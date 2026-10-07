#!/usr/bin/env node
/**
 * Prueft, wo das Hauptfenster aufgeht - gegen erfundene Bildschirme.
 *
 *   node src/cli/window-test.js
 *
 * Kein Electron, kein Fenster: core/window-place.js bekommt die gemerkte Lage
 * und die Arbeitsflaechen und sagt, ob die Lage gilt. Nachgestellt ist auch
 * Kaans Aufbau - Hauptbildschirm rechts, der zweite links daneben bei
 * x = -2560, also mit negativen Koordinaten.
 */
import { parseWindowState, placeWindow, TITLEBAR_HEIGHT } from '../core/window-place.js';

let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Arbeitsflaechen: die Taskleiste (48 px) geht unten ab. */
const PRIMARY = { x: 0, y: 0, width: 2560, height: 1392 };
const LEFT    = { x: -2560, y: 0, width: 2560, height: 1392 };
const SMALL   = { x: 0, y: 0, width: 1280, height: 672 };

const at = (x, y, width = 1560, height = 880, maximized = false) => ({ x, y, width, height, maximized });

console.log('\n=== Was aus window.json kommt ===\n');

ok('vollstaendige Lage', same(parseWindowState(at(10, 20)), at(10, 20)));
ok('maximiert nur bei true', parseWindowState({ ...at(10, 20), maximized: 'yes' }).maximized === false);
ok('Kommazahlen gerundet', same(parseWindowState({ x: 10.4, y: 20.6, width: 1559.5, height: 880.2 }),
  { x: 10, y: 21, width: 1560, height: 880, maximized: false }));
ok('fehlendes Feld: keine Lage', parseWindowState({ x: 1, y: 2, width: 3 }) === null);
ok('Text statt Zahl: keine Lage', parseWindowState({ x: '1', y: 2, width: 3, height: 4 }) === null);
ok('Breite 0: keine Lage', parseWindowState(at(0, 0, 0, 500)) === null);
ok('null, Zahl, Liste: keine Lage',
  parseWindowState(null) === null && parseWindowState(5) === null && parseWindowState([1, 2]) === null);

console.log('\n=== Wo es aufgeht ===\n');

const two = [PRIMARY, LEFT];

ok('auf dem Hauptbildschirm: wie gemerkt', same(placeWindow(at(400, 200), two), { x: 400, y: 200, width: 1560, height: 880 }));
ok('auf dem linken Bildschirm (negative x): wie gemerkt',
  same(placeWindow(at(-2200, 150), two), { x: -2200, y: 150, width: 1560, height: 880 }));
ok('ueber beide Bildschirme: gilt', placeWindow(at(-800, 100), two) !== null);
ok('linker Bildschirm abgesteckt: Standardplatz', placeWindow(at(-2200, 150), [PRIMARY]) === null);
ok('Kopfzeile ueber dem oberen Rand: Standardplatz', placeWindow(at(400, -TITLEBAR_HEIGHT + 10), two) === null);
ok('halbe Kopfzeile noch im Bild: gilt', placeWindow(at(400, -TITLEBAR_HEIGHT / 2), two) !== null);
ok('Kopfzeile unten hinter der Taskleiste: Standardplatz',
  placeWindow(at(400, 1392 - 10), two) === null);
ok('rechts fast hinaus, 200 px Kopfzeile sichtbar: gilt', placeWindow(at(2560 - 200, 300), two) !== null);
ok('rechts hinaus, nur 100 px sichtbar: Standardplatz', placeWindow(at(2560 - 100, 300), [PRIMARY]) === null);
ok('kleiner Monitor: auf die Arbeitsflaeche gekuerzt',
  same(placeWindow(at(0, 0), [SMALL]), { x: 0, y: 0, width: 1280, height: 672 }));
ok('kein Bildschirm bekannt: Standardplatz', placeWindow(at(0, 0), []) === null);
ok('kaputte Arbeitsflaeche wird uebergangen', placeWindow(at(0, 0), [null, { x: 'a' }, PRIMARY]) !== null);
ok('keine Lage: Standardplatz', placeWindow(null, two) === null);

console.log(failures ? `\n${failures} FEHLER` : '\nAlles gruen.');
process.exit(failures ? 1 : 0);
