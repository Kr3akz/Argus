#!/usr/bin/env node
/**
 * Prueft den Inventar-Scan aus dem Speicher - den Ersatz fuer den API-Abruf.
 *
 * Gibt Struktur und Umfang aus, damit sich das Ergebnis gegen den bisherigen
 * Abruf halten laesst. Es wird nichts auf Platte geschrieben.
 *
 *   node src/cli/heap-scan.js            Kurzfassung
 *   node src/cli/heap-scan.js --all      alle Fundstellen auflisten
 *   node src/cli/heap-scan.js --compare  gegen data/inventory.json halten
 *
 * VORHER ins Relais oder den Dojo und zurueck aufs Schiff - sonst liegt kein
 * Inventar im Heap.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { scanInventory, REQUIRED_FIELDS } from '../core/inventory-scan.js';
import { findGameProcessIds } from '../core/accountid.js';
import { isSupported } from '../core/procmem.js';
import { dataDir } from '../core/paths.js';

const showAll = process.argv.includes('--all');
const compare = process.argv.includes('--compare');

console.log('=== Voraussetzungen ===');
console.log(`  Plattform      ${process.platform}/${process.arch}` +
            (isSupported() ? '' : '   NICHT UNTERSTUETZT - Windows x64 noetig'));

const pids = await findGameProcessIds();
console.log(`  Spielprozess   ${pids.length ? 'PID ' + pids.join(', ') : 'laeuft nicht'}`);
if (!pids.length) {
  console.log('\n  Warframe starten und einloggen, dann erneut versuchen.');
  process.exit(1);
}

console.log('\n=== Suche ===');
const res = await scanInventory({ maxSeconds: 180 });
const s = res.stats || {};

if (s.regions !== undefined) {
  console.log(`  Gescannt       ${s.regions} Regionen (${s.megabytes} MB) in ${s.seconds}s`
            + (s.stoppedEarly ? '   (abgebrochen, vollstaendige Scheibe gefunden)' : ''));
}
if (s.candidates) {
  console.log(`  Fundstellen    ${s.candidates.length}`);
  const list = showAll ? s.candidates : s.candidates.slice(0, 5);
  for (const c of list) {
    console.log(`     ${c.address.padEnd(16)} ${String(c.kilobytes).padStart(6)} KB   `
              + `${String(c.fields).padStart(2)}/${REQUIRED_FIELDS.length} Felder`);
  }
  if (!showAll && s.candidates.length > list.length) {
    console.log(`     ... ${s.candidates.length - list.length} weitere (--all)`);
  }
}
if (s.chosen) {
  console.log('\n  Gewaehlt');
  console.log(`     Adresse     ${s.chosen.address}`);
  console.log(`     Umfang      ${s.chosen.kilobytes} KB `
            + `(${s.chosen.backward} rueckwaerts, ${s.chosen.forward} vorwaerts)`);
  console.log(`     Anfang      ${s.chosen.startsWithBrace ? "'{' - Dokumentanfang" : 'angeschnitten'}`);
  console.log(`     Aufbereitet ${s.repaired ? 'ja' : 'nein'} - ${s.note}`);
}

if (!res.ok) {
  console.log(`\n  FEHLER  ${res.code}: ${res.message}`);
  if (res.code === 'incomplete' && res.inventory) {
    console.log('  Das Teilergebnis wird NICHT verwendet - der Zwischenspeicher bliebe stehen.');
  }
  process.exit(1);
}

const inv = res.inventory;
console.log('\n=== Ergebnis ===');
console.log(`  Felder         ${REQUIRED_FIELDS.length}/${REQUIRED_FIELDS.length} vollstaendig`);
console.log(`  Schluessel     ${Object.keys(inv).length} insgesamt im Dokument`);

const size = key => Array.isArray(inv[key]) ? inv[key].length : null;
const rows = [
  ['Warframes',   size('Suits')],
  ['Primaer',     size('LongGuns')],
  ['Sekundaer',   size('Pistols')],
  ['Nahkampf',    size('Melee')],
  ['Mods roh',    size('RawUpgrades')],
  ['Mods gerangt',size('Upgrades')],
  ['Materialien', size('MiscItems')],
  ['Blaupausen',  size('Recipes')],
  ['Foundry',     size('PendingRecipes')]
];
console.log('\n  Bestand');
for (const [label, n] of rows) {
  if (n !== null) console.log(`     ${label.padEnd(14)} ${String(n).padStart(6)}`);
}

console.log('\n  Waehrungen');
console.log(`     Credits        ${String(inv.RegularCredits ?? '?').padStart(10)}`);
console.log(`     Platin         ${String(inv.PremiumCredits ?? '?').padStart(10)}`);
console.log(`     Endo           ${String(inv.FusionPoints ?? '?').padStart(10)}`);
if (inv.InfestedFoundry?.Name) {
  console.log(`     Helminth       ${inv.InfestedFoundry.Name}`);
}

if (compare) {
  console.log('\n=== Abgleich mit dem bisherigen Abruf ===');
  const file = path.join(dataDir(), 'inventory.json');
  let old = null;
  try {
    old = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    console.log(`  ${file} nicht lesbar - erst einmal ueber den alten Weg abrufen.`);
  }
  if (old) {
    let same = 0, differ = 0;
    for (const field of REQUIRED_FIELDS) {
      const a = Array.isArray(old[field]) ? old[field].length : old[field];
      const b = Array.isArray(inv[field]) ? inv[field].length : inv[field];
      const equal = JSON.stringify(a) === JSON.stringify(b);
      if (equal) same++; else differ++;
      if (!equal) console.log(`     ABWEICHUNG  ${field.padEnd(16)} alt ${a}   neu ${b}`);
    }
    console.log(`  ${same} Felder gleich, ${differ} abweichend.`);
    if (differ) {
      console.log('  Abweichungen sind nicht zwingend Fehler - zwischen beiden Staenden');
      console.log('  liegt Spielzeit. Auffaellig waere nur eine Liste, die deutlich kuerzer ist.');
    }
  }
}
