/**
 * Rundgang "Arrange overlays": die Felder im Spiel der Reihe nach einrichten.
 *
 * WARUM EINE BUEHNE IM HAUPTFENSTER und nicht die echten Fenster im Spiel:
 *   Die Felder erscheinen nur auf ihrem Bildschirm - die Preisschilder bei
 *   einer Belohnung, die Empfehlung bei der Reliktauswahl, die Riven-Felder
 *   beim Umwandeln. Wer sie dort einrichten will, muss erst einmal hinkommen,
 *   und hat dann zwei Sekunden bis zur Wahl. Hier stehen alle drei jederzeit
 *   bereit, nacheinander, mit Beispielinhalt.
 *
 * DIE BUEHNE HAT DAS SEITENVERHAELTNIS DES SPIELFENSTERS, und darin liegt
 * eine "Welt" in dessen echter Groesse in Punkten, verkleinert um einen
 * Faktor. Die Felder darin sind dieselben Klassen wie im Spiel (.tag-panel,
 * .rp-panel, .rv-panel) in derselben Breite - so stimmt das Verhaeltnis von
 * Feld zu Bildschirm, und was hier rechts oben anstoesst, stoesst dort auch
 * an. Gespeichert wird dieselbe Form wie beim Ziehen im Spiel: die linke
 * obere Ecke als Anteil des Fensters.
 *
 * Jede Aenderung geht sofort an den Hauptprozess (overlay-layout:set); steht
 * ein Feld gerade im Spiel, zieht es mit.
 */
const OverlayLayout = (() => {

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const STEPS = [
    {
      key: 'tags',
      title: 'Relic reward prices',
      text: 'The price tags under the four cards on the reward screen. Drag them up or down; '
          + 'sideways they always follow the cards they belong to.',
      off: 'Switched off right now: "Show prices inside the game" above.'
    },
    {
      key: 'relicPick',
      title: 'Relic recommendation',
      text: 'Lists your best relics while you choose one for a fissure. Drag it anywhere on '
          + 'the screen.',
      inGame: true,
      off: 'Switched off right now: "Recommend a relic on the selection screen" above.'
    },
    {
      key: 'riven',
      title: 'Riven comparison',
      text: 'Your current roll and the new one while cycling a riven. Both panels move on their '
          + 'own and share one size.',
      inGame: true,
      off: 'Switched off right now: "Compare riven rolls while cycling" above.'
    }
  ];

  let layout = null;     // Stand aus dem Hauptprozess
  let step = 0;
  let root = null;
  let k = 1;             // Welt -> Buehne
  let drag = null;
  let saveTimer = null;
  let pending = {};

  /* ---------------- Beispielinhalt ----------------
     Dieselben Bausteine wie in tags.js, relic-pick.js und riven.js, nur mit
     festen Werten. Kein Bild aus dem Netz: die Buehne soll auch ohne
     Verbindung stehen. */

  const PLAT = '<img src="assets/icons/currency/platinum.png" class="currency-ic" alt="p">';
  const DUC  = '<img src="assets/icons/ducats.png" class="currency-ic ducat-ic" alt="D">';

  function tagCards() {
    const cards = [
      ['Xaku Prime Chassis Blueprint', 'owned', '1 / 1 owned', 12, 45],
      ['Bronco Prime Receiver', 'missing', '0 / 1 owned', 4, 15],
      ['Paris Prime Lower Limb', 'partial', '1 / 2 owned', 9, 25],
      ['Forma Blueprint', 'owned', '3 / 1 owned', '–', '–']
    ];
    return cards.map(([name, cls, badge, plat, duc], i) => `
      <div class="tag-card${i === 0 ? ' best' : ''}" style="grid-column: ${i + 1}">
        <div class="tag-title">${esc(name)}</div>
        <div class="tag-status-badge ${cls}">${esc(badge)}</div>
        <div class="tag-prices-row">
          <div class="tag-price-col tag-plat${plat >= 20 ? ' good' : ''}">
            <span class="tag-price-val">${plat}</span>${PLAT}
          </div>
          <div class="tag-price-col tag-duc">
            <span class="tag-duc-val">${duc}</span>${DUC}
          </div>
        </div>
      </div>`).join('');
  }

  function relicPickHtml() {
    const rows = [
      ['Lith', 'G1', 'Radiant', 'Galvanized Aptitude', 38, 14.2, 41],
      ['Lith', 'V9', 'Intact', 'Volt Prime Chassis', 22, 9.6, 33],
      ['Lith', 'K12', 'Flawless', 'Kronen Prime Blade', 17, 7.1, 28],
      ['Lith', 'C11', 'Intact', 'Cedo Prime Stock', 11, 4.8, 24]
    ];
    const st = { Intact: ['Intact', 'st-intact'], Flawless: ['Flaw', 'st-flaw'], Radiant: ['Rad', 'st-rad'] };
    return `
      <div class="rp-head"><span class="rp-tag">Relic pick</span>
        <span class="rp-ctx"><span class="rp-ctx-era">Lith fissure</span></span></div>
      <div class="rp-rows">${rows.map(([tier, name, state, best, bestP, exp, duc], i) => `
        <div class="rp-row${i === 0 ? ' is-top' : ''}" data-tier="${tier}">
          <span class="rp-img"></span>
          <div class="rp-main">
            <div class="rp-title"><span class="rp-era">${tier}</span><b>${name}</b>
              <span class="ov-rc-ref ${st[state][1]}">${st[state][0]}</span></div>
            <div class="rp-sub"><span class="rp-best">${esc(best)}</span><b>${bestP}p</b></div>
          </div>
          <div class="rp-val">
            <span class="rp-plat">${exp}<img class="rp-cur" src="assets/icons/currency/platinum.png" alt=""></span>
            <span class="rp-duc">${duc}<img class="rp-cur" src="assets/icons/currency/ducats.png" alt=""></span>
          </div>
        </div>`).join('')}</div>
      <div class="rp-foot"><span class="rp-foot-left">24 Lith relics in stock</span>
        <span class="rp-traces"><img src="assets/icons/currency/traces.png" alt="">412</span></div>`;
  }

  function rivenHtml(label, stats, foot) {
    return `
      <div class="rv-head"><span class="rv-tag">${label}</span></div>
      <div class="rv-title"><b>Soma Prime <span class="rv-name">Crita-satilis</span></b></div>
      <div class="rv-stats">${stats.map(([val, text, pct, curse]) => `
        <div class="rv-stat ${curse ? 'is-curse' : 'is-buff'}">
          <span class="rv-val">${val}</span><span class="rv-label">${text}</span>
          <span class="rv-roll ${pct >= 80 ? 'q-top' : pct >= 50 ? 'q-mid' : pct >= 20 ? 'q-low' : 'q-bottom'}"
                style="grid-column:4"><i style="width:${pct}%"></i></span>
          <span class="rv-pct">${pct}%</span>
        </div>`).join('')}</div>
      <div class="rv-foot"><span>R8/8</span><span>⟳ ${foot.rerolls}</span>
        <span class="rv-avg">avg ${foot.avg}%</span></div>`;
  }

  /* ---------------- Aufbau ---------------- */

  function build() {
    root = document.createElement('div');
    root.className = 'ovl-tour';
    root.innerHTML = `
      <div class="ovl-stage" id="ovl-stage"><div class="ovl-world" id="ovl-world"></div></div>
      <div class="ovl-card">
        <div class="ovl-card-head">
          <h3 id="ovl-title"></h3>
          <span class="ovl-count" id="ovl-count"></span>
        </div>
        <p class="ovl-text" id="ovl-text"></p>
        <p class="ovl-sub" id="ovl-sub"></p>
        <div class="ovl-size">
          <span>Size</span>
          <input type="range" id="ovl-scale" min="60" max="160" step="5">
          <b id="ovl-scale-val"></b>
          <button class="btn-sm" id="ovl-reset" title="Back to where and how large it was built">Reset</button>
        </div>
        <div class="ovl-actions">
          <button class="btn-sm" id="ovl-close">Close</button>
          <span class="ovl-spacer"></span>
          <button class="btn-sm" id="ovl-back">Back</button>
          <button class="btn ovl-next" id="ovl-next">Next</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    root.querySelector('#ovl-close').addEventListener('click', close);
    root.querySelector('#ovl-back').addEventListener('click', () => go(step - 1));
    root.querySelector('#ovl-next').addEventListener('click', () =>
      step >= STEPS.length - 1 ? close() : go(step + 1));
    root.querySelector('#ovl-reset').addEventListener('click', reset);
    root.querySelector('#ovl-scale').addEventListener('input', e => setScale(Number(e.target.value) / 100));
    root.querySelector('#ovl-world').addEventListener('mousedown', startDrag);
  }

  /* Die Buehne so gross wie moeglich, ohne dass die Karte darunter aus dem
     Fenster rutscht. */
  function fit() {
    const stage = root.querySelector('#ovl-stage');
    const world = root.querySelector('#ovl-world');
    const fw = layout.frame.width, fh = layout.frame.height;
    const card = root.querySelector('.ovl-card').offsetHeight || 220;
    const maxW = Math.min(1200, innerWidth - 64);
    const maxH = Math.max(160, innerHeight - card - 72);
    const w = Math.min(maxW, maxH * fw / fh);
    k = w / fw;
    stage.style.width = `${Math.round(w)}px`;
    stage.style.height = `${Math.round(w * fh / fw)}px`;
    world.style.width = `${fw}px`;
    world.style.height = `${fh}px`;
    world.style.scale = k;
  }

  /* Umrisse des jeweiligen Spielbildschirms - nur so viel, dass man sieht,
     was das Feld nicht verdecken sollte. */
  function ghosts(key) {
    const W = layout.frame.width, H = layout.frame.height;
    const box = (x, y, w, h, extra = '') =>
      `<div class="ovl-ghost ${extra}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;
    if (key === 'tags') {
      const cw = layout.tags.cardWidth * W;
      const x0 = W / 2 - 2 * cw;
      const bottom = layout.tags.namesBottom * H;
      let out = '';
      for (let i = 0; i < 4; i++) {
        out += box(x0 + i * cw + 6, bottom - cw * 1.05, cw - 12, cw * 0.8);
        out += box(x0 + i * cw + cw * 0.18, bottom - cw * 0.16, cw * 0.64, cw * 0.1, 'is-line');
      }
      return out;
    }
    if (key === 'relicPick') {
      let out = box(W * 0.04, H * 0.1, W * 0.12, H * 0.025, 'is-line');
      const cw = W * 0.075, ch = cw * 1.25;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 7; c++) out += box(W * 0.04 + c * (cw + 14), H * 0.2 + r * (ch + 22), cw, ch);
      }
      return out;
    }
    const cw = W * 0.16, ch = cw * 1.5;
    return box(W / 2 - cw - 20, H * 0.2, cw, ch) + box(W / 2 + 20, H * 0.2, cw, ch);
  }

  function panelFor(key, which) {
    const W = layout.frame.width;
    if (key === 'tags') {
      const s = layout.tags.scale;
      const cw = layout.tags.cardWidth * W;
      const width = 4 * cw;
      const left = W / 2 - 2 * cw;
      /* Wie tags.js: schmaler anlegen, damit die Spalten unter den Karten bleiben. */
      const inner = width / s;
      const top = (layout.tags.namesBottom + layout.tags.offset) * layout.frame.height;
      return `<div class="tag-panel schon-da ovl-drag" data-which="tags"
        style="left:${left + (width - inner) / 2}px;top:${top}px;width:${inner}px;
               grid-template-columns:repeat(4,1fr);--ov-scale:${s}">${tagCards()}</div>`;
    }
    if (key === 'relicPick') {
      const w = clamp(0.21 * W, 300, 380);
      return `<div class="rp-panel ovl-drag" data-tier="Lith" data-which="relicPick"
        style="width:${w}px;--ov-scale:${layout.relicPick.scale}">${relicPickHtml()}</div>`;
    }
    const w = clamp(0.21 * W, 300, 400);
    const html = which === 'current'
      ? rivenHtml('Current', [['+128.4%', 'Critical Chance', 71], ['+96.2%', 'Multishot', 44], ['-38.1%', 'Zoom', 62, true]], { rerolls: 14, avg: 59 })
      : rivenHtml('New roll', [['+141.0%', 'Critical Chance', 88], ['+104.7%', 'Critical Damage', 69]], { rerolls: 15, avg: 79 });
    return `<div class="rv-panel ${which === 'current' ? 'rv-left' : 'rv-right'} ovl-drag" data-which="${which}"
      style="width:${w}px;--ov-scale:${layout.riven.scale}">${html}</div>`;
  }

  /* Gespeicherte Lage anlegen - dieselbe Regel wie place() im Spiel. */
  function applyPos(el, pos) {
    if (!pos) return;
    const W = layout.frame.width, H = layout.frame.height;
    el.classList.add('is-placed');
    const r = rectInWorld(el);
    el.style.left = `${clamp(pos.x * W, 0, Math.max(0, W - r.w))}px`;
    el.style.top = `${clamp(pos.y * H, 0, Math.max(0, H - 48))}px`;
    el.style.right = 'auto';
  }

  function rectInWorld(el) {
    const world = root.querySelector('#ovl-world').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: (r.left - world.left) / k, y: (r.top - world.top) / k, w: r.width / k, h: r.height / k };
  }

  function render() {
    const s = STEPS[step];
    const world = root.querySelector('#ovl-world');
    world.dataset.step = s.key;
    world.innerHTML = ghosts(s.key) + (s.key === 'riven'
      ? panelFor('riven', 'current') + panelFor('riven', 'next')
      : panelFor(s.key));
    if (s.key === 'relicPick') applyPos(world.querySelector('.rp-panel'), layout.relicPick.pos);
    if (s.key === 'riven') {
      applyPos(world.querySelector('[data-which="current"]'), layout.riven.pos.current);
      applyPos(world.querySelector('[data-which="next"]'), layout.riven.pos.next);
    }

    root.querySelector('#ovl-title').textContent = s.title;
    root.querySelector('#ovl-count').textContent = `${step + 1} / ${STEPS.length}`;
    root.querySelector('#ovl-text').textContent = s.text;
    const hotkey = layout.hotkey;
    const sub = [];
    if (!layout[s.key].enabled) sub.push(`<span class="is-off">${esc(s.off)}</span>`);
    if (s.inGame && hotkey) sub.push(`In the game, ${esc(hotkey)} while it shows lets you drag it there too.`);
    root.querySelector('#ovl-sub').innerHTML = sub.join(' ');

    const scale = layout[s.key].scale;
    root.querySelector('#ovl-scale').value = Math.round(scale * 100);
    root.querySelector('#ovl-scale-val').textContent = `${Math.round(scale * 100)}%`;
    root.querySelector('#ovl-back').disabled = step === 0;
    root.querySelector('#ovl-next').textContent = step >= STEPS.length - 1 ? 'Done' : 'Next';
  }

  /* ---------------- Speichern ---------------- */

  /* Zusammenfassen und nach einer kurzen Pause schicken - der Regler feuert
     bei jeder Stufe, und jede Stufe schreibt config.json. */
  function save(patch) {
    for (const [key, val] of Object.entries(patch)) {
      const before = pending[key] || {};
      pending[key] = { ...before, ...val };
      /* Die Riven-Felder haben zwei Lagen - ein Zug am rechten darf den am
         linken, der noch nicht abgeschickt ist, nicht verschlucken. */
      if (key === 'riven' && val.pos && before.pos) pending[key].pos = { ...before.pos, ...val.pos };
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 150);
  }

  async function flush() {
    clearTimeout(saveTimer);
    const patch = pending;
    pending = {};
    if (!Object.keys(patch).length) return;
    try {
      const res = await window.api.setOverlayLayout(patch);
      /* Der Hauptprozess hat begrenzt und gerundet - sein Stand gilt. Neu
         gezeichnet wird dabei nicht: die Buehne zeigt schon, was gemeint war,
         und ein Neuzeichnen mitten in einem Zug liesse das Feld springen. */
      if (res?.ok && layout && !Object.keys(pending).length) layout = { ...res, frame: layout.frame };
    } catch { /* bleibt auf der Buehne stehen, beim naechsten Oeffnen gilt der alte Stand */ }
  }

  function setScale(v) {
    const s = STEPS[step].key;
    layout[s].scale = v;
    root.querySelector('#ovl-scale-val').textContent = `${Math.round(v * 100)}%`;
    render();
    save({ [s]: { scale: v } });
  }

  function reset() {
    const s = STEPS[step].key;
    if (s === 'tags') {
      layout.tags.offset = 0.23;
      layout.tags.scale = 1;
      save({ tags: { offset: 0.23, scale: 1 } });
    } else if (s === 'relicPick') {
      layout.relicPick = { ...layout.relicPick, pos: null, scale: 1 };
      save({ relicPick: { pos: null, scale: 1 } });
    } else {
      layout.riven = { ...layout.riven, pos: { current: null, next: null }, scale: 1 };
      save({ riven: { pos: { current: null, next: null }, scale: 1 } });
    }
    render();
  }

  /* ---------------- Ziehen ---------------- */

  function startDrag(e) {
    if (e.button !== 0) return;
    const el = e.target.closest('.ovl-drag');
    if (!el) return;
    const r = rectInWorld(el);
    const world = root.querySelector('#ovl-world').getBoundingClientRect();
    drag = {
      el, which: el.dataset.which,
      dx: (e.clientX - world.left) / k - r.x,
      dy: (e.clientY - world.top) / k - r.y,
      /* Die Schilder bewegen sich nur senkrecht - waagerecht haengen sie an
         den Karten. Ihr linker Rand bleibt, wo tags.js ihn hinsetzt. */
      left: el.style.left
    };
    el.classList.add('is-dragging');
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag) return;
    const W = layout.frame.width, H = layout.frame.height;
    const world = root.querySelector('#ovl-world').getBoundingClientRect();
    const x = (e.clientX - world.left) / k - drag.dx;
    const y = (e.clientY - world.top) / k - drag.dy;
    if (drag.which === 'tags') {
      const min = layout.tags.namesBottom * H;
      drag.el.style.top = `${clamp(y, min, min + 0.33 * H)}px`;
      return;
    }
    drag.el.classList.add('is-placed');
    const w = rectInWorld(drag.el).w;
    drag.el.style.left = `${clamp(x, 0, Math.max(0, W - w))}px`;
    drag.el.style.top = `${clamp(y, 0, Math.max(0, H - 48))}px`;
    drag.el.style.right = 'auto';
  }

  function onUp() {
    if (!drag) return;
    const { el, which } = drag;
    drag = null;
    el.classList.remove('is-dragging');
    const W = layout.frame.width, H = layout.frame.height;
    const r = rectInWorld(el);
    if (which === 'tags') {
      const offset = Math.round(clamp(r.y / H - layout.tags.namesBottom, 0, 0.33) * 1000) / 1000;
      layout.tags.offset = offset;
      save({ tags: { offset } });
      return;
    }
    const pos = { x: r.x / W, y: r.y / H };
    if (which === 'relicPick') {
      layout.relicPick.pos = pos;
      save({ relicPick: { pos } });
    } else {
      layout.riven.pos = { ...layout.riven.pos, [which]: pos };
      save({ riven: { pos: { [which]: pos } } });
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  function onResize() {
    if (!root) return;
    fit();
    render();
  }

  /* ---------------- Oeffnen und Schliessen ---------------- */

  function go(n) {
    step = clamp(n, 0, STEPS.length - 1);
    render();
  }

  async function open() {
    if (root) return;
    try {
      layout = await window.api.getOverlayLayout();
    } catch { layout = null; }
    if (!layout?.ok) return;
    step = 0;
    build();
    fit();
    render();
    /* Erst nach dem ersten Zeichnen steht die Hoehe der Karte fest. */
    setTimeout(onResize, 0);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
  }

  function close() {
    if (!root) return;
    flush();
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    root.remove();
    root = null;
    drag = null;
  }

  return { open, close };
})();
