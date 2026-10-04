#!/usr/bin/env node
/**
 * Prueft den Auto-Sync-Ausloeser (C1) ohne Spiel und ohne Electron.
 *
 *   node src/cli/autosync-test.js
 *
 * Teil 1  Welche Logzeilen ein neues Inventar melden (inventory-arrived) -
 *         Wortlaut aus Kaans EE.log vom 04.10.2026.
 * Teil 2  Welche Kopie der Scanner nimmt, wenn zwei denselben Stand haben
 *         (rankCandidates mit der gemeldeten Laenge).
 * Teil 3  Liegt eine EE.log da: wie oft der neue Ausloeser darin gegriffen
 *         haette. Nur zur Auskunft.
 */
import { existsSync, readFileSync } from 'node:fs';
import { LogWatcher, DEFAULT_LOG_PATH } from '../core/logwatch.js';
import { rankCandidates } from '../core/inventory-scan.js';

let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};

/** Zeilen durch einen frischen Beobachter schicken, Ereignisse einsammeln. */
function feed(lines) {
  const w = new LogWatcher('nicht-vorhanden.log');
  const arrived = [];
  const activity = [];
  w.on('inventory-arrived', ev => arrived.push(ev));
  w.on('game-activity', ev => activity.push(ev.trigger));
  for (const line of lines) w.handleLine(line);
  return { arrived, activity };
}

console.log('=== Teil 1: Ankunft eines Inventars ===\n');
{
  /* Rueckkehr aufs Schiff nach dem Schlusskampf - aus dem Zwischenspeicher. */
  let r = feed([
    '6429.145 Script [Info]: Background.lua: return to ship: initial sync',
    '6429.145 Sys [Info]: SyncInventoryFromDB',
    '6429.145 Sys [Info]: Using cached inventory data instead of performing sync',
    '6429.145 Sys [Info]: OnInventoryResults, body size=1293609',
    '6429.211 Sys [Info]: OnInventoryResults completed in 66ms'
  ]);
  ok('Rueckkehr aus dem Zwischenspeicher', r.arrived.length === 1 && r.arrived[0].kind === 'cached' && r.arrived[0].bytes === 1293609, JSON.stringify(r.arrived));

  /* Zwei Minuten spaeter die echte Synchronisation - gleiche Laenge, neuer Stempel. */
  r = feed([
    '6554.713 Script [Info]: Background.lua: return to ship: initial sync',
    '6554.713 Sys [Info]: SyncInventoryFromDB',
    '6554.914 Sys [Info]: OnInventoryResults, body size=1293609',
    '6554.978 Sys [Info]: OnInventoryResults completed in 63ms'
  ]);
  ok('echte Synchronisation', r.arrived.length === 1 && r.arrived[0].kind === 'sync' && r.arrived[0].bytes === 1293609);

  /* Missionsende: die Kopie mit neuem Stempel liegt danach im Heap. */
  r = feed([
    '6412.850 Script [Info]: EndOfMatch.lua: Mission Succeeded',
    '6412.858 Game [Info]: CommitInventoryChangesToDB',
    '6413.105 Sys [Info]: CommitInventoryChangesCallback - Success!(Attempt #0)',
    '6413.150 Script [Info]: EndOfMatch.lua: DbUpdateComplete'
  ]);
  ok('Commit am Missionsende', r.arrived.length === 1 && r.arrived[0].kind === 'mission' && r.arrived[0].bytes === null);

  /* Die Zeilen, die frueher den Auto-Sync ausloesten - eine Ausweichrolle
     mitten im Kampf, ein Verlassen des Trupps. Ein Inventar melden sie nicht. */
  r = feed([
    '4026.792 Game [Info]: MotionController::DoDodgeRoll TennoMotion Setting PM_DODGE to true',
    '4030.000 Net [Info]: MatchingService::LeaveSquad'
  ]);
  ok('Ausweichrolle und Truppwechsel melden kein Inventar', r.arrived.length === 0);
  ok('... game-activity feuert dafuer weiter (Reliktwaechter braucht es)', r.activity.length >= 1, r.activity.join(','));

  /* Die Laenge gehoert zur naechsten Ankunft und wird danach vergessen. */
  r = feed([
    '15.549 Sys [Info]: OnInventoryResults, body size=1293036',
    '15.829 Sys [Info]: OnInventoryResults completed in 279ms',
    '20.000 Sys [Info]: OnInventoryResults completed in 50ms'
  ]);
  ok('Laenge gilt nur fuer ihre Ankunft', r.arrived.length === 2 && r.arrived[0].bytes === 1293036 && r.arrived[1].bytes === null && r.arrived[1].kind === 'sync');
}

console.log('\n=== Teil 2: welche Kopie gewinnt ===\n');
{
  const fields = n => Array.from({ length: n }, (_, i) => 'f' + i);
  const cand = (name, f, syncedAt, bytes) => ({ name, fields: fields(f), syncedAt, bytes });

  /* Gleicher Stand, die neue Kopie ist kleiner (wie am 28.09.2026). */
  let list = [cand('alt', 12, 1000, 1293716), cand('neu', 12, 1000, 1293609)];
  ok('ohne Laenge: die groessere zuerst (bisheriges Verhalten)', rankCandidates([...list])[0].name === 'alt');
  ok('mit gemeldeter Laenge: die passende zuerst', rankCandidates([...list], 1293609)[0].name === 'neu');

  /* Der Stand geht vor der Laenge: die Commit-Kopie vom Missionsende ist
     neuer als jede Ankunft davor. */
  list = [cand('ankunft', 12, 1000, 1293609), cand('commit', 12, 2000, 1293700)];
  ok('neuerer Stand schlaegt passende Laenge', rankCandidates([...list], 1293609)[0].name === 'commit');

  /* Und die Feldabdeckung vor allem - eine Scheibe ist kein Inventar. */
  list = [cand('scheibe', 11, 3000, 1293609), cand('voll', 12, 1000, 1200000)];
  ok('mehr Felder schlagen alles', rankCandidates([...list], 1293609)[0].name === 'voll');
}

console.log('\n=== Teil 3: im echten Log ===\n');
{
  const file = DEFAULT_LOG_PATH();
  if (!existsSync(file)) {
    console.log('  (keine EE.log - uebersprungen)');
  } else {
    const lines = readFileSync(file, 'latin1').split(/\r?\n/);
    const r = feed(lines);
    const byKind = r.arrived.reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] || 0) + 1 }), {});
    console.log(`  ${lines.length} Zeilen`);
    console.log(`  neuer Ausloeser: ${r.arrived.length} Ankuenfte ${JSON.stringify(byKind)}`);
  }
}

console.log(failures ? `\n${failures} FEHLER` : '\nAlles gruen.');
process.exitCode = failures ? 1 : 0;
