/**
 * Unterreiter "Appearance" in den Einstellungen: Themes waehlen, anlegen,
 * bearbeiten und teilen, dazu die Groesse der Oberflaeche.
 *
 * WAS HIER STEHT UND WAS NICHT:
 *   Hier wird gezeichnet und geklickt. Gerechnet wird im Hauptprozess
 *   (core/themes.js): jede Aenderung geht als kleiner Auftrag hin
 *   (setAppearance), zurueck kommt der ganze neue Stand - dieselbe Form wie
 *   getAppearance. Das Theme selbst legt theme.js an, sobald der Hauptprozess
 *   es an alle Fenster verteilt; diese Datei muss das nicht selbst tun.
 *
 * DIE VORSCHAUKARTEN zeigen jedes Theme in seinen eigenen Farben: die
 * Variablen des Themes stehen als style-Attribut auf der kleinen Flaeche, und
 * alles darin nimmt rgb(var(--t-...)) direkt. Die fertigen Farben (--accent
 * und Co.) wuerden dort NICHT greifen - sie sind am :root schon ausgerechnet,
 * siehe den Kopf von :root in style.css. Name und Kontur der Karte liegen
 * ausserhalb der Flaeche und bleiben in den Farben der Seite.
 *
 * DER EDITOR bearbeitet immer das gewaehlte Theme. Ist das ein Preset, legt
 * die erste Aenderung eine Kopie an (applyPatch, edit) - der Editor merkt das
 * an der neuen ID in der Antwort und arbeitet an der Kopie weiter.
 *
 * DER FARBWAEHLER ist selbst gebaut und kein <input type="color">: der
 * oeffnet unter Windows einen eigenen Dialog, in dem sich nichts live
 * verfolgen laesst, und er kennt die Grenzen nicht. Hier liegt ueber der
 * Flaeche eine Maske fuer das, was core/themes.js nicht zulaesst (ein heller
 * Hintergrund etwa) - wer dort hineinzieht, bekommt den naechsten erlaubten
 * Ton, und die Maske sagt vorher, warum.
 */
const Appearance = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  let state = null;        // describeAppearance aus dem Hauptprozess
  let loading = null;

  /* ------------------------------ Farbrechnung ------------------------------
     Nur fuer die Anzeige des Waehlers. Was gilt, entscheidet der Hauptprozess;
     die OKLCH-Formeln sind dieselben wie in core/themes.js, damit die Maske an
     derselben Stelle endet wie die Klemme dort. */

  const hexToRgb = hex => {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    let h = m[1].toLowerCase();
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  };
  const rgbToHex = rgb => '#' + rgb.map(c => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('');

  function hsvToRgb(h, s, v) {
    const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  function rgbToHsv([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }
  /* Nachschlagetafel statt Potenz: die Flaeche des Waehlers rechnet bei jedem
     Zug am Farbton-Regler 35 000 Punkte neu. */
  const LIN = Float64Array.from({ length: 256 }, (_, i) => {
    const c = i / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const toLin = c => LIN[clamp(Math.round(c), 0, 255)];
  function oklchLC([r, g, b]) {
    const R = toLin(r), G = toLin(g), B = toLin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { L, C: Math.hypot(a, bb) };
  }
  const allowed = (rgb, spec) => {
    const o = oklchLC(rgb);
    return o.L >= spec.L[0] - 1e-4 && o.L <= spec.L[1] + 1e-4 && o.C <= spec.maxC + 1e-4;
  };

  /* ---------------------------- Vorschaukarten ---------------------------- */

  /* Ein Fenster im Kleinen: Sidebar mit aktivem Reiter, Ueberschrift, zwei
     Karten, ein Akzentknopf und die beiden Zustandsfarben. Genug, um ein
     Theme wiederzuerkennen - nicht so viel, dass es nach Screenshot aussieht. */
  function mock(vars) {
    const style = Object.entries(vars || {}).map(([k, v]) => `${k}:${v}`).join(';');
    return `
      <span class="theme-mock" style="${esc(style)}" aria-hidden="true">
        <span class="tm-rail"><i class="on"></i><i></i><i></i></span>
        <span class="tm-body">
          <span class="tm-line tm-title"></span>
          <span class="tm-line tm-sub"></span>
          <span class="tm-cards">
            <span class="tm-card"><i></i><i></i></span>
            <span class="tm-card"><i></i><i></i></span>
          </span>
          <span class="tm-foot">
            <span class="tm-btn"></span>
            <span class="tm-dot is-pos"></span>
            <span class="tm-dot is-neg"></span>
          </span>
        </span>
      </span>`;
  }

  function card(t) {
    const active = state && t.id === state.active;
    const note = t.note || (t.fromName ? `Based on ${t.fromName}` : 'Your own');
    return `
      <button class="theme-card${active ? ' is-active' : ''}" data-theme-id="${esc(t.id)}"
              aria-pressed="${active ? 'true' : 'false'}" title="${esc(t.name)}">
        ${mock(t.vars)}
        <span class="theme-card-meta">
          <b>${esc(t.name)}</b>
          <span>${esc(note)}</span>
        </span>
      </button>`;
  }

  /* Die Karte zum Anlegen. Sie kopiert das Theme, das gerade gilt - wer ein
     eigenes will, faengt fast immer bei dem an, das er vor sich sieht. */
  function newCard() {
    const full = state.custom.length >= state.limits.maxCustom;
    const base = state.activeTheme.name;
    return `
      <button class="theme-card theme-card-new" id="theme-new"${full ? ' disabled' : ''}
              title="${full ? 'Delete one of your themes first' : 'Start a new theme from ' + esc(base)}">
        <span class="theme-new-art" aria-hidden="true">${Icon.plus(20)}</span>
        <span class="theme-card-meta">
          <b>New theme</b>
          <span>${full ? `You have ${state.limits.maxCustom} already` : `Starts as a copy of ${esc(base)}`}</span>
        </span>
      </button>`;
  }

  function renderCards() {
    const presets = $('theme-presets');
    if (presets) presets.innerHTML = state.presets.map(card).join('');
    const custom = $('theme-custom');
    if (custom) custom.innerHTML = state.custom.map(card).join('') + newCard();
    const count = $('theme-own-count');
    if (count) count.textContent = `${state.custom.length} of ${state.limits.maxCustom}`;
  }

  /* --------------------------------- Editor --------------------------------- */

  const pct = v => Math.round(v * 100) + ' %';

  /* Der Kopf des Editors: Hinweis, Name, Herkunft, Knoepfe. Eigene Funktion,
     weil er auch mitten im Ziehen neu muss - wenn die erste Aenderung ein
     Preset gerade kopiert hat -, ohne dass die Zeilen darunter neu entstehen. */
  function renderHead() {
    const t = state.activeTheme;
    const own = !t.isPreset;

    const note = $('theme-editor-note');
    if (note) {
      note.textContent = own
        ? 'Changes apply while you make them and are saved as you go.'
        : `Presets stay as they are. Your first change below makes a copy, “${t.name} custom”, that you can rename.`;
    }
    /* Wer gerade tippt, behaelt seinen Text - aber nur, solange es um
       dasselbe Theme geht. Nach einem Wechsel stuende sonst der Name des
       vorigen Themes im Feld (nach "Duplicate" hat es noch den Fokus). */
    const name = $('theme-name');
    if (name) {
      if (document.activeElement !== name || name.dataset.for !== t.id) name.value = t.name;
      name.dataset.for = t.id;
      name.disabled = !own;
      name.title = own ? 'Rename this theme' : 'Presets keep their name';
    }
    const from = $('theme-from');
    if (from) from.textContent = own ? (t.fromName ? `Based on ${t.fromName}` : 'Your own') : 'Preset';

    const dup = $('theme-duplicate');
    if (dup) dup.innerHTML = Icon.copy(13) + '<span>Duplicate</span>';
    const reset = $('theme-reset');
    if (reset) {
      reset.classList.toggle('hidden', !own || !t.from);
      reset.innerHTML = Icon.refresh(13) + `<span>Reset to ${esc(t.fromName || '')}</span>`;
    }
    const del = $('theme-delete');
    if (del) {
      del.classList.toggle('hidden', !own);
      disarm(del);
    }
  }

  function renderEditor() {
    const t = state.activeTheme;
    renderHead();

    const colors = $('theme-colors');
    if (colors) {
      colors.innerHTML = state.colorKeys.map(k => {
        const v = t.colors[k.key];
        return `
          <div class="te-row" data-row="${k.key}">
            <span class="te-row-label"><b>${esc(k.label)}</b><span>${esc(k.hint)}</span></span>
            <span class="te-color">
              <button class="te-swatch" data-color="${k.key}" style="--sw:${esc(v)}"
                      aria-label="Pick the ${esc(k.label.toLowerCase())} colour"></button>
              <input class="te-hex" data-color="${k.key}" value="${esc(v)}" maxlength="7"
                     spellcheck="false" autocomplete="off" aria-label="${esc(k.label)} as hex">
            </span>
          </div>`;
      }).join('');
    }

    const shape = $('theme-shape');
    if (shape) {
      shape.innerHTML = state.shapeKeys.map(s => `
          <div class="te-row">
            <span class="te-row-label"><b>${esc(s.label)}</b><span>${esc(s.hint)}</span></span>
            <span class="te-range">
              <input type="range" data-shape="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"
                     value="${t.shape[s.key]}" aria-label="${esc(s.label)}">
              <b class="te-val" data-val="${s.key}">${pct(t.shape[s.key])}</b>
            </span>
          </div>`).join('') + `
          <label class="te-row te-toggle">
            <span class="te-row-label"><b>Blur behind panels</b>
              <span>Softens what shows through the sidebar and dialogs. Off makes them solid</span></span>
            <input type="checkbox" class="toggle-checkbox" data-shape="blur"${t.shape.blur ? ' checked' : ''}>
            <span class="toggle-switch"></span>
          </label>`;
    }
    renderWarnings();
  }

  function renderWarnings() {
    const box = $('theme-warnings');
    if (!box) return;
    const w = state.activeTheme.warnings || [];
    box.innerHTML = w.map(x =>
      `<div class="settings-note warn te-warn">${Icon.warning(13)}<span>${esc(x.text)}</span></div>`).join('');
    /* Die Zeile der Farbe, um die es geht, bekommt dieselbe Kante. */
    document.querySelectorAll('#theme-colors .te-row').forEach(r =>
      r.classList.toggle('is-warned', w.some(x => x.key === r.dataset.row)));
  }

  /* Nach einer Aenderung am Farbwaehler oder an einem Regler: nur die Werte
     nachziehen, nichts neu bauen - sonst verlore der Regler unter dem
     Zeiger seinen Griff. Das Feld, an dem gerade gearbeitet wird, bleibt. */
  function syncValues() {
    const t = state.activeTheme;
    document.querySelectorAll('#theme-colors .te-swatch').forEach(b => b.style.setProperty('--sw', t.colors[b.dataset.color]));
    document.querySelectorAll('#theme-colors .te-hex').forEach(i => {
      if (document.activeElement !== i) { i.value = t.colors[i.dataset.color]; i.classList.remove('is-bad'); }
    });
    document.querySelectorAll('#theme-shape input[type=range]').forEach(r => {
      if (r !== dragging) r.value = t.shape[r.dataset.shape];
      const val = document.querySelector(`#theme-shape [data-val="${r.dataset.shape}"]`);
      if (val) val.textContent = pct(t.shape[r.dataset.shape]);
    });
    const blur = document.querySelector('#theme-shape [data-shape="blur"]');
    if (blur) blur.checked = !!t.shape.blur;
    /* Den Griff nur nachsetzen, wenn gerade niemand zieht: das Runden auf
       ganze Hex-Stufen verschiebt den Farbton um Bruchteile, und ein Regler,
       der unter dem Finger zurueckspringt, laesst sich nicht fuehren. */
    if (picker.key && !picker.dragging && !picker.hueDrag) placeKnob(t.colors[picker.key]);
    if (picker.key) picker.el.querySelector('.cp-now').style.background = t.colors[picker.key];
    if (picker.key && document.activeElement !== picker.el.querySelector('.cp-hex')) {
      picker.el.querySelector('.cp-hex').value = t.colors[picker.key];
    }
  }

  /* --------------------------- Groesse und Teilen --------------------------- */

  function renderExtras() {
    const zoom = $('theme-zoom');
    if (zoom) {
      zoom.innerHTML = state.zoomSteps.map(z => `
        <button class="filter-chip${z === state.zoom ? ' active' : ''}" data-zoom="${z}"
                aria-pressed="${z === state.zoom ? 'true' : 'false'}">${Math.round(z * 100)} %</button>`).join('');
    }
    const share = $('theme-share');
    if (share) share.innerHTML = Icon.copy(13) + '<span>Copy code</span>';
    const note = $('theme-share-note');
    if (note) note.textContent = `Copies a code for “${state.activeTheme.name}” to the clipboard`;
  }

  /* Rueckmeldung zum Teilen und Einfuegen, direkt darunter statt oben im
     Editor - wer einen Code einfuegt, schaut auf das Feld. */
  let shareTimer = null;
  function shareStatus(kind, text) {
    const el = $('theme-share-status');
    if (!el) return;
    el.className = `settings-note ${kind}`;
    el.textContent = text;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => el.classList.add('hidden'), 6000);
  }

  async function share() {
    await settle();
    const res = await window.api.themeShareCode(state.active);
    if (!res || !res.ok) { shareStatus('warn', res?.error || 'Could not make a code for this theme.'); return; }
    const c = await window.api.copyText(res.code);
    if (c && c.ok) shareStatus('ok', `Copied the code for “${state.activeTheme.name}”. Paste it anywhere to send it.`);
    else shareStatus('warn', 'Could not reach the clipboard.');
  }

  async function importCode() {
    const input = $('theme-import');
    const code = (input?.value || '').trim();
    if (!code) { shareStatus('warn', 'Paste a code into the field first.'); input?.focus(); return; }
    await settle();
    const res = await send({ import: code });
    render();
    if (res && res.ok) {
      input.value = '';
      shareStatus('ok', `Added “${state.activeTheme.name}” and switched to it.`);
    } else {
      shareStatus('warn', res?.error || 'That code did not work.');
    }
  }

  function render() {
    if (!state) return;
    renderCards();
    renderEditor();
    renderExtras();
  }

  /* ------------------------------- Auftraege ------------------------------- */

  async function send(patch) {
    try {
      const res = await window.api.setAppearance(patch);
      if (res && res.presets) state = res;
      return res;
    } catch (err) {
      console.error('[Aussehen]', err);
      return { ok: false, error: err.message };
    }
  }

  /* Ein Auftrag, danach alles neu - fuer Klicks (waehlen, anlegen, loeschen).
     Vorher muss durch sein, was vom Ziehen noch wartet: eine Aenderung
     trifft immer das GEWAEHLTE Theme, und nach dem Klick waere das ein
     anderes. Die Karte, die den Fokus hatte, bekommt ihn nach dem
     Neuzeichnen zurueck - sonst stuende die Tastatur wieder am Seitenanfang. */
  async function act(patch, after) {
    await settle();
    const focusId = document.activeElement?.dataset?.themeId || null;
    const res = await send(patch);
    render();
    if (focusId) document.querySelector(`.theme-card[data-theme-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
    if (res && !res.ok && res.error) flash(res.error);
    if (after) after(res);
    return res;
  }

  /* Beim Ziehen: hoechstens ein Auftrag unterwegs, und was waehrenddessen
     dazukommt, sammelt sich und geht als EINER hinterher. Der Hauptprozess
     bekommt so nie eine Schlange, und das letzte Wort hat immer die letzte
     Stellung des Reglers. */
  let pending = null, inflight = false, flushTimer = null;
  function queueEdit(part) {
    pending = {
      colors: { ...(pending?.colors || {}), ...(part.colors || {}) },
      shape: { ...(pending?.shape || {}), ...(part.shape || {}) }
    };
    if (!inflight && !flushTimer) flushTimer = setTimeout(flush, 16);
  }
  async function flush() {
    flushTimer = null;
    if (!pending) return;
    const edit = pending;
    pending = null;
    inflight = true;
    const before = state?.active;
    const res = await send({ edit });
    inflight = false;
    if (res && res.presets) {
      renderCards();
      /* Das Preset wurde eben kopiert - Kopf und Knoepfe gehoeren jetzt zur
         Kopie. Die Werte stehen schon richtig da. */
      if (res.active !== before) { renderHead(); renderExtras(); }
      syncValues();
      renderWarnings();
    }
    /* Abgelehnt (etwa: schon 50 eigene Themes, das Preset laesst sich nicht
       mehr kopieren) - dann steht der alte Stand wieder da, und warum. */
    if (res && !res.ok && res.error) { syncValues(); flash(res.error); }
    if (pending) flushTimer = setTimeout(flush, 16);
  }

  /* Wartet, bis vom Ziehen nichts mehr unterwegs ist. */
  async function settle() {
    for (let i = 0; i < 200 && (flushTimer || inflight); i++) {
      if (flushTimer && !inflight) { clearTimeout(flushTimer); await flush(); }
      else await new Promise(r => setTimeout(r, 10));
    }
  }

  /* Eine Meldung unter dem Editor, die von selbst wieder geht - fuer das, was
     der Hauptprozess ablehnt (zu viele Themes, ein Name, den es nicht gibt). */
  let flashTimer = null;
  function flash(text) {
    const box = $('theme-warnings');
    if (!box) return;
    box.querySelector('.te-flash')?.remove();
    box.insertAdjacentHTML('afterbegin', `<div class="settings-note warn te-flash">${Icon.warning(13)}<span>${esc(text)}</span></div>`);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => box.querySelector('.te-flash')?.remove(), 6000);
  }

  /* Zweistufiges Loeschen wie bei den Builds: der erste Klick bewaffnet, der
     zweite loescht, nach drei Sekunden entschaerft sich der Knopf. */
  let armTimer = null;
  function disarm(btn) {
    clearTimeout(armTimer);
    btn.classList.remove('armed');
    btn.innerHTML = Icon.trash(13) + '<span>Delete</span>';
  }

  /* ------------------------------ Farbwaehler ------------------------------ */

  const picker = { el: null, key: null, spec: null, h: 0, s: 0, v: 0, win: [0, 1],
                   dragging: false, hueDrag: false, anchor: null };

  /* Welcher Helligkeitsausschnitt (HSV-Wert) die Flaeche fuellt. Der
     Hintergrund darf nur dunkel sein - zeigte die Flaeche trotzdem 0 bis 100
     %, bliebe fuer ihn ein Streifen am unteren Rand, den man kaum trifft. Die
     Maske zeigt innerhalb des Ausschnitts weiter die genaue Grenze. */
  const vWindow = key => key === 'bg' ? [0, 0.4] : (key === 'text' || key === 'surface') ? [0.7, 1] : [0, 1];

  function buildPicker() {
    const el = document.createElement('div');
    el.className = 'cp hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Pick a colour');
    el.innerHTML = `
      <div class="cp-area" tabindex="0" aria-label="Saturation and brightness. Arrow keys move, Shift moves further">
        <canvas class="cp-field" width="232" height="150"></canvas>
        <span class="cp-knob"></span>
      </div>
      <input type="range" class="cp-hue" min="0" max="359" step="1" aria-label="Hue">
      <div class="cp-foot">
        <span class="cp-now" aria-hidden="true"></span>
        <input class="cp-hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex">
        <span class="cp-hint"></span>
      </div>`;
    document.body.appendChild(el);
    picker.el = el;

    const area = el.querySelector('.cp-area');
    const fromPointer = e => {
      const r = area.getBoundingClientRect();
      const [v0, v1] = picker.win;
      picker.s = clamp((e.clientX - r.left) / r.width, 0, 1);
      picker.v = v1 - clamp((e.clientY - r.top) / r.height, 0, 1) * (v1 - v0);
      moveKnob();
      pick();
    };
    area.addEventListener('pointerdown', e => {
      picker.dragging = true;
      area.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    area.addEventListener('pointermove', e => { if (picker.dragging) fromPointer(e); });
    /* Beim Loslassen springt der Griff auf die Farbe, die wirklich gilt -
       wer in die Maske gezogen hat, sieht so, wo der erlaubte Ton liegt. Ist
       die Antwort noch unterwegs, erledigt das syncValues, sobald sie da ist. */
    const stop = () => {
      picker.dragging = false;
      if (state && picker.key && !inflight && !pending) placeKnob(state.activeTheme.colors[picker.key]);
    };
    area.addEventListener('pointerup', stop);
    area.addEventListener('pointercancel', stop);
    area.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.1 : 0.02;
      const [v0, v1] = picker.win;
      const vs = step * (v1 - v0);
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, vs], ArrowDown: [0, -vs] }[e.key];
      if (!d) return;
      e.preventDefault();
      picker.s = clamp(picker.s + d[0], 0, 1);
      picker.v = clamp(picker.v + d[1], v0, v1);
      moveKnob();
      pick();
    });

    const hue = el.querySelector('.cp-hue');
    /* Ende des Ziehens: pointerup, und zur Sicherheit auch change - endet der
       Zug ausserhalb des Reglers, kommt pointerup womoeglich nicht bei ihm an. */
    hue.addEventListener('pointerdown', () => { picker.hueDrag = true; });
    for (const ev of ['pointerup', 'pointercancel', 'change']) {
      hue.addEventListener(ev, () => { picker.hueDrag = false; });
    }
    hue.addEventListener('input', () => {
      picker.h = Number(hue.value);
      paintArea();
      pick();
    });

    const hex = el.querySelector('.cp-hex');
    const commitHex = () => {
      const rgb = hexToRgb(hex.value);
      if (!rgb) { hex.classList.add('is-bad'); return; }
      hex.classList.remove('is-bad');
      const hsv = rgbToHsv(rgb);
      if (hsv.s > 0) picker.h = hsv.h;
      picker.s = hsv.s; picker.v = hsv.v;
      el.querySelector('.cp-hue').value = Math.round(picker.h);
      paintArea();
      moveKnob();
      queueEdit({ colors: { [picker.key]: rgbToHex(rgb) } });
    };
    hex.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitHex(); }
      if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
    });
    hex.addEventListener('change', commitHex);

    /* Zu geht er mit Esc, mit einem Klick daneben und wenn die Seite rollt -
       dann stuende er sonst neben einer Zeile, die gar nicht mehr da ist. */
    document.addEventListener('pointerdown', e => {
      if (!picker.key) return;
      if (el.contains(e.target) || e.target.closest('.te-swatch')) return;
      closePicker();
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && picker.key) closePicker(); });
    document.querySelector('.main-content')?.addEventListener('scroll', () => { if (picker.key) closePicker(); }, { passive: true });
    window.addEventListener('resize', () => { if (picker.key) closePicker(); });
  }

  function openPicker(key, anchor) {
    if (!picker.el) buildPicker();
    if (picker.key === key) { closePicker(); return; }
    const spec = state.colorKeys.find(k => k.key === key);
    if (!spec) return;
    picker.key = key;
    picker.spec = spec;
    picker.anchor = anchor;
    picker.win = vWindow(key);
    const hsv = rgbToHsv(hexToRgb(state.activeTheme.colors[key]) || [0, 0, 0]);
    picker.h = hsv.h; picker.s = hsv.s; picker.v = hsv.v;
    const el = picker.el;
    el.querySelector('.cp-hue').value = Math.round(picker.h);
    el.querySelector('.cp-hex').value = state.activeTheme.colors[key];
    el.querySelector('.cp-hex').classList.remove('is-bad');
    el.querySelector('.cp-now').style.background = state.activeTheme.colors[key];
    el.querySelector('.cp-hint').textContent = hintFor(spec);
    document.querySelectorAll('.te-swatch.is-open').forEach(b => b.classList.remove('is-open'));
    anchor.classList.add('is-open');
    el.classList.remove('hidden');
    paintArea();
    moveKnob();
    /* Unter dem Farbfeld, rechtsbuendig an dessen Kante; passt es unten nicht
       mehr hin, dann darueber. */
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = clamp(r.right - w, 8, window.innerWidth - w - 8);
    const below = r.bottom + 8 + h <= window.innerHeight - 8;
    el.style.left = left + 'px';
    el.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + 'px';
    el.querySelector('.cp-area').focus({ preventScroll: true });
  }

  function closePicker() {
    if (!picker.el || !picker.key) return;
    picker.el.classList.add('hidden');
    picker.anchor?.classList.remove('is-open');
    picker.key = null;
    picker.dragging = false;
    if (state) syncValues();
  }

  /* Welche Grenze die Maske zieht, in einem Satz. */
  function hintFor(spec) {
    if (spec.key === 'bg') return 'Dark tones only — cards and lines are drawn light on top of it';
    if (spec.key === 'text' || spec.key === 'surface') return 'Light tones only, so text and cards stay readable';
    return 'Very dark and very light tones are left out';
  }

  /* Die Flaeche Punkt fuer Punkt: Saettigung nach rechts, Helligkeit nach
     oben (im Ausschnitt picker.win), und was core/themes.js klemmen wuerde,
     zu drei Vierteln abgedunkelt. Selbst gezeichnet statt mit zwei
     CSS-Verlaeufen, weil die nur den ganzen Bereich von 0 bis 100 % kennen. */
  function paintArea() {
    const cv = picker.el.querySelector('.cp-field');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const [v0, v1] = picker.win;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      const v = v1 - (y / (H - 1)) * (v1 - v0);
      for (let x = 0; x < W; x++) {
        const rgb = hsvToRgb(picker.h, x / (W - 1), v);
        const i = (y * W + x) * 4;
        if (allowed(rgb, picker.spec)) {
          d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
        } else {
          d[i] = rgb[0] * 0.25 + 4.5; d[i + 1] = rgb[1] * 0.25 + 6.75; d[i + 2] = rgb[2] * 0.25 + 10.5;
        }
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function moveKnob() {
    const knob = picker.el.querySelector('.cp-knob');
    const [v0, v1] = picker.win;
    knob.style.left = (picker.s * 100) + '%';
    knob.style.top = (clamp((v1 - picker.v) / (v1 - v0), 0, 1) * 100) + '%';
    knob.style.background = rgbToHex(hsvToRgb(picker.h, picker.s, picker.v));
  }

  function placeKnob(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const hsv = rgbToHsv(rgb);
    if (hsv.s > 0.001) picker.h = hsv.h;
    picker.s = hsv.s; picker.v = hsv.v;
    picker.el.querySelector('.cp-hue').value = Math.round(picker.h);
    paintArea();
    moveKnob();
  }

  function pick() {
    const hex = rgbToHex(hsvToRgb(picker.h, picker.s, picker.v));
    picker.el.querySelector('.cp-hex').value = hex;
    queueEdit({ colors: { [picker.key]: hex } });
  }

  /* ------------------------------- Ereignisse ------------------------------- */

  let dragging = null;     // der Regler, an dem gerade gezogen wird

  document.addEventListener('click', e => {
    if (!e.target.closest('[data-set-pane="appearance"]')) return;

    const c = e.target.closest('.theme-card[data-theme-id]');
    if (c) {
      if (state && c.dataset.themeId !== state.active) act({ select: c.dataset.themeId });
      return;
    }
    if (e.target.closest('#theme-new')) {
      act({ create: {} }, res => { if (res?.ok) focusName(); });
      return;
    }
    const sw = e.target.closest('.te-swatch');
    if (sw) { openPicker(sw.dataset.color, sw); return; }

    const zb = e.target.closest('#theme-zoom [data-zoom]');
    if (zb) {
      const z = Number(zb.dataset.zoom);
      if (state && z !== state.zoom) act({ zoom: z });
      return;
    }
    if (e.target.closest('#theme-share')) { share(); return; }
    if (e.target.closest('#theme-import-add')) { importCode(); return; }

    if (e.target.closest('#theme-duplicate')) {
      act({ duplicate: state.active }, res => { if (res?.ok) focusName(); });
      return;
    }
    if (e.target.closest('#theme-reset')) { act({ reset: state.active }); return; }

    const del = e.target.closest('#theme-delete');
    if (del) {
      if (del.classList.contains('armed')) {
        disarm(del);
        act({ remove: state.active });
        return;
      }
      del.classList.add('armed');
      del.innerHTML = Icon.trash(13) + '<span>Sure?</span>';
      clearTimeout(armTimer);
      armTimer = setTimeout(() => disarm(del), 3000);
    }
  });

  function focusName() {
    const name = $('theme-name');
    if (!name || name.disabled) return;
    name.focus();
    name.select();
    name.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  document.addEventListener('input', e => {
    const r = e.target.closest('#theme-shape input[type=range]');
    if (!r) return;
    dragging = r;
    const v = Number(r.value);
    const val = document.querySelector(`#theme-shape [data-val="${r.dataset.shape}"]`);
    if (val) val.textContent = pct(v);
    queueEdit({ shape: { [r.dataset.shape]: v } });
  });

  document.addEventListener('change', e => {
    if (e.target.matches('#theme-shape input[type=range]')) { dragging = null; return; }
    if (e.target.matches('#theme-shape [data-shape="blur"]')) {
      queueEdit({ shape: { blur: e.target.checked } });
      return;
    }
    if (e.target.matches('#theme-colors .te-hex')) {
      const rgb = hexToRgb(e.target.value);
      if (!rgb) { e.target.classList.add('is-bad'); return; }
      e.target.classList.remove('is-bad');
      queueEdit({ colors: { [e.target.dataset.color]: rgbToHex(rgb) } });
      return;
    }
    if (e.target.matches('#theme-name')) {
      /* Das Feld weiss, zu welchem Theme es gehoert - "change" kommt beim
         Verlassen, und wer danach gleich eine andere Karte anklickt, hat den
         Namen fuer das alte Theme getippt, nicht fuer das neue. */
      const id = e.target.dataset.for || state?.active;
      const own = state?.custom.find(c => c.id === id);
      const name = e.target.value.trim();
      if (!name || !own || name === own.name) {
        e.target.value = state?.activeTheme.name || '';
        return;
      }
      act({ rename: { id, name } });
    }
  });

  document.addEventListener('keydown', e => {
    if (e.target.matches('#theme-import') && e.key === 'Enter') {
      e.preventDefault();
      importCode();
      return;
    }
    if (e.target.matches('#theme-name, #theme-colors .te-hex') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
    if (e.target.matches('#theme-name') && e.key === 'Escape') {
      e.target.value = state?.activeTheme.name || '';
      e.target.blur();
    }
  });

  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const res = await window.api.getAppearance();
        if (res && res.presets) { state = res; render(); }
      } catch (err) {
        console.error('[Aussehen] nicht geladen:', err);
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  return { load, render };
})();
