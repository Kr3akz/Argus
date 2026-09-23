#!/usr/bin/env node
/**
 * Prueft, dass die zwei Quellen fuer Logzeilen sauber zusammenlaufen.
 *
 * Warframe gibt jede Zeile gleichzeitig ueber den Windows-Debugkanal und in
 * die Datei aus. Der Kanal ist sofort da, die Datei traege. Beide muessen
 * ausgewertet werden - der Kanal, weil er schnell ist, die Datei, weil es
 * systemweit nur EINEN Zuhoerer am Kanal geben kann.
 *
 * Geprueft wird genau das, was dabei schiefgehen kann:
 *  - eine Zeile ueber den Kanal loest EINMAL aus
 *  - dieselbe Zeile spaeter in der Datei loest NICHT noch einmal aus
 *  - eine Zeile, die der Kanal NIE hatte, loest ueber die Datei aus
 *    (das ist der Fall "ein anderes Programm hat sie abgefangen")
 *
 * Braucht kein laufendes Warframe - die Zeilen kommen von hier.
 *
 *   node src/cli/logquellen-test.js
 */
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { LogWatcher } from '../core/logwatch.js';

if (process.platform !== 'win32') {
  console.log('Der Debugkanal ist eine Windows-Sache - hier gibt es nichts zu pruefen.');
  process.exit(0);
}

const require = createRequire(import.meta.url);
const k32 = require('koffi').load('kernel32.dll');
const OutputDebugStringA = k32.func('void __stdcall OutputDebugStringA(str s)');

console.log('=== Zwei Quellen, eine Auswertung ===\n');

let fehler = 0;
/* Der Hinweis erklaert den FEHLSCHLAG und steht deshalb nur dort. Sonst las
   sich eine bestandene Pruefung wie eine gescheiterte. */
const pruefe = (was, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'}  ${was}${!ok && hinweis ? ' - ' + hinweis : ''}`);
  if (!ok) fehler++;
};

const warte = ms => new Promise(r => setTimeout(r, ms));

/* Eine Zeile, die genau ein Ereignis ausloest und keinen Zustand braucht. */
const zeile = n =>
  `${n}.000 Sys [Info]: Dialog.lua: Dialog::CreateOkCancel(description=`
  + `Do you want to equip Axi A${n} Relic [Exceptional] for this mission?)`;

const ordner = await mkdtemp(path.join(tmpdir(), 'argus-log-'));
const datei = path.join(ordner, 'EE.log');
await writeFile(datei, '');

const gesehen = [];
const w = new LogWatcher(datei);
w.on('relic-equipped', ev => gesehen.push(ev.name));
await w.start();
w.setGamePids([process.pid]);
await warte(400);

const st = w.dbwinStatus();
pruefe('Debugkanal laeuft', st.aktiv);
/* Abbrechen statt rot melden - die Begruendung steht in dbwin-test.js. */
if (st.fremderZuhoerer) {
  console.log('\n=== NICHT GELAUFEN - der Kanal ist besetzt ===');
  console.log('Am Debugkanal hoert bereits ein anderes Programm mit,');
  console.log('sehr wahrscheinlich Argus selbst (npm start).');
  console.log('Argus beenden, dann noch einmal.');
  w.stop();
  await warte(400);
  await rm(ordner, { recursive: true, force: true });
  process.exit(2);
}

console.log('\n1. Zeile ueber den Kanal');
OutputDebugStringA(zeile(11) + '\n');
await warte(300);
pruefe('einmal ausgeloest', gesehen.filter(n => n === 'A11').length === 1,
       `${gesehen.filter(n => n === 'A11').length}x`);

console.log('\n2. Dieselbe Zeile spaeter in der Datei');
/* So kommt sie beim echten Spiel an: erst der Kanal, Sekunden spaeter der
   traege Dateipuffer. */
await appendFile(datei, zeile(11) + '\n');
await warte(400);
pruefe('NICHT erneut ausgeloest', gesehen.filter(n => n === 'A11').length === 1,
       `${gesehen.filter(n => n === 'A11').length}x - das Echo ist durchgerutscht`);

console.log('\n3. Zeile, die der Kanal nie hatte');
/* Der Fall, der die Dateiquelle ueberhaupt rechtfertigt: ein anderes Programm
   hat die Zeile am Kanal abgefangen, nur die Datei hat sie noch. */
await appendFile(datei, zeile(22) + '\n');
await warte(400);
pruefe('ueber die Datei ausgeloest', gesehen.includes('A22'),
       gesehen.join(', ') || 'nichts');

console.log('\n4. Bilanz');
console.log(`     ueber den Kanal: ${w.ueberDbwin}, Echos verworfen: ${w.echos},`
          + ` nur ueber die Datei: ${w.verpasst}`);
pruefe('mindestens ein Echo verworfen', w.echos >= 1, `${w.echos}`);

w.stop();
await warte(400);
await rm(ordner, { recursive: true, force: true });

console.log(`\n=== ${fehler ? fehler + ' Fehler' : 'alles in Ordnung'} ===`);
process.exit(fehler ? 1 : 0);
