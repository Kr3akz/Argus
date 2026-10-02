/* Foundry und Ziele - beides steht nur am PC (Inventar und Profil), die
 * Seite gibt es deshalb nur zuhause. Unterwegs zeigt die App, wie man
 * hinkommt (siehe pcNeeded in app.js). */

import { esc, img, nf, countdown, phaseBar, ago } from '../lib/ui.js';

export const PAGES = [['foundry', 'Foundry'], ['goals', 'Goals']];

export function counts({ foundry, dashboard }) {
  return {
    foundry: foundry && !foundry.empty ? (foundry.items || []).filter(i => i.ready).length || null : null,
    goals: dashboard ? (dashboard.goals || []).filter(g => !g.done).length : null
  };
}

/* ------------------------------- Foundry ------------------------------- */

export function renderFoundry(q) {
  if (!q || q.empty) {
    return `<div class="empty"><div class="big">⚒</div><h3>No foundry data yet</h3>
      <p>Argus reads the foundry from your inventory. Open the Inventory tab on the PC once with the game running.</p></div>`;
  }
  const fertig = (q.items || []).filter(i => i.ready);
  const baut = (q.items || []).filter(i => !i.ready);
  const zeile = i => {
    const start = i.buildSeconds && i.completionAt ? new Date(i.completionAt - i.buildSeconds * 1000).toISOString() : null;
    return `<div class="row">
      ${img(i.image)}
      <div class="main">
        <div class="title">${esc(i.name)}${i.count > 1 ? ` <span class="muted">×${nf(i.count)}</span>` : ''}</div>
        ${i.ready ? '<div class="meta ok-text">Ready to claim</div>'
          : `<div class="meta">${i.completionAt ? `done in ${countdown(new Date(i.completionAt).toISOString())}` : 'building'}</div>
             ${start ? phaseBar(start, new Date(i.completionAt).toISOString()) : ''}`}
      </div>
      <div class="end">${i.ready ? '<span class="badge ok">Ready</span>' : ''}</div>
    </div>`;
  };
  const h = q.helminth;
  return `
    ${fertig.length ? `<section class="section"><div class="section-title">Ready</div><div class="list">${fertig.map(zeile).join('')}</div></section>` : ''}
    <section class="section"><div class="section-title">Building</div>
      ${baut.length ? `<div class="list">${baut.map(zeile).join('')}</div>` : '<div class="note">Nothing is building right now.</div>'}
    </section>
    ${h?.ability ? `<section class="section"><div class="section-title">Helminth</div><div class="list">
      <div class="row noicon"><div class="main"><div class="title">${esc(h.ability)}</div>
        <div class="meta">${h.busy ? `ready in ${countdown(new Date(h.readyAt).toISOString())}` : 'ready to subsume'}</div></div>
        <div class="end">${h.busy ? '' : '<span class="badge ok">Ready</span>'}</div></div>
    </div></section>` : ''}
    <p class="muted small" style="text-align:center">As of the last inventory read · ${esc(ago(q.fetchedAt))}.
      You get a notification when something is done.</p>`;
}

/* -------------------------------- Ziele -------------------------------- */

function bedarf(r) {
  const genug = r.enough === true;
  const knapp = r.enough === false;
  return `<div class="need">
    ${img(r.image, 'thumb sm')}
    <div>${esc(r.name)}${r.building ? ` <span class="badge accent">${nf(r.building)} building</span>` : ''}</div>
    <div class="have ${genug ? 'ok' : knapp ? 'short' : ''}">${r.have == null ? '' : `${nf(r.have)} / `}${nf(r.count)}</div>
  </div>`;
}

export function renderGoals(d, st) {
  if (!d) return '';
  const p = d.player || {};
  const offen = (d.goals || []).filter(g => !g.done);
  const fertig = (d.goals || []).filter(g => g.done);
  const zeigeFertige = st.showDone === true;
  const kopf = `<div class="card" style="display:flex;gap:12px;align-items:center">
      ${p.loadout?.image ? img(p.loadout.image, 'thumb round') : ''}
      <div style="flex:1;min-width:0">
        <h3>${esc(p.name || 'Tenno')}</h3>
        <div class="sub">MR ${esc(p.mr ?? '—')}${p.mrName ? ` · ${esc(p.mrName)}` : ''}${p.clan ? ` · ${esc(p.clan)}` : ''}</div>
      </div>
    </div>`;

  const ziel = g => {
    const teile = [...(g.components || []), ...(g.materials || [])];
    const unter = g.isUpgrade
      ? (g.sources || []).map(s => `<div class="meta wrap"><b>${esc(s.label)}:</b> ${s.entries.map(e =>
          `${esc(e.place)}${e.chance ? ` (${esc(e.chance)})` : ''}`).join(', ')}</div>`).join('')
      : '';
    const was = g.owned ? `Rank ${nf(g.rank)} of ${nf(g.maxLvl)}` : g.isUpgrade ? (g.kind === 'farm' ? 'To farm' : `Rank ${nf(g.rank)} of ${nf(g.maxLvl)}`) : 'To build';
    return `<details class="fold">
      <summary>${img(g.image)}<div style="min-width:0">
        <div class="title" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.name)}</div>
        <div class="meta muted small">${esc(was)}${g.buildTime ? ` · ${esc(g.buildTime)}` : ''}${g.credits ? ` · ${nf(g.credits)} credits` : ''}</div>
      </div><span class="chev">›</span></summary>
      <div class="body">
        ${teile.length ? teile.map(bedarf).join('') : ''}
        ${unter}
        ${g.note ? `<div class="note" style="margin-top:8px">${esc(g.note)}</div>` : ''}
        ${!teile.length && !unter && !g.note ? '<div class="muted small">Nothing left to collect.</div>' : ''}
      </div>
    </details>`;
  };

  const einkauf = (d.shopping?.materials || []).length
    ? `<section class="section"><div class="section-title">Shopping list <span class="hint">for all open goals</span></div>
        <div class="card">${d.shopping.materials.map(bedarf).join('')}
        ${d.shopping.credits ? `<div class="need"><span></span><div>Credits</div><div class="have">${nf(d.shopping.credits)}</div></div>` : ''}
        </div></section>`
    : '';

  return `${kopf}
    <section class="section"><div class="section-title">Goals <span class="hint">${offen.length} open</span></div>
      ${offen.length ? offen.map(ziel).join('') : '<div class="note">No open goals. Add some in Argus on your PC under Mastery.</div>'}
      ${fertig.length ? `<button class="btn small block" data-act="goals-done" style="margin-top:4px">${zeigeFertige ? 'Hide' : 'Show'} ${fertig.length} finished</button>` : ''}
      ${zeigeFertige ? `<div style="margin-top:10px">${fertig.map(ziel).join('')}</div>` : ''}
    </section>
    ${einkauf}
    ${(d.quickWins || []).length ? `<section class="section"><div class="section-title">Quick wins <span class="hint">owned, not mastered</span></div>
      <div class="list">${d.quickWins.map(q => `<div class="row">${img(q.image, 'thumb sm')}<div class="main">
        <div class="title">${esc(q.name)}</div><div class="meta">${esc(q.label || '')}</div></div>
        <div class="end">${q.gain ? `+${nf(q.gain)} XP` : ''}</div></div>`).join('')}</div></section>` : ''}`;
}
