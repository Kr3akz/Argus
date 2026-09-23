#!/usr/bin/env node
/**
 * Prueft den Draht zum Windows-Debugkanal (src/core/dbwin.js).
 *
 * Braucht kein laufendes Warframe: der Test schickt sich die Zeilen selbst
 * ueber OutputDebugString und laesst sie vom Arbeiter wieder einsammeln.
 *
 * Geprueft wird:
 *  - Anmelden und Zeilen empfangen
 *  - Filter nach Prozessnummer: fremde Ausgabe darf NICHT durchkommen
 *  - mehrzeilige Ausgaben zerfallen in einzelne Zeilen
 *  - Zeichen ausserhalb von ASCII bleiben heil (latin1, nicht utf8)
 *  - sauberes Beenden ohne Prozessleiche
 *
 *   node src/cli/dbwin-test.js
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as dbwin from '../core/dbwin.js';

const HIER = fileURLToPath(import.meta.url);

/* ---------- Betriebsart "senden": laeuft als eigener Prozess ---------- */

if (process.argv.includes('--senden')) {
  const require = createRequire(import.meta.url);
  const k32 = require('koffi').load('kernel32.dll');
  const OutputDebugStringA = k32.func('void __stdcall OutputDebugStringA(str s)');
  for (const zeile of JSON.parse(process.argv[process.argv.indexOf('--senden') + 1])) {
    OutputDebugStringA(zeile);
  }
  process.exit(0);
}

/* ---------- Test ---------- */

if (process.platform !== 'win32') {
  console.log('Der Debugkanal ist eine Windows-Sache - hier gibt es nichts zu pruefen.');
  process.exit(0);
}

console.log('=== Draht zum Windows-Debugkanal ===\n');

let fehler = 0;
const pruefe = (was, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'}  ${was}${hinweis ? ' - ' + hinweis : ''}`);
  if (!ok) fehler++;
};

/** Einen Sendeprozess starten und auf sein Ende warten. Liefert seine Nummer. */
function senden(zeilen) {
  return new Promise((fertig, schiefgegangen) => {
    const kind = spawn(process.execPath, [HIER, '--senden', JSON.stringify(zeilen)],
                       { stdio: 'ignore' });
    kind.on('error', schiefgegangen);
    kind.on('exit', () => fertig(kind.pid));
  });
}

const warte = ms => new Promise(r => setTimeout(r, ms));

const empfangen = [];
dbwin.start(zeilen => empfangen.push(...zeilen),
            { onError: m => { console.log('  Fehler vom Arbeiter:', m); fehler++; } });

/* Der Arbeiter muss erst angelegt sein und sich angemeldet haben. */
await warte(400);

console.log('1. Anmelden');
pruefe('Draht ist aktiv', dbwin.isActive());
/* ABBRECHEN STATT ROT MELDEN.
   Der Kanal hat systemweit genau EINEN Platz. Haelt ihn schon jemand - im
   Regelfall Argus selbst -, teilen sich beide die Zeilen nach Zufall, und
   dieser Durchlauf meldet Fehlschlaege, die keine sind. Nachgemessen bei
   laufendem Argus: von drei gesendeten Zeilen kamen zwei an, und zwar die
   mittleren. Das sieht nach einem kaputten Arbeiter aus und ist in Wahrheit
   nur ein besetzter Platz.
   Abbruch mit 2, nicht mit 0 oder 1: der Durchlauf ist weder bestanden noch
   gescheitert, er hat gar nicht stattgefunden. */
if (dbwin.otherListener()) {
  console.log('\n=== NICHT GELAUFEN - der Kanal ist besetzt ===');
  console.log('Am Debugkanal hoert bereits ein anderes Programm mit,');
  console.log('sehr wahrscheinlich Argus selbst (npm start).');
  console.log('');
  console.log('Solange ihn jemand anders haelt, bekommt dieser Durchlauf nur');
  console.log('einen zufaelligen Teil der Zeilen und wuerde Fehler melden,');
  console.log('die keine sind. Argus beenden, dann noch einmal.');
  await dbwin.stop();
  process.exit(2);
}

console.log('\n2. Filter nach Prozessnummer');
/* Noch KEINE Nummer gemeldet: es darf nichts durchkommen, obwohl gesendet
   wird. Das ist die Zusicherung, auf der die Privatsphaere steht. */
await senden(['ARGUS-TEST vor der Anmeldung']);
await warte(250);
pruefe('ohne gemeldete Nummer kommt nichts durch', empfangen.length === 0,
       empfangen.length ? `${empfangen.length} Zeile(n) durchgerutscht` : '');

console.log('\n3. Zeilen empfangen');
/* Hier sendet der Test SELBST, nicht ein Kind: gefiltert wird nach
   Prozessnummer, und die muss vor dem Senden bekannt sein. Bei einem Kind
   erfaehrt man sie erst beim Start, und bis sie gemeldet ist, waeren die
   ersten Zeilen schon verworfen. Die eigene Nummer steht von Anfang an fest.
   Fuer die Gegenprobe in Schritt 4 ist ein Kind dann genau das Richtige. */
const require = createRequire(import.meta.url);
const k32 = require('koffi').load('kernel32.dll');
const OutputDebugStringA = k32.func('void __stdcall OutputDebugStringA(str s)');

dbwin.setPids([process.pid]);
await warte(50);

empfangen.length = 0;
OutputDebugStringA('ARGUS-TEST eine Zeile');
OutputDebugStringA('ARGUS-TEST zwei\nARGUS-TEST drei');
/* koffis 'str' kodiert nach utf8 - genau das, was Warframe auch tut:
   nachgemessen steht der Plattform-Glyph in EE.log als "ee 80 80", also
   U+E000 in utf8. Der Test schickt deshalb dasselbe Zeichen und erwartet es
   unversehrt zurueck. */
OutputDebugStringA('ARGUS-TEST Kr3aKz mit Sonderzeichen');
await warte(250);

pruefe('einzelne Zeile kam an', empfangen.includes('ARGUS-TEST eine Zeile'));
pruefe('mehrzeilige Ausgabe zerfaellt',
       empfangen.includes('ARGUS-TEST zwei') && empfangen.includes('ARGUS-TEST drei'));
pruefe('Plattform-Glyph bleibt heil (utf8, U+E000)',
       empfangen.includes('ARGUS-TEST Kr3aKz mit Sonderzeichen'),
       JSON.stringify(empfangen.find(z => z.includes('Kr3aKz')) ?? 'nichts gefunden'));

console.log('\n4. Fremde Ausgabe bleibt draussen');
empfangen.length = 0;
/* Ein anderer Prozess sendet, dessen Nummer nicht gemeldet ist. */
const fremdPid = await senden(['ARGUS-TEST von einem fremden Prozess']);
await warte(250);
pruefe(`Ausgabe von Prozess ${fremdPid} verworfen`, empfangen.length === 0,
       empfangen.length ? empfangen.join(' | ') : '');

console.log('\n5. Beenden');
await dbwin.stop();
pruefe('Draht ist beendet', !dbwin.isActive());

console.log(`\n=== ${fehler ? fehler + ' Fehler' : 'alles in Ordnung'} ===`);
process.exit(fehler ? 1 : 0);
