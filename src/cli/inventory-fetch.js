#!/usr/bin/env node
/**
 * Holt das Inventar EINMAL aus dem Spielspeicher und legt es als
 * data/inventory.json ab. Danach wird gegen diese Datei entwickelt.
 *
 * FRUEHER stand hier ein echter API-Abruf bei DE, mit allem Drumherum:
 * Mindestabstand, Sperrfrist, --force. Das ist weg - der Scan belastet
 * niemanden ausser der eigenen CPU, also gibt es auch nichts zu drosseln.
 *
 *   node src/cli/inventory-fetch.js            Stand anzeigen, nichts holen
 *   node src/cli/inventory-fetch.js --live     Speicher scannen und speichern
 *
 * VORHER ins Relais oder den Dojo und zurueck aufs Schiff - ohne Zonenwechsel
 * liegt kein Inventar im Speicher.
 */
import { loadInventory, inventoryAge } from '../core/inventory.js';
import { findGameProcessIds } from '../core/accountid.js';

const live = process.argv.includes('--live');

const age = await inventoryAge();
const pids = await findGameProcessIds();

const QUELLE = { api: 'alter API-Abruf', memory: 'Spielspeicher' };
console.log('=== Stand ===');
console.log(`  Lokale Datei   ${age ? new Date(age.fetchedAt).toLocaleString('de-DE')
                                    + '  (' + (QUELLE[age.source] || age.source) + ')' : 'noch keine'}`);
console.log(`  Spielprozess   ${pids.length ? 'laeuft (PID ' + pids.join(', ') + ')' : 'laeuft nicht'}`);

if (!live) {
  console.log('\n  Kein Scan ohne --live:');
  console.log('    node src/cli/inventory-fetch.js --live');
  process.exit(0);
}

console.log('\n=== Scan ===');
const started = Date.now();
let res;
try {
  res = await loadInventory({ refresh: true });
} catch (err) {
  console.log(`  FEHLGESCHLAGEN  ${err.code || err.name || 'Fehler'}: ${err.message}`);
  process.exit(1);
}

if (res.fromCache) {
  console.log(`  Kein neuer Stand (${res.skipped}): ${res.message}`);
  console.log('  Die alte Datei bleibt unangetastet.');
  process.exit(0);
}

const inv = res.inventory;
const keys = Object.keys(inv);
const size = Buffer.byteLength(JSON.stringify(inv));
const s = res.stats || {};
console.log(`  ok  ${((Date.now() - started) / 1000).toFixed(1)}s, ${(size / 1048576).toFixed(2)} MB, ${keys.length} Felder`);
if (s.chosen) {
  console.log(`      Fundstelle ${s.chosen.address}, ${s.chosen.kilobytes} KB, `
            + `${s.repaired ? 'aufbereitet' : 'unveraendert'}`);
}
console.log('  Gespeichert als data/inventory.json');

const n = k => (Array.isArray(inv[k]) ? inv[k].length : '-');
console.log('\n=== Struktur ===');
console.log(`  MiscItems      ${n('MiscItems')}      (Materialien + Relikte)`);
console.log(`  RawUpgrades    ${n('RawUpgrades')}      (ungerankte Mods + Arcanes)`);
console.log(`  Upgrades       ${n('Upgrades')}      (gerankte Mods + Arcanes)`);
console.log(`  Recipes        ${n('Recipes')}      (Blueprints)`);
console.log(`  PendingRecipes ${n('PendingRecipes')}      (laufende Foundry)`);
console.log(`  Credits        ${inv.RegularCredits ?? '-'} / Platin ${inv.PremiumCredits ?? '-'} / Endo ${inv.FusionPoints ?? '-'}`);

/* Gegenprobe: es gibt keinen nonce mehr, der versehentlich auf Platte landen
   koennte - aber die Pruefung bleibt stehen, weil sie nichts kostet und der
   Tag kommen kann, an dem jemand wieder etwas Vertrauliches mitschleppt. */
const flat = JSON.stringify(inv);
const suspects = keys.filter(k => /nonce|secret|password|authtoken|sessiontoken/i.test(k));
console.log('\n=== Gegenprobe ===');
console.log(`  Verdaechtige Feldnamen  ${suspects.length ? suspects.join(', ') : 'keine'}`);
console.log(`  "nonce" im Rohtext      ${/"nonce"/i.test(flat) ? 'JA - pruefen!' : 'nein'}`);
