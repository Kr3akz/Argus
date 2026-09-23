#!/usr/bin/env node
/**
 * Sonde: hoert am Windows-Debugkanal mit und zeigt, was dort ankommt.
 *
 * WOZU DAS DA IST:
 *   Warframe schreibt EE.log gepuffert. Nachgemessen kamen "Got rewards" und
 *   "Relic reward screen shut down" 15 Sekunden Spielzeit auseinander, aber
 *   1 Millisekunde auseinander in der Datei - wer nur auf die Datei hoert,
 *   erfaehrt vom Belohnungsbildschirm erst, wenn er schon zu ist.
 *
 *   Es gibt neben der Datei einen zweiten Weg: Windows nimmt Ausgaben ueber
 *   OutputDebugString entgegen und stellt sie SOFORT einem Zuhoerer zu, ohne
 *   Datei und ohne Puffer. Ob Warframe diesen Weg ueberhaupt benutzt, ist die
 *   Frage, an der alles haengt - und sie laesst sich nur am laufenden Spiel
 *   beantworten. Genau dafuer gibt es diese Sonde.
 *
 * WIE DER KANAL FUNKTIONIERT:
 *   Es ist ein Protokoll aus vier benannten Objekten, und ES GIBT NUR EINEN
 *   PLATZ. Wer schreiben will, sucht zuerst den Mutex "DBWinMutex". Findet er
 *   ihn nicht, gibt es keinen Zuhoerer, und die Ausgabe wird verworfen, ohne
 *   dass irgendetwas kostet. Den Mutex legt also der ZUHOERER an - er ist das
 *   Anmeldeschild.
 *
 *   Dann teilen sich beide Seiten 4096 Bytes Speicher ("DBWIN_BUFFER"): die
 *   ersten vier Bytes die Prozessnummer des Schreibers, der Rest die Zeile als
 *   ANSI-Text. Zwei Ereignisse takten das Ganze - "DBWIN_BUFFER_READY" sagt
 *   "der Platz ist frei", "DBWIN_DATA_READY" sagt "es liegt etwas drin".
 *
 * WAS DAS FUER ARGUS BEDEUTET, FALLS ES KLAPPT:
 *   Nur EIN Zuhoerer gleichzeitig. Laeuft DebugView, Overwolf oder ein anderes
 *   Begleitwerkzeug, ist der Platz belegt, und wir bekommen nichts - still.
 *   Die Sonde sagt deshalb beim Start, ob die Objekte schon jemandem gehoeren.
 *   Der Dateiweg muss in jedem Fall bestehen bleiben.
 *
 *   node src/cli/dbwin-probe.js                 alles mitschreiben
 *   node src/cli/dbwin-probe.js --pid 1234      nur diesen Prozess
 *   node src/cli/dbwin-probe.js --grep reward   nur passende Zeilen
 *   node src/cli/dbwin-probe.js --sekunden 120  nach zwei Minuten von selbst Schluss
 *
 * WARUM ES --sekunden GIBT UND NICHT NUR STRG-C: Der Kanal hat nur einen Platz.
 * Eine Sonde, die haengenbleibt, haelt ihn besetzt, und der naechste Lauf meldet
 * einen Mithoerer, den es nicht gibt. Eine Laufzeitgrenze ist der Ausstieg, der
 * nicht davon abhaengt, dass ein Signal ankommt - und beim Spielen ohnehin
 * bequemer, weil man die Hand nicht an der Tastatur braucht.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

if (process.platform !== 'win32') {
  console.error('Der Debugkanal ist eine Windows-Sache - hier gibt es nichts zu hoeren.');
  process.exit(1);
}

/* ---------- Aufrufparameter ---------- */

const argv = process.argv.slice(2);
const argOf = name => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const nurPid = Number(argOf('--pid')) || null;
const muster = argOf('--grep');
const re = muster ? new RegExp(muster, 'i') : null;
const sekunden = Number(argOf('--sekunden')) || 0;

/* ---------- Windows-Aufrufe ---------- */

let koffi;
try {
  koffi = require('koffi');
} catch {
  console.error('koffi fehlt - npm install');
  process.exit(1);
}

const k32 = koffi.load('kernel32.dll');

/* Handles als uint64 statt als Zeiger: dieselbe Schreibweise wie in
   src/core/foreground.js, und sie erspart das Herumreichen von
   INVALID_HANDLE_VALUE als Zeigerwert. */
const CreateMutexW = k32.func(
  'uint64 __stdcall CreateMutexW(void *attr, bool initialOwner, str16 name)');
const OpenMutexW = k32.func(
  'uint64 __stdcall OpenMutexW(uint32 access, bool inherit, str16 name)');
const CreateFileMappingW = k32.func(
  'uint64 __stdcall CreateFileMappingW(uint64 file, void *attr, uint32 protect,'
  + ' uint32 maxHigh, uint32 maxLow, str16 name)');
const MapViewOfFile = k32.func(
  'void* __stdcall MapViewOfFile(uint64 map, uint32 access, uint32 offHigh,'
  + ' uint32 offLow, size_t bytes)');
const UnmapViewOfFile = k32.func('bool __stdcall UnmapViewOfFile(void *base)');
/* memcpy aus der kernel32 - siehe den Kommentar an `puffer`. */
const RtlMoveMemory = k32.func(
  'void __stdcall RtlMoveMemory(void *ziel, void *quelle, size_t bytes)');
const CreateEventW = k32.func(
  'uint64 __stdcall CreateEventW(void *attr, bool manualReset, bool initialState, str16 name)');
const WaitForSingleObject = k32.func(
  'uint32 __stdcall WaitForSingleObject(uint64 handle, uint32 millis)');
const SetEvent = k32.func('bool __stdcall SetEvent(uint64 event)');
const CloseHandle = k32.func('bool __stdcall CloseHandle(uint64 handle)');
const GetLastError = k32.func('uint32 __stdcall GetLastError()');

const INVALID_HANDLE_VALUE = 0xFFFFFFFFFFFFFFFFn;
const PAGE_READWRITE = 0x04;
const FILE_MAP_READ = 0x0004;
const WAIT_OBJECT_0 = 0x00000000;
const WAIT_TIMEOUT = 0x00000102;
const ERROR_ALREADY_EXISTS = 183;
const ERROR_ACCESS_DENIED = 5;
const SYNCHRONIZE = 0x00100000;
const MUTEX_MODIFY_STATE = 0x0001;

/* Die ersten vier Bytes gehoeren der Prozessnummer, der Rest dem Text. */
const PUFFER_BYTES = 4096;

/* Wie lange ein Warteruf hoechstens haengt. Er muss ueberhaupt zurueckkommen,
   sonst laesst sich Strg-C nicht bedienen und der Prozess waere nur noch
   abzuschiessen. */
const WARTE_MS = 250;

/* ---------- Anmelden ---------- */

const offen = [];
function anlegen(was, handle) {
  if (!handle) {
    console.error(`${was} liess sich nicht anlegen (Fehler ${GetLastError()})`);
    aufraeumen();
    process.exit(1);
  }
  /* ERROR_ALREADY_EXISTS heisst nicht "Fehler", sondern "das Objekt gab es
     schon". Genau das ist die interessante Auskunft: dann hoert bereits
     jemand mit, und wir bekommen bestenfalls die Haelfte. */
  const schonDa = GetLastError() === ERROR_ALREADY_EXISTS;
  offen.push(handle);
  return { handle, schonDa };
}

function aufraeumen() {
  if (sicht) { try { UnmapViewOfFile(sicht); } catch {} }
  for (const h of offen.reverse()) { try { CloseHandle(h); } catch {} }
  offen.length = 0;
}

let sicht = null;

/**
 * Das Anmeldeschild besorgen.
 *
 * Der Mutex muss nur EXISTIEREN, damit Schreiber sich nicht sofort abwenden -
 * uns gehoeren muss er nicht. Nachgemessen auf Kaans Rechner: er war schon da,
 * mit einer Zugriffsliste, die uns das Anlegen verweigert (Fehler 5), waehrend
 * Puffer und Ereignisse fehlten. Es hoerte also niemand mit, und trotzdem
 * scheiterte das Anlegen. Wer hier auf CreateMutex besteht, gibt an dieser
 * Stelle auf, obwohl der Weg offen ist.
 */
function mutexBesorgen() {
  const neu = CreateMutexW(null, false, 'DBWinMutex');
  if (neu) { offen.push(neu); return { handle: neu, fremd: false }; }

  const fehler = GetLastError();
  if (fehler !== ERROR_ACCESS_DENIED) {
    console.error(`DBWinMutex liess sich nicht anlegen (Fehler ${fehler})`);
    aufraeumen();
    process.exit(1);
  }

  const alt = OpenMutexW(SYNCHRONIZE | MUTEX_MODIFY_STATE, false, 'DBWinMutex');
  if (alt) { offen.push(alt); return { handle: alt, fremd: true }; }

  /* Weder anlegen noch oeffnen: dann existiert er mit einer Liste, die uns
     ganz aussperrt. Schreiber finden ihn trotzdem, also weitermachen - nur
     ohne eigenen Griff darauf. */
  return { handle: null, fremd: true };
}

const mutex = mutexBesorgen();
const mapping = anlegen('DBWIN_BUFFER',
  CreateFileMappingW(INVALID_HANDLE_VALUE, null, PAGE_READWRITE, 0, PUFFER_BYTES, 'DBWIN_BUFFER'));

sicht = MapViewOfFile(mapping.handle, FILE_MAP_READ, 0, 0, 0);
if (!sicht) {
  console.error(`Der gemeinsame Speicher liess sich nicht einblenden (Fehler ${GetLastError()})`);
  aufraeumen();
  process.exit(1);
}

/* Beide Ereignisse sind selbstruecksetzend (manualReset = false). BUFFER_READY
   startet gesetzt: der Platz ist frei, bevor der erste Schreiber kommt. */
const bufferReady = anlegen('DBWIN_BUFFER_READY',
  CreateEventW(null, false, true, 'DBWIN_BUFFER_READY'));
const dataReady = anlegen('DBWIN_DATA_READY',
  CreateEventW(null, false, false, 'DBWIN_DATA_READY'));

/* Der Mutex zaehlt hier NICHT mit. Er ueberlebt seinen Erzeuger und lag auf
   Kaans Rechner als Altlast herum, ohne dass jemand zuhoerte - haette er
   gezaehlt, haette die Sonde einen Mithoerer gemeldet, den es nicht gibt.
   Puffer und Ereignisse dagegen legt nur an, wer wirklich lesen will. */
const belegt = mapping.schonDa || bufferReady.schonDa || dataReady.schonDa;

console.log('=== Sonde am Windows-Debugkanal ===');
console.log(belegt
  ? 'ACHTUNG: Puffer oder Ereignisse gab es schon - ein anderes Programm hoert mit.\n'
    + '         (DebugView, Overwolf, ein anderes Begleitwerkzeug)\n'
    + '         Zeilen koennen dort landen statt hier. Zum Vergleich jenes beenden.'
  : 'Angemeldet, kein anderer Zuhoerer.');
if (mutex.fremd) {
  console.log('Hinweis: DBWinMutex gehoert einem anderen Prozess oder ist eine Altlast.'
            + ' Das stoert nicht - er muss nur da sein.');
}
if (nurPid) console.log(`Filter: nur Prozess ${nurPid}`);
if (re) console.log(`Filter: nur Zeilen auf /${muster}/i`);
console.log(sekunden
  ? `Warframe starten und eine Riss-Mission spielen. Endet nach ${sekunden} s.\n`
  : 'Warframe starten und eine Riss-Mission spielen. Strg-C beendet.\n');

/* ---------- Mithoeren ---------- */

/**
 * Der Puffer, in den jede Zeile kopiert wird - EINMAL angelegt, dann nur noch
 * ueberschrieben.
 *
 * Dasselbe Verfahren wie im Arbeiter (src/core/dbwin-worker.js), und aus
 * denselben Gruenden: koffi kann einen ArrayBuffer direkt ueber die
 * eingeblendete Adresse legen, aber das stuerzt unter Electron den Prozess ab.
 * Die Sonde liefe zwar unter Node, wo es geht - zwei Verfahren fuer dieselbe
 * Sache sind aber eine Falle fuer den Naechsten, der hier etwas abschaut.
 *
 * Solange wir lesen, WARTET der Schreiber. Deshalb keine Zuweisung je Zeile:
 * die Speicherbereinigung waere sonst eine Pause, die das Spiel mitwartet.
 */
const puffer = Buffer.allocUnsafe(PUFFER_BYTES);

const t0 = Date.now();
let gesamt = 0;
let gezeigt = 0;
const proPid = new Map();

/* WIE LANGE WIR DEN SCHREIBER AUFHALTEN - die wichtigste Zahl hier.
 *
 * Ein Schreiber, der OutputDebugString aufruft, WARTET auf unser Signal, dass
 * der Platz wieder frei ist. Solange wir den Puffer halten, steht er. Ohne
 * Zuhoerer faellt das ganz weg: er findet den Mutex nicht und ist sofort
 * durch. Anders gesagt - wer sich hier anmeldet, haengt sich in den heissen
 * Pfad des Spiels und verlangsamt es genau um diese Zeit, je Zeile.
 *
 * Gemessen wird deshalb die Spanne zwischen "Warteruf kam zurueck" und
 * "Platz wieder freigegeben". Alles danach ist unsere Sache und kostet das
 * Spiel nichts. */
let haltMax = 0;
let haltSumme = 0;

let laeuft = true;
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(sig, () => { laeuft = false; });
}

/**
 * Einmal ans Ereignissystem abgeben.
 *
 * WARUM DAS NICHT WEGGELASSEN WERDEN DARF: WaitForSingleObject blockiert den
 * Thread, und eine rein SYNCHRONE Schleife gibt den Ereignisumlauf nie frei.
 * Der Handler oben steht dann zwar bereit, kommt aber nie dran - Strg-C bleibt
 * wirkungslos, und der Prozess ist nur noch abzuschiessen. Genau so ist es beim
 * ersten Lauf passiert: die Sonde ueberlebte ihren eigenen Abbruch und hielt
 * den Kanal besetzt, sodass der naechste Lauf einen Mithoerer gemeldet haette,
 * den es nicht gab.
 *
 * Ein setImmediate je Durchgang kostet nichts - der Durchgang dauert ohnehin
 * bis zu WARTE_MS.
 */
const atemholen = () => new Promise(resolve => setImmediate(resolve));

function zeileLesen() {
  /* Die ersten vier Bytes sind die Prozessnummer, danach der Text bis zum
     ersten Nullbyte.

     utf8, obwohl dies die ANSI-Schnittstelle ist: an den Spielernamen haengt
     Warframe einen Plattform-Glyph, und in EE.log steht der als "ee 80 80" -
     utf8 fuer U+E000. Als latin1 gelesen wuerden daraus drei Zeichen, zwei
     davon Steuerzeichen. Dasselbe wie in logwatch.js, das die Datei ebenfalls
     als utf8 liest. */
  RtlMoveMemory(puffer, sicht, PUFFER_BYTES);
  const pid = puffer.readUInt32LE(0);
  let ende = puffer.indexOf(0, 4);
  if (ende < 0) ende = PUFFER_BYTES;
  return { pid, text: puffer.toString('utf8', 4, ende) };
}

/* Der Platz ist frei, bevor der erste Schreiber kommt. Danach wird er
   freigegeben, sobald der Inhalt HERAUSKOPIERT ist - nicht erst, wenn er
   verarbeitet wurde. Ein Schreiber, der in der Zwischenzeit anklopft, wartet
   sonst auf unser Ausgeben statt auf unser Lesen. */
SetEvent(bufferReady.handle);

const frist = sekunden ? t0 + sekunden * 1000 : Infinity;

while (laeuft && Date.now() < frist) {
  const ergebnis = WaitForSingleObject(dataReady.handle, WARTE_MS);

  if (ergebnis === WAIT_TIMEOUT) { await atemholen(); continue; }
  if (ergebnis !== WAIT_OBJECT_0) {
    console.error(`Warteruf unerwartet beendet: 0x${ergebnis.toString(16)}`);
    break;
  }

  const haltAb = process.hrtime.bigint();
  const { pid, text } = zeileLesen();
  SetEvent(bufferReady.handle);
  const halt = Number(process.hrtime.bigint() - haltAb) / 1e6;
  if (halt > haltMax) haltMax = halt;
  haltSumme += halt;

  await atemholen();
  gesamt++;
  proPid.set(pid, (proPid.get(pid) ?? 0) + 1);

  if (nurPid && pid !== nurPid) continue;
  if (re && !re.test(text)) continue;

  gezeigt++;
  const sek = ((Date.now() - t0) / 1000).toFixed(3).padStart(9);
  /* Zeilenenden weg: der Kanal liefert sie mit, und im Protokoll stuenden
     sonst leere Zeilen zwischen allem. */
  console.log(`${sek}  pid ${String(pid).padStart(6)}  ${text.replace(/[\r\n]+$/, '')}`);
}

/* ---------- Abschluss ---------- */

const dauer = (Date.now() - t0) / 1000;

console.log('\n=== Ende ===');
console.log(`Zeilen gesamt: ${gesamt}, davon gezeigt: ${gezeigt}`);
if (gesamt) {
  console.log(`Rate: ${(gesamt / dauer).toFixed(1)} Zeilen/s ueber ${dauer.toFixed(1)} s`);
  console.log(`Schreiber aufgehalten: im Mittel ${(haltSumme / gesamt * 1000).toFixed(0)} us,`
            + ` schlimmstenfalls ${haltMax.toFixed(2)} ms,`
            + ` in Summe ${(haltSumme / 1000).toFixed(2)} s`
            + ` (${(haltSumme / 10 / dauer).toFixed(2)} % der Laufzeit)`);
}
if (proPid.size) {
  console.log('Nach Prozess:');
  for (const [pid, n] of [...proPid].sort((a, b) => b[1] - a[1])) {
    console.log(`  pid ${String(pid).padStart(6)}: ${n}`);
  }
} else {
  console.log('Es kam nichts an. Moegliche Gruende:');
  console.log('  - Warframe lief nicht, oder es gab keine Ausgabe');
  console.log('  - ein anderer Zuhoerer war schneller (siehe Hinweis oben)');
  console.log('  - Warframe benutzt diesen Weg nicht, sondern nur die Datei');
}

aufraeumen();
