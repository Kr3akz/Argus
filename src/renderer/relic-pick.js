/* Relikt-Empfehlung auf dem Auswahlbildschirm.

   Bekommt vom Hauptprozess die fertige Auswahl (buildRelicPick in
   src/core/relic-pick.js, ergaenzt in relicPickView in main.js):
     mode     era | any | unknown | tracked - welcher Fall, steht dort
     tier     die Aera, 'Omnia', 'all', 'tracked' oder null
     source   woher sie kommt: manual | screen | log | console | null
     manual   der von Hand gewaehlte Filter, oder null fuer "Auto"
     auto     was "Auto" gerade zeigen wuerde
     fissure  { tier, node, isHard } aus dem Log, oder null
     rows     die Relikte, die dastehen sollen
     total    wie viele fuer diese Auswahl in Frage kamen
     owned    wie viele Relikte ueberhaupt bekannt sind
     traces   Spuren des Nichts
     pos      linke obere Ecke als Anteil des Fensters, oder null = oben rechts
     scale    Groesse des Feldes, 1 = wie gezeichnet
     interactive, hotkey
   Dazu { busy: true }, solange gerechnet wird, und null zum Leeren.
   Gerechnet wird hier nichts - auch ein Filter geht an den Hauptprozess und
   kommt als neue Auswahl zurueck.

   BEDIENMODUS: das Kuerzel des Zeigermodus schaltet ihn um (toggleInteract
   in main.js). Dann stehen die Filter-Chips da, das Feld laesst sich an der
   Kopfzeile ziehen, und ein Doppelklick darauf schickt es zurueck in die
   Ecke. Klicks nimmt das Fenster nur an, solange der Zeiger auf dem Feld
   steht - das meldet dieses Skript bei jeder Bewegung (relicPickHover). */

const $ = id => document.getElementById(id);
const nf = n => (n ?? 0).toLocaleString('en-GB');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Dieselben Kurzformen und Farben wie im Overlay-Fenster - "Exceptional"
   ausgeschrieben passt nicht neben Aera, Name und Anzahl. Die Pille selbst
   ist dieselbe Klasse (.ov-rc-ref), damit eine Politur ueberall gleich
   aussieht. */
const STATE_LABEL = { Intact: 'Intact', Exceptional: 'Exc', Flawless: 'Flaw', Radiant: 'Rad' };
const STATE_CLASS = { Intact: 'st-intact', Exceptional: 'st-exc', Flawless: 'st-flaw', Radiant: 'st-rad' };

const PLAT_IC = '<img class="rp-cur" src="assets/icons/currency/platinum.png" alt="platinum">';
const DUC_IC  = '<img class="rp-cur" src="assets/icons/currency/ducats.png" alt="ducats">';

/* Dieselben Filter wie die Chips im Reliktabschnitt des Overlays, dazu
   "Auto" - zurueck zu dem, was Log und Bildschirm sagen. */
const FILTERS = [
  ['auto', 'Auto'], ['all', 'All'], ['Lith', 'Lith'], ['Meso', 'Meso'], ['Neo', 'Neo'],
  ['Axi', 'Axi'], ['Requiem', 'Req'], ['tracked', '★ Starred']
];

let view = null;
let interactive = false;
/* Waehrend des Ziehens: Abstand des Zeigers zur linken oberen Ecke. */
let drag = null;
/* Zuletzt gemeldet: steht der Zeiger auf dem Feld? */
let overSent = false;

/** 12.4 -> "12.4", 12 -> "12". Mehr als eine Nachkommastelle sagt hier nichts. */
const fmtPlat = v => String(Math.round((Number(v) || 0) * 10) / 10);

/* "Ctrl+E" -> zwei Tasten als EIN Element, wie in der Hinweiszeile des
   Overlays - aus dem echten Kuerzel, es laesst sich umstellen. */
const keys = combo => `<span class="rp-keys">` + String(combo || '').split('+')
  .map(k => `<kbd>${esc(k.trim())}</kbd>`).join('') + `</span>`;

/* Wofuer das Feld gerade steht. Beim unbekannten Riss steht dabei, WARUM er
   unbekannt ist - sonst sieht "jede Aera" wie ein vergessener Filter aus. */
function context(v) {
  if (v.mode === 'tracked') return 'Starred relics';
  if (v.source === 'manual') {
    return v.mode === 'era' ? `<span class="rp-ctx-era">${esc(v.tier)} relics</span>` : 'All eras';
  }
  if (v.source === 'console') return 'Relic segment · all eras';
  if (v.mode === 'era') {
    const title = v.source === 'screen' ? ' title="Read from the selection screen"' : '';
    return `<span class="rp-ctx-era"${title}>${esc(v.tier)} fissure</span>`
         + (v.source === 'log' && v.fissure?.isHard ? '<i class="rp-sp">SP</i>' : '');
  }
  if (v.mode === 'any') return 'Omnia fissure · any era';
  return 'Best of each era';
}

function chips(v) {
  const active = v.manual || 'auto';
  const autoIs = v.auto === 'all' ? 'All' : v.auto || '';
  return `<div class="rp-chips">${FILTERS.map(([value, label]) => {
    const text = value === 'auto' && autoIs ? `Auto · ${autoIs}` : label;
    return `<button class="ov-chip${active === value ? ' active' : ''}" data-filter="${value}">${esc(text)}</button>`;
  }).join('')}</div>`;
}

function row(r) {
  const plat = r.unpriced ? '–' : `${r.thin ? '≥' : ''}${fmtPlat(r.expPlat)}`;
  const platTitle = r.unpriced
    ? 'No price known for anything in this relic yet'
    : r.thin
      ? 'Only part of the drop chance has a known price, so this is a lower bound'
      : 'Expected platinum per crack';
  return `
    <div class="rp-row${r.top ? ' is-top' : ''}" data-tier="${esc(r.tier)}">
      ${r.image
        ? `<img class="rp-img" src="${esc(r.image)}" alt="">`
        : '<span class="rp-img"></span>'}
      <div class="rp-main">
        <div class="rp-title">
          <span class="rp-era">${esc(r.tier)}</span>
          <b>${esc(r.name)}</b>
          <span class="ov-rc-ref ${STATE_CLASS[r.state] || 'st-intact'}">${esc(STATE_LABEL[r.state] || r.state)}</span>
          ${r.count > 1 ? `<span class="rp-count">×${r.count}</span>` : ''}
          ${r.tracked && typeof Icon !== 'undefined'
            ? `<span class="rp-star" title="Starred in the relic planner">${Icon.star(10)}</span>` : ''}
        </div>
        <div class="rp-sub">${r.best
          ? `<span class="rp-best">${esc(r.best.name)}</span><b>${r.best.plat}p</b>`
          : '<i>prices unknown</i>'}</div>
      </div>
      <div class="rp-val">
        <span class="rp-plat" title="${platTitle}">${plat}${PLAT_IC}</span>
        <span class="rp-duc" title="Expected ducats per crack">${nf(r.expDucats)}${DUC_IC}</span>
      </div>
    </div>`;
}

/* Unten: was im Bestand ist, der Weg zum Bedienmodus und die Spuren. Im
   Bedienmodus steht dort, wie man das Feld bewegt und wieder loslaesst. */
function foot(v) {
  const n = v.mode === 'era' || v.mode === 'tracked' ? v.total : v.owned;
  const s = n === 1 ? '' : 's';
  const what = v.mode === 'era' ? `${esc(v.tier)} relic${s}`
             : v.mode === 'tracked' ? `starred relic${s}` : `relic${s}`;
  const left = interactive ? 'Drag the title to move' : `${nf(n)} ${what} in stock`;
  const hint = v.hotkey
    ? `<span class="rp-hint">${keys(v.hotkey)} ${interactive ? 'done' : 'filter'}</span>`
    : '';
  return `
    <div class="rp-foot">
      <span class="rp-foot-left">${left}</span>
      ${hint}
      <span class="rp-traces" title="Void Traces">
        <img src="assets/icons/currency/traces.png" alt="">${nf(v.traces)}
      </span>
    </div>`;
}

/* Warum nichts dasteht, in einem Satz - die Faelle haben verschiedene
   Auswege. */
function emptyNote(v) {
  if (!v.owned) return 'No relics known yet. Fetch your inventory once and Argus ranks them here.';
  if (v.mode === 'era') return `No ${esc(v.tier)} relics in your last inventory fetch.`;
  if (v.mode === 'tracked') return 'No starred relic in stock. Star relics in the relic planner.';
  return 'No relics to show.';
}

/* ---------- Lage ---------- */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Das Feld an eine Stelle setzen, ohne es aus dem Fenster zu schieben. Die
   Kopfzeile bleibt immer greifbar - sonst waere ein Feld, das man einmal an
   den Rand gezogen hat, nicht mehr zurueckzuholen. */
function moveTo(panel, left, top) {
  /* Ab jetzt waechst das Feld von links oben aus (is-placed) - sonst stuende
     die linke Kante bei einer Groesse ungleich 1 nicht dort, wo sie
     hingesetzt wurde. Gemessen wird die GEZEICHNETE Breite; offsetWidth
     kennt die Groesse nicht. */
  panel.classList.add('is-placed');
  const w = panel.getBoundingClientRect().width;
  panel.style.left = `${Math.round(clamp(left, 0, Math.max(0, innerWidth - w)))}px`;
  panel.style.top = `${Math.round(clamp(top, 0, Math.max(0, innerHeight - 48)))}px`;
  panel.style.right = 'auto';
}

/* Gemerkte Lage und Groesse anwenden, oder zurueck in die Ecke oben rechts
   (CSS). Die Groesse gilt auch waehrend des Ziehens. */
function place(panel, pos, scale) {
  if (Number.isFinite(scale)) panel.style.setProperty('--ov-scale', scale);
  if (drag) return;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    moveTo(panel, pos.x * innerWidth, pos.y * innerHeight);
  } else {
    panel.classList.remove('is-placed');
    panel.style.left = panel.style.top = panel.style.right = '';
  }
}

/* Wo das Feld steht, an den Hauptprozess - fuer den Zeiger im Bedienmodus
   und damit der Blick auf den Bildschirm das Feld nicht selbst vorliest.
   Ueber setTimeout und nicht requestAnimationFrame: ein Fenster, das gerade
   nicht zeichnet, ruft rAF nie auf. */
function reportRect() {
  const panel = $('rp-panel');
  if (panel.classList.contains('hidden')) return;
  const r = panel.getBoundingClientRect();
  window.api?.relicPickRect?.({ x: r.left, y: r.top, w: r.width, h: r.height });
}

/* ---------- Zeichnen ---------- */

function render(next) {
  const panel = $('rp-panel');
  view = next;
  if (!next) {
    drag = null;
    panel.classList.add('hidden');
    panel.classList.remove('is-entering', 'is-interactive', 'is-dragging');
    panel.innerHTML = '';
    return;
  }
  if (typeof next.interactive === 'boolean') interactive = next.interactive;

  /* Nur beim Aufgehen einblenden, nicht bei jeder Nachlieferung: vom
     "wird gelesen" zur fertigen Liste soll nichts blinken. */
  const entering = panel.classList.contains('hidden');
  panel.classList.remove('hidden');
  panel.classList.toggle('is-entering', entering);
  panel.classList.toggle('is-interactive', interactive);

  /* Farbe nach Aera; "All" von Hand und die Konsole im Schiff bleiben beim
     Akzent - das violette Omnia hiesse sonst einen Riss, den es nicht gibt. */
  const tint = next.mode === 'era' ? next.tier : next.mode === 'any' && next.tier === 'Omnia' ? 'Omnia' : '';
  if (tint) panel.dataset.tier = tint; else delete panel.dataset.tier;

  const head = `
    <div class="rp-head"${interactive ? ' title="Drag to move · double-click: back to the corner"' : ''}>
      <span class="rp-tag">Relic pick</span>
      ${next.busy ? '' : `<span class="rp-ctx">${context(next)}</span>`}
    </div>`;

  if (next.busy) {
    panel.innerHTML = head + '<div class="rp-empty is-busy">Reading your relics …</div>';
  } else {
    /* Ohne jeden Bestand sagt die Fusszeile nur "0" - das steht schon im Satz
       darueber, und die Spuren kommen aus demselben fehlenden Abruf. */
    panel.innerHTML = head
      + (interactive ? chips(next) : '')
      + (next.rows?.length
          ? `<div class="rp-rows">${next.rows.map(row).join('')}</div>`
          : `<div class="rp-empty">${emptyNote(next)}</div>`)
      + (next.owned || interactive ? foot(next) : '');
  }

  place(panel, next.pos, next.scale);
  setTimeout(reportRect, 0);
}

/* ---------- Bedienung ---------- */

const panelEl = $('rp-panel');

panelEl.addEventListener('click', e => {
  const chip = e.target.closest('[data-filter]');
  if (!chip || !interactive) return;
  window.api?.relicPickFilter?.(chip.dataset.filter === 'auto' ? null : chip.dataset.filter);
});

panelEl.addEventListener('mousedown', e => {
  if (!interactive || e.button !== 0 || !e.target.closest('.rp-head')) return;
  const r = panelEl.getBoundingClientRect();
  drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
  panelEl.classList.add('is-dragging');
  e.preventDefault();
});

panelEl.addEventListener('dblclick', e => {
  if (!interactive || !e.target.closest('.rp-head')) return;
  drag = null;
  if (view) view.pos = null;
  place(panelEl, null, view?.scale);
  window.api?.relicPickMove?.(null);
  setTimeout(reportRect, 0);
});

window.addEventListener('mouseup', () => {
  if (!drag) return;
  drag = null;
  panelEl.classList.remove('is-dragging');
  const r = panelEl.getBoundingClientRect();
  const pos = { x: r.left / innerWidth, y: r.top / innerHeight };
  if (view) view.pos = pos;
  window.api?.relicPickMove?.(pos);
  reportRect();
});

/* Kommen auch bei durchgereichten Klicks an (forward im Hauptprozess) - so
   merkt das Feld, wann der Zeiger es betritt, und holt sich erst dann die
   Klicks. Waehrend des Ziehens bleibt es dabei, auch wenn der Zeiger bei
   einer schnellen Bewegung kurz vor dem Feld herlaeuft. */
window.addEventListener('mousemove', e => {
  if (drag) {
    moveTo(panelEl, e.clientX - drag.dx, e.clientY - drag.dy);
    return;
  }
  if (!interactive) return;
  const r = panelEl.getBoundingClientRect();
  const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (over === overSent) return;
  overSent = over;
  window.api?.relicPickHover?.(over);
});

/* Das Spielfenster hat seine Groesse geaendert - die gemerkte Lage gilt als
   Anteil und wird neu angelegt. */
window.addEventListener('resize', () => {
  if (view) place(panelEl, view.pos, view.scale);
  setTimeout(reportRect, 0);
});

if (window.api?.onRelicPick) window.api.onRelicPick(render);

if (window.api?.onRelicPickInteractive) {
  window.api.onRelicPickInteractive(on => {
    interactive = !!on;
    /* Den Durchlass setzt der Hauptprozess beim Umschalten selbst zurueck -
       die naechste Bewegung meldet von vorn. */
    overSent = false;
    if (!interactive) {
      drag = null;
      panelEl.classList.remove('is-dragging');
    }
    if (view) render({ ...view, interactive });
  });
}
