/* Inventar und Preise.
 *
 * Das Inventar kommt aus dem laufenden Spiel am PC - auf dem Handy gibt es
 * es nur zuhause. Die Preisabfrage geht auch unterwegs: sie fragt dann
 * warframe.market selbst, mit derselben Rechnung wie am PC (market.js). */

import { esc, img, nf, ago, ASSET } from '../lib/ui.js';

export const PAGES_PC = [['relics', 'Relics'], ['sets', 'Prime sets'], ['parts', 'Prime parts'], ['mods', 'Mods'], ['prices', 'Price check']];
export const PAGES_WEB = [['prices', 'Price check']];

const plat = p => (p?.min != null ? `${nf(p.min)} p` : '—');

function suchfeld(id, value, placeholder) {
  return `<label class="search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
    <input id="${id}" type="search" value="${esc(value || '')}" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></label>`;
}

const passt = (name, q) => !q || String(name).toLowerCase().includes(q.toLowerCase());

export function wallet(inv) {
  const c = inv?.currencies;
  if (!c) return '';
  const feld = (icon, label, value) => `<div><img src="${esc(icon)}" alt=""><div class="wt"><b>${nf(value)}</b><span>${esc(label)}</span></div></div>`;
  return `<div class="wallet">
    ${feld(ASSET.platinum, 'Platinum', c.platinum)}
    ${feld(ASSET.ducats, 'Ducats', c.ducats)}
    ${feld(ASSET.credits, 'Credits', c.credits)}
    ${feld(ASSET.endo, 'Endo', c.endo)}
  </div>`;
}

/* Suchfeld und Filter stehen im Kopf der Seite, die Liste im Rumpf - beim
   Tippen wird nur der Rumpf neu gezeichnet (siehe render in app.js). */
export function relicHead(st) {
  const tier = st.relicTier || null;
  const chips = [null, 'Lith', 'Meso', 'Neo', 'Axi', 'Requiem'].map(t =>
    `<button class="chip${tier === t ? ' active' : ''}" data-act="relic-tier" data-val="${t || ''}">${t || 'All'}</button>`).join('');
  return `${suchfeld('q-relics', st.relicQuery, 'Search your relics')}<div class="chips">${chips}</div>`;
}
export const setSearch = st => suchfeld('q-sets', st.setQuery, 'Search prime sets');
export const partSearch = st => suchfeld('q-parts', st.partQuery, 'Search prime parts');
export const priceSearch = st => suchfeld('q-price', st.priceQuery, 'Item on warframe.market');

export function renderRelics(inv, st) {
  const q = st.relicQuery || '';
  const tier = st.relicTier || null;
  const liste = (inv.relics || []).filter(r => passt(r.name, q) && (!tier || r.tier === tier))
    .sort((a, b) => (b.value?.plat ?? -1) - (a.value?.plat ?? -1) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  return `${liste.length ? `<div class="list">${liste.slice(0, 200).map(r => `<div class="row">
      ${img(r.image)}
      <div class="main"><div class="title">${esc(r.name)} <span class="muted">×${nf(r.count)}</span></div>
        <div class="meta">${esc(r.quality || 'Intact')}${r.vaulted === true ? ' · <span class="warn-text">vaulted</span>' : ''}</div></div>
      <div class="end">${r.value?.plat != null ? `${nf(Math.round(r.value.plat))} p` : '—'}<div class="meta">per crack</div></div>
    </div>`).join('')}</div>
    ${liste.length > 200 ? `<p class="muted small">${liste.length - 200} more — search to narrow it down.</p>` : ''}` : '<div class="note">No relics match.</div>'}`;
}

export function renderSets(inv, st) {
  const q = st.setQuery || '';
  const liste = (inv.sets || []).filter(s => passt(s.name, q));
  return `${liste.length ? liste.slice(0, 120).map(s => `<details class="fold">
      <summary>${img(s.image)}<div style="min-width:0">
        <div class="title" style="font-weight:600">${esc(s.name)}</div>
        <div class="meta muted small">${nf(s.ownedParts)} of ${nf(s.totalParts)} parts${s.complete ? ' · <span class="ok-text">complete</span>' : ''}${s.vaultSoon ? ' · <span class="warn-text">vaulting soon</span>' : ''}</div>
      </div><span class="end" style="font-weight:600">${plat(s.setPrice)}</span></summary>
      <div class="body">${(s.parts || []).map(p => `<div class="need"><span></span>
        <div>${esc(p.name)} <span class="muted">${nf(p.ducats)} ducats</span></div>
        <div class="have ${p.count >= p.required ? 'ok' : 'short'}">${nf(p.count)}/${nf(p.required)} · ${plat(p.price)}</div></div>`).join('')}</div>
    </details>`).join('') : '<div class="note">No prime sets match.</div>'}`;
}

export function renderParts(inv, st) {
  const q = st.partQuery || '';
  const liste = (inv.parts || []).filter(p => passt(p.name, q));
  const s = inv.partsSummary;
  return `${s ? `<div class="note">${nf(s.totalItems)} prime parts · <b>${nf(s.totalDucats)} ducats</b> · about <b>${nf(s.totalPlatMin)} platinum</b> at the cheapest in-game sellers</div>` : ''}
    ${liste.length ? `<div class="list">${liste.slice(0, 250).map(p => `<div class="row${p.image ? '' : ' noicon'}">
      ${p.image ? img(p.image, 'thumb sm') : ''}
      <div class="main"><div class="title">${esc(p.name)} <span class="muted">×${nf(p.count)}</span></div>
        <div class="meta">${nf(p.ducats)} ducats${p.adviceLabel ? ` · ${esc(p.adviceLabel)}` : ''}</div></div>
      <div class="end">${plat(p.price)}</div>
    </div>`).join('')}</div>` : '<div class="note">No prime parts match.</div>'}`;
}

export function renderMods(inv) {
  const liste = inv.valuable || [];
  return liste.length
    ? `<p class="muted small" style="margin:0 2px 10px">Mods and arcanes you own that sell for 10 platinum or more.</p>
       <div class="list">${liste.map(m => `<div class="row${m.image ? '' : ' noicon'}">
        ${m.image ? img(m.image, 'thumb sm') : ''}
        <div class="main"><div class="title">${esc(m.name)}${m.count > 1 ? ` <span class="muted">×${nf(m.count)}</span>` : ''}</div>
          <div class="meta">Rank ${nf(m.rank)}</div></div>
        <div class="end">${plat(m.price)}</div></div>`).join('')}</div>`
    : '<div class="note">No mods or arcanes with a known price of 10 platinum or more. Prices fill in as you browse the Inventory tab on the PC.</div>';
}

export function renderPrices(st) {
  const hits = st.priceHits || [];
  const pick = st.pricePick;
  return `${pick ? `<div class="card">
      <div style="display:flex;gap:12px;align-items:center">${pick.image ? img(pick.image) : ''}
        <div style="flex:1;min-width:0"><h3>${esc(pick.name)}</h3>
        <div class="sub">${pick.ducats != null ? `${nf(pick.ducats)} ducats` : ''}</div></div></div>
      ${st.priceLoading ? '<p class="muted">Asking warframe.market …</p>'
        : st.priceError ? `<div class="note warn" style="margin:12px 0 0">${esc(st.priceError)}</div>`
        : st.price ? `<div class="kv" style="margin-top:12px">
            <span>Cheapest seller</span><b>${nf(st.price.min)} p</b>
            <span>Median</span><b>${nf(st.price.median)} p</b>
            <span>Offers counted</span><b>${nf(st.price.offers)}</b>
            <span>Sellers</span><b>${st.price.online ? 'in game now' : 'none in game — all offers'}</b>
          </div>`
        : '<p class="muted">Nobody is selling this right now.</p>'}
    </div>` : ''}
    ${st.priceSearchError ? `<div class="note warn">${esc(st.priceSearchError)}</div>` : ''}
    ${hits.length ? `<div class="list">${hits.map((h, i) => `<div class="row tap${h.image ? '' : ' noicon'}" data-act="price-pick" data-val="${i}">
      ${h.image ? img(h.image, 'thumb sm') : ''}<div class="main"><div class="title">${esc(h.name)}</div>
      ${h.ducats != null ? `<div class="meta">${nf(h.ducats)} ducats</div>` : ''}</div><div class="end">›</div></div>`).join('')}</div>`
      : (st.priceQuery || '').length >= 2 && !st.priceSearching && !st.priceSearchError ? '<div class="note">Nothing found on warframe.market.</div>' : ''}`;
}

export function stand(inv) {
  return inv?.fetchedAt
    ? `<p class="muted small" style="text-align:center;margin-top:16px">Inventory as of ${esc(ago(inv.syncedAt || inv.fetchedAt))} · prices from warframe.market</p>`
    : '';
}
