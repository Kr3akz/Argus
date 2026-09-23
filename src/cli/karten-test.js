#!/usr/bin/env node
/**
 * Prueft den Kartenzaehler gegen die gesammelten Aufnahmen.
 *
 * Braucht kein laufendes Warframe: jede Aufnahme unter data/diag/ geht als
 * `source` in den Erkennungsprozess, und die erkannte Zahl wird gegen das
 * `soll` im Beiblatt gehalten.
 *
 *   node src/cli/karten-test.js
 *   node src/cli/karten-test.js --laut     auch die Huebe je Gruppengroesse
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { kartenZaehlen, stop as stopOcrHost } from '../core/ocr-host.js';
import { setDataDir } from '../core/paths.js';

setDataDir(path.resolve('data'));

const laut = process.argv.includes('--laut');
const ordner = path.resolve('data', 'diag');

let dateien;
try {
  dateien = (await readdir(ordner)).filter(n => n.endsWith('.json')).sort();
} catch {
  console.log(`Kein Ordner ${ordner} - erst mit relicScanDebug Aufnahmen sammeln.`);
  process.exit(0);
}

if (!dateien.length) {
  console.log('Keine Beiblaetter gefunden.');
  process.exit(0);
}

console.log('=== Kartenzaehler gegen die Sammlung ===\n');

let treffer = 0, geprueft = 0, ohneSoll = 0;
const fehler = [];

for (const datei of dateien) {
  const bei = JSON.parse(await readFile(path.join(ordner, datei), 'utf8'));
  /* Ohne `soll` gibt es nichts zu vergleichen - eine Aufnahme, die noch
     niemand bestaetigt hat, taugt nicht als Massstab. */
  if (bei.soll?.karten == null) { ohneSoll++; continue; }

  const bild = path.join(ordner, bei.bild);
  const res = await kartenZaehlen({ source: bild });
  geprueft++;

  const soll = bei.soll.karten;
  const ist = res.ok ? res.karten : null;
  const ok = ist === soll;
  if (ok) treffer++; else fehler.push({ datei: bei.bild, soll, ist, huebe: res.huebe });

  const kurz = bei.bild.replace('relikt-', '').replace('.png', '');
  const huebe = res.huebe
    ? Object.keys(res.huebe).sort().map(k => `${k}:${String(res.huebe[k]).padStart(5)}`).join('  ')
    : '';
  console.log(`  ${ok ? 'ok  ' : 'FEHL'}  ${kurz.padEnd(24)} soll ${soll}  erkannt ${ist ?? '-'}`
            + (laut && huebe ? `   [${huebe}]` : '')
            + (res.ok ? '' : `   ${res.error}`));
}

await stopOcrHost();

console.log();
if (ohneSoll) console.log(`${ohneSoll} Aufnahme(n) ohne soll uebersprungen.`);
console.log(`${treffer} von ${geprueft} richtig.`);

if (fehler.length) {
  console.log('\nAbweichungen:');
  for (const f of fehler) {
    console.log(`  ${f.datei}: soll ${f.soll}, erkannt ${f.ist}`);
    if (f.huebe) console.log(`    Huebe ${JSON.stringify(f.huebe)}`);
  }
}

process.exit(fehler.length ? 1 : 0);
