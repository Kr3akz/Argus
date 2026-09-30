/**
 * Unterreiter "Appearance" in den Einstellungen: Themes waehlen.
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
 */
const Appearance = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let state = null;        // describeAppearance aus dem Hauptprozess
  let loading = null;

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

  /* -------------------------------- Zeichnen -------------------------------- */

  function render() {
    if (!state) return;
    const presets = $('theme-presets');
    if (presets) presets.innerHTML = state.presets.map(card).join('');

    const own = $('theme-own');
    const custom = $('theme-custom');
    if (own && custom) {
      own.classList.toggle('hidden', !state.custom.length);
      custom.innerHTML = state.custom.map(card).join('');
      const count = $('theme-own-count');
      if (count) count.textContent = `${state.custom.length} of ${state.limits.maxCustom}`;
    }
  }

  /* -------------------------------- Auftraege -------------------------------- */

  async function send(patch) {
    try {
      const res = await window.api.setAppearance(patch);
      if (res && res.presets) { state = res; render(); }
      return res;
    } catch (err) {
      console.error('[Aussehen]', err);
      return { ok: false, error: err.message };
    }
  }

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

  /* ------------------------------- Ereignisse ------------------------------- */

  document.addEventListener('click', e => {
    const c = e.target.closest('.theme-card[data-theme-id]');
    if (!c || !c.closest('[data-set-pane="appearance"]')) return;
    if (state && c.dataset.themeId === state.active) return;
    send({ select: c.dataset.themeId });
  });

  /* Ein Wechsel aus einem anderen Fenster (oder aus einem zweiten Aufruf)
     soll die Auswahl hier nicht veraltet stehen lassen. */
  if (typeof ArgusTheme !== 'undefined') {
    ArgusTheme.onChange(t => {
      if (state && t && t.id && t.id !== state.active) load();
    });
  }

  return { load, render };
})();
