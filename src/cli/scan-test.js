#!/usr/bin/env node
/**
 * Prueft den Speicherzugriff ohne Electron - das Node-Gegenstueck zu tools/memscan.ps1.
 *
 * Gesucht wird die Account-ID fuer das oeffentliche Profil. Einen Session-nonce
 * liest Argus nicht mehr: das Inventar kommt aus dem Heap statt ueber einen
 * API-Aufruf, siehe src/cli/heap-scan.js.
 *
 * Die Kennung selbst wird NICHT ausgegeben, nur ob und wie schnell sie gefunden wurde.
 *
 *   node src/cli/scan-test.js
 */
import { findGameProcessIds, scanAccountId } from '../core/accountid.js';
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

console.log('\n=== Suche (im Worker, blockiert die App also nicht) ===');
const started = Date.now();
const res = await scanAccountId();
const took = ((Date.now() - started) / 1000).toFixed(1);

if (!res.ok) {
  console.log(`  FEHLER  ${res.code}: ${res.message}`);
  process.exit(1);
}

const s = res.stats || {};
console.log(`  Durchgang      ${s.pass}`);
console.log(`  Regionen       ${s.regions}`);
console.log(`  Gelesen        ${s.megabytes} MB`);
console.log(`  Fundstellen    ${s.candidates}`);
console.log(`  Verschiedene   ${s.distinct} Kennung(en)`);
console.log(`  Scandauer      ${s.seconds}s`);
console.log(`  Gesamt         ${took}s (inkl. Worker-Start)`);

console.log('\n=== Ergebnis ===');
console.log(`  ok    Account-ID gefunden (${res.accountId.length} Zeichen)`);
console.log('  Die Kennung wird absichtlich nicht ausgegeben.');
if (s.distinct > 1) {
  console.log(`  Hinweis: ${s.distinct} verschiedene Kennungen gefunden - genommen wurde die haeufigste.`);
}
