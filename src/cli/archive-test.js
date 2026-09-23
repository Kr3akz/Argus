#!/usr/bin/env node
/**
 * Prueft die Ablage der Beweisaufnahmen (src/core/scan-archive.js).
 *
 * Geprueft wird vor allem das AUFRAEUMEN, weil es loescht:
 *  - Beiblatt wird geschrieben und ist lesbar
 *  - unter der Grenze wird nichts weggeraeumt
 *  - ueber der Grenze gehen die AELTESTEN
 *  - was ein eingetragenes `soll` hat, bleibt - auch wenn es das aelteste ist
 *  - ein Bild ohne Beiblatt wird nicht bevorzugt geloescht
 *
 *   node src/cli/archive-test.js
 */
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { archiveScan, pruneArchive } from '../core/scan-archive.js';

console.log('=== Ablage der Beweisaufnahmen ===\n');

let fehler = 0;
const pruefe = (was, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'}  ${was}${hinweis ? ' - ' + hinweis : ''}`);
  if (!ok) fehler++;
};

const ordner = await mkdtemp(path.join(tmpdir(), 'argus-ablage-'));

/** Ein Bild mit dem Namensschema anlegen, das Argus benutzt. */
async function bildAnlegen(lauf, stempel) {
  const p = path.join(ordner, `relikt-${lauf}-${stempel}.png`);
  await writeFile(p, 'nicht wirklich ein PNG');
  return p;
}

const namen = async () => (await readdir(ordner)).sort();

console.log('1. Beiblatt schreiben');
const bild = await bildAnlegen(1, '2026-09-22T10-00-00');
const bei = await archiveScan(bild, {
  at: '2026-09-22T10:00:00.000Z',
  karten: { erwartet: 4, gelesen: 3 },
  gelesen: [{ position: 1, name: 'Paris Prime Grip', score: 0.94 }]
});
pruefe('Beiblatt angelegt', !!bei);
const inhalt = JSON.parse(await readFile(bei, 'utf8'));
pruefe('soll steht drin und ist null', 'soll' in inhalt && inhalt.soll === null);
pruefe('Bildname zeigt auf das Bild', inhalt.bild === path.basename(bild));
pruefe('Messwerte sind mitgekommen', inhalt.karten?.gelesen === 3);

console.log('\n2. Unter der Grenze wird nichts weggeraeumt');
let weg = await pruneArchive(ordner, 30);
pruefe('nichts geloescht', weg === 0, `${weg} geloescht`);
pruefe('beide Dateien noch da', (await namen()).length === 2);

console.log('\n3. Ueber der Grenze gehen die aeltesten');
await rm(ordner, { recursive: true, force: true });
await mkdir(ordner, { recursive: true });
for (let i = 1; i <= 5; i++) {
  const b = await bildAnlegen(i, `2026-09-22T10-0${i}-00`);
  await archiveScan(b, { at: `2026-09-22T10:0${i}:00.000Z` });
}
weg = await pruneArchive(ordner, 3);
const uebrig = (await namen()).filter(n => n.endsWith('.png'));
pruefe('zwei Paare weggeraeumt', weg === 2, `${weg} geloescht`);
pruefe('die drei juengsten sind geblieben',
       uebrig.length === 3 && uebrig[0].includes('10-03') && uebrig[2].includes('10-05'),
       uebrig.join(', '));

console.log('\n4. Was ein soll hat, bleibt');
await rm(ordner, { recursive: true, force: true });
await mkdir(ordner, { recursive: true });
for (let i = 1; i <= 5; i++) {
  const b = await bildAnlegen(i, `2026-09-22T11-0${i}-00`);
  await archiveScan(b, { at: `2026-09-22T11:0${i}:00.000Z` });
}
/* Ausgerechnet in das AELTESTE etwas eintragen - genau das, was ohne
   Schutzregel als Erstes wegfliegen wuerde. */
const aeltestes = path.join(ordner, 'relikt-1-2026-09-22T11-01-00.json');
const alt = JSON.parse(await readFile(aeltestes, 'utf8'));
alt.soll = ['Paris Prime Grip', 'Forma Blueprint'];
await writeFile(aeltestes, JSON.stringify(alt, null, 2));

weg = await pruneArchive(ordner, 3);
const nachher = (await namen()).filter(n => n.endsWith('.png'));
pruefe('das aelteste ist trotzdem noch da',
       nachher.includes('relikt-1-2026-09-22T11-01-00.png'), nachher.join(', '));
pruefe('es zaehlt nicht auf das Kontingent', nachher.length === 4, `${nachher.length} uebrig`);

console.log('\n5. Bild ohne Beiblatt');
await rm(ordner, { recursive: true, force: true });
await mkdir(ordner, { recursive: true });
for (let i = 1; i <= 4; i++) {
  const b = await bildAnlegen(i, `2026-09-22T12-0${i}-00`);
  /* Das juengste bekommt KEINS - so sieht ein Durchgang aus, der abbrach. */
  if (i < 4) await archiveScan(b, { at: `2026-09-22T12:0${i}:00.000Z` });
}
await pruneArchive(ordner, 2);
const rest = (await namen()).filter(n => n.endsWith('.png'));
pruefe('das beiblattlose juengste ueberlebt',
       rest.includes('relikt-4-2026-09-22T12-04-00.png'), rest.join(', '));

await rm(ordner, { recursive: true, force: true });

console.log(`\n=== ${fehler ? fehler + ' Fehler' : 'alles in Ordnung'} ===`);
process.exit(fehler ? 1 : 0);
