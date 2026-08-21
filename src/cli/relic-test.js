/**
 * Prueft die Relikt- und Preis-Kette ohne Electron:
 *   Droptabelle -> Belohnungen -> Zuordnung zum Markt -> Preis
 *   und die Aufloesung der Reliktpfade aus dem eigenen Inventar.
 *
 * Aufruf:  node src/cli/relic-test.js [Relikt]      z. B. "Axi A1"
 */
import { loadRelicTables, rewardsFor, resolveInventoryRelic } from '../core/relics.js';
import { loadMarketItems, findMarketItem, getPrice } from '../core/market.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dataFile } from '../core/paths.js';

const wanted = process.argv.slice(2).join(' ') || 'Axi A1';
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const t0 = Date.now();

console.log('1. Droptabellen laden …');
const relics = await loadRelicTables();
console.log(`   ${relics.relics.length} farmbare Relikte${relics.stale ? ` (alter Stand: ${relics.stale})` : ''}`);

console.log('2. Marktliste laden …');
const market = await loadMarketItems();
console.log(`   ${market.list.length} handelbare Items${market.stale ? ` (alter Stand: ${market.stale})` : ''}`);

const relic = rewardsFor(relics, wanted);
if (!relic) {
  console.error(`\nRelikt "${wanted}" nicht gefunden. Beispiele: ` +
    relics.relics.slice(0, 6).map(r => r.key).join(', '));
  process.exit(1);
}

console.log(`\n3. ${relic.key} (${relic.state}) - ${relic.rewards.length} Belohnungen\n`);
console.log('   ' + pad('Belohnung', 38) + pad('Seltenheit', 11) + pad('Chance', 9) + pad('Platin', 17) + 'Dukaten');
console.log('   ' + '-'.repeat(89));

let unmatched = 0;
for (const r of relic.rewards) {
  const item = findMarketItem(market, { name: r.itemName });
  if (!item) unmatched++;

  const price = item ? await getPrice(item.slug) : null;
  const plat = price
    ? `${price.min}p (Median ${price.median})${price.online ? '' : ' [offline]'}`
    : (item ? 'kein Angebot' : 'nicht am Markt');

  console.log('   ' + pad(r.itemName, 38) + pad(r.rarity, 11) +
              pad((r.chance ?? '?') + '%', 9) + pad(plat, 17) +
              (item?.ducats ?? '-'));
}

/* Zweite Probe: die Pfade aus dem echten Inventar. Der interne Pfadname hat
   mit dem Anzeigenamen nichts zu tun, deshalb geht die Aufloesung ueber die
   Marktliste - siehe Kommentar in relics.js. */
const invFile = dataFile('inventory.json');
if (existsSync(invFile)) {
  const raw = JSON.parse(await readFile(invFile, 'utf8'));
  const inv = raw.inventory || raw;

  const owned = (inv.MiscItems || []).filter(e =>
    typeof e.ItemType === 'string' && e.ItemType.includes('/Projections/'));

  let named = 0, farmable = 0, vaulted = 0, unknown = 0;
  const examples = [];

  for (const entry of owned) {
    const res = resolveInventoryRelic(market, entry.ItemType);
    if (!res) continue;
    if (!res.key) { unknown++; continue; }
    named++;
    if (relics.byKey.has(res.key)) farmable++; else vaulted++;
    if (examples.length < 3) {
      examples.push(`${entry.ItemType.replace('/Lotus/Types/Game/Projections/', '')}  ->  ${res.key} (${res.state}) x${entry.ItemCount ?? '?'}`);
    }
  }

  console.log(`\n4. Inventar: ${owned.length} Reliktsorten`);
  console.log(`   benannt        : ${named}`);
  console.log(`   davon farmbar  : ${farmable}`);
  console.log(`   davon vaulted  : ${vaulted}   (kein Eintrag in den Droptabellen)`);
  console.log(`   ohne Zuordnung : ${unknown}`);
  examples.forEach(e => console.log('   ' + e));
} else {
  console.log('\n4. Kein data/inventory.json - Inventarprobe uebersprungen');
}

console.log(`\nFertig in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
            (unmatched ? ` - ${unmatched} Belohnung(en) ohne Markt-Zuordnung` : ''));
