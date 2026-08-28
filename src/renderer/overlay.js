/* Overlay-Renderer.

   Eigenes Fenster neben dem Hauptfenster, kein zweiter Zustand desselben:
   waehrend das Overlay ueber dem Spiel liegt, bleibt die volle Oberflaeche auf
   dem zweiten Monitor stehen.

   Gezeigt wird nur, was sich in den naechsten Minuten entscheidet - Zyklen,
   Risse, Relikte, offene Ziele. Die Restzeiten laufen lokal aus dem
   expiry-Zeitstempel weiter, ein Tick pro Sekunde. Der 30-Sekunden-Takt des
   Hauptfensters faellt ueber einem Spiel auf, in dem man auf die letzte
   Minute schaut.

   ALLES, WAS TIEFER GEHT, KLAPPT AUF STATT DAZUSTEHEN: die sechs Belohnungen
   eines Relikts und die Bauteile eines Ziels sind zu wertvoll, um sie
   wegzulassen, und zu lang, um sie dauerhaft zu zeigen. Der aufgeklappte
   Zustand ueberlebt das naechste Zeichnen (siehe openRelics/openGoals) -
   sonst faellt er beim Minutentakt von selbst wieder zu.

   Laeuft wie der uebrige Renderer ohne Node-Zugriff, alles ueber window.api.  */

const $  = id => document.getElementById(id);
const nf = n => (n ?? 0).toLocaleString('en-GB');

/** Item- und Knotennamen kommen aus fremden Daten - vor dem Einsetzen entschaerfen. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 12500 -> "12.5k". Materialmengen sprengen sonst die schmale Spalte. */
function compact(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1000000) {
    const k = v / 1000;
    return (k < 100 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)) + 'k';
  }
  return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

/** 2 -> "2%", 25.33 -> "25%", 11 -> "11%". Nachkommastellen nur, wo sie zaehlen. */
function fmtChance(c) {
  const v = Number(c);
  if (!Number.isFinite(v) || v <= 0) return '';
  return (v < 10 ? Number(v.toFixed(1)) : Math.round(v)) + '%';
}

let dashboard = null;             // MR und Ziele
let world     = null;             // Weltzustand
let trackedRelics = [];           // Merkliste aus dem Relikt-Planer
let recommendedRelics = [];       // Alle besessenen Relikte mit Erwartungswert
let voidTraces = 0;               // Aktueller Vorrat an Spuren des Nichts
let selectedTier = 'all';         // Filter: all, Lith, Meso, Neo, Axi, tracked
let isSelectingRelic = false;     // Ob Warframes Reliktauswahl gerade aktiv ist
let notifSettings = null;         // dieselbe Auswahl wie fuer die Toasts
let clickThrough = false;
let interacting = false;
let visible = true;
/* Nur der Stand, bis der Hauptprozess den echten schickt (applyState). Muss
   trotzdem stimmen: das Overlay zeigt die Tasten jetzt an, und beim ersten
   Zeichnen stand hier eine Kombination, die es seit der Umstellung auf
   Ctrl+R/Ctrl+E gar nicht mehr gibt. Dieselben Werte wie DEFAULT_HOTKEYS. */
let hotkeys = { overlay: 'Ctrl+R', interact: 'Ctrl+E' };

/* Aufgeklappte Zeilen. Als Mengen von Kennungen, nicht als Markierung am
   Element: die Listen werden im Minutentakt neu gezeichnet, ein Zustand im
   DOM ginge dabei jedes Mal verloren. */
const openRelics = new Set();
const openGoals  = new Set();

/* Welches Relikt die laufende Auswahl von selbst aufgeklappt hat. Getrennt
   von openRelics, damit ein Zuklappen von Hand haelt: waere die Bedingung
   "nichts offen", klappte dieselbe Zeile beim naechsten Zeichnen wieder auf. */
let autoExpandedFor = null;

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
const MAX_RELICS = 8;

/* Die vier Politur-Stufen. Kurzform fuer die Pille auf der Kartenzeile -
   ausgeschrieben passt "Exceptional" nicht neben Aera, Name und Anzahl. */
const RELIC_STATE_LABEL = {
  Intact: 'Intact',
  Exceptional: 'Exc',
  Flawless: 'Flaw',
  Radiant: 'Rad'
};

/* Die beiden Waehrungszeichen. Dieselben Bilder wie im Hauptfenster - ein
   nachgestelltes "p" und "d" muss man lesen, das Zeichen erkennt man. */
const PLAT_IC = '<img class="ov-cur" src="assets/icons/currency/platinum.png" alt="platinum">';
const DUC_IC  = '<img class="ov-cur" src="assets/icons/currency/ducats.png" alt="ducats">';

/* Kuerzel fuer die Klasse - die vier Stufen haben je eine eigene Farbe. */
const RELIC_STATE_CLASS = {
  Intact: 'st-intact',
  Exceptional: 'st-exc',
  Flawless: 'st-flaw',
  Radiant: 'st-rad'
};

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
  if (ms <= 0) return 'now';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function relativeAge(ts) {
  if (!ts) return 'unknown';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
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

async function loadTrackedRelics() {
  try {
    const list = await window.api.getTrackedRelics();
    if (Array.isArray(list)) trackedRelics = list;
  } catch { /* ohne Merkliste faellt nur dieser Abschnitt weg */ }
}

async function loadRecommendedRelics() {
  try {
    const res = await window.api.getRecommendedRelics();
    if (res) {
      voidTraces = res.traces ?? voidTraces;
      if (Array.isArray(res.relics)) recommendedRelics = res.relics;
    }
  } catch { /* ohne Planer faellt nur dieser Abschnitt weg */ }
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
  el.innerHTML = `${Icon.warning(12)}<span>Source is ${h ? h + ' h ' : ''}${m} min behind — expired entries are missing</span>`;
  el.classList.remove('hidden');
}

function render() {
  renderStale();
  renderHead();
  renderRecommendedRelics();
  renderCycles();
  renderFissures();
  renderGoals();
  renderFoot();
  tickClocks();
}

function renderHead() {
  const p = dashboard && dashboard.player;
  $('ov-mr').textContent = p ? `MR ${p.mr}` : 'MR –';
  const tr = $('ov-traces-val');
  if (tr) tr.textContent = nf(voidTraces);
}

function renderCycles() {
  const box = $('ov-cycles');
  if (!world) {
    box.innerHTML = '<div class="ov-empty">Loading world state …</div>';
    return;
  }

  const c = world.cetus || {}, v = world.vallis || {}, cb = world.cambion || {};
  const rows = [
    { name: 'Cetus',   cls: c.isDay   ? 'day'  : 'night', icon: c.isDay   ? 'sun'   : 'moon',
      state: c.isDay ? 'Day' : 'Night', expiry: c.expiry },
    { name: 'Vallis',  cls: v.isWarm  ? 'warm' : 'cold',  icon: v.isWarm  ? 'flame' : 'snowflake',
      state: v.isWarm ? 'Warm' : 'Cold', expiry: v.expiry },
    { name: 'Cambion', cls: cb.isFass ? 'warm' : 'night', icon: cb.isFass ? 'flame' : 'moon',
      state: cb.isFass ? 'Fass' : 'Vome', expiry: cb.expiry }
  ];

  box.innerHTML = rows.map(r => `
    <div class="ov-cycle ${r.cls}">
      <span class="ov-cycle-ic">${Icon[r.icon](13)}</span>
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
      ? '<div class="ov-empty">No data — the source is lagging (see above).</div>'
      : '<div class="ov-empty">No active fissures.</div>';
    note.textContent = '';
    return;
  }

  const hits = all.filter(isHit);
  note.textContent = hits.length ? `${hits.length} matching` : `${all.length} active`;

  const sorted = [...all].sort((a, b) =>
    (isHit(b) ? 1 : 0) - (isHit(a) ? 1 : 0) ||
    (a.tierNum || 0) - (b.tierNum || 0));

  box.innerHTML = sorted.slice(0, MAX_FISS).map(f => `
    <div class="ov-row ov-fiss ${isHit(f) ? 'hit' : ''}" data-tier="${esc(f.tier)}">
      <span class="ov-tier">${esc(f.tier)}</span>
      <div class="ov-row-body">
        <b>${esc(f.missionType)}${f.isHard ? '<i class="ov-sp">SP</i>' : ''}</b>
        <span>${esc(f.node)}</span>
      </div>
      <span class="ov-clock" data-until="${esc(f.expiry || '')}">—</span>
    </div>`).join('');
}

/* ---------------- Relikte ---------------- */

/**
 * Die sechs Belohnungen eines Relikts.
 *
 * Nur aufgeklappt und nur fuer EINE Zeile: sechs Namen mal acht Relikte waeren
 * 48 Zeilen ueber dem Spiel. Sortiert nach Seltenheit, weil danach gesucht
 * wird - der seltene Fund oben, der Forma-Bauplan unten.
 */
function dropList(r) {
  const rows = [...(r.rewards || [])].sort((a, b) => (a.chance || 0) - (b.chance || 0));
  if (!rows.length) return '<div class="ov-rc-drops-empty">No drop table for this relic.</div>';

  /* Kopfzeile nur aus den beiden Waehrungszeichen: sechsmal ein Zeichen hinter
     die Zahl zu setzen macht die Spalte unruhig, einmal darueber genuegt. */
  const head = `<div class="ov-drop ov-drop-head">
      <span></span><span></span><span></span>
      <span>${PLAT_IC}</span><span>${DUC_IC}</span>
    </div>`;

  return head + rows.map(d => {
    const rar = String(d.rarity || '').toLowerCase() || 'common';
    return `
      <div class="ov-drop rar-${esc(rar)}">
        <span class="ov-drop-dot" title="${esc(d.rarity || '')}"></span>
        <span class="ov-drop-name">${esc(d.name)}</span>
        <span class="ov-drop-chance">${fmtChance(d.chance)}</span>
        <span class="ov-drop-plat">${d.plat != null ? d.plat : '–'}</span>
        <span class="ov-drop-duc">${d.ducats != null ? d.ducats : '–'}</span>
      </div>`;
  }).join('');
}

/**
 * Empfohlene Relikte aus dem Relic Planner und fuer die Reliktauswahl.
 *
 * Eine Karte je Relikt: Aera farbig am linken Rand, Politur als Pille, der
 * Platin-Erwartungswert als groesste Zahl der Zeile. Darunter, in einer Zeile,
 * die einzige Angabe die man beim Waehlen wirklich braucht - laeuft dafuer
 * gerade ein Riss, und was ist das Beste, was drin sein kann.
 */
function renderRecommendedRelics() {
  const sec = $('ov-rec-sec');
  const box = $('ov-recommended-list');
  const note = $('ov-rec-note');
  const title = $('ov-rec-title');
  if (!sec || !box) return;

  const hasTracked = trackedRelics.length > 0 || recommendedRelics.some(r => r.tracked);
  if (!isSelectingRelic && !hasTracked) {
    sec.classList.add('hidden');
    return;
  }
  sec.classList.remove('hidden');

  sec.classList.toggle('selecting', isSelectingRelic);
  if (title) title.textContent = isSelectingRelic ? 'Relic selection' : 'Tracked relics';

  const filterBar = $('ov-rec-filters');
  if (filterBar) filterBar.classList.toggle('hidden', !isSelectingRelic && hasTracked);

  const openTiers = new Map();
  for (const f of (world && world.fissures) || []) {
    const left = msUntil(f.expiry);
    if (left !== null && left <= 0) continue;
    openTiers.set(f.tier, (openTiers.get(f.tier) || 0) + 1);
  }

  let list = recommendedRelics;
  if (selectedTier === 'tracked') {
    list = list.filter(r => r.tracked);
  } else if (selectedTier !== 'all') {
    list = list.filter(r => (r.tier || '').toLowerCase() === selectedTier.toLowerCase());
  }

  /* Sortierung: Relikte mit aktiven Rissen zuerst, dann nach Platin-Erwartungswert */
  const sorted = [...list].sort((a, b) => {
    const openA = openTiers.get(a.tier) ? 1 : 0;
    const openB = openTiers.get(b.tier) ? 1 : 0;
    return (openB - openA) || ((b.expPlat || 0) - (a.expPlat || 0)) || ((b.expDucats || 0) - (a.expDucats || 0));
  });

  const matchingFissureCount = sorted.filter(r => openTiers.get(r.tier)).length;
  if (note) {
    if (isSelectingRelic) {
      note.textContent = 'Active in Warframe';
    } else if (selectedTier === 'tracked') {
      note.textContent = `${sorted.length} starred`;
    } else if (matchingFissureCount) {
      note.textContent = `${matchingFissureCount} with fissure`;
    } else {
      note.textContent = `${sorted.length} relics`;
    }
  }

  if (!sorted.length) {
    box.innerHTML = `<div class="ov-empty">${selectedTier === 'tracked' ? 'No starred relics yet. Click the star next to any relic to pin it.' : 'No relics in stock for this filter.'}</div>`;
    return;
  }

  /* In der Auswahl klappt das beste Relikt von selbst auf. Waehrend der
     Bildschirm im Spiel offen ist, kostet jeder Klick ins Overlay Warframe den
     Fokus - was man dort lesen will, muss ohne Klick dastehen. */
  if (isSelectingRelic && autoExpandedFor === null && sorted.length) {
    autoExpandedFor = sorted[0].id;
    openRelics.add(autoExpandedFor);
  }

  const shown = sorted.slice(0, MAX_RELICS);

  box.innerHTML = shown.map(r => {
    const open = openTiers.get(r.tier) || 0;
    const best = r.bestPlat;
    const expanded = openRelics.has(r.id);

    return `
      <div class="ov-rc ${open ? 'live' : ''} ${expanded ? 'is-open' : ''}"
           data-tier="${esc(r.tier)}" data-relic="${esc(r.id)}">
        <div class="ov-rc-head" data-toggle="${esc(r.id)}" title="Show the six drops">
          <img class="ov-rc-img" src="${esc(r.image || '')}" alt=""
               onerror="this.style.visibility='hidden'">
          <div class="ov-rc-main">
            <div class="ov-rc-title">
              <span class="ov-rc-era">${esc(r.tier)}</span>
              <b>${esc(r.name)}</b>
              <span class="ov-rc-ref ${RELIC_STATE_CLASS[r.state] || 'st-intact'}">${esc(RELIC_STATE_LABEL[r.state] || r.state || '')}</span>
              ${r.count > 1 ? `<span class="ov-rc-count">×${r.count}</span>` : ''}
            </div>
            <div class="ov-rc-sub">
              ${open ? `<span class="ov-rc-live">${open} ${open === 1 ? 'fissure' : 'fissures'}</span>` : ''}
              ${best && best.plat != null
                  ? `<span class="ov-rc-best">${esc(best.name)}<b>${best.plat}p</b></span>`
                  : '<span class="ov-rc-best is-none">prices unknown</span>'}
            </div>
          </div>
          <div class="ov-rc-val">
            <span class="ov-rc-plat" title="Expected platinum return">${r.expPlat ?? 0}${PLAT_IC}</span>
            <span class="ov-rc-duc" title="Expected ducats">${r.expDucats ?? 0}${DUC_IC}</span>
          </div>
          <span class="ov-rc-chev">${Icon.chevron(11)}</span>
        </div>
        <button class="ov-rc-star ${r.tracked ? 'active' : ''}" data-track="${esc(r.id)}"
                title="${r.tracked ? 'Entmerken' : 'Merken'}">${Icon.star(11)}</button>
        ${expanded ? `<div class="ov-rc-drops">${dropList(r)}</div>` : ''}
      </div>`;
  }).join('') + (sorted.length > MAX_RELICS
    ? `<div class="ov-more">… and ${sorted.length - MAX_RELICS} more in the planner</div>`
    : '');
}

/* ---------------- Ziele ---------------- */

/**
 * Bauteile und Rohstoffe eines Ziels.
 *
 * Beides steht schon im Dashboard (buildDashboard loest jedes offene Ziel ueber
 * resolveGoal auf) - hier wird es nur enger gesetzt. Die Teile bekommen eine
 * Zeile je Stueck, die Rohstoffe Pillen: bei "Nano Spores 12.5k" ist die Zahl
 * die Angabe, der Name nur ihre Beschriftung.
 */
function goalDetails(g) {
  const parts = (g.components || []).slice(0, 6);
  const mats  = (g.materials  || []).slice(0, 10);
  if (!parts.length && !mats.length) return '';

  return `
    <div class="ov-goal-more">
      ${parts.length ? `
        <div class="ov-goal-block">
          <div class="ov-goal-label">${Icon.cube(10)} Parts</div>
          ${parts.map(c => `
            <div class="ov-part ${c.isSubRecipe ? 'is-craft' : ''}">
              <img class="ov-part-img" src="${esc(c.image || '')}" alt=""
                   onerror="this.style.visibility='hidden'">
              <span class="ov-part-name">${esc(c.name)}</span>
              ${c.isSubRecipe ? '<span class="ov-part-tag">forge</span>' : ''}
              <span class="ov-part-count">×${nf(c.count)}</span>
            </div>`).join('')}
        </div>` : ''}
      ${mats.length ? `
        <div class="ov-goal-block">
          <div class="ov-goal-label">${Icon.crate(10)} Resources</div>
          <div class="ov-mats">
            ${mats.map(m => `
              <span class="ov-mat" title="${esc(m.name)} ×${nf(m.count)}">
                <img src="${esc(m.image || '')}" alt="" onerror="this.style.display='none'">
                <em>${esc(m.name)}</em><b>${compact(m.count)}</b>
              </span>`).join('')}
          </div>
        </div>` : ''}
    </div>`;
}

function renderGoals() {
  const sec = $('ov-goals-sec');
  const open = ((dashboard && dashboard.goals) || []).filter(g => !g.done);

  /* Ohne Ziele faellt der ganze Abschnitt weg, statt eine leere Ueberschrift
     stehen zu lassen - im Overlay ist jede Zeile Platz, der dem Spiel fehlt. */
  sec.classList.toggle('hidden', !open.length);
  if (!open.length) return;

  const note = $('ov-goals-note');
  if (note) note.textContent = open.length > MAX_GOALS ? `${MAX_GOALS} of ${open.length}` : `${open.length} open`;

  $('ov-goals').innerHTML = open.slice(0, MAX_GOALS).map(g => {
    const isLevel = g.owned || g.kind === 'level';
    const hasMore = !isLevel && ((g.components || []).length || (g.materials || []).length);
    const expanded = hasMore && openGoals.has(g.uniqueName);

    /* Drei Arten von Ziel, drei Unterzeilen: was man BESITZT, braucht den
       Rangbalken; was man BAUT, die Kosten; eine Mod oder ein Arcane hat
       weder Schmiede noch Rezept - dort sagt die Zeile, WO sie faellt. */
    const sub = isLevel
      ? `<span class="ov-goal-rank">Rank ${g.rank}/${g.maxLvl}</span>`
      : g.isUpgrade
        ? `<span>${esc([g.compat, g.rarityLabel].filter(Boolean).join(' · ')
                      || (g.upgradeKind === 'arcane' ? 'Arcane' : 'Mod'))}</span>`
        : `<span>${Icon.coin(10)}${compact(g.credits || 0)}</span>
           ${g.buildTime ? `<span>${Icon.clock(10)}${esc(g.buildTime)}</span>` : ''}
           ${(g.components || []).length ? `<span>${(g.components || []).length} parts</span>` : ''}`;

    const pct = isLevel && g.maxLvl ? Math.min(100, (g.rank / g.maxLvl) * 100) : 0;

    return `
      <div class="ov-goal ${isLevel ? 'is-level' : 'is-farm'} ${expanded ? 'is-open' : ''}"
           data-goal="${esc(g.uniqueName)}">
        <div class="ov-goal-head" ${hasMore ? `data-goal-toggle="${esc(g.uniqueName)}" title="Show parts and resources"` : ''}>
          <img class="ov-goal-img" src="${esc(g.image)}" alt="" onerror="this.style.visibility='hidden'">
          <div class="ov-goal-body">
            <b>${esc(g.name)}</b>
            <div class="ov-goal-sub">${sub}</div>
            ${isLevel ? `<div class="ov-goal-bar"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}
          </div>
          ${g.gain > 0 ? `<span class="ov-gain">+${nf(g.gain)}</span>` : ''}
          ${hasMore ? `<span class="ov-goal-chev">${Icon.chevron(11)}</span>` : ''}
        </div>
        ${expanded ? goalDetails(g) : ''}
      </div>`;
  }).join('');
}

function renderFoot() {
  const ts = world && world.fetchedAt ? new Date(world.fetchedAt).getTime() : null;
  $('ov-age').textContent = ts ? `As of ${relativeAge(ts)}` : 'No world state';
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

  /* Beim Einblenden sofort zeichnen und im Hintergrund aktualisieren,
     damit das Fenster ohne Verzoegerung erscheint. */
  if (wasHidden) {
    render();
    Promise.all([loadDashboard(), loadWorld(false), loadTrackedRelics(), loadRecommendedRelics()])
      .then(() => render())
      .catch(() => {});
  }
  startTimers();
}

/* ---------------- Bedienung ---------------- */

function initRecFilters() {
  $('ov-rec-filters')?.querySelectorAll('.ov-chip').forEach(btn => {
    btn.onclick = () => {
      $('ov-rec-filters').querySelectorAll('.ov-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTier = btn.dataset.tier || 'all';
      renderRecommendedRelics();
    };
  });
}

/**
 * Klicks an EINER Stelle abgefangen, nicht an jeder Zeile.
 *
 * Die Listen werden im Minutentakt neu gebaut. Wer die Behandler an die
 * Zeilen haengt, haengt sie jede Minute neu - und verliert sie genau in dem
 * Moment, in dem gerade jemand klickt.
 */
function initDelegates() {
  $('ov-recommended-list')?.addEventListener('click', async e => {
    const star = e.target.closest('[data-track]');
    if (star) {
      e.stopPropagation();
      const id = star.dataset.track;
      const [key, state] = id.split('|');
      const rel = recommendedRelics.find(r => r.id === id);
      try {
        await window.api.toggleTrackedRelic({
          key, state, tier: rel?.tier || '', name: rel?.name || ''
        });
        await loadRecommendedRelics();
        renderRecommendedRelics();
      } catch {}
      return;
    }

    const head = e.target.closest('[data-toggle]');
    if (!head) return;
    const id = head.dataset.toggle;
    if (openRelics.has(id)) openRelics.delete(id); else openRelics.add(id);
    renderRecommendedRelics();
  });

  $('ov-goals')?.addEventListener('click', e => {
    const head = e.target.closest('[data-goal-toggle]');
    if (!head) return;
    const u = head.dataset.goalToggle;
    if (openGoals.has(u)) openGoals.delete(u); else openGoals.add(u);
    renderGoals();
  });
}

$('ov-exit').onclick = () => window.api.toggleOverlay();

$('ov-refresh').onclick = async () => {
  await Promise.all([loadWorld(true), loadDashboard(), loadTrackedRelics(), loadRecommendedRelics()]);
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
/**
 * "Ctrl+R" -> die beiden Tasten als EIN Element.
 *
 * Die Umhuellung ist noetig, nicht huebsch: die Zeile ist ein Flex-Kasten mit
 * Abstand, und ohne sie stuenden Ctrl und R genauso weit auseinander wie das
 * Kuerzel von seiner Beschriftung. Zusammen gehoert aber, was zusammen
 * gedrueckt wird.
 */
const keys = combo => `<span class="ov-keys">` + String(combo || '').split('+')
  .map(k => `<kbd>${esc(k.trim())}</kbd>`).join('') + `</span>`;

function renderHint() {
  const el = $('ov-hint');

  if (interacting) {
    el.innerHTML = `<b>Cursor mode</b> · <kbd>Esc</kbd> back to the game`;
  } else if (clickThrough) {
    el.innerHTML = `Clicks go to the game · ${keys(hotkeys.interact)} takes the cursor`;
  } else {
    /* Die beiden Tastenwege stehen jetzt dauerhaft da, statt nur in den zwei
       Sonderzustaenden. Sie sind global: wer im Spiel steht, sieht das Overlay,
       aber keinen Weg, es wieder loszuwerden - und geraten hat sie noch
       niemand. Aus den ECHTEN Kuerzeln gebaut, nicht aus festem Text: sie
       lassen sich in den Einstellungen aendern. */
    el.innerHTML = `${keys(hotkeys.overlay)} hide · ${keys(hotkeys.interact)} cursor`;
  }

  /* Immer sichtbar. Vorher verschwand die Zeile im Normalfall, und mit ihr
     sprang der Inhalt darueber jedes Mal um ihre Hoehe. */
  el.classList.remove('hidden');
  el.classList.toggle('is-idle', !interacting && !clickThrough);

  /* Der Knopf trug seine Tastenkombination als festen Text im Titel - und
     zwar die alte. Aus derselben Quelle wie die Zeile darunter. */
  $('ov-exit').title = `Hide the overlay (${hotkeys.overlay})`;
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

/* Der Stern im Planer wirkt sofort: der Hauptprozess schickt die fertige
   Liste an beide Fenster, sobald sie sich geaendert hat. */
window.api.onTrackedRelicsChanged(async list => {
  trackedRelics = Array.isArray(list) ? list : [];
  await loadRecommendedRelics();
  renderRecommendedRelics();
});

/* Ein Relikt wurde geoeffnet und ist damit weg. Der Hauptprozess schickt die
   fertige Liste - nachfragen wuerde nur denselben Stand zurueckholen. */
window.api.onRelicsChanged?.(data => {
  if (!data) return;
  voidTraces = data.traces ?? voidTraces;
  if (Array.isArray(data.relics)) recommendedRelics = data.relics;
  renderHead();
  renderRecommendedRelics();
});

/* Relikt-Auswahl in Warframe (ThemedProjectionManager) */
window.api.onRelicSelectOpen(data => {
  if (data) {
    voidTraces = data.traces ?? voidTraces;
    if (Array.isArray(data.relics)) recommendedRelics = data.relics;
  }
  isSelectingRelic = true;
  autoExpandedFor = null;
  renderHead();
  renderRecommendedRelics();
  $('ov-rec-sec')?.scrollIntoView({ behavior: 'smooth' });
});

window.api.onRelicSelectClosed(() => {
  isSelectingRelic = false;
  /* Aufgeklappte Belohnungslisten gehoeren zur Auswahl - danach nimmt die
     Merkliste wieder ihren kurzen Platz ein. */
  openRelics.clear();
  autoExpandedFor = null;
  renderRecommendedRelics();
});

/* ---------------- Start ---------------- */

(async function boot() {
  initRecFilters();
  initDelegates();
  /* Sofort, nicht erst mit dem Zustand aus dem Hauptprozess: schlaegt der
     Abruf unten fehl, stuende die Zeile sonst nie da. */
  renderHint();
  await Promise.all([loadDashboard(), loadWorld(false), loadNotifSettings(), loadTrackedRelics(), loadRecommendedRelics()]);
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

function rewardRow(r, bestPlat, complete) {
  const plat = priceText(r.price);
  const good = r.price && r.price.min >= RELIC_GOOD_PLAT;
  const best = r.price && bestPlat && r.price.min === bestPlat;

  return `
    <div class="ov-rw ${r.isOwn ? 'mine' : ''} ${best ? 'best' : ''}">
      <!-- Die Nummer ist die Bruecke zum Bildschirm - aber nur, wenn alle vier
           gelesen wurden. Sonst zeigt sie auf die falsche Karte, und ein Punkt
           ist ehrlicher als eine Zahl, die man abzaehlt. -->
      <span class="ov-rw-pos">${complete ? r.position : '•'}</span>
      <img class="ov-rw-img" src="${esc(r.image || '')}" alt=""
           onerror="this.style.visibility='hidden'">
      <div class="ov-rw-body">
        <b>${esc(r.name)}</b>
        <span>${r.isOwn ? 'your relic' : ''}${r.score < 1 ? (r.isOwn ? ' · ' : '') + 'fuzzy match' : ''}</span>
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
  head.textContent = list.length ? 'Relic rewards' : 'Your drop';

  if (list.length) {
    /* Der hoechste Platinpreis wird hervorgehoben - aber erst, wenn alle
       Preise da sind. Vorher waere die Auszeichnung eine Behauptung. */
    const prices = list.map(r => r.price?.min).filter(n => Number.isFinite(n));
    const allPriced = prices.length === list.length;
    const bestPlat = allPriced ? Math.max(...prices) : null;

    /* Wurden nicht alle gelesen, taugen die Nummern nicht - siehe rewardRow.
       relicState.complete fehlt beim Fund aus dem Log allein.
       Erwartet wird eine Karte pro Mitspieler, nicht immer vier: zu dritt
       stand hier sonst dauerhaft "3 von 4", obwohl alles gelesen war. */
    const expected = relicState.expected || 4;
    const allRead = relicState.complete !== false && list.length >= expected;

    body.innerHTML = `<div class="ov-rw-head">
        <span></span><span></span><span>Reward</span><span>${PLAT_IC}</span><span>${DUC_IC}</span>
      </div>`
      + list.map(r => rewardRow(r, bestPlat, allRead)).join('')
      + (allRead ? '' : `<div class="ov-relic-note">Only ${list.length} of ${expected} could be read — the numbers are left out.</div>`);
    return;
  }

  /* Noch keine Bildschirmerkennung: wenigstens der eigene Fund steht fest. */
  const own = relicState.own;
  const note = relicState.scanError
    ? `<div class="ov-relic-note">Bildschirm nicht lesbar: ${esc(relicState.scanError)}</div>`
    : relicState.scanning
      ? '<div class="ov-relic-note">Lese die anderen vom Bildschirm …</div>'
      : '';

  body.innerHTML = (own
    ? `<div class="ov-rw mine">
         <span class="ov-rw-pos">•</span>
         <img class="ov-rw-img" src="${esc(own.image || '')}" alt=""
              onerror="this.style.visibility='hidden'">
         <div class="ov-rw-body"><b>${esc(own.name)}</b><span>your relic</span></div>
         <span class="ov-rw-plat">${priceText(own.price)}</span>
         <span class="ov-rw-duc">${own.ducats != null ? own.ducats : '–'}</span>
       </div>`
    : '<div class="ov-relic-note">Choice in progress — your drop was not in the log.</div>') + note;
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
