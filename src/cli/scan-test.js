#!/usr/bin/env node
/**
 * Prueft den Speicherzugriff ohne Electron - das Node-Gegenstueck zu tools/memscan.ps1.
 *
 * Gibt bewusst KEINE Zugangsdaten aus, nur ob und wie schnell sie gefunden wurden.
 *
 *   node src/cli/scan-test.js          gemerkte Adresse zuerst probieren
 *   node src/cli/scan-test.js --full   Schnellpfad ueberspringen, immer scannen
 */
import { findGameProcessIds, scanCredentials } from '../core/gamecreds.js';
import { isSupported } from '../core/procmem.js';

console.log('=== Speicherzugriff ===');
console.log(`  Plattform      ${process.platform}/${process.arch}` +
            (isSupported() ? '' : '   NICHT UNTERSTUETZT - Windows x64 noetig'));

const pids = await findGameProcessIds();
console.log(`  Spielprozess   ${pids.length ? 'PID ' + pids.join(', ') : 'laeuft nicht'}`);

if (!pids.length) {
  console.log('\n  Warframe starten und einloggen, dann erneut versuchen.');
  process.exit(1);
}

const skipHint = process.argv.includes('--full');
console.log('\n=== Suche (im Worker, blockiert die App also nicht) ===');
if (skipHint) console.log('  Schnellpfad uebersprungen (--full)');
const started = Date.now();
const res = await scanCredentials({ skipHint });
const took = ((Date.now() - started) / 1000).toFixed(1);

if (!res.ok) {
  console.log(`  FEHLER  ${res.code}: ${res.message}`);
  process.exit(1);
}

const s = res.stats || {};
if (s.fromHint) {
  console.log('  Treffer ueber die gemerkte Adresse - kein Vollscan noetig.');
} else {
  console.log(`  Durchgang      ${s.pass}`);
  console.log(`  Regionen       ${s.regions}`);
  console.log(`  Gelesen        ${s.megabytes} MB`);
  console.log(`  Fundstellen    ${s.candidates}`);
  console.log(`  Scandauer      ${s.seconds}s`);
}
console.log(`  Gesamt         ${took}s (inkl. Worker-Start)`);

/* Nur Formmerkmale, nie die Werte selbst. Das ct ist die Plattform, kein Geheimnis. */
console.log('\n=== Ergebnis ===');
console.log(`  ok    Zugangsdaten gefunden (accountId ${res.accountId.length} Zeichen, ` +
            `nonce ${res.nonce.length} Stellen, ct ${res.ct || 'nicht gefunden'})`);
console.log('  accountId und nonce werden absichtlich nicht ausgegeben.');
