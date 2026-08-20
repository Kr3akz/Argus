#!/usr/bin/env node
/**
 * Holt das Inventar EINMAL live und legt es als data/inventory.json ab.
 *
 * Danach wird gegen diese Datei entwickelt, nicht gegen die API - genau wie beim
 * Profil (data/profile-<id>.json). Derselbe Host hat schon einmal eine IP-Sperre
 * ausgeloest, die den Spiel-Login blockiert hat.
 *
 *   node src/cli/inventory-fetch.js            Stand anzeigen, nichts abrufen
 *   node src/cli/inventory-fetch.js --live     einen echten Abruf ausloesen
 *   node src/cli/inventory-fetch.js --live --force   6-Stunden-Abstand ueberspringen
 *
 * --force umgeht nur die Hoeflichkeitspause, niemals die 24-Stunden-Sperre nach
 * einer echten Drosselung.
 */
import { loadInventory, inventoryAge } from '../core/inventory.js';
import { checkAllowed, formatWait } from '../core/ratelimit.js';
import { findGameProcessIds } from '../core/gamecreds.js';

const live  = process.argv.includes('--live');
const force = process.argv.includes('--force');

const age = await inventoryAge();
const gate = await checkAllowed({ force });
const pids = await findGameProcessIds();

const QUELLE = { api: 'echter API-Abruf', alecaframe: 'AlecaFrame-Notbehelf' };
console.log('=== Stand ===');
console.log(`  Lokale Datei   ${age ? new Date(age.fetchedAt).toLocaleString('de-DE')
                                    + '  (' + (QUELLE[age.source] || age.source) + ')' : 'noch keine'}`);
console.log(`  Spielprozess   ${pids.length ? 'laeuft (PID ' + pids.join(', ') + ')' : 'laeuft nicht'}`);
console.log(`  Drosselung     ${gate.allowed ? 'Abruf erlaubt' : gate.reason + ' - ' + formatWait(gate.waitMs)}`);
if (!gate.allowed) console.log(`                 ${gate.message}`);

if (!live) {
  console.log('\n  Kein Abruf ohne --live. Fuer den einmaligen Live-Abruf:');
  console.log('    node src/cli/inventory-fetch.js --live');
  process.exit(0);
}

console.log('\n=== Live-Abruf ===');
const started = Date.now();
let res;
try {
  res = await loadInventory({ refresh: true, force });
} catch (err) {
  console.log(`  FEHLGESCHLAGEN  ${err.code || err.name || 'Fehler'}: ${err.message}`);
  if (err.wrongEndpoint) {
    console.log('  -> ENDPOINT in src/core/inventory.js anpassen. Der Pfad ist der einzige');
    console.log('     Punkt, der sich nicht am Prozessspeicher nachmessen liess.');
  }
  process.exit(1);
}

if (res.fromCache) {
  console.log(`  Kein Abruf: ${res.message}`);
  process.exit(0);
}

const inv = res.inventory;
const keys = Object.keys(inv);
const size = Buffer.byteLength(JSON.stringify(inv));
console.log(`  ok  ${((Date.now() - started) / 1000).toFixed(1)}s, ${(size / 1048576).toFixed(2)} MB, ${keys.length} Felder`);
console.log('  Gespeichert als data/inventory.json');

const n = k => (Array.isArray(inv[k]) ? inv[k].length : '-');
console.log('\n=== Struktur ===');
console.log(`  MiscItems      ${n('MiscItems')}      (Materialien + Relikte)`);
console.log(`  RawUpgrades    ${n('RawUpgrades')}      (ungerankte Mods + Arcanes)`);
console.log(`  Upgrades       ${n('Upgrades')}      (gerankte Mods + Arcanes)`);
console.log(`  Recipes        ${n('Recipes')}      (Blueprints)`);
console.log(`  Credits        ${inv.RegularCredits ?? '-'} / Platin ${inv.PremiumCredits ?? '-'} / Endo ${inv.FusionPoints ?? '-'}`);

/* Gegenprobe: der nonce darf nicht in der Antwort stehen und damit auf Platte
   landen. Die Account-ID darf - die steht ohnehin im Dateinamen des Profils. */
const flat = JSON.stringify(inv);
const suspects = keys.filter(k => /nonce|token|secret|password/i.test(k));
console.log('\n=== Gegenprobe ===');
console.log(`  Verdaechtige Feldnamen  ${suspects.length ? suspects.join(', ') : 'keine'}`);
console.log(`  "nonce" im Rohtext      ${/"nonce"/i.test(flat) ? 'JA - pruefen!' : 'nein'}`);
