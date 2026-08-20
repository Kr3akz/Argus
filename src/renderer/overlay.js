/* Overlay-Renderer.

   Eigenes Fenster neben dem Hauptfenster, kein zweiter Zustand desselben:
   waehrend das Overlay ueber dem Spiel liegt, bleibt die volle Oberflaeche auf
   dem zweiten Monitor stehen.

   Gezeigt wird nur, was sich in den naechsten Minuten entscheidet - Zyklen,
   Risse, offene Ziele. Die Restzeiten laufen lokal aus dem expiry-Zeitstempel
   weiter, ein Tick pro Sekunde. Der 30-Sekunden-Takt des Hauptfensters faellt
   ueber einem Spiel auf, in dem man auf die letzte Minute schaut.

   Laeuft wie der uebrige Renderer ohne Node-Zugriff, alles ueber window.api.  */

const $  = id => document.getElementById(id);
const nf = n => (n ?? 0).toLocaleString('de-DE');

/** Item- und Knotennamen kommen aus fremden Daten - vor dem Einsetzen entschaerfen. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let dashboard = null;             // MR und Ziele
let world     = null;             // Weltzustand
let notifSettings = null;         // dieselbe Auswahl wie fuer die Toasts
let clickThrough = false;
let interacting = false;
let visible = true;
let hotkeys = { overlay: 'Alt+Shift+W', interact: 'Alt+Shift+E' };

let tickTimer = null;
let pollTimer = null;
let hoverSent = null;

const SOON_MS   = 5 * 60 * 1000;  // ab hier faerbt sich die Restzeit
/* Dieselbe Schwelle wie im Hauptfenster (renderWsSource): ab einer
   Viertelstunde Rueckstand ist die Quelle nicht mehr brauchbar. */
const STALE_MS  = 15 * 60 * 1000;
const POLL_MS   = 60000;
const MAX_FISS  = 8;
const MAX_GOALS = 4;

/* ---------------- Icons ---------------- */

document.querySelectorAll('[data-icon]').forEach(el => {
  const name = el.dataset.icon;
  if (Icon[name]) el.innerHTML = Icon[name](15);
});
$('ov-refresh').innerHTML = Icon.refresh(13);
$('ov-click').innerHTML   = Icon.target(13);
$('ov-exit').innerHTML    = Icon.pip(13);

/* ---------------- Zeitrechnung ---------------- */

function msUntil(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t - Date.now() : null;
}

/** h:mm:ss bzw. m:ss - kurz genug fuer eine schmale Spalte. */
function fmtCountdown(ms) {
  if (ms === null) return '—';
  if (ms <= 0) return 'jetzt';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function relativeAge(ts) {
  if (!ts) return 'unbekannt';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} Minuten`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Stunde${h === 1 ? '' : 'n'}`;
  const d = Math.round(h / 24);
  return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
}

/* Laeuft jede Sekunde und fasst nur die Uhren an - kein Neuaufbau der Listen,
   sonst reisst jede Sekunde die Scrollposition und jeder Hover ab. */
function tickClocks() {
  /* Bei haengender Quelle keine Zahlen erfinden: eine Restzeit, die vor zwei
     Stunden abgelaufen ist, als "jetzt" anzuzeigen ist schlicht falsch. */
  const stale = sourceIsStale();

  document.querySelectorAll('[data-until]').forEach(el => {
    const ms = msUntil(el.dataset.until);
    if (stale && ms !== null && ms <= 0) {
      el.textContent = '—';
      el.classList.remove('soon');
      el.classList.add('gone');
      return;
    }
    el.textContent = fmtCountdown(ms);
    el.classList.toggle('soon', ms !== null && ms > 0 && ms < SOON_MS);
    el.classList.toggle('gone', ms !== null && ms <= 0);
  });
}

/* ---------------- Daten ---------------- */

async function loadDashboard() {
  try {
    const res = await window.api.getDashboard();
    if (res && res.ok) dashboard = res.data;
  } catch {
    /* Ohne Dashboard fehlen MR und Ziele - Zyklen und Risse zeigt das
       Overlay trotzdem. Ein Teilausfall soll nicht alles mitreissen. */
  }
}

async function loadWorld(force = false) {
  try {
    const d = await window.api.getWorldState(force);
    if (d && !d.error) world = d;
  } catch { /* alter Stand bleibt stehen, das Alter steht in der Fussleiste */ }
}

async function loadNotifSettings() {
  try { notifSettings = await window.api.getNotifications(); } catch { /* dann eben ohne Hervorhebung */ }
}

/* ---------------- Anzeige ---------------- */

/** Rueckstand der Datenquelle in Millisekunden, oder null. */
function sourceLag() {
  const ts = world?.sourceTimestamp ? new Date(world.sourceTimestamp).getTime() : null;
  return Number.isFinite(ts) ? Date.now() - ts : null;
}

const sourceIsStale = () => (sourceLag() ?? 0) > STALE_MS;

/**
 * Hinweis bei haengender Quelle.
 *
 * warframestat.us liefert zeitweise stundenalte Staende. Dann sind alle Risse
 * abgelaufen und alle Zyklen laengst umgeschlagen - die Anzeige waere nicht
 * falsch, aber wertlos, und sieht ohne Hinweis nach einem Fehler der App aus.
 */
function renderStale() {
  const el = $('ov-stale');
  if (!el) return;

  const lag = sourceLag();
  if (!sourceIsStale()) { el.classList.add('hidden'); return; }

  const min = Math.round(lag / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  el.innerHTML = `${Icon.warning(12)}<span>Datenquelle hängt ${h ? h + ' h ' : ''}${m} min hinterher — abgelaufene Einträge fehlen</span>`;
  el.classList.remove('hidden');
}

function render() {
  renderStale();
  renderHead();
  renderCycles();
  renderFissures();
  renderGoals();
  renderFoot();
  tickClocks();
}

function renderHead() {
  const p = dashboard && dashboard.player;
  $('ov-mr').textContent = p ? `MR ${p.mr}` : 'MR –';
}

function renderCycles() {
  const box = $('ov-cycles');
  if (!world) {
    box.innerHTML = '<div class="ov-empty">Weltzustand wird geladen …</div>';
    return;
  }

  const c = world.cetus || {}, v = world.vallis || {}, cb = world.cambion || {};
  const rows = [
    { name: 'Cetus',   cls: c.isDay   ? 'day'  : 'night', icon: c.isDay   ? 'sun'   : 'moon',
      state: c.isDay ? 'Tag' : 'Nacht', expiry: c.expiry },
    { name: 'Vallis',  cls: v.isWarm  ? 'warm' : 'cold',  icon: v.isWarm  ? 'flame' : 'snowflake',
      state: v.isWarm ? 'Warm' : 'Kalt', expiry: v.expiry },
    { name: 'Cambion', cls: cb.isFass ? 'warm' : 'night', icon: cb.isFass ? 'flame' : 'moon',
      state: cb.isFass ? 'Fass' : 'Vome', expiry: cb.expiry }
  ];

  box.innerHTML = rows.map(r => `
    <div class="ov-cycle ${r.cls}">
      <span class="ov-cycle-ic">${Icon[r.icon](12)}</span>
      <span class="ov-cycle-name">${esc(r.name)}</span>
      <span class="ov-cycle-state">${esc(r.state)}</span>
      <span class="ov-clock" data-until="${esc(r.expiry || '')}">—</span>
    </div>`).join('');
}

/**
 * Risse: passende zuerst, der Rest darunter.
 *
 * Nur die gefilterten zu zeigen waere konsequenter, macht das Overlay bei einer
 * engen Auswahl (Voreinstellung ist allein Void Cascade) aber die meiste Zeit
 * leer - und ein leeres Overlay sieht aus wie ein kaputtes. Deshalb dieselbe
 * Auswahl wie fuer die Toasts als Hervorhebung, nicht als Filter.
 */
function renderFissures() {
  const all = (world && world.fissures) || [];
  const box = $('ov-fissures');
  const note = $('ov-fissure-note');

  /* matches() erwartet die GANZEN Einstellungen, nicht den fissures-Teil: es
     prueft zuerst die beiden Hauptschalter und greift dann selbst darauf zu. */
  const isHit = f => !!notifSettings && FissureFilter.matches(f, notifSettings);

  if (!all.length) {
    box.innerHTML = sourceIsStale()
      ? '<div class="ov-empty">Keine Daten — die Quelle hängt (siehe oben).</div>'
      : '<div class="ov-empty">Keine aktiven Risse.</div>';
    note.textContent = '';
    return;
  }

  const hits = all.filter(isHit);
  note.textContent = hits.length ? `${hits.length} passend` : `${all.length} aktiv`;

  const sorted = [...all].sort((a, b) =>
    (isHit(b) ? 1 : 0) - (isHit(a) ? 1 : 0) ||
    (a.tierNum || 0) - (b.tierNum || 0));

  box.innerHTML = sorted.slice(0, MAX_FISS).map(f => `
    <div class="ov-row ${isHit(f) ? 'hit' : ''}">
      <span class="ws-fissure-tier ov-tier ${esc(f.tier)}">${esc(f.tier)}</span>
      <div class="ov-row-body">
        <b>${esc(f.missionType)}</b>
        <span>${esc(f.node)}${f.isHard ? ' · SP' : ''}</span>
      </div>
      <span class="ov-clock" data-until="${esc(f.expiry || '')}">—</span>
    </div>`).join('');
}

function renderGoals() {
  const sec = $('ov-goals-sec');
  const open = ((dashboard && dashboard.goals) || []).filter(g => !g.done);

  /* Ohne Ziele faellt der ganze Abschnitt weg, statt eine leere Ueberschrift
     stehen zu lassen - im Overlay ist jede Zeile Platz, der dem Spiel fehlt. */
  sec.classList.toggle('hidden', !open.length);
  if (!open.length) return;

  $('ov-goals').innerHTML = open.slice(0, MAX_GOALS).map(g => `
    <div class="ov-row">
      <img class="ov-goal-img" src="${esc(g.image)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="ov-row-body">
        <b>${esc(g.name)}</b>
        <span>${g.owned ? `Rang ${g.rank}/${g.maxLvl}` : 'Farmen'}</span>
      </div>
      <span class="ov-gain">+${nf(g.gain)}</span>
    </div>`).join('');
}

function renderFoot() {
  const ts = world && world.fetchedAt ? new Date(world.fetchedAt).getTime() : null;
  $('ov-age').textContent = ts ? `Stand ${relativeAge(ts)}` : 'Kein Weltzustand';
}

/* ---------------- Takte ---------------- */

function startTimers() {
  stopTimers();
  tickTimer = setInterval(tickClocks, 1000);
  /* Der Weltzustand laeuft hier weiter, auch wenn im Hauptfenster ein ganz
     anderer Tab offen ist - genau dafuer gibt es das Overlay. */
  pollTimer = setInterval(async () => {
    await loadWorld(false);
    render();
  }, POLL_MS);
}

function stopTimers() {
  clearInterval(tickTimer); tickTimer = null;
  clearInterval(pollTimer); pollTimer = null;
}

/* ---------------- Zustand vom Hauptprozess ---------------- */

async function applyState(st) {
  if (!st) return;
  clickThrough = !!st.clickThrough;
  interacting  = !!st.interacting;
  if (st.hotkeys) hotkeys = st.hotkeys;

  /* Sichtbare Rueckmeldung: im Zeigermodus nimmt das Overlay Klicks an und
     das Spiel laeuft ohne Fokus weiter - das darf man nicht raten muessen. */
  document.getElementById('overlay-view').classList.toggle('interacting', interacting);
  updateClickButton();
  renderHint();

  const slider = $('ov-opacity');
  if (slider && Number.isFinite(st.opacity)) slider.value = String(Math.round(st.opacity * 100));

  const wasHidden = !visible;
  visible = !!st.overlay;

  if (!visible) { stopTimers(); hoverSent = null; return; }

  /* Beim Einblenden neu laden: waehrend das Overlay weg war, koennen im
     Hauptfenster Ziele dazugekommen oder abgehakt worden sein. */
  if (wasHidden) {
    await Promise.all([loadDashboard(), loadWorld(false)]);
    render();
  }
  startTimers();
}

/* ---------------- Bedienung ---------------- */

$('ov-exit').onclick = () => window.api.toggleOverlay();

$('ov-refresh').onclick = async () => {
  await Promise.all([loadWorld(true), loadDashboard()]);
  render();
};

$('ov-click').onclick = async () => {
  const st = await window.api.setClickThrough(!clickThrough);
  clickThrough = !!(st && st.clickThrough);
  updateClickButton();
};

$('ov-opacity').oninput = e => window.api.setOverlayOpacity(Number(e.target.value) / 100);

/**
 * Erklaert den jeweils unklaren Zustand - und nur den.
 *
 * Bei durchgereichten Klicks ist nicht ersichtlich, wie man wieder an die
 * Bedienung kommt; im Zeigermodus nicht, wie man zurueck ins Spiel kommt.
 * Sind beide aus, ist alles offensichtlich und die Zeile verschwindet.
 */
function renderHint() {
  const el = $('ov-hint');
  if (interacting) {
    el.innerHTML = `<b>Zeigermodus</b> · <kbd>Esc</kbd> zurück ins Spiel`;
    el.classList.remove('hidden');
  } else if (clickThrough) {
    el.innerHTML = `Klicks gehen ans Spiel · ` +
      hotkeys.interact.split('+').map(k => `<kbd>${esc(k)}</kbd>`).join('') +
      ` holt den Zeiger`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function updateClickButton() {
  const btn = $('ov-click');
  btn.classList.toggle('on', clickThrough);
  btn.title = clickThrough
    ? 'Klicks gehen ans Spiel - nur die Kopfleiste bleibt bedienbar'
    : 'Klicks ans Spiel durchreichen';
}

/**
 * Kopfleiste bleibt bedienbar, waehrend der Rest Klicks durchlaesst.
 *
 * Ohne diese Ausnahme waere der Durchlass eine Falle: ein Fenster, das keine
 * Klicks mehr annimmt, kann auch den eigenen Schalter nicht mehr anbieten.
 * Moeglich wird das durch forward: true im Hauptprozess - Mausbewegungen
 * kommen weiter an, obwohl Klicks durchfallen.
 */
window.addEventListener('mousemove', e => {
  /* Im Zeigermodus ist der Durchlass ohnehin ausgesetzt - eine Meldung von
     hier wuerde ihn mitten in der Bedienung wieder einschalten. */
  if (!clickThrough || interacting) return;
  const bar = $('ov-bar').getBoundingClientRect();
  const overBar = e.clientY <= bar.bottom;
  if (overBar === hoverSent) return;
  hoverSent = overBar;
  window.api.setOverlayHover(overBar);
});

/* Esc ist der Weg zurueck ins Spiel, ohne die Hand von der Maus zu nehmen
   und ohne den Hotkey blind zu treffen. */
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && interacting) window.api.setInteract(false);
});

window.api.onOverlayChanged(applyState);

/* ---------------- Start ---------------- */

(async function boot() {
  await Promise.all([loadDashboard(), loadWorld(false), loadNotifSettings()]);
  render();

  /* Das Fenster entsteht oft erst, WEIL gerade ein Fund gemeldet wurde - die
     zugehoerige Nachricht kam dann an, bevor dieser Renderer zuhoerte. */
  try {
    const cur = await window.api.getCurrentRelic();
    if (cur) showRelicReward(cur);
  } catch { /* dann eben ohne */ }
  try { await applyState(await window.api.overlayState()); }
  catch { startTimers(); }
})();

/* ============================================================================
   Relikt-Belohnungen

   Zwei Quellen laufen hier zusammen:
     - EE.log liefert sofort den EIGENEN Fund (siehe core/logwatch.js)
     - der Bildschirm liefert nach gut einer Sekunde alle vier Namen
       (siehe core/rewardscan.js)

   Die Nummerierung ist der Sinn der Sache: sie entspricht der Reihenfolge auf
   dem Bildschirm, von links nach rechts. Ohne sie muesste man die Namen
   vergleichen, statt einfach die dritte Karte anzuklicken.
   ========================================================================= */

let relicState = null;
let relicDeadline = 0;
let relicTicker = null;

/* Ab hier lohnt ein Teil mehr als der uebliche Prime-Schrott. */
const RELIC_GOOD_PLAT = 20;

function priceText(price) {
  if (price === null || price === undefined) return '…';
  if (!price) return '–';
  return price.min + 'p';
}

function rewardRow(r, bestPlat) {
  const plat = priceText(r.price);
  const good = r.price && r.price.min >= RELIC_GOOD_PLAT;
  const best = r.price && bestPlat && r.price.min === bestPlat;

  return `
    <div class="ov-rw ${r.isOwn ? 'mine' : ''} ${best ? 'best' : ''}">
      <span class="ov-rw-pos">${r.position}</span>
      <img class="ov-rw-img" src="${esc(r.image || '')}" alt=""
           onerror="this.style.visibility='hidden'">
      <div class="ov-rw-body">
        <b>${esc(r.name)}</b>
        <span>${r.isOwn ? 'dein Relikt' : ''}${r.score < 1 ? (r.isOwn ? ' · ' : '') + 'unscharf erkannt' : ''}</span>
      </div>
      <span class="ov-rw-plat ${good ? 'good' : ''}">${plat}</span>
      <span class="ov-rw-duc">${r.ducats != null ? r.ducats : '–'}</span>
    </div>`;
}

function renderRelic() {
  const box = $('ov-relic');
  const body = $('ov-relic-body');
  const head = $('ov-relic-title');
  if (!box || !body) return;

  if (!relicState) { box.classList.add('hidden'); return; }

  const list = relicState.rewards || [];
  head.textContent = list.length ? 'Relikt-Belohnungen' : 'Dein Fund';

  if (list.length) {
    /* Der hoechste Platinpreis wird hervorgehoben - aber erst, wenn alle
       Preise da sind. Vorher waere die Auszeichnung eine Behauptung. */
    const prices = list.map(r => r.price?.min).filter(n => Number.isFinite(n));
    const complete = prices.length === list.length;
    const bestPlat = complete ? Math.max(...prices) : null;

    body.innerHTML = `<div class="ov-rw-head">
        <span></span><span></span><span>Belohnung</span><span>Platin</span><span>Duk.</span>
      </div>` + list.map(r => rewardRow(r, bestPlat)).join('');
    return;
  }

  /* Noch keine Bildschirmerkennung: wenigstens der eigene Fund steht fest. */
  const own = relicState.own;
  const note = relicState.scanError
    ? `<div class="ov-relic-note">Bildschirm nicht lesbar: ${esc(relicState.scanError)}</div>`
    : relicState.scanning
      ? '<div class="ov-relic-note">Lese die anderen drei vom Bildschirm …</div>'
      : '';

  body.innerHTML = (own
    ? `<div class="ov-rw mine">
         <span class="ov-rw-pos">•</span>
         <img class="ov-rw-img" src="${esc(own.image || '')}" alt=""
              onerror="this.style.visibility='hidden'">
         <div class="ov-rw-body"><b>${esc(own.name)}</b><span>dein Relikt</span></div>
         <span class="ov-rw-plat">${priceText(own.price)}</span>
         <span class="ov-rw-duc">${own.ducats != null ? own.ducats : '–'}</span>
       </div>`
    : '<div class="ov-relic-note">Auswahl läuft — dein Fund stand nicht im Log.</div>') + note;
}

function showRelicReward(data) {
  relicState = data || null;
  renderRelic();
  $('ov-relic')?.classList.remove('hidden');
  startRelicCountdown(data?.seconds || 15);
}

function startRelicCountdown(seconds) {
  relicDeadline = Date.now() + seconds * 1000;
  clearInterval(relicTicker);
  tickRelic();
  relicTicker = setInterval(tickRelic, 250);
}

function tickRelic() {
  const el = $('ov-relic-timer');
  if (!el) return;

  const left = Math.max(0, Math.ceil((relicDeadline - Date.now()) / 1000));
  el.textContent = left + 's';
  el.classList.toggle('urgent', left <= 5);

  if (left > 0) return;
  clearInterval(relicTicker);

  /* Wie bei den Schildern: bleibt die Schluss-Zeile im Log aus, verschwindet
     die Anzeige trotzdem. Der Vergleich der Frist faengt den Fall ab, dass
     inzwischen eine neue Belohnung kam. */
  const deadlineAtStop = relicDeadline;
  setTimeout(() => { if (relicDeadline === deadlineAtStop) hideRelicReward(); }, 2000);
}

function hideRelicReward() {
  clearInterval(relicTicker);
  relicTicker = null;
  relicState = null;
  $('ov-relic')?.classList.add('hidden');
}

window.api.onRelicReward(showRelicReward);
window.api.onRelicTimer(d => { if (d?.seconds) startRelicCountdown(d.seconds); });
window.api.onRelicClosed(hideRelicReward);
