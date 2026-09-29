/* Riven-Overlay auf dem Umwandeln-Bildschirm.

   Bekommt vom Hauptprozess den Stand der Sitzung:
     phase    open | ready | rolling | rolled | missing | chosen
     current  der Wurf, der gerade gilt (Ansicht aus rivens.js), oder null
     next     der neue Wurf, oder null
     kuva     Preis der Umwandlung, wenn das Log ihn nannte
     message  eine Zeile fuer den Fall, dass etwas nicht geklappt hat
     layout   { pos: { current, next }, scale } - Lage als Anteil des
              Fensters (null = eingebaute Lage am Rand) und Groesse
     interactive, hotkey
   Gerechnet wird hier nichts ausser dem Vergleich der beiden Seiten.

   BEDIENMODUS wie bei der Relikt-Empfehlung (relic-pick.js): das Kuerzel des
   Zeigermodus schaltet ihn um, dann lassen sich beide Felder an der Kopfzeile
   ziehen, ein Doppelklick schickt eines zurueck an den Rand. Klicks nimmt das
   Fenster nur an, solange der Zeiger auf einem Feld steht. */

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Dieselben Stufen wie im Riven-Reiter - eine Lesehilfe, keine Wertung. */
const tier = pct => pct >= 80 ? 'q-top' : pct >= 50 ? 'q-mid' : pct >= 20 ? 'q-low' : 'q-bottom';

/**
 * Pfeil fuer einen Wert, den es auf beiden Seiten gibt: besser oder
 * schlechter als drueben. Verglichen wird der angezeigte Betrag, beim
 * negativen Wert umgekehrt - weniger schadet weniger.
 */
function arrow(stat, other) {
  if (!other) return '';
  const mine = other.stats.find(s => s.tag === stat.tag && s.curse === stat.curse);
  if (!mine) return '<span class="rv-cmp is-new" title="Not on the other roll">new</span>';
  const a = Math.abs(stat.maxValue), b = Math.abs(mine.maxValue);
  if (Math.abs(a - b) < 1e-9) return '';
  const better = stat.curse ? a < b : a > b;
  return `<span class="rv-cmp ${better ? 'is-up' : 'is-down'}">${better ? '▲' : '▼'}</span>`;
}

/* Die Werte auf Rang 8: so zeigt sie der Umwandeln-Bildschirm mit "Show
   ranked", und so wird gehandelt. Der eigene Rang steht unten im Fuss. */
function statRows(view, other) {
  return view.stats.map(s => {
    const pct = Math.round(s.quality * 100);
    return `
      <div class="rv-stat ${s.curse ? 'is-curse' : 'is-buff'}">
        <span class="rv-val">${esc(s.maxText)}</span>
        <span class="rv-label ${s.element ? 'el-' + esc(s.element) : ''}">${esc(s.label)}</span>
        ${arrow(s, other)}
        <span class="rv-roll ${tier(pct)}"><i style="width:${Math.max(pct, 3)}%"></i></span>
        <span class="rv-pct">${pct}%</span>
      </div>`;
  }).join('');
}

/* `other` ist nur beim neuen Wurf gesetzt: verglichen wird immer "neu gegen
   jetzt". Auf der linken Seite stuenden dieselben Pfeile nur spiegelverkehrt. */
function panelHtml(label, view, other, { note = null, busy = false, cost = null } = {}) {
  const head = `
    <div class="rv-head">
      <span class="rv-tag">${esc(label)}</span>
      ${cost ? `<span class="rv-cost">${esc(cost)}</span>` : ''}
    </div>`;
  if (!view) {
    return head + `<div class="rv-empty ${busy ? 'is-busy' : ''}">${esc(note || '')}</div>`;
  }
  const pol = view.polarity && typeof Icon !== 'undefined' ? Icon.polarity(view.polarity.glyph, 12) : '';
  const avg = Math.round(view.avgQuality * 100);
  const otherAvg = other ? Math.round(other.avgQuality * 100) : null;
  const diff = otherAvg == null ? '' : avg - otherAvg;
  /* Der Bildschirm rechnet mit der Waffe unter "Fits in" - steht dort eine
     andere Variante als die Grundwaffe, sagt die Zeile, fuer welche. */
  return head + `
    <div class="rv-title">
      <b>${esc(view.weapon.name)} <span class="rv-name">${esc(view.name || '')}</span></b>
      ${view.shownOn ? `<span class="rv-on">on ${esc(view.shownOn.name)} · ×${Number(view.weapon.disposition.toFixed(2))}</span>` : ''}
    </div>
    <div class="rv-stats">${statRows(view, other)}</div>
    <div class="rv-foot">
      <span title="Values shown at rank ${view.maxRank}">R${view.rank}/${view.maxRank}${view.rank < view.maxRank ? ` · shown at R${view.maxRank}` : ''}</span>
      <span>⟳ ${view.rerolls}</span>
      <span class="rv-pol">${view.drain}${pol}</span>
      <span class="rv-avg">avg ${avg}%${diff === '' || diff === 0 ? ''
        : ` <em class="${diff > 0 ? 'is-up' : 'is-down'}">${diff > 0 ? '+' : ''}${diff}</em>`}</span>
    </div>
    ${note ? `<div class="rv-note">${esc(note)}</div>` : ''}`;
}

/* "Ctrl+E" -> Tasten als ein Element, wie in der Relikt-Empfehlung. */
const keys = combo => `<span class="rp-keys">` + String(combo || '').split('+')
  .map(k => `<kbd>${esc(k.trim())}</kbd>`).join('') + `</span>`;

/* Die Zeile, die im Bedienmodus unter jedem Feld steht. */
const hintHtml = hotkey => `
  <div class="rv-hint">Drag the title to move · double-click: back to the edge
    ${hotkey ? `<span class="rv-hint-key">${keys(hotkey)} done</span>` : ''}</div>`;

let state = null;
let interactive = false;
/* Waehrend des Ziehens: welches Feld, und Abstand des Zeigers zu seiner
   linken oberen Ecke. */
let drag = null;
let overSent = false;

const PANELS = { current: 'rv-current', next: 'rv-next' };
const whichOf = el => el.id === 'rv-next' ? 'next' : 'current';

/* ---------- Lage ---------- */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Wie in relic-pick.js: gesetzt wird die GEZEICHNETE linke obere Ecke, die
   Kopfzeile bleibt immer im Fenster. */
function moveTo(panel, left, top) {
  panel.classList.add('is-placed');
  const w = panel.getBoundingClientRect().width;
  panel.style.left = `${Math.round(clamp(left, 0, Math.max(0, innerWidth - w)))}px`;
  panel.style.top = `${Math.round(clamp(top, 0, Math.max(0, innerHeight - 48)))}px`;
  panel.style.right = 'auto';
}

function place(panel, pos, scale) {
  if (Number.isFinite(scale)) panel.style.setProperty('--ov-scale', scale);
  if (drag?.panel === panel) return;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    moveTo(panel, pos.x * innerWidth, pos.y * innerHeight);
  } else {
    panel.classList.remove('is-placed');
    panel.style.left = panel.style.top = panel.style.right = '';
  }
}

function placeAll() {
  const layout = state?.layout || {};
  for (const [which, id] of Object.entries(PANELS)) {
    place($(id), layout.pos?.[which] || null, layout.scale);
  }
}

/* Wo das linke Feld steht - dorthin holt der Hauptprozess den Zeiger. */
function reportRect() {
  const left = $('rv-current');
  if (left.classList.contains('hidden')) return;
  const r = left.getBoundingClientRect();
  window.api?.rivenRect?.({ x: r.left, y: r.top, w: r.width, h: r.height });
}

/* ---------- Zeichnen ---------- */

function render(next) {
  state = next;
  const left = $('rv-current');
  const right = $('rv-next');
  if (!next) {
    drag = null;
    for (const el of [left, right]) {
      el.classList.add('hidden');
      el.classList.remove('is-interactive', 'is-dragging');
    }
    return;
  }
  if (typeof next.interactive === 'boolean') interactive = next.interactive;
  const hotkey = next.hotkey || '';

  const { phase, current, next: nextRoll, kuva, message, unknownRiven, ambiguous } = next;

  left.innerHTML = panelHtml('Current', current, null, {
    note: unknownRiven
      ? 'This riven is not in your last inventory fetch. Fetch the inventory once so Argus can work out its stats.'
      : !current ? 'Reading the riven …'
      : ambiguous ? `${ambiguous} of your rivens fit this weapon - the one on the table shows after the first cycle.`
      : (phase === 'chosen' ? null : message),
    busy: !current && !unknownRiven
  }) + (interactive ? hintHtml(hotkey) : '');
  left.classList.remove('hidden');

  /* Rechts steht erst etwas, wenn gewuerfelt wird - vorher waere es eine
     leere Kiste neben der Karte, die man gerade ansieht. Im Bedienmodus
     steht es trotzdem da, als Platzhalter: sonst liesse sich die Stelle
     des neuen Wurfs erst waehrend eines Wurfs einrichten. */
  const rolled = phase === 'rolling' || phase === 'rolled' || phase === 'missing' || (phase === 'chosen' && nextRoll);
  right.classList.toggle('hidden', !rolled && !interactive);
  if (rolled) {
    right.innerHTML = panelHtml('New roll', nextRoll, current, {
      note: phase === 'rolling' ? 'Reading the new roll …'
        : phase === 'missing' ? (message || 'The new roll could not be read.')
        : null,
      busy: phase === 'rolling',
      cost: kuva ? `${kuva.toLocaleString('en-GB')} Kuva` : null
    }) + (interactive ? hintHtml(hotkey) : '');
  } else if (interactive) {
    right.innerHTML = panelHtml('New roll', null, null, { note: 'The new roll shows up here.' })
      + hintHtml(hotkey);
  }

  for (const el of [left, right]) el.classList.toggle('is-interactive', interactive);
  placeAll();
  setTimeout(reportRect, 0);
}

/* ---------- Bedienung ---------- */

document.addEventListener('mousedown', e => {
  if (!interactive || e.button !== 0) return;
  const head = e.target.closest('.rv-head');
  const panel = head?.closest('.rv-panel');
  if (!panel) return;
  const r = panel.getBoundingClientRect();
  drag = { panel, dx: e.clientX - r.left, dy: e.clientY - r.top };
  panel.classList.add('is-dragging');
  e.preventDefault();
});

document.addEventListener('dblclick', e => {
  if (!interactive) return;
  const panel = e.target.closest('.rv-head')?.closest('.rv-panel');
  if (!panel) return;
  drag = null;
  const which = whichOf(panel);
  if (state?.layout?.pos) state.layout.pos = { ...state.layout.pos, [which]: null };
  place(panel, null, state?.layout?.scale);
  window.api?.rivenMove?.(which, null);
  setTimeout(reportRect, 0);
});

window.addEventListener('mouseup', () => {
  if (!drag) return;
  const { panel } = drag;
  drag = null;
  panel.classList.remove('is-dragging');
  const r = panel.getBoundingClientRect();
  const pos = { x: r.left / innerWidth, y: r.top / innerHeight };
  const which = whichOf(panel);
  if (state?.layout) state.layout.pos = { ...(state.layout.pos || {}), [which]: pos };
  window.api?.rivenMove?.(which, pos);
  reportRect();
});

/* Kommen auch bei durchgereichten Klicks an (forward im Hauptprozess) - so
   merkt das Fenster, wann der Zeiger ein Feld betritt. */
window.addEventListener('mousemove', e => {
  if (drag) {
    moveTo(drag.panel, e.clientX - drag.dx, e.clientY - drag.dy);
    return;
  }
  if (!interactive) return;
  const over = Object.values(PANELS).some(id => {
    const el = $(id);
    if (el.classList.contains('hidden')) return false;
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  });
  if (over === overSent) return;
  overSent = over;
  window.api?.rivenHover?.(over);
});

window.addEventListener('resize', () => {
  if (state) placeAll();
  setTimeout(reportRect, 0);
});

if (window.api?.onRivenOverlay) window.api.onRivenOverlay(render);

if (window.api?.onRivenInteractive) {
  window.api.onRivenInteractive(on => {
    interactive = !!on;
    overSent = false;
    if (!interactive && drag) {
      drag.panel.classList.remove('is-dragging');
      drag = null;
    }
    /* Neu gezeichnet wird mit dem Stand, den der Hauptprozess gleich
       hinterherschickt (redrawRiven) - hier nur der Rahmen. */
    for (const id of Object.values(PANELS)) $(id).classList.toggle('is-interactive', interactive);
  });
}
