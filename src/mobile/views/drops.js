/* Droptabellen: wo etwas faellt, mit Chance.
 *
 * Zuhause sucht der PC (drops:search, dieselbe Suche wie im Reiter am PC),
 * unterwegs die App selbst - mit DEs Tabellen, einmal geladen und dann aus
 * dem Speicher des Browsers (lib/source-web.js). */

import { esc, nf } from '../lib/ui.js';

const MODES = [['item', 'Item'], ['place', 'Location'], ['enemy', 'Enemy']];

/* Wo etwas faellt, wenn es kein Ort mit Planet ist - dieselben Arten wie im
   Reiter am PC (DROP_KINDS in core/drop-search.js), in der Einzahl. */
const ART = {
  mission: 'Mission', special: 'Special mission', bounty: 'Bounty', enemy: 'Enemy drop', relic: 'Relic',
  syndicate: 'Syndicate', key: 'Key or vault', sortie: 'Sortie', other: 'Other source'
};

const fmtChance = c => (c == null ? '' : `${Number(c).toLocaleString('en-GB', { maximumFractionDigits: c < 1 ? 2 : 1 })} %`);

function ort(r) {
  const teile = [r.place, r.region, r.mode].filter(Boolean);
  if (r.rotation) teile.push(`Rotation ${r.rotation}`);
  if (r.stage) teile.push(r.stage);
  if (r.refinement && r.refinement !== 'Intact') teile.push(r.refinement);
  return teile.map(esc).join(' · ');
}

/* Kopf: Art der Suche und das Suchfeld. Steht fest, waehrend man tippt -
   nur der Rumpf darunter wird neu gezeichnet (siehe render in app.js). */
export function head(st) {
  const mode = st.dropMode || 'item';
  const seg = MODES.map(([k, label]) =>
    `<button class="${mode === k ? 'active' : ''}" data-act="drop-mode" data-val="${k}">${label}</button>`).join('');
  return `<div class="seg">${seg}</div>
    <label class="search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="q-drops" type="search" value="${esc(st.dropQuery || '')}" placeholder="Search drop tables" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></label>`;
}

export function body(st) {
  const mode = st.dropMode || 'item';
  const res = st.dropResult;
  const hinweis = {
    item: 'Type an item — "Serration", "Wisp Prime Neuroptics", "Kuva" …',
    place: 'Type a node, planet or relic — "Apollodorus", "Axi A15" …',
    enemy: 'Type an enemy — "Stalker", "Corrupted Heavy Gunner" …'
  }[mode];

  let liste = '';
  if (st.dropStatus) liste = `<div class="note accent">${esc(st.dropStatus)}</div>`;
  else if (st.dropError) liste = `<div class="note warn">${esc(st.dropError)}</div>`;
  else if (res && (st.dropQuery || '').trim().length >= 2) {
    liste = res.rows.length
      ? `<div class="list">${res.rows.map(r => `<div class="row noicon">
          <div class="main"><div class="title">${esc(mode === 'item' ? r.place : r.item)}</div>
            <div class="meta wrap">${mode === 'item' ? ort({ ...r, place: null }) || esc(ART[r.kind] || r.kind) : ort(r)}${r.vaulted === true ? ' · <span class="warn-text">vaulted</span>' : ''}</div></div>
          <div class="end">${fmtChance(r.chance)}${r.rarity ? `<div class="meta">${esc(r.rarity)}</div>` : ''}</div>
        </div>`).join('')}</div>
        ${res.total > res.shown ? `<p class="muted small" style="text-align:center">${nf(res.shown)} of ${nf(res.total)} — type more to narrow it down.</p>` : ''}`
      : '<div class="note">No drops found.</div>';
  }

  return liste || `<p class="muted small" style="margin:4px 2px">${esc(hinweis)}</p>`;
}
