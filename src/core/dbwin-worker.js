/**
 * Der Arbeiter am Windows-Debugkanal.
 *
 * WARUM EIN EIGENER THREAD:
 *   Der Warteruf auf die naechste Zeile BLOCKIERT. Im Hauptthread wuerde damit
 *   der Ereignisumlauf stillstehen - Electron zeichnet nicht mehr, Zeitgeber
 *   laufen nicht, nichts geht mehr. Hier darf er blockieren, weil sonst
 *   niemand auf diesen Thread wartet.
 *
 * WARUM DIE SCHLEIFE KEINEN EREIGNISUMLAUF BENUTZT:
 *   Eine synchrone Dauerschleife laesst den Umlauf ihres eigenen Threads
 *   verhungern. Nachrichten vom Hauptthread kaemen nie an, Zeitgeber nie dran.
 *   Deshalb laeuft ALLES ueber gemeinsamen Speicher: der Abbruchwunsch und die
 *   Liste der Prozessnummern stehen in einem SharedArrayBuffer, und die
 *   Schleife liest sie einfach bei jedem Durchgang. Kein Umlauf noetig.
 *
 * WAS DAS DAS SPIEL KOSTET - und warum hier nichts weiter optimiert wird:
 *   Wer an diesem Kanal haengt, haengt im heissen Pfad des Schreibers:
 *   OutputDebugString WARTET darauf, dass wir den Platz freigeben. Ohne
 *   Zuhoerer faellt das ganz weg.
 *
 *   Nachgemessen mit 5000 Zeilen echter Laenge: ohne Zuhoerer 3,3 us je
 *   Aufruf, mit Zuhoerer rund 15 us. Unser Anteil daran sind 3 us - der Rest
 *   ist Windows' eigener Handshake ueber Mutex und Ereignisse, und der laesst
 *   sich von hier aus nicht wegkuerzen - eine Fuenfzehnfach-Beschleunigung des
 *   Lesens hat die Schreiberseite nicht messbar bewegt.
 *
 *   Daraus folgt beides: der heisse Pfad bleibt schlank, aber er wird nicht
 *   verbogen. Was zaehlt, ist kein AUSSETZER - wird dieser Thread verdraengt
 *   oder haelt eine Speicherbereinigung ihn an, wartet das Spiel die ganze
 *   Pause mit. Genau deshalb wird hier je Zeile NICHTS zugewiesen; siehe den
 *   Kommentar an `puffer`.
 *
 * WARUM NACH PROZESSNUMMER GEFILTERT WIRD:
 *   Der Kanal ist SYSTEMWEIT. Hier kommt die Debugausgabe JEDES Programms an,
 *   das welche erzeugt - nicht nur die von Warframe. Was nicht vom Spiel
 *   kommt, wird deshalb sofort verworfen: es wird nicht gesammelt, nicht
 *   weitergereicht und nirgends hingeschrieben. Solange keine Nummer bekannt
 *   ist, geht gar nichts hinaus.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/* ---------- Der gemeinsame Speicher ----------

   Die Belegung kommt von dbwin.js und steht NICHT auch hier: zwei Kopien einer
   Speicherbelegung laufen irgendwann auseinander, und der Fehler waere dann
   kein Absturz, sondern ein falsch gelesenes Feld. */
const steuer = new Int32Array(workerData.steuerPuffer);
const { stop: STOP, pidAnzahl: PID_ANZAHL, pidAb: PID_AB } = workerData.belegung;

/* ---------- Windows-Aufrufe ---------- */

const k32 = require('koffi').load('kernel32.dll');

const CreateMutexW = k32.func(
  'uint64 __stdcall CreateMutexW(void *attr, bool owner, str16 name)');
const OpenMutexW = k32.func(
  'uint64 __stdcall OpenMutexW(uint32 access, bool inherit, str16 name)');
const CreateFileMappingW = k32.func(
  'uint64 __stdcall CreateFileMappingW(uint64 file, void *attr, uint32 protect,'
  + ' uint32 maxHigh, uint32 maxLow, str16 name)');
const MapViewOfFile = k32.func(
  'void* __stdcall MapViewOfFile(uint64 map, uint32 access, uint32 offHigh,'
  + ' uint32 offLow, size_t bytes)');
const UnmapViewOfFile = k32.func('bool __stdcall UnmapViewOfFile(void *base)');
/* memcpy aus der kernel32. Siehe den Kommentar an `puffer` - es ist der
   einzige Weg aus dem gemeinsamen Speicher, der unter Electron sowohl laeuft
   als auch schnell genug ist. */
const RtlMoveMemory = k32.func(
  'void __stdcall RtlMoveMemory(void *ziel, void *quelle, size_t bytes)');
const CreateEventW = k32.func(
  'uint64 __stdcall CreateEventW(void *attr, bool manual, bool initial, str16 name)');
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

/* So lange haengt ein Warteruf hoechstens. Er muss zurueckkommen, sonst wird
   der Abbruchwunsch erst beim naechsten Zeilenempfang bemerkt - und wenn das
   Spiel gerade nichts schreibt, waere das nie. */
const WARTE_MS = 200;

/* Wann ein Bund Zeilen hinausgeht: wenn es voll ist oder alt genug. Beides,
   weil sonst entweder ein einzelner Fund liegenbliebe, bis 64 zusammenkommen,
   oder jede Zeile einzeln ueber die Threadgrenze muesste. */
const BUND_MAX = 64;
const BUND_MS = 40;

/* ---------- Anmelden ---------- */

const offen = [];
let sicht = null;

function aufraeumen() {
  if (sicht) { try { UnmapViewOfFile(sicht); } catch {} sicht = null; }
  for (const h of offen.reverse()) { try { CloseHandle(h); } catch {} }
  offen.length = 0;
}

function anlegen(handle) {
  if (!handle) return null;
  offen.push(handle);
  return { handle, schonDa: GetLastError() === ERROR_ALREADY_EXISTS };
}

/**
 * Das Anmeldeschild besorgen.
 *
 * Der Mutex muss nur EXISTIEREN, damit Schreiber sich nicht sofort abwenden -
 * uns gehoeren muss er nicht. Nachgemessen auf einem echten Rechner: er war
 * schon da, mit einer Zugriffsliste, die das Anlegen verweigert, waehrend
 * Puffer und Ereignisse fehlten. Es hoerte also niemand mit, und trotzdem
 * waere ein Anlauf, der auf CreateMutex besteht, hier gescheitert.
 */
function mutexBesorgen() {
  const neu = CreateMutexW(null, false, 'DBWinMutex');
  if (neu) { offen.push(neu); return { fremd: false }; }
  if (GetLastError() !== ERROR_ACCESS_DENIED) return null;

  const alt = OpenMutexW(SYNCHRONIZE | MUTEX_MODIFY_STATE, false, 'DBWinMutex');
  if (alt) offen.push(alt);
  /* Auch ohne eigenen Griff weiter: Schreiber finden ihn trotzdem. */
  return { fremd: true };
}

function anmelden() {
  const mutex = mutexBesorgen();
  if (!mutex) return { fehler: `DBWinMutex nicht erreichbar (${GetLastError()})` };

  const mapping = anlegen(
    CreateFileMappingW(INVALID_HANDLE_VALUE, null, PAGE_READWRITE, 0, PUFFER_BYTES, 'DBWIN_BUFFER'));
  if (!mapping) return { fehler: `DBWIN_BUFFER nicht anlegbar (${GetLastError()})` };

  sicht = MapViewOfFile(mapping.handle, FILE_MAP_READ, 0, 0, 0);
  if (!sicht) return { fehler: `DBWIN_BUFFER nicht einblendbar (${GetLastError()})` };

  const bufferReady = anlegen(CreateEventW(null, false, true, 'DBWIN_BUFFER_READY'));
  const dataReady = anlegen(CreateEventW(null, false, false, 'DBWIN_DATA_READY'));
  if (!bufferReady || !dataReady) return { fehler: `Ereignisse nicht anlegbar (${GetLastError()})` };

  return {
    bufferReady: bufferReady.handle,
    dataReady: dataReady.handle,
    fremd: mutex.fremd,
    /* Der Mutex zaehlt hier NICHT mit: er ueberlebt seinen Erzeuger und liegt
       auf manchen Rechnern als Altlast herum, ohne dass jemand zuhoert.
       Puffer und Ereignisse legt nur an, wer wirklich lesen will. */
    belegt: mapping.schonDa || bufferReady.schonDa || dataReady.schonDa
  };
}

const kanal = anmelden();
if (kanal.fehler) {
  parentPort.postMessage({ type: 'error', message: kanal.fehler });
  aufraeumen();
  process.exit(0);
}

parentPort.postMessage({ type: 'ready', belegt: kanal.belegt, fremd: kanal.fremd });

/* ---------- Mithoeren ---------- */

/**
 * Der Puffer, in den jede Zeile kopiert wird - EINMAL angelegt, dann nur noch
 * ueberschrieben.
 *
 * WARUM NICHT DER NAHELIEGENDE WEG: koffi kann einen ArrayBuffer direkt ueber
 * die eingeblendete Adresse legen (koffi.view), ganz ohne Kopie. Das ist unter
 * Node auch schneller - gemessen 128 ns gegen 1945 ns. **Unter Electron
 * stuerzt es den Prozess ab**, mit `FATAL ERROR: Error::New
 * napi_get_last_error_info`, und zwar sofort beim Anlegen und auch im
 * Hauptthread. Dasselbe gilt fuer koffi.decode mit dem Typ 'str'.
 *
 * Nachgemessen unter Electron 33 / Node 20 / Modules 130, je Zeile:
 *
 *   koffi.view                      Absturz
 *   koffi.decode(..., 'str')        Absturz
 *   koffi.decode in ein neues Feld  49 639 ns
 *   RtlMoveMemory in DIESEN Puffer   2 315 ns
 *
 * Der Unterschied zwischen den letzten beiden ist die Zuweisung: ein frisches
 * 4-KB-Feld je Zeile beschaeftigt die Speicherbereinigung, und deren Pausen
 * sind genau das, was das Spiel mitwartet. Ein vorgehaltener Puffer hat sie
 * nicht.
 *
 * WARUM DAS UEBERHAUPT AUFFIEL - und fast nicht aufgefallen waere: die
 * Testlaeufe hier laufen unter Node, Argus laeuft unter Electron. Unter Node
 * ging koffi.view einwandfrei. Was native Aufrufe anfasst, muss unter Electron
 * geprueft werden; dafuer gibt es `npm run dbwin-test:app`.
 */
const puffer = Buffer.allocUnsafe(PUFFER_BYTES);

let bund = [];
let bundAb = 0;

function abgeben() {
  if (!bund.length) return;
  parentPort.postMessage({ type: 'lines', lines: bund });
  bund = [];
  bundAb = 0;
}

/** Gehoert diese Nummer dem Spiel? Die Liste steht im gemeinsamen Speicher. */
function vomSpiel(pid) {
  const n = steuer[PID_ANZAHL];
  for (let i = 0; i < n; i++) {
    if (steuer[PID_AB + i] === pid) return true;
  }
  return false;
}

while (steuer[STOP] === 0) {
  const ergebnis = WaitForSingleObject(kanal.dataReady, WARTE_MS);

  if (ergebnis === WAIT_OBJECT_0) {
    /* AB HIER WARTET DER SCHREIBER. Herauskopieren, freigeben, fertig -
       alles andere gehoert hinter das SetEvent. */
    RtlMoveMemory(puffer, sicht, PUFFER_BYTES);
    const pid = puffer.readUInt32LE(0);
    let ende = puffer.indexOf(0, 4);
    if (ende < 0) ende = PUFFER_BYTES;
    /* utf8, obwohl der Kanal die ANSI-Schnittstelle ist.

       NACHGEMESSEN AN DEN ROHBYTES: Warframe haengt an den Spielernamen einen
       Plattform-Glyph, und in EE.log steht er als "ee 80 80" - das ist utf8
       fuer U+E000. Als latin1 gelesen wuerden daraus DREI Zeichen, zwei davon
       Steuerzeichen.

       Und es muss dasselbe sein wie in logwatch.js, das die Datei ebenfalls
       als utf8 liest: sobald beide Quellen zusammengefuehrt werden, wird
       verglichen, und zwei verschiedene Lesarten derselben Bytes waeren zwei
       verschiedene Zeilen. */
    const text = vomSpiel(pid) ? puffer.toString('utf8', 4, ende) : null;
    SetEvent(kanal.bufferReady);
    /* AB HIER laeuft der Schreiber wieder. */

    if (text !== null) {
      /* Der Kanal liefert die Zeilenenden mit. Sie fallen hier weg, damit
         weiter oben niemand damit rechnen muss - und eine Ausgabe, die aus
         mehreren Zeilen bestand, zerfaellt gleich in ihre Teile. */
      for (const zeile of text.split(/\r?\n/)) {
        if (zeile) bund.push(zeile);
      }
      if (!bundAb) bundAb = Date.now();
      if (bund.length >= BUND_MAX || Date.now() - bundAb >= BUND_MS) abgeben();
    }
    continue;
  }

  if (ergebnis === WAIT_TIMEOUT) { abgeben(); continue; }

  parentPort.postMessage({
    type: 'error',
    message: `Warteruf unerwartet beendet: 0x${ergebnis.toString(16)}`
  });
  break;
}

abgeben();
aufraeumen();
parentPort.postMessage({ type: 'stopped' });
