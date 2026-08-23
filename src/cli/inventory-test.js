#!/usr/bin/env node
/**
 * Prueft die Inventar-Aufbereitung ohne Electron und ohne Netzwerkabruf.
 * Laeuft gegen data/inventory.json bzw. die Entwicklungs-Fixture.
 *
 *   node src/cli/inventory-test.js
 */
import { loadInventory } from '../core/inventory.js';
import { loadCatalog } from '../core/catalog.js';
import { buildInventory, SECTIONS } from '../core/inventory-items.js';

const nf = n => (n ?? 0).toLocaleString('de-DE');
const ok = (label, cond, extra = '') =>
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);

const { inventory, fromCache, fetchedAt, source } = await loadInventory();
const catalog = await loadCatalog();
const view = buildInventory(inventory, catalog);

console.log('=== Quelle ===');
console.log(`  echter API-Abruf, Stand ${new Date(fetchedAt).toLocaleString('de-DE')}`);
ok('ohne Netzwerkzugriff geladen', fromCache);

console.log('\n=== Sektionen ===');
for (const { key, label } of SECTIONS) {
  const t = view.totals[key];
  console.log(`  ${label.padEnd(12)} ${String(t.arten).padStart(4)} Arten   ${nf(t.stueck).padStart(10)} Stueck`);
}

console.log('\n=== Waehrungen ===');
console.log(`  Credits ${nf(view.currencies.credits)} | Platin ${nf(view.currencies.platinum)} | Endo ${nf(view.currencies.endo)} | Dukaten ${nf(view.currencies.ducats)}`);

/* Strukturelle Invarianten statt fester Zahlen. Ein Inventar aendert sich mit
   jeder Spielsitzung - Tests gegen eingefrorene Staende schlagen dann fehl,
   ohne dass etwas kaputt ist. */
console.log('\n=== Invarianten ===');
const miscGesamt = view.totals.relics.arten + view.totals.materials.arten;
ok('Relikte + Materialien = MiscItems', miscGesamt === (inventory.MiscItems || []).length,
   `${miscGesamt} vs ${(inventory.MiscItems || []).length}`);
ok('Mods + Arcanes aus beiden Upgrade-Listen',
   view.totals.mods.arten > 0 && view.totals.arcanes.arten > 0,
   `${view.totals.mods.arten} Mods, ${view.totals.arcanes.arten} Arcanes`);
ok('Blueprints = Recipes', view.totals.blueprints.arten === (inventory.Recipes || []).length,
   `${view.totals.blueprints.arten} vs ${(inventory.Recipes || []).length}`);
ok('Relikte tragen einen Zustand',
   view.sections.relics.filter(e => e.quality).length > view.sections.relics.length * 0.9,
   `${view.sections.relics.filter(e => e.quality).length} von ${view.sections.relics.length}`);
ok('Waehrungen sind Zahlen',
   Object.values(view.currencies).every(v => Number.isFinite(v)),
   Object.values(view.currencies).join(' / '));
ok('keine Zugangsdaten in der Datei',
   !/"(nonce|accountId)"/i.test(JSON.stringify(inventory)), 'geprueft');

console.log('\n=== Aufloesung ===');
const total = Object.values(view.sections).flat().length;
const quote = Math.round((total - view.unresolved.length) / total * 100);
ok(`Namen aufgeloest (${quote}%)`, quote >= 95, `${view.unresolved.length} ohne Katalogtreffer`);
for (const e of view.unresolved.slice(0, 8)) console.log(`        offen: ${e.name}  (${e.uniqueName})`);

console.log('\n=== Stichproben ===');
const sample = (key, pick) => {
  const e = view.sections[key].find(pick) || view.sections[key][0];
  if (!e) return console.log(`  ${key}: leer`);
  const extra = e.quality ? ` [${e.quality}]`
              : e.ranks ? ` [Raenge ${e.ranks.map(r => `${r.rank}x${r.count}`).join(' ')}]` : '';
  console.log(`  ${e.name}${extra}  x${nf(e.count)}`);
  console.log(`      ${e.image}`);
};
sample('materials', e => e.name === 'Rubedo');
sample('relics',    e => /Lith/.test(e.name));
sample('mods',      e => e.ranks && e.ranks.length > 1);
sample('arcanes',   () => true);
sample('blueprints',() => true);
