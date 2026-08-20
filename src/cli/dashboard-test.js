#!/usr/bin/env node
/**
 * Prueft die Dashboard-Datenaufbereitung ohne Electron.
 * Spiegelt buildDashboard() aus main.js - findet Fehler, bevor die App startet.
 */
import { loadCatalog, imageUrl } from '../core/catalog.js';
import { loadProfile, displayName } from '../core/profile.js';
import { analyze, recommend, diversify, STATUS } from '../core/analyze.js';
import { masteryRankName, progressForMR } from '../core/mastery.js';
import { CATEGORY_LABELS } from '../core/classify.js';
import { resolveGoal, combineGoals, formatDuration } from '../core/recipes.js';
import { loadConfig } from '../core/config.js';
import * as store from '../core/store.js';

const ok = (label, cond, extra = '') =>
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);

const cfg = await loadConfig();
const catalog = await loadCatalog();
const { profile, fromCache } = await loadProfile(cfg.accountId, cfg.platform);
const a = analyze(profile, catalog);

console.log('=== Datenquellen ===');
ok('Katalog geladen', catalog.items.length > 1000, catalog.items.length + ' Items');
ok('Profil geladen', !!profile, displayName(profile) + (fromCache ? ' (Cache)' : ''));
ok('Analyse erstellt', a.entries.length > 0, a.entries.length + ' Eintraege');

console.log('\n=== Empfehlungen ===');
const rec = recommend(a, catalog, { limit: 200 });
ok('quickWins', rec.quickWins.length > 0, rec.quickWins.length + ' Eintraege');
ok('easyGains', rec.easyGains.length > 0, rec.easyGains.length);
ok('diversify begrenzt', diversify(rec.easyGains, 2, 8).length <= 8);

const decorate = e => ({
  ...e,
  label: CATEGORY_LABELS[e.category] || e.category,
  image: imageUrl(e.uniqueName, 128)
});

console.log('\n=== Felder, die die UI erwartet ===');
const card = decorate(rec.quickWins[0]);
for (const f of ['name', 'gain', 'label', 'image', 'reason', 'uniqueName']) {
  ok('card.' + f, card[f] !== undefined && card[f] !== null, String(card[f]).slice(0, 46));
}

console.log('\n=== Spielerblock ===');
const s = a.summary;
const player = {
  name: displayName(profile), mr: s.mr, mrName: masteryRankName(s.mr),
  progress: progressForMR(s.totalXP, s.mr), counts: s.counts,
  openGain: s.openGain, potentialMR: s.potentialMR
};
ok('name', !!player.name, player.name);
ok('mrName', !!player.mrName, player.mrName);
ok('progress.percent im Bereich 0-100',
   player.progress.percent >= 0 && player.progress.percent <= 100,
   player.progress.percent.toFixed(1) + '%');
ok('counts vollstaendig',
   ['done', 'partial', 'missing'].every(k => typeof player.counts[k] === 'number'),
   JSON.stringify(player.counts));

console.log('\n=== Ziele und Materialien ===');
const octavia = catalog.items.find(i => i.name === 'Octavia');
const r = resolveGoal(octavia.uniqueName, catalog);
ok('Materialien aufgeloest', r.materials.length > 0, r.materials.length + ' Posten');
ok('keine absurden Mengen', r.materials.every(m => m.count < 200000),
   'groesste: ' + r.materials[0].count.toLocaleString('de-DE') + 'x ' + r.materials[0].name);
ok('Credits plausibel', r.totalCredits > 0 && r.totalCredits < 5e6, r.totalCredits.toLocaleString('de-DE'));
ok('Bauzeit formatiert', /\d/.test(formatDuration(r.totalBuildSeconds)), formatDuration(r.totalBuildSeconds));

const combo = combineGoals([octavia.uniqueName], catalog);
ok('combineGoals liefert Liste', combo.materials.length > 0, combo.materials.length + ' Posten');

console.log('\n=== Speicher (Ziele/Notizen) ===');
const before = await store.load();
await store.addGoal(octavia.uniqueName, 'Octavia');
let st = await store.load();
ok('Ziel angelegt', st.goals.some(g => g.uniqueName === octavia.uniqueName));
await store.setNote(octavia.uniqueName, 'Testnotiz');
st = await store.load();
ok('Notiz gespeichert', st.notes[octavia.uniqueName] === 'Testnotiz');
await store.removeGoal(octavia.uniqueName);
await store.setNote(octavia.uniqueName, '');
st = await store.load();
ok('Aufraeumen', !st.goals.some(g => g.uniqueName === octavia.uniqueName) && !st.notes[octavia.uniqueName]);
ok('Ausgangszustand wiederhergestellt', st.goals.length === before.goals.length);

console.log('\n=== Checkliste ===');
const list = a.entries.filter(e => e.category === 'Suits');
ok('Warframes gefunden', list.length > 40, list.length + ' Stueck');
ok('Status gesetzt', list.every(e => ['done', 'partial', 'missing'].includes(e.status)));
ok('Bild-URL gebaut', /^https:\/\/cdn\.jsdelivr\.net/.test(imageUrl(list[0].uniqueName)));

console.log('\nAlles durchgelaufen.');
