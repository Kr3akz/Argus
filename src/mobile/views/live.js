/* Der Live-Tracker auf dem Handy.
 *
 * Dieselbe Antwort wie im Fenster am PC (core/world-view.js, buildWorldView) -
 * zuhause vom PC mit allen Haken fuer Besitz und Mastery, unterwegs in der
 * App selbst gerechnet und ohne sie. Die Ansicht fragt deshalb nie, woher
 * die Daten kommen, nur ob ein Feld da ist. */

import { esc, img, nf, left, countdown, phaseBar, clockTime, ASSET } from '../lib/ui.js';

export const PAGES = [
  ['overview', 'Overview'],
  ['fissures', 'Fissures'],
  ['missions', 'Missions'],
  ['traders', 'Traders'],
  ['nightwave', 'Nightwave'],
  ['invasions', 'Invasions'],
  ['bounties', 'Bounties']
];

/* Unterseiten, die die Meldungen auf dem Handy ansteuern (siehe MELDUNG_ZIEL
   in main.js) - "worlds" ist die Uebersicht, dort stehen die Uhren. */
export const ALIASES = { worlds: 'overview' };

export function counts(v) {
  if (!v) return {};
  return {
    fissures: (v.fissures || []).length,
    missions: v.counts?.missions || 0,
    nightwave: (v.nightwave || []).length,
    invasions: (v.invasions || []).length,
    bounties: (v.bounties || []).reduce((s, b) => s + (b.jobs || []).length, 0)
  };
}

const TIERS = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'];

/* Haken am Konto - nur, wenn der PC sie mitgeschickt hat (null = unbekannt). */
function besitz(x) {
  if (!x) return '';
  if (x.owned === true) return '<span class="badge ok">Owned</span>';
  if (x.mastery === 'done') return '<span class="badge ok">Mastered</span>';
  if (x.owned === false) return '<span class="badge warn">Missing</span>';
  return '';
}

function row({ icon = null, title, meta = '', end = '', tap = null, metaWrap = false }) {
  return `<div class="row${icon == null ? ' noicon' : ''}${tap ? ' tap' : ''}"${tap ? ` data-go="${esc(tap)}"` : ''}>
    ${icon == null ? '' : icon}
    <div class="main"><div class="title">${title}</div>${meta ? `<div class="meta${metaWrap ? ' wrap' : ''}">${meta}</div>` : ''}</div>
    <div class="end">${end}</div>
  </div>`;
}

const glyph = src => `<span class="glyph">${src ? `<img src="${esc(src)}" alt="">` : ''}</span>`;

/* Ein Bild, wenn es eins gibt - sonst keine Bildspalte. Unterwegs kennt die
   App den Katalog nicht und hat fuer Haendlerware meist kein Bild; ein leerer
   Kasten an jeder Zeile saehe aus wie ein kaputtes Bild. */
const bildOder = src => (src ? img(src, 'thumb sm') : null);

function leer(text) {
  return `<div class="note">${esc(text)}</div>`;
}

/* ------------------------------- Uebersicht ------------------------------- */

function uhren(v) {
  const t = v.today || {};
  const baro = v.traders?.baro;
  const items = [
    ['Daily reset', t.dailyReset],
    ['Sortie', v.sortie?.expiry],
    ['Weekly reset', t.weeklyReset],
    baro ? [baro.active ? 'Baro leaves' : 'Baro arrives', baro.active ? baro.expiry : baro.activation] : null,
    ['Teshin', v.steelPath?.expiry],
    v.arbitration?.current ? ['Arbitration', v.arbitration.current.expiry] : null,
    v.traders?.darvo?.[0] ? ['Darvo', v.traders.darvo[0].expiry] : null
  ].filter(x => x && x[1]);
  return `<div class="clocks">${items.map(([k, at]) =>
    `<div class="clock"><div class="k">${esc(k)}</div><div class="v">${countdown(at)}</div></div>`).join('')}</div>`;
}

function welten(v) {
  const cycles = v.cycles || [];
  if (!cycles.length) return '';
  return `<section class="section" id="worlds">
    <div class="section-title">Open worlds</div>
    <div class="worlds">${cycles.map(c => `
      <div class="world ${esc(c.state)}">
        <div class="name">${esc(c.name)}</div>
        <div class="state">${esc(c.label)}</div>
        <div class="left">${esc(c.next)} in ${countdown(c.expiry)}</div>
        ${phaseBar(c.activation, c.expiry, c.state === 'day' || c.state === 'warm' || c.state === 'fass' ? 'gold' : '')}
        ${c.hint ? `<div class="hint">${esc(c.hint)}</div>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
}

function kacheln(v) {
  const f = v.fissures || [];
  const sp = f.filter(x => x.isHard).length;
  const baro = v.traders?.baro;
  const tiles = [
    { go: '#live/fissures', k: 'Void fissures', icon: ASSET.fissure, v: nf(f.length), s: `${sp} Steel Path · ${f.filter(x => x.isStorm).length} storms` },
    v.sortie ? { go: '#live/missions', k: 'Sortie', icon: ASSET.sortie, v: esc(v.sortie.boss), text: true, s: esc(v.sortie.faction) } : null,
    v.archonHunt ? { go: '#live/missions', k: 'Archon hunt', icon: ASSET.archon, v: esc(v.archonHunt.boss), text: true, s: `ends in ${countdown(v.archonHunt.expiry)}` } : null,
    baro ? { go: '#live/traders', k: "Baro Ki'Teer", icon: ASSET.ducats, v: baro.active ? 'Here now' : 'Away', text: true,
             s: baro.active ? esc(baro.location || '') : `arrives in ${countdown(baro.activation)}` } : null,
    { go: '#live/nightwave', k: 'Nightwave', icon: ASSET.nightwave, v: nf((v.nightwave || []).length), s: 'acts this week' },
    { go: '#live/invasions', k: 'Invasions', icon: ASSET.invasion, v: nf((v.invasions || []).length), s: 'running' }
  ].filter(Boolean);
  return `<section class="section"><div class="section-title">Right now</div>
    <div class="tiles">${tiles.map(t => `
      <button class="tile" data-go="${t.go}">
        <div class="k"><img src="${esc(t.icon)}" alt="">${esc(t.k)}</div>
        <div class="v${t.text ? ' text' : ''}">${t.v}</div>
        <div class="s">${t.s}</div>
      </button>`).join('')}</div>
  </section>`;
}

function heute(v) {
  const t = v.today;
  if (!t || (!t.standing && !t.focus && t.sortie?.done == null)) return '';
  const zeilen = [];
  if (t.sortie && t.sortie.done != null) {
    zeilen.push(row({ title: 'Sortie', meta: `${t.sortie.done} of ${t.sortie.missions} missions done`,
                      end: t.sortie.done >= t.sortie.missions ? '<span class="badge ok">Done</span>' : '' }));
  }
  if (t.focus) {
    zeilen.push(row({ title: 'Focus', meta: `${nf(t.focus.left)} left today`, end: t.focus.cap ? `${Math.round(100 - t.focus.left / t.focus.cap * 100)} %` : '' }));
  }
  for (const s of (t.standing || []).filter(s => s.cap && s.left < s.cap).slice(0, 6)) {
    zeilen.push(row({ title: esc(s.label), meta: `${nf(s.left)} standing left today` }));
  }
  if (!zeilen.length) return '';
  return `<section class="section"><div class="section-title">Today <span class="hint">from your inventory · ${t.inventoryAt ? esc(clockTime(t.inventoryAt)) : ''}</span></div>
    <div class="list">${zeilen.join('')}</div></section>`;
}

function overview(v) {
  return uhren(v) + welten(v) + kacheln(v) + heute(v);
}

/* --------------------------------- Risse --------------------------------- */

function fissures(v, st) {
  const alle = v.fissures || [];
  const art = st.fissureKind || 'normal';
  const nach = {
    normal: alle.filter(f => !f.isHard && !f.isStorm),
    sp: alle.filter(f => f.isHard),
    storm: alle.filter(f => f.isStorm)
  };
  const tier = st.fissureTier || null;
  const liste = nach[art].filter(f => !tier || f.tier === tier);
  const seg = [['normal', 'Normal'], ['sp', 'Steel Path'], ['storm', 'Storms']].map(([k, label]) =>
    `<button class="${art === k ? 'active' : ''}" data-act="fissure-kind" data-val="${k}">${label} <span class="muted">${nach[k].length}</span></button>`).join('');
  const chips = [null, ...TIERS].map(t =>
    `<button class="chip${tier === t ? ' active' : ''}" data-act="fissure-tier" data-val="${t || ''}">${t || 'All tiers'}</button>`).join('');
  return `<div class="seg">${seg}</div>
    <div class="chips">${chips}</div>
    ${liste.length ? `<div class="list">${liste.map(f => row({
      icon: glyph(ASSET.relic(f.tier)),
      title: `${esc(f.missionType)} <span class="muted">· ${esc(f.tier)}</span>`,
      meta: `${esc(f.node)} · ${esc(f.enemy)}`,
      end: countdown(f.expiry)
    })).join('')}</div>` : leer('No fissures of this kind right now.')}`;
}

/* -------------------------------- Missionen -------------------------------- */

function missions(v) {
  const teile = [];
  const s = v.sortie;
  if (s) {
    teile.push(`<section class="section"><div class="section-title">Sortie <span class="hint">${countdown(s.expiry)}</span></div>
      <div class="list">
        ${row({ icon: glyph(ASSET.sortie), title: esc(s.boss), meta: esc(s.faction) })}
        ${(s.variants || []).map((m, i) => row({
          title: `${i + 1}. ${esc(m.missionType)}`, meta: `${esc(m.node)}${m.modifier ? ` · ${esc(m.modifier)}` : ''}`, metaWrap: true
        })).join('')}
      </div></section>`);
  }
  const a = v.archonHunt;
  if (a) {
    teile.push(`<section class="section"><div class="section-title">Archon hunt <span class="hint">${countdown(a.expiry)}</span></div>
      <div class="list">
        ${row({ icon: glyph(ASSET.archon), title: esc(a.boss), meta: esc(a.faction) })}
        ${(a.missions || []).map((m, i) => row({ title: `${i + 1}. ${esc(m.type)}`, meta: esc(m.node) })).join('')}
      </div></section>`);
  }
  const arb = v.arbitration;
  if (arb?.current) {
    teile.push(`<section class="section"><div class="section-title">Arbitration <span class="hint">${countdown(arb.current.expiry)}</span></div>
      <div class="list">
        ${row({ title: esc(arb.current.name), meta: [arb.current.type, arb.current.enemy].filter(Boolean).map(esc).join(' · ') })}
        ${(arb.upcoming || []).slice(0, 5).map(u => row({
          title: esc(u.name), meta: [u.type, u.enemy].filter(Boolean).map(esc).join(' · '), end: `<span class="muted">${esc(clockTime(u.activation))}</span>`
        })).join('')}
      </div></section>`);
  }
  const inc = v.steelPath?.incursions;
  if (inc?.today?.missions?.length) {
    teile.push(`<section class="section"><div class="section-title">Steel Path incursions <span class="hint">${countdown(inc.today.expiry)}</span></div>
      <div class="list">${inc.today.missions.map(m => row({
        icon: glyph(ASSET.steelpath), title: esc(m.name || m.node), meta: [m.type, m.enemy].filter(Boolean).map(esc).join(' · ')
      })).join('')}</div></section>`);
  }
  const c = v.circuit;
  if (c) {
    const pick = p => `<div class="row noicon"><div class="main"><div class="title">${esc(p.name)}</div></div><div class="end">${besitz(p)}</div></div>`;
    teile.push(`<section class="section"><div class="section-title">The Circuit <span class="hint">${countdown(c.expiry)}</span></div>
      <div class="list">${(c.normal || []).map(pick).join('')}</div>
      <div class="section-title" style="margin-top:12px">Steel Path Circuit</div>
      <div class="list">${(c.hard || []).map(pick).join('')}</div></section>`);
  }
  const alerts = v.alerts || [];
  if (alerts.length) {
    teile.push(`<section class="section"><div class="section-title">Alerts</div>
      <div class="list">${alerts.map(x => row({
        icon: glyph(ASSET.alert), title: esc(x.titel), meta: `${esc(x.node)}${x.reward ? ` · ${esc(x.reward)}` : ''}`, metaWrap: true, end: esc(x.eta || '')
      })).join('')}</div></section>`);
  }
  const events = v.events || [];
  if (events.length) {
    teile.push(`<section class="section"><div class="section-title">Operations</div>
      <div class="list">${events.map(e => row({
        icon: glyph(ASSET.events), title: esc(e.name), meta: esc(e.tooltip || e.node || ''), metaWrap: true,
        end: e.expiry ? countdown(e.expiry) : ''
      })).join('')}</div></section>`);
  }
  return teile.join('') || leer('No missions reported right now.');
}

/* --------------------------------- Haendler --------------------------------- */

function traders(v) {
  const t = v.traders || {};
  const teile = [];
  const b = t.baro;
  if (b) {
    const kopf = b.active
      ? row({ icon: glyph(ASSET.ducats), title: "Baro Ki'Teer", meta: `here now · ${esc(b.location || '')}`,
              end: `${countdown(b.expiry)}<div class="meta">until he leaves</div>` })
      : row({ icon: glyph(ASSET.ducats), title: "Baro Ki'Teer", meta: `next at ${esc(b.location || 'a relay')}`,
              end: `${countdown(b.activation)}<div class="meta">until he arrives</div>` });
    const waren = (b.items || []).slice(0, 40).map(i => row({
      icon: bildOder(i.image),
      title: esc(i.name),
      meta: `${nf(i.ducats)} ducats · ${nf(i.credits)} credits`,
      end: besitz(i)
    })).join('');
    /* Die Summe nur, wenn der Besitz bekannt ist - ohne Inventar steht an
       jeder Ware "unbekannt", und "0 Dukaten" waere eine falsche Antwort. */
    const summe = b.cost && (b.items || []).some(i => i.owned != null)
      ? `<div class="note">Everything you are missing costs <b>${nf(b.cost.ducats)} ducats</b> and <b>${nf(b.cost.credits)} credits</b>${b.stock?.ducats != null ? ` — you have ${nf(b.stock.ducats)} ducats` : ''}.</div>`
      : '';
    teile.push(`<section class="section"><div class="section-title">Void trader</div><div class="list">${kopf}${waren}</div>${summe}</section>`);
  }
  const r = t.resurgence;
  if (r) {
    teile.push(`<section class="section"><div class="section-title">Prime Resurgence <span class="hint">${countdown(r.expiry)}</span></div>
      <div class="list">${row({ title: esc(r.character || 'Varzia'), meta: esc(r.location || '') })}${
        [...(r.primes || []), ...(r.cosmetics || [])].map(p => row({
          /* Ohne Preis: welche Waehrung die Quelle meint, ist nicht belegt
             (siehe formatVaultTrader in core/worldstate.js) - der PC zeigt
             deshalb auch keinen. */
          icon: bildOder(p.image), title: esc(p.name), end: besitz(p)
        })).join('')}${(r.relics || []).length ? row({ title: `${r.relics.length} relics`, meta: r.relics.map(x => esc(x.name || x.tier || '')).filter(Boolean).slice(0, 8).join(', '), metaWrap: true }) : ''}</div></section>`);
  }
  if ((t.darvo || []).length) {
    teile.push(`<section class="section"><div class="section-title">Darvo's deal</div>
      <div class="list">${t.darvo.map(d => row({
        icon: bildOder(d.image), title: esc(d.name), metaWrap: true,
        meta: `${nf(d.salePrice)} platinum · ${d.discount ?? 0} % off${d.total != null ? ` · ${nf(d.sold)} of ${nf(d.total)} sold` : ''}`,
        end: d.soldOut ? '<span class="badge warn">Sold out</span>' : countdown(d.expiry)
      })).join('')}</div></section>`);
  }
  const sp = v.steelPath;
  if (sp) {
    teile.push(`<section class="section"><div class="section-title">Teshin · Steel Path honors</div>
      <div class="list">
        ${row({ icon: bildOder(sp.rewardImage), title: esc(sp.rewardName), meta: sp.rewardCost != null ? `${nf(sp.rewardCost)} Steel Essence` : '', end: countdown(sp.expiry) })}
        ${(sp.upcoming || []).slice(0, 4).map(u => row({
          icon: bildOder(u.image), title: esc(u.name), meta: `from ${esc(new Date(u.activation).toLocaleDateString([], { day: 'numeric', month: 'short' }))}`,
          end: u.cost != null ? `<span class="muted">${nf(u.cost)}</span>` : ''
        })).join('')}
      </div></section>`);
  }
  const vend = t.vendors;
  if (vend) {
    for (const x of [vend.tenet, vend.coda].filter(Boolean)) {
      teile.push(`<section class="section"><div class="section-title">${esc(x.vendor)} <span class="hint">${countdown(x.expiry)}</span></div>
        <div class="list">${(x.items || []).map(i => row({ icon: bildOder(i.image), title: esc(i.name), end: besitz(i) })).join('')}</div>
        <div class="muted small" style="margin:-4px 2px 0">${esc(x.place)}</div></section>`);
    }
  }
  return teile.join('') || leer('No traders reported right now.');
}

/* -------------------------------- Nightwave -------------------------------- */

function nightwave(v) {
  const acts = v.nightwave || [];
  const s = v.nightwaveSeason;
  const art = a => a.art === 'nightwave-elite' ? 'accent' : a.art === 'nightwave-taeglich' ? '' : 'ok';
  return `${s?.expiry ? `<div class="note">Season ${esc(s.season ?? '')} ends in <b>${esc(left(s.expiry))}</b>.</div>` : ''}
    ${acts.length ? `<div class="list">${acts.map(a => row({
      title: esc(a.titel),
      meta: `${esc(a.beschreibung || '')}`, metaWrap: true,
      end: `<span class="badge ${art(a)}">${esc(a.missionType)}</span><div class="meta">${esc(a.reward || '')}</div>`
    })).join('')}</div>` : leer('No Nightwave acts reported right now.')}`;
}

/* -------------------------------- Invasionen -------------------------------- */

function invasions(v) {
  const list = v.invasions || [];
  if (!list.length) return leer('No invasions running right now.');
  return list.map(i => `<div class="card">
    <h3>${esc(i.node)}</h3>
    <div class="sub">${esc(i.attacker)} vs ${esc(i.defender)}</div>
    <div class="bar"><i style="width:${Math.max(0, Math.min(100, Number(i.completion) || 0))}%"></i></div>
    <div class="kv" style="margin-top:10px">
      ${i.attackerReward ? `<span>${esc(i.attacker)}</span><b>${esc(i.attackerReward)}</b>` : ''}
      ${i.defenderReward ? `<span>${esc(i.defender)}</span><b>${esc(i.defenderReward)}</b>` : ''}
    </div>
  </div>`).join('');
}

/* --------------------------------- Kopfgelder --------------------------------- */

function bounties(v) {
  const list = v.bounties || [];
  if (!list.length) return leer('No bounties reported right now.');
  return list.map(b => {
    const jobs = (b.jobs || []);
    const kopf = `<span class="glyph"><img src="${esc(ASSET.syndicates)}" alt=""></span>
      <div><div class="title" style="font-weight:600">${esc(b.syndicate)}</div><div class="meta muted small">${esc(b.zone || '')}</div></div>
      <span class="end">${b.expiry ? countdown(b.expiry) : '<span class="muted small">in game only</span>'}</span>`;
    const inhalt = jobs.length
      ? jobs.map(j => {
          const belohnung = (j.rewards || []).at(-1)?.items?.slice(0, 4).map(x => esc(x.name)).join(', ');
          return `<div class="row noicon"><div class="main">
              <div class="title">${esc(j.type)}</div>
              <div class="meta wrap">Level ${esc((j.levels || []).join('–'))}${j.standingTotal ? ` · ${nf(j.standingTotal)} standing` : ''}${j.rewardRotation ? ` · rotation ${esc(j.rewardRotation)}` : ''}</div>
              ${belohnung ? `<div class="meta wrap">${belohnung}</div>` : ''}
            </div><div class="end">${j.minMR ? `<span class="badge">MR ${esc(j.minMR)}</span>` : ''}</div></div>`;
        }).join('')
      : `<div class="note" style="margin:0">This syndicate rolls its bounties in the game itself — nothing is published.</div>`;
    return `<details class="fold"><summary>${kopf}</summary><div class="body">${inhalt}</div></details>`;
  }).join('');
}

/* ------------------------------------------------------------------------- */

export function render(v, page, st) {
  if (!v) return '';
  switch (page) {
    case 'fissures': return fissures(v, st);
    case 'missions': return missions(v);
    case 'traders': return traders(v);
    case 'nightwave': return nightwave(v);
    case 'invasions': return invasions(v);
    case 'bounties': return bounties(v);
    default: return overview(v);
  }
}

/** Wie alt der Weltzustand ist, unten auf jeder Seite. */
export function footnote(v, { at, source }) {
  const quelle = source === 'pc' ? 'from Argus on your PC' : 'from warframestat.us';
  const hinterher = v?.sourceTimestamp && Date.now() - Date.parse(v.sourceTimestamp) > 20 * 60000;
  return `<p class="muted small" style="text-align:center;margin-top:18px">World state ${quelle}${at ? ` · ${esc(clockTime(at))}` : ''}
    ${hinterher ? '<br><span class="warn-text">The source is running behind — recent changes may be missing.</span>' : ''}</p>`;
}
