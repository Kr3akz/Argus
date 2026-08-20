#!/usr/bin/env node
/** Konsolen-Report: Mastery-Stand und die lohnendsten naechsten Ziele. */
import { loadCatalog } from '../core/catalog.js';
import { loadProfile, displayName } from '../core/profile.js';
import { analyze, recommend, diversify, STATUS } from '../core/analyze.js';
import { masteryRankName } from '../core/mastery.js';
import { CATEGORY_LABELS } from '../core/classify.js';
import { loadConfig } from '../core/config.js';

const n = x => x.toLocaleString('de-DE');
const bar = (pct, w = 24) => '#'.repeat(Math.round(pct / 100 * w)).padEnd(w, '.');

const cfg = await loadConfig();
const accountId = process.argv[2] || cfg.accountId;
if (!accountId) {
  console.error('Keine Account-ID. Aufruf: npm run report -- <accountId>');
  console.error('ID: auf warframe.com einloggen -> /api/user-data -> Feld "user_id"');
  process.exit(1);
}

const catalog = await loadCatalog();
const { profile, fromCache, message } = await loadProfile(accountId, cfg.platform);
if (message) console.log('(' + message + ')');
else if (fromCache) console.log('(aus lokalem Cache - kein Netzwerkzugriff)');

const a = analyze(profile, catalog);
const s = a.summary;

console.log(`\n=== ${displayName(profile)} ===`);
console.log(`Mastery Rank ${s.mr} (${masteryRankName(s.mr)})   [Spiel meldet: ${s.reportedMR}]`);
console.log(`Gesamt-MR-XP: ${n(s.totalXP)}   -   bis MR ${s.mr + 1} noch ${n(s.nextMRneeds)}`);
console.log(`Items: ${s.counts.done} fertig | ${s.counts.partial} angefangen | ${s.counts.missing} offen`);
console.log(`Offen: ${n(s.openGain)} MR-XP  ->  maximal MR ${s.potentialMR}`);

const rec = recommend(a, catalog, { limit: 200 });

const show = (title, list, hint) => {
  console.log(`\n=== ${title} ===`);
  if (hint) console.log(`    ${hint}`);
  if (!list.length) return console.log('    (nichts)');
  for (const r of list) {
    const cat = CATEGORY_LABELS[r.category] || r.category;
    console.log(`\n  ${r.name}  [${cat}]  +${n(r.gain)} MR-XP   (Aufwand ${r.effort})`);
    console.log(`     ${r.reason}`);
  }
};

show('QUICK WINS', rec.quickWins.slice(0, 8), 'Hast du bereits - nur noch hochleveln, kein Farmen noetig');
show('GUENSTIG ZU HOLEN', diversify(rec.easyGains, 2, 8), 'Bester MR-Gewinn pro Aufwand');
show('FEHLENDE WARFRAMES', rec.all.filter(r => r.category === 'Suits' && !r.owned).slice(0, 10), 'Je 6.000 MR-XP');

console.log('\n=== FORTSCHRITT NACH KATEGORIE ===');
const groups = {};
for (const e of a.entries) {
  const g = groups[e.category] || (groups[e.category] = { done: 0, total: 0, gain: 0 });
  g.total++;
  if (e.status === STATUS.DONE) g.done++;
  g.gain += e.gain;
}
Object.entries(groups).sort((x, y) => y[1].gain - x[1].gain).forEach(([k, g]) => {
  console.log(`  ${(CATEGORY_LABELS[k] || k).padEnd(19)} ${bar(g.done / g.total * 100)} `
            + `${String(g.done).padStart(4)}/${String(g.total).padEnd(4)} offen ${n(g.gain).padStart(9)}`);
});
