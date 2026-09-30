#!/usr/bin/env node
/**
 * Prueft die Themes (core/themes.js).
 *
 *   node src/cli/theme-test.js
 *
 * Teil 1  Argus loest genau auf die Werte auf, die in style.css stehen - und
 *         die Regeln allein kommen nahe an sie heran.
 * Teil 2  Jedes Preset ist lesbar: Schrift auf dem Akzent, Textstufen,
 *         Zustandsfarben. Keine Warnungen.
 * Teil 3  Der Normalizer haelt alles im dunklen Bereich und wirft
 *         Unbrauchbares weg, statt den Start zu verhindern.
 * Teil 4  Aenderungen aus der Oberflaeche (applyPatch).
 * Teil 5  Teilen-Codes: Hin und zurueck, und was ein fremder Code nicht darf.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRESETS, COLOR_KEYS, LIMITS, parseHex, contrast, distance, rgbToOklch,
  deriveChannels, resolveTheme, normalizeTheme, normalizeColor, normalizeAppearance,
  resolveActive, describeAppearance, applyPatch, checkTheme,
  encodeShare, decodeShare, shareCodeFor
} from '../core/themes.js';

let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const argus = PRESETS.find(p => p.id === 'argus');

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 1: Argus und style.css ===');

const here = path.dirname(fileURLToPath(import.meta.url));
const css = await readFile(path.join(here, '../renderer/style.css'), 'utf8');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
const cssChannels = {};
for (const m of rootBlock.matchAll(/--t-([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
  cssChannels[m[1]] = [+m[2], +m[3], +m[4]];
}
const resolved = resolveTheme(argus);
const themed = Object.keys(resolved.vars).filter(k => k.startsWith('--t-')).map(k => k.slice(4));
const abweichend = themed.filter(k => !same(cssChannels[k], resolved.vars['--t-' + k].split(' ').map(Number)));
ok(`alle ${themed.length} Kanaele stehen so in :root`, !abweichend.length, abweichend.join(', '));
const fehlt = Object.keys(cssChannels).filter(k => !themed.includes(k));
ok('ausser den festen Farben setzt :root nichts, was ein Theme nicht auch setzt',
   same(fehlt.sort(), ['axi', 'bronze', 'gold', 'lith', 'meso', 'neo', 'omnia', 'requiem', 'riven', 'silver', 'wfm'].sort()),
   fehlt.join(', '));
ok('Fensterhintergrund bleibt #0d1117', resolved.windowBg === '#0d1117', resolved.windowBg);
ok('Overlay-Hintergrund bleibt #0b0f16', resolved.overlayBg === '#0b0f16', resolved.overlayBg);
ok('Regler stehen auf 1, Sidebar deckt zu 88 %',
   resolved.vars['--r-k'] === '1' && resolved.vars['--sf-k'] === '1' && resolved.vars['--blur-k'] === '1'
   && resolved.vars['--chrome-a'] === '.88');

/* Die Regeln allein, ohne Pins: wie weit liegen sie daneben? Unter 0.02 in
   OKLab ist mit blossem Auge kaum zu sehen. */
const nt = normalizeTheme(argus);
const ohne = deriveChannels(nt, { pins: false });
const mit = deriveChannels(nt);
let schlimmste = { k: null, d: 0 };
for (const k of Object.keys(mit)) {
  const d = distance(ohne[k], mit[k]);
  if (d > schlimmste.d) schlimmste = { k, d };
}
ok('die Regeln treffen Argus auch ohne Pins (Abstand < 0.03)', schlimmste.d < 0.03,
   `groesster Abstand ${schlimmste.d.toFixed(4)} bei ${schlimmste.k}`);

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 2: Presets ===');

ok('mindestens acht Presets, Argus zuerst', PRESETS.length >= 8 && PRESETS[0].id === 'argus');
ok('Namen und IDs sind eindeutig',
   new Set(PRESETS.map(p => p.id)).size === PRESETS.length && new Set(PRESETS.map(p => p.name)).size === PRESETS.length);
for (const p of PRESETS) {
  const t = normalizeTheme(p);
  ok(`${p.name}: Farben liegen schon im erlaubten Bereich`, same(t.colors, p.colors),
     JSON.stringify(Object.entries(t.colors).filter(([k, v]) => v !== p.colors[k])));
  const ch = deriveChannels(t);
  const r = (a, b) => contrast(ch[a], ch[b]);
  const probleme = [];
  if (r('on-accent', 'accent') < 4.5) probleme.push(`on-accent ${r('on-accent', 'accent').toFixed(2)}`);
  if (r('text', 'bg') < 12) probleme.push(`text ${r('text', 'bg').toFixed(2)}`);
  if (r('text-2', 'bg') < 4.5) probleme.push(`text-2 ${r('text-2', 'bg').toFixed(2)}`);
  if (r('text-3', 'bg') < 3.2) probleme.push(`text-3 ${r('text-3', 'bg').toFixed(2)}`);
  for (const k of ['accent-text', 'accent-soft', 'green-text', 'red-text']) {
    if (r(k, 'panel') < 4.5) probleme.push(`${k} ${r(k, 'panel').toFixed(2)}`);
  }
  if (r('ink', 'green') < 4.5) probleme.push(`ink/green ${r('ink', 'green').toFixed(2)}`);
  ok(`${p.name}: alles lesbar`, !probleme.length, probleme.join(', '));
  const w = checkTheme(t);
  ok(`${p.name}: keine Warnungen`, !w.length, w.map(x => x.text).join(' | '));
}

/* Ein neutral graues Theme darf keine Farbe bekommen, die es nicht hat. */
const grau = normalizeTheme({ colors: { ...argus.colors, bg: '#121212' } });
const gch = deriveChannels(grau);
const bunt = ['bg-hi', 'deep', 'chrome', 'panel', 'ink'].filter(k => Math.max(...gch[k]) - Math.min(...gch[k]) > 1);
ok('grauer Grund bleibt grau (bg-hi, deep, chrome, panel, ink)', !bunt.length, bunt.join(', '));

/* Ein dunkler Akzent: die Schrift auf ihm kippt auf hell, die Schriftstufen
   bleiben lesbar. */
const dunkel = normalizeTheme({ colors: { ...argus.colors, accent: '#7a3cff' } });
const dch = deriveChannels(dunkel);
ok('dunkler Akzent bekommt helle Schrift', rgbToOklch(dch['on-accent']).L > 0.9,
   dch['on-accent'].join(' '));
ok('... und seine Textstufe bleibt lesbar', contrast(dch['accent-text'], dch.panel) >= 4.5,
   contrast(dch['accent-text'], dch.panel).toFixed(2));

const glow0 = resolveTheme({ ...argus, shape: { ...argus.shape, glow: 0 } });
ok('Schein 0 heisst: oberes Verlaufsende, kein Akzent',
   glow0.vars['--t-glow'] === glow0.vars['--t-bg-hi'], `${glow0.vars['--t-glow']} / ${glow0.vars['--t-bg-hi']}`);
const ohneBlur = resolveTheme({ ...argus, shape: { ...argus.shape, blur: false } });
ok('ohne Unschaerfe deckt die Sidebar fast ganz',
   ohneBlur.vars['--blur-k'] === '0' && ohneBlur.vars['--chrome-a'] === '.97');

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 3: Normalisieren ===');

const keyOf = k => COLOR_KEYS.find(x => x.key === k);
const hell = normalizeColor('#f0f0f0', keyOf('bg'), '#0a0d12');
ok('heller Hintergrund wird dunkel geklemmt', rgbToOklch(parseHex(hell)).L <= 0.2601, hell);
const dunkleSchrift = normalizeColor('#333333', keyOf('text'), '#f2f5f9');
ok('dunkle Schrift wird hell geklemmt', rgbToOklch(parseHex(dunkleSchrift)).L >= 0.8199, dunkleSchrift);
const neon = normalizeColor('#00ff00', keyOf('bg'), '#0a0d12');
ok('greller Hintergrund verliert Helligkeit und Buntheit',
   rgbToOklch(parseHex(neon)).L <= 0.2601 && rgbToOklch(parseHex(neon)).C <= 0.0601, neon);
ok('ungueltige Farbe wird zur Ersatzfarbe', normalizeColor('red; background:url(x)', keyOf('accent'), '#4a9eff') === '#4a9eff');
ok('kurze Schreibweise wird ausgeschrieben', normalizeColor('#FFF', keyOf('surface'), '#000000') === '#ffffff');

const geformt = normalizeTheme({ colors: {}, shape: { radius: 7, surfaceContrast: 0.1, glow: 0.333, blur: 'ja' } });
ok('Regler werden begrenzt und gerastert',
   geformt.shape.radius === 1.5 && geformt.shape.surfaceContrast === 0.6 && geformt.shape.glow === 0.35,
   JSON.stringify(geformt.shape));
ok('Unschaerfe nimmt nur echte Wahrheitswerte', geformt.shape.blur === true);
ok('fremde Schluessel fallen weg', same(Object.keys(normalizeTheme({ colors: { evil: 1 }, x: 2 })).sort(), ['colors', 'shape']));

ok('ohne Konfiguration: Argus, keine eigenen, 100 %', same(normalizeAppearance(null), { theme: 'argus', custom: [], zoom: 1 }));
const kaputt = normalizeAppearance({
  theme: 'c9', zoom: 3,
  custom: [
    null, 'text', { id: 'x1' }, { id: 'c1', name: 'Eins', colors: { accent: '#ff00aa' } },
    { id: 'c1', name: 'Doppelt' }, { id: 'c2', name: '  Argus  ' }, { id: 'c3', name: '\u0007' + 'x'.repeat(80) }
  ]
});
ok('unbrauchbare Eintraege und doppelte IDs fallen weg', same(kaputt.custom.map(c => c.id), ['c1', 'c2', 'c3']));
ok('Verweis auf ein fehlendes Theme faellt auf Argus', kaputt.theme === 'argus');
ok('unbekannte Groesse faellt auf 100 %', kaputt.zoom === 1);
ok('Name gleich einem Preset wird unterschieden', kaputt.custom[1].name === 'Argus (2)', kaputt.custom[1].name);
ok('Namen ohne Steuerzeichen und gekuerzt',
   !/[\u0000-\u001f]/.test(kaputt.custom[2].name) && kaputt.custom[2].name.length <= LIMITS.nameMax, kaputt.custom[2].name);
const viele = normalizeAppearance({ custom: Array.from({ length: 70 }, (_, i) => ({ id: 'c' + (i + 1), name: 'T' + i })) });
ok(`hoechstens ${LIMITS.maxCustom} eigene Themes`, viele.custom.length === LIMITS.maxCustom);
ok('resolveActive faellt nie ins Leere', resolveActive({ theme: 'weg' }).id === 'argus');

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 4: Aenderungen ===');

let app = normalizeAppearance(null);
let r = applyPatch(app, { select: 'void' });
ok('Preset waehlen', r.ok && r.appearance.theme === 'void');
ok('applyPatch veraendert den alten Stand nicht', app.theme === 'argus');
app = r.appearance;

r = applyPatch(app, { edit: { colors: { accent: '#ff8800' } } });
ok('erste Aenderung an einem Preset legt eine Kopie an',
   r.ok && r.created === 'c1' && r.appearance.theme === 'c1' && r.appearance.custom[0].name === 'Void custom',
   JSON.stringify(r.appearance?.custom?.[0]?.name));
ok('... mit der Aenderung und dem Rest des Presets',
   r.appearance.custom[0].colors.accent === '#ff8800'
   && r.appearance.custom[0].colors.bg === PRESETS.find(p => p.id === 'void').colors.bg
   && r.appearance.custom[0].from === 'void');
ok('... und das Preset bleibt, wie es war', describeAppearance(r.appearance).presets.find(p => p.id === 'void').colors.accent === '#a98bff');
app = r.appearance;

r = applyPatch(app, { edit: { shape: { radius: 0 } } });
ok('weitere Aenderungen bleiben in der Kopie', r.ok && !r.created && r.appearance.custom.length === 1
   && r.appearance.custom[0].shape.radius === 0);
app = r.appearance;

r = applyPatch(app, { rename: { id: 'c1', name: 'Orokin' } });
ok('Umbenennen auf einen Preset-Namen wird unterschieden', r.ok && r.appearance.custom[0].name === 'Orokin (2)',
   r.appearance.custom[0].name);
app = r.appearance;
ok('Presets lassen sich nicht umbenennen', !applyPatch(app, { rename: { id: 'argus', name: 'X' } }).ok);

r = applyPatch(app, { duplicate: 'c1' });
ok('Duplizieren legt ein zweites an und waehlt es', r.ok && r.created === 'c2' && r.appearance.theme === 'c2'
   && r.appearance.custom[1].name === 'Orokin (2) copy', r.appearance?.custom?.[1]?.name);
app = r.appearance;

r = applyPatch(app, { reset: 'c1' });
ok('Zuruecksetzen holt die Farben des Presets', r.ok && r.appearance.custom[0].colors.accent === '#a98bff'
   && r.appearance.custom[0].shape.radius === 1);
app = r.appearance;

r = applyPatch(app, { select: 'c1' });
r = applyPatch(r.appearance, { remove: 'c1' });
ok('Loeschen des aktiven Themes faellt auf sein Preset', r.ok && r.appearance.theme === 'void'
   && !r.appearance.custom.some(c => c.id === 'c1'));
app = r.appearance;
ok('Presets lassen sich nicht loeschen', !applyPatch(app, { remove: 'argus' }).ok);
ok('neue IDs zaehlen weiter', applyPatch(app, { create: {} }).created === 'c3');

ok('Groesse: erlaubte Stufe', applyPatch(app, { zoom: 1.25 }).appearance.zoom === 1.25);
ok('Groesse: andere Stufen abgelehnt', !applyPatch(app, { zoom: 2 }).ok);
ok('leere Aenderung abgelehnt', !applyPatch(app, {}).ok);

let voll = normalizeAppearance({ custom: Array.from({ length: LIMITS.maxCustom }, (_, i) => ({ id: 'c' + (i + 1), name: 'T' + i })) });
ok('bei vollem Vorrat keine weitere Kopie', !applyPatch(voll, { create: {} }).ok
   && !applyPatch({ ...voll, theme: 'argus' }, { edit: { colors: { accent: '#ffffff' } } }).ok);

const d = describeAppearance(app);
ok('Beschreibung nennt aktives Theme, Presets, eigene und Grenzen',
   d.active === app.theme && d.presets.length === PRESETS.length && d.custom.length === app.custom.length
   && d.colorKeys.length === 6 && d.limits.maxCustom === LIMITS.maxCustom);
ok('jede Karte bringt ihre fertigen Variablen mit', d.presets.every(p => p.vars['--t-accent'] && p.vars['--r-k']));

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 5: Teilen ===');

const code = encodeShare({ ...PRESETS.find(p => p.id === 'grineer'), name: 'Rost', from: 'grineer',
                           shape: { radius: 0.5, surfaceContrast: 1.2, glow: 0, blur: false } });
ok('Code beginnt mit argus-theme:1:', code.startsWith('argus-theme:1:'), code.slice(0, 24));
ok('Code ist kurz genug zum Verschicken', code.length < 400, `${code.length} Zeichen`);
const back = decodeShare(code);
ok('hin und zurueck: Name, Herkunft, Farben, Form',
   back.ok && back.theme.name === 'Rost' && back.theme.from === 'grineer'
   && same(back.theme.colors, PRESETS.find(p => p.id === 'grineer').colors)
   && same(back.theme.shape, { radius: 0.5, surfaceContrast: 1.2, glow: 0, blur: false }),
   JSON.stringify(back));
ok('Leerzeichen und Umbrueche im Code stoeren nicht', decodeShare(code.replace(/(.{20})/g, '$1\n ')).ok);

ok('fremder Text wird abgelehnt', !decodeShare('hello').ok);
ok('zu langer Code wird abgelehnt', !decodeShare('argus-theme:1:' + 'A'.repeat(5000)).ok);
ok('beschaedigter Code wird abgelehnt', !decodeShare(code.slice(0, 40)).ok);
const boese = 'argus-theme:1:' + Buffer.from(JSON.stringify({
  n: 'x', c: { accent: '4a9eff);background:url(//evil)', bg: '0a0d12', surface: 'ffffff', text: 'f2f5f9', positive: '4ade80', negative: 'ff5c5c' }
})).toString('base64url');
ok('Farbe mit angehaengtem CSS wird abgelehnt', !decodeShare(boese).ok);
const hellCode = 'argus-theme:1:' + Buffer.from(JSON.stringify({
  n: 'Weiss', c: { accent: '4a9eff', bg: 'ffffff', surface: 'ffffff', text: '000000', positive: '4ade80', negative: 'ff5c5c' },
  s: { r: 99, c: -5, g: 'x', b: 1 }
})).toString('base64url');
const hellBack = decodeShare(hellCode);
ok('ein heller Code wird dunkel geklemmt statt abgelehnt',
   hellBack.ok && rgbToOklch(parseHex(hellBack.theme.colors.bg)).L <= 0.2601
   && rgbToOklch(parseHex(hellBack.theme.colors.text)).L >= 0.8199);
ok('... und seine Regler begrenzt', hellBack.ok && hellBack.theme.shape.radius === 1.5 && hellBack.theme.shape.surfaceContrast === 0.6);

r = applyPatch(normalizeAppearance(null), { import: code });
ok('Import legt ein eigenes Theme an und waehlt es', r.ok && r.appearance.theme === r.created
   && r.appearance.custom[0].name === 'Rost' && r.appearance.custom[0].from === 'grineer');
r = applyPatch(r.appearance, { import: code });
ok('derselbe Code zweimal: Name wird unterschieden', r.ok && r.appearance.custom[1].name === 'Rost (2)');
ok('Import eines kaputten Codes meldet einen Grund', (() => { const x = applyPatch(r.appearance, { import: 'nix' }); return !x.ok && !!x.error; })());
const sc = shareCodeFor(r.appearance, 'argus');
ok('auch Presets lassen sich teilen', sc.ok && decodeShare(sc.code).ok && decodeShare(sc.code).theme.from === 'argus');

console.log(`\n=== ${failures ? failures + ' Fehler' : 'alles in Ordnung'} ===`);
process.exit(failures ? 1 : 0);
