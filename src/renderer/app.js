/* Renderer. Laeuft ohne Node-Zugriff - alles geht ueber window.api (preload.cjs). */

const $  = id => document.getElementById(id);
const nf = n => (n ?? 0).toLocaleString('en-GB');

/** Item-Namen kommen aus fremden Daten - vor dem Einsetzen entschaerfen. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = null;
let checklistCache = [];
let buildsLoaded = false;

/* ---------------- Icons einsetzen ---------------- */
$('btn-overlay').innerHTML = Icon.pip(15);

/* Hotkey-Anzeige in der Titelleiste. Der Wert kommt aus dem Main-Prozess,
   damit hier nie eine andere Taste steht als die registrierte. */
/* Wird nach jeder Aenderung im Einstellungs-Tab erneut aufgerufen - sonst
   zeigt die Leiste eine Taste an, die gar nicht mehr registriert ist. */
function renderHotkeyHint(hk) {
  const el = $('hotkey-hint');
  if (!el || !hk || !hk.overlay) return;
  el.innerHTML = hk.overlay.split('+').map(k => `<kbd>${esc(k)}</kbd>`).join('');
  el.title = [
    `${hk.overlay}: show/hide the overlay`,
    `${hk.interact}: bring the cursor into the overlay`,
    hk.main ? `${hk.main}: bring up this window` : null
  ].filter(Boolean).join('\n');
  el.classList.remove('hidden');
}

window.api.overlayHotkey().then(renderHotkeyHint).catch(() => {});
$('btn-min').innerHTML     = Icon.minus(15);
$('btn-close').innerHTML   = Icon.close(15);
if ($('ic-goalsearch')) $('ic-goalsearch').innerHTML   = Icon.search(16);
if ($('ic-filtersearch')) $('ic-filtersearch').innerHTML = Icon.search(16);
if ($('ic-buildimport')) $('ic-buildimport').innerHTML  = Icon.link(16);
if ($('ic-arcsearch')) $('ic-arcsearch').innerHTML   = Icon.search(16);
if ($('ic-modsearch')) $('ic-modsearch').innerHTML    = Icon.search(16);
if ($('ic-itemsearch')) $('ic-itemsearch').innerHTML  = Icon.search(16);
if ($('ic-fgsearch')) $('ic-fgsearch').innerHTML     = Icon.search(16);
if ($('ic-ducatsearch')) $('ic-ducatsearch').innerHTML  = Icon.search(16);
if ($('ic-baro-kaufkraft')) $('ic-baro-kaufkraft').innerHTML = Icon.baro(36);
if ($('ic-invsearch')) $('ic-invsearch').innerHTML    = Icon.search(16);
if ($('btn-inv-refresh')) $('btn-inv-refresh').innerHTML = Icon.refresh(15) + '<span>Fetch inventory</span>';
if ($('btn-refresh')) $('btn-refresh').innerHTML = Icon.refresh(15) + '<span>Refresh profile</span>';
if ($('btn-refresh-worldstate')) $('btn-refresh-worldstate').innerHTML = Icon.refresh(14) + ' <span>Reload</span>';

document.querySelectorAll('[data-icon]').forEach(el => {
  const name = el.dataset.icon;
  if (Icon[name]) {
    /* Die Wortmarke von warframe.market ist breiter als hoch - fuer sie ist
       die Zahl die HOEHE, nicht die Kantenlaenge. Deshalb kleinere Werte als
       bei den quadratischen Glyphen daneben. */
    const size = el.classList.contains('logo')       ? 26
               : el.classList.contains('nav-icon')   ? 22
               : el.classList.contains('setup-logo') ? 44
               : el.classList.contains('wfm-brand')  ? 16
               : el.classList.contains('badge-wfm')  ? 16
               : 15;
    el.innerHTML = Icon[name](size);
  }
});

/* ---------------- Fenstersteuerung ---------------- */
$('btn-min').onclick     = () => window.api.minimize();
$('btn-close').onclick   = () => window.api.close();
/* Das Overlay ist ein eigenes Fenster (overlay.html). Hier bleibt nur der
   Schalter und die Anzeige, ob es gerade offen ist. */
$('btn-overlay').onclick = async () => syncOverlayBadge(await window.api.toggleOverlay());

function syncOverlayBadge(st) {
  const on = !!(st && st.overlay);
  $('overlay-badge').classList.toggle('hidden', !on);
  $('btn-overlay').classList.toggle('on', on);

  /* Ist das Overlay abgeschaltet, ist der Knopf nicht "aus", sondern ohne
     Wirkung - und ein Knopf, auf den nichts folgt, ist ein Fehler und keine
     Einstellung. Er sagt stattdessen, wo man ihn wieder scharf macht. */
  const enabled = !st || st.enabled !== false;
  const btn = $('btn-overlay');
  btn.disabled = !enabled;
  btn.title = enabled
    ? `Overlay mode (${(st && st.hotkeys && st.hotkeys.overlay) || 'Ctrl+R'})`
    : 'Overlay switched off — see Settings, Overlays';

  /* Der Schalter in den Einstellungen kann von hier aus umgelegt worden sein
     (oder gar nicht) - er zieht mit derselben Meldung nach. */
  if ($('set-overlay-enabled')) $('set-overlay-enabled').checked = enabled;
}

/* Auch der Hotkey aendert den Zustand - ohne dieses Ereignis zeigte die
   Titelleiste weiter "zu", waehrend das Overlay offen ist. */
window.api.onOverlayChanged(syncOverlayBadge);
window.api.overlayState().then(syncOverlayBadge).catch(() => {});

/* ---------------- Sidebar Navigation ---------------- */
function showTab(name) {
  if (typeof cancelHotkeyCapture === 'function') cancelHotkeyCapture();
  /* Mastery Manager und Farm-Ziele sind ein Reiter mit zwei Modi. Aeltere
     Namen zeigen weiter dorthin, damit Aufrufe von aussen nicht ins Leere
     laufen - 'checklist' und 'goals' schalten dabei auf den Katalog. */
  if (name === 'checklist' || name === 'goals') { name = 'mastery'; masteryMode = 'catalog'; }
  if (name === 'dashboard') { name = 'mastery'; masteryMode = 'manager'; }
  document.querySelectorAll('.nav-item').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));

  if (name === 'mastery') {
    if (!checklistCache.length) loadChecklist();
    if (state) renderGoals(state);
    applyMasteryMode();
  }
  if (name === 'builds' && !buildsLoaded) loadBuilds();
  if (name === 'worldstate') loadWorldState();
  if (name === 'weekly') loadWeekly();
  if (name === 'farmguide') reloadFarmTab();
  if (name === 'ducats') loadDucats();
  if (name === 'inventory') loadInventoryTab();
  if (name === 'trading') { initTradingEvents(); loadTrading(); }
  if (name === 'settings') loadSettingsTab();
}

document.querySelectorAll('.nav-item').forEach(tab => {
  tab.onclick = () => showTab(tab.dataset.tab);
});

/* ---------------- Mastery: Manager <-> Katalog <-> Schmiede ---------------- */
const MASTERY_MODES = ['manager', 'catalog', 'foundry'];
let masteryMode = 'manager';

const MASTERY_HINTS = {
  manager: 'Goals, resources & mastery recommendations',
  catalog: 'Search every item and set it as a goal',
  foundry: 'What is building and what is finished'
};

function applyMasteryMode() {
  /* Ueber die Liste statt Zeile fuer Zeile: bei drei Modi war die vierte
     vergessene Zeile nur eine Frage der Zeit. */
  for (const m of MASTERY_MODES) {
    $('tab-mastery-mode-' + m)?.classList.toggle('active', masteryMode === m);
    $('mastery-pane-' + m)?.classList.toggle('active', masteryMode === m);
  }
  const hint = $('mastery-mode-hint');
  if (hint) hint.textContent = MASTERY_HINTS[masteryMode] || '';

  if (masteryMode === 'catalog' && !checklistCache.length) loadChecklist();
  /* Die Schmiede laedt bei JEDEM Aufschlagen neu, anders als der Katalog:
     ihr Inhalt ist eine Uhr. Ein Stand von vor einer Stunde waere hier nicht
     "schon da", sondern falsch.

     Die Ketten darunter NICHT: sie aendern sich nur, wenn ein Bau fertig oder
     ein Rang erreicht ist - und dann kommt ein neuer Inventarabruf, der sie
     verwirft. */
  if (masteryMode === 'foundry') { loadForge(); initChainEvents(); loadChains(); }
}

function setMasteryMode(mode) {
  masteryMode = mode;
  applyMasteryMode();
}

for (const m of MASTERY_MODES) {
  $('tab-mastery-mode-' + m)?.addEventListener('click', () => setMasteryMode(m));
}

/* ------------------------- Die Schmiede ------------------------- */

/**
 * Restzeit als Text.
 *
 * Eigene Fassung im Renderer, obwohl core/foundry.js dieselbe Funktion hat:
 * ueber die IPC-Bruecke kommen Daten, keine Funktionen, und ein zweiter
 * Kanal nur fuer eine Formatierung waere teurer als diese zwoelf Zeilen.
 *
 * Unter einer Stunde ist "0h" die falsche Antwort - dann zaehlen Minuten,
 * und in der letzten Minute die Sekunden.
 */
function forgeRemaining(ms) {
  if (ms == null) return '—';
  if (ms <= 0) return 'ready';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s % 60}s`;
}

let forgeData = null;
let forgeTicker = null;

/**
 * Die Schmiede holen und zeichnen.
 *
 * EIGENER ABRUF, NICHT DER DES INVENTARS: Diese Seite liegt im Mastery-Tab.
 * Haenge sie an die Inventardaten, muesste man erst das Inventar aufmachen,
 * damit hier etwas steht - genau der Umweg, den die Seite abschaffen soll.
 * Der Abruf ist rein lokal und kostet weder Netz noch Speicherzugriff.
 */
async function loadForge() {
  const box = $('forge-body');
  if (!box) return;

  const res = await window.api.getFoundry();
  forgeData = res?.ok ? res.data : null;

  if (!forgeData) {
    box.innerHTML = `<div class="forge-empty">
      <b>No inventory fetched yet.</b>
      <p>The foundry is part of your account data. Start Warframe and press
         <b>Fetch inventory</b> on the Inventory tab once — after that it is
         read from the local copy and costs nothing.</p>
    </div>`;
    return;
  }
  renderForge();
}

/**
 * Was in der Schmiede steht.
 *
 * DIE ZEITEN LAUFEN HIER, NICHT IM HAUPTPROZESS.
 *   Ueber die Bruecke kommt completionAt - ein fester Zeitpunkt. Die
 *   Restzeit daraus zu rechnen ist Sache dessen, der sie anzeigt; haette der
 *   Hauptprozess sie mitgeschickt, waere sie in der Sekunde nach dem Abruf
 *   schon falsch und bliebe es bis zum naechsten.
 *
 * WAS DIE UHR NICHT WEISS: ob jemand im Spiel etwas abgeholt oder neu
 * eingelegt hat. Das steht erst im naechsten Inventarabruf. Die Anzeige
 * bleibt deshalb bei dem, was sie belegen kann - sie zaehlt herunter, aber
 * sie erfindet nichts dazu.
 */
function renderForge() {
  const box = $('forge-body');
  if (!box || !forgeData) return;

  const items = forgeData.items || [];
  const helminth = forgeData.helminth;

  if (!items.length && !helminth) {
    box.innerHTML = `<div class="forge-empty">
      <b>Nothing in the foundry.</b>
      <p>Whatever you put in next shows up here with the time it will be done.</p>
    </div>`;
    if (forgeTicker) { clearInterval(forgeTicker); forgeTicker = null; }
    return;
  }

  const now = Date.now();

  /* Ein Bild je Zeile. Faellt es aus - kein Katalogeintrag, kein Netz -,
     bleibt der Rahmen stehen statt zu verschwinden: sonst rutschen Name und
     Zeit nach links und die Liste wird unruhig. */
  const bild = (src, alt) => src
    ? `<img class="forge-img" src="${esc(src)}" alt="${esc(alt)}" onerror="this.style.visibility='hidden'">`
    : '<span class="forge-img"></span>';

  /**
   * Eine Zeile.
   *
   * FERTIG UND LAUFEND SEHEN VERSCHIEDEN AUS, weil sie Verschiedenes von
   * einem wollen. Fertig ist eine AUFFORDERUNG - hingehen und abholen -, und
   * die traegt deshalb ein Abzeichen statt einer Zeitangabe: "ready to
   * collect" als grauer Fliesstext rechts sah aus wie eine Uhr, die stehen
   * geblieben ist. Laufend ist eine AUSKUNFT, und die gehoert an dieselbe
   * Stelle wie jede andere Restzeit.
   *
   * @param total  Gesamtdauer des Baus in ms - macht aus der Restzeit einen
   *               Fortschritt. Fehlt sie (Helminth), bleibt der Balken weg,
   *               statt einen geratenen Stand zu zeigen.
   */
  const zeile = (name, at, img, extra = '', total = null) => {
    const rest = at == null ? null : at - now;
    const bereit = rest != null && rest <= 0;

    /* Ein gerushter Bau kann laenger her sein als seine eigene Bauzeit -
       der Anteil wird deshalb gedeckelt, nicht nur gerechnet. */
    const anteil = total > 0 && rest != null
      ? Math.max(0, Math.min(1, (total - rest) / total))
      : null;

    return `
      <div class="forge-row ${bereit ? 'is-ready' : ''}">
        ${img}
        <div class="forge-main">
          <span class="forge-name">${esc(name)}${extra}</span>
          ${!bereit && anteil != null ? `
            <span class="forge-bar" data-forge-total="${total}">
              <i style="width:${(anteil * 100).toFixed(1)}%"></i>
            </span>` : ''}
        </div>
        ${bereit
          ? `<span class="forge-pill" data-forge-at="${at ?? ''}">
               <i class="forge-pip"></i>Collect
             </span>`
          : `<span class="forge-time" data-forge-at="${at ?? ''}">${forgeRemaining(rest)}</span>`}
      </div>`;
  };

  /* Zwei Gruppen statt einer sortierten Liste. Sie sind zwei verschiedene
     Nachrichten - "geh hin" und "warte noch" -, und mit Ueberschrift muss
     man den Bruch dazwischen nicht an der Farbe der Zeilen ablesen.

     Der Helminth zaehlt mit: fuer den Spieler ist er dieselbe Frage. */
  const alle = [
    ...items.map(i => ({
      name: i.name, at: i.completionAt, total: i.buildSeconds ? i.buildSeconds * 1000 : null,
      img: bild(i.image, i.name), extra: i.count > 1 ? ` <em>x${i.count}</em>` : ''
    })),
    ...(helminth ? [{
      name: helminth.ability, at: helminth.readyAt, total: null,
      img: `<span class="forge-img forge-img-helminth">${Icon.qaHelminth(24)}</span>`,
      extra: ' <em>Helminth</em>'
    }] : [])
  ];

  const fertig = alle.filter(z => z.at != null && z.at <= now);
  const laeuft = alle.filter(z => !(z.at != null && z.at <= now));

  const gruppe = (titel, zeilen, ready = false) => zeilen.length ? `
    <div class="forge-group ${ready ? 'is-ready' : ''}">
      <div class="forge-group-head">
        ${ready ? '<i class="forge-pip"></i>' : ''}
        <span>${titel}</span>
        <em>${zeilen.length}</em>
      </div>
      <div class="forge-list">
        ${zeilen.map(z => zeile(z.name, z.at, z.img, z.extra, z.total)).join('')}
      </div>
    </div>` : '';

  /* Der naechste Umschlag steht im Kopf, weil er die einzige Zahl ist, die
     man sich merkt: wann muss ich wieder nachsehen. */
  const naechster = laeuft
    .map(z => z.at).filter(t => t != null && t > now).sort((a, b) => a - b)[0] || null;

  box.innerHTML = `
    <div class="forge-card">
      <div class="forge-head">
        <span class="forge-title">${alle.length} in the foundry</span>
        ${naechster
          ? `<span class="forge-next">next in
               <b data-forge-at="${naechster}">${forgeRemaining(naechster - now)}</b></span>`
          : ''}
      </div>
      ${gruppe('Ready to collect', fertig, true)}
      ${gruppe('Building', laeuft)}
    </div>`;

  /* Ein Ticker fuer die ganze Liste statt einer Uhr je Zeile. Er schreibt nur
     Text in vorhandene Elemente - und laesst neu zeichnen, sobald eine Zeile
     die Grenze zu "fertig" ueberschreitet, weil sich dann Bild, Farbe und
     Kopfzeile mitaendern muessen. */
  if (forgeTicker) clearInterval(forgeTicker);
  forgeTicker = setInterval(() => {
    if (!document.body.contains(box)) { clearInterval(forgeTicker); forgeTicker = null; return; }
    /* Nicht sichtbar, nicht rechnen - und sichtbar ist die Liste nur, wenn
       BEIDES stimmt: der Mastery-Tab ist vorn und darin der Schmiede-Modus.
       Der Modus allein reicht nicht, er bleibt auch gesetzt, waehrend man
       ganz woanders in der App ist. */
    if (!$('tab-mastery')?.classList.contains('active') ||
        !$('mastery-pane-foundry')?.classList.contains('active')) return;

    let umschlag = false;
    box.querySelectorAll('[data-forge-at]').forEach(el => {
      const at = Number(el.dataset.forgeAt);
      if (!Number.isFinite(at) || !at) return;
      const rest = at - Date.now();
      /* Das Abzeichen einer fertigen Zeile traegt denselben Zeitpunkt wie die
         Uhr einer laufenden. Nur die Zeile entscheidet, ob hier ein Umschlag
         stattfindet - sonst loeste jede fertige Zeile im Sekundentakt ein
         Neuzeichnen aus. Die Zahl im Kopf haengt an keiner Zeile und wird
         zusammen mit ihr neu gesetzt. */
      const row = el.closest('.forge-row');
      if (rest <= 0) {
        if (row && !row.classList.contains('is-ready')) umschlag = true;
        return;
      }
      el.textContent = forgeRemaining(rest);
    });

    /* Die Fortschrittsbalken laufen mit. Sie haengen an einem anderen Element
       als die Zeit derselben Zeile, deshalb eine zweite Runde. */
    box.querySelectorAll('.forge-bar[data-forge-total]').forEach(bar => {
      const at = Number(bar.closest('.forge-row')?.querySelector('[data-forge-at]')?.dataset.forgeAt);
      const total = Number(bar.dataset.forgeTotal);
      if (!Number.isFinite(at) || !(total > 0)) return;
      const anteil = Math.max(0, Math.min(1, (total - (at - Date.now())) / total));
      if (bar.firstElementChild) bar.firstElementChild.style.width = (anteil * 100).toFixed(1) + '%';
    });

    if (umschlag) renderForge();
  }, 1000);
}

/* ------------------------- Bauketten -------------------------
   Waffen, die aus anderen Waffen gebaut werden. Die Kette steht unter der
   Schmiede, weil sie dieselbe Handlung betrifft - was lege ich als Naechstes
   ein - und weil sie die Reihenfolge vorgibt: jede Stufe wird beim Bau der
   naechsten VERBRAUCHT. Wer die Bolto ungerankt in die Akbolto steckt, hat
   3.000 Mastery-Punkte weggeworfen, und das Spiel sagt es ihm nicht.
   ------------------------------------------------------------- */

let chainData = null;
let chainFilter = 'open';   // 'open' | 'risk' | 'ready' | 'all'

const CHAIN_CATEGORY = {
  Suits: 'Warframe', LongGuns: 'Primary', Pistols: 'Secondary', Melee: 'Melee',
  SpaceGuns: 'Archwing gun', SpaceMelee: 'Archwing melee', SpaceSuits: 'Archwing',
  Sentinels: 'Sentinel', SentinelWeapons: 'Sentinel weapon', MechSuits: 'Necramech',
  KubrowPets: 'Companion', KDrive: 'K-Drive', AmpPrism: 'Amp prism',
  ZawStrike: 'Zaw strike', KitgunChamber: 'Kitgun chamber'
};

async function loadChains() {
  const box = $('chains-body');
  if (!box) return;

  if (!chainData) {
    const res = await window.api.getCraftChains();
    chainData = res?.ok ? res.data : { chains: [], hasMastery: false, hasInventory: false };
  }
  renderChains();
}

/** Alle Glieder einer Kette flach - fuer Suche und Baureihenfolge. */
function chainNodes(node, out = []) {
  out.push(node);
  for (const s of node.steps || []) chainNodes(s, out);
  return out;
}

/**
 * Ein Glied als Zeile.
 *
 * DIE EINRUECKUNG IST DIE AUSSAGE: was weiter rechts steht, wird frueher
 * gebaut und vom Ding darueber gefressen. Deshalb traegt jede Zeile ihre
 * Tiefe als Variable und nicht als eigene Klasse - bei vier Stufen waere die
 * fuenfte nur eine Frage der Zeit.
 */
function chainRank(n) {
  return n.status === 'missing'
    ? '<span class="chain-rank is-missing">not owned</span>'
    : `<span class="chain-rank ${n.status === 'mastered' ? 'is-done' : 'is-part'}">${n.rank}/${n.maxRank}</span>`;
}

function chainNodeRow(n, hasInventory) {
  /* Der Bestand nur, wo er etwas sagt: "0/2 in stock" neben einem "not
     owned" ist dieselbe Auskunft zweimal. Interessant wird er, sobald man
     etwas HAT - dann steht dort, ob es fuer den naechsten Bau reicht. */
  const bestand = hasInventory && n.owned > 0
    ? `<span class="chain-have ${n.covered ? 'is-ok' : ''}">${n.owned}/${n.need} in stock</span>`
    : '';

  /* Die Wurzel steht im Kopf der Karte, die Zutaten ruecken deshalb um eine
     Stufe nach links - sonst begaenne der Baum mit einer leeren Spalte. */
  const tiefe = Math.max(0, n.depth - 1);

  return `
    <div class="chain-node d${Math.min(tiefe, 4)} is-${n.status}" style="--depth:${tiefe}">
      <span class="chain-mark">${n.status === 'mastered' ? Icon.check(12) : ''}</span>
      <img class="chain-img" src="${esc(n.image || '')}" alt="" loading="lazy"
           onerror="this.style.visibility='hidden'">
      <span class="chain-name">
        ${n.need > 1 ? `<b class="chain-need">${n.need}×</b>` : ''}${esc(n.name)}
      </span>
      ${n.building ? '<span class="chain-flag is-building">in the foundry</span>' : ''}
      ${bestand}
      ${chainRank(n)}
    </div>`;
}

function renderChains() {
  const box = $('chains-body');
  if (!box || !chainData) return;

  const alle = chainData.chains || [];
  const q = ($('chain-search')?.value || '').trim().toLowerCase();

  /* Die Suche greift auf die ganze Kette, nicht nur auf den Namen oben: wer
     "Bolto" sucht, meint die Kette, in der eine Bolto steckt - und die heisst
     Akjagara. */
  let liste = q
    ? alle.filter(c => chainNodes(c).some(n => n.name.toLowerCase().includes(q)))
    : alle;

  if (chainFilter === 'open')  liste = liste.filter(c => !c.complete);
  if (chainFilter === 'risk')  liste = liste.filter(c => c.atRisk.length);
  if (chainFilter === 'ready') liste = liste.filter(c => c.ready === true);

  /* Die Kopfzeile spricht ueber ALLE Ketten, nicht ueber die gefilterten -
     sonst aendert sich die Gesamtlage, sobald man einen Chip anklickt. */
  const offen = alle.filter(c => !c.complete).length;
  const summe = alle.reduce((s, c) => s + c.openGain, 0);
  const kopf = $('chain-summary');
  if (kopf) {
    kopf.textContent = alle.length
      ? `${alle.length} chains · ${alle.length - offen} complete · ${nf(summe)} mastery points still open`
      : '';
  }

  if (!liste.length) {
    box.innerHTML = `
      <div class="forge-empty">
        <b>${alle.length ? 'Nothing matches' : 'No chains found'}</b>
        <p>${alle.length
          ? 'No chain matches your search and filter. “All” shows the finished ones as well.'
          : 'The chains come from DE&rsquo;s own recipes — if this stays empty, the item catalogue could not be loaded.'}</p>
      </div>`;
    return;
  }

  /* Ohne Mastery-Daten waere jedes Glied "not owned" - das ist keine Aussage,
     sondern eine fehlende Quelle, und es steht dabei. */
  const hinweis = !chainData.hasMastery ? `
    <div class="chain-note">
      ${Icon.warning(13)} No mastery data yet — fetch your profile once and every link below
      shows its own rank instead of “not owned”.
    </div>` : '';

  box.innerHTML = hinweis + liste.map(c => {
    const nodes = chainNodes(c);

    /* Die Baureihenfolge: von unten nach oben, Stufe fuer Stufe. Sie steht in
       einer Zeile, weil genau das die Antwort auf "und was mache ich jetzt"
       ist - der Baum darueber sagt, WAS zusammengehoert, diese Zeile sagt,
       in welcher Reihenfolge. */
    const stufen = [];
    for (let d = c.depthMax; d >= 0; d--) {
      const auf = nodes.filter(n => n.depth === d);
      if (auf.length) stufen.push(auf.map(n => (n.need > 1 ? `${n.need}× ` : '') + n.name).join(' + '));
    }

    return `
      <div class="chain-card ${c.complete ? 'is-complete' : ''}">
        <div class="chain-head">
          <img class="chain-head-img" src="${esc(c.image || '')}" alt=""
               onerror="this.style.visibility='hidden'">
          <div class="chain-title">
            <b>${esc(c.name)}</b>
            <span class="chain-sub">${esc(CHAIN_CATEGORY[c.category] || c.category)}
              · ${c.links} links${c.masteryReq ? ` · MR ${c.masteryReq}` : ''}
              · ${chainRank(c)}</span>
          </div>
          <div class="chain-stats">
            <span class="chain-done ${c.complete ? 'is-complete' : ''}">${c.mastered}/${c.links}</span>
            <span class="chain-gain">${c.complete ? 'all mastered' : `+${nf(c.openGain)} MR`}</span>
          </div>
        </div>

        <!-- Die Wurzel steht schon im Kopf - hier steht, was sie frisst. -->
        <div class="chain-tree">
          ${nodes.slice(1).map(n => chainNodeRow(n, chainData.hasInventory)).join('')}
        </div>

        ${c.atRisk.length ? `
          <div class="chain-warn">
            ${Icon.warning(13)}
            <span>Rank <b>${c.atRisk.map(esc).join('</b>, <b>')}</b> to 30 first — the next build
                  consumes ${c.atRisk.length > 1 ? 'them' : 'it'}, and the mastery goes with ${c.atRisk.length > 1 ? 'them' : 'it'}.</span>
          </div>` : ''}

        ${c.ready === true && !c.complete ? `
          <div class="chain-ok">${Icon.check(13)}
            <span>Everything for the final build is in your inventory.</span></div>` : ''}

        ${c.depthMax > 1 ? `
          <div class="chain-order">
            <span class="chain-order-label">Build order</span>
            ${stufen.map(s => `<span class="chain-step">${esc(s)}</span>`).join('<i class="chain-arrow">→</i>')}
          </div>` : ''}
      </div>`;
  }).join('');
}

let chainEventsReady = false;
function initChainEvents() {
  if (chainEventsReady) return;
  chainEventsReady = true;

  $('chain-search')?.addEventListener('input', () => renderChains());
  document.querySelectorAll('[data-chainfilter]').forEach(btn => {
    btn.addEventListener('click', () => {
      chainFilter = btn.dataset.chainfilter;
      document.querySelectorAll('[data-chainfilter]').forEach(b =>
        b.classList.toggle('active', b === btn));
      renderChains();
    });
  });
}

/* Der Knopf im Kopf springt zu den ausfuehrlichen Zielkarten - die liegen im
   Manager, also erst umschalten und dann dorthin scrollen. */
function setGoalDetailsOpen(open) {
  $('btn-goal-details')?.setAttribute('aria-expanded', String(open));
  $('goals')?.classList.toggle('hidden', !open);
}

$('btn-goal-details')?.addEventListener('click', () => {
  const open = $('btn-goal-details').getAttribute('aria-expanded') === 'true';
  setGoalDetailsOpen(!open);
});

function jumpToGoalDetails() {
  masteryMode = 'manager';
  showTab('mastery');
  setGoalDetailsOpen(true);
  /* Erst wenn der Manager wirklich sichtbar ist, hat das Ziel eine Position. */
  requestAnimationFrame(() =>
    $('goal-details-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
if ($('btn-to-goals')) $('btn-to-goals').onclick = jumpToGoalDetails;

$('btn-easy-more')?.addEventListener('click', () => {
  easyGainsOpen = !easyGainsOpen;
  if (state) renderEasyGains(state);

  /* Beim Zuklappen schrumpft die Liste um bis zu drei Reihen. Wer weiter
     unten stand, landete dadurch hinter dem Abschnitt und musste zurueck-
     scrollen, um den Knopf wiederzufinden, den er gerade gedrueckt hat. */
  if (!easyGainsOpen) {
    requestAnimationFrame(() =>
      $('btn-easy-more')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
});

/* ---------------- Ersteinrichtung ---------------- */

const ACCOUNT_ID_RE = /^[0-9a-f]{24}$/i;

function showSetupError(msg) {
  const box = $('setup-id-error');
  box.textContent = msg || '';
  box.classList.toggle('hidden', !msg);
  $('setup-id').classList.toggle('invalid', !!msg);
}

function setSetupStatus(msg, { busy = false } = {}) {
  const box = $('setup-status');
  if (!msg) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = (busy ? '<span class="spinner"></span>' : '') + `<span>${msg}</span>`;
}

async function submitSetup() {
  const id = $('setup-id').value.trim().toLowerCase();

  /* Vorpruefung im Fenster, nicht erst im Hauptprozess. Nicht aus Bequemlich-
     keit: jeder Abruf zaehlt gegen die Drosselung von DE, ein erkennbarer
     Vertipper darf gar nicht erst ins Netz gehen. */
  if (!ACCOUNT_ID_RE.test(id)) {
    /* Laenge und Zeichenvorrat getrennt melden. Ein gemeinsamer Satz ergibt
       bei 24 falschen Zeichen "that is 24 characters, an ID has 24" - eine
       Meldung, die dem Leser nichts sagt, ausser dass etwas nicht stimmt. */
    let msg;
    if (!id) msg = 'Please enter your account ID.';
    else if (id.length !== 24) {
      msg = `That is ${id.length} character${id.length === 1 ? '' : 's'} — an account ID has exactly 24.`;
    } else {
      const bad = [...new Set(id.replace(/[0-9a-f]/g, ''))].join(' ');
      msg = `The length is right, but an account ID only uses 0-9 and a-f. Check: ${bad}`;
    }
    showSetupError(msg);
    $('setup-id').focus();
    return;
  }
  showSetupError('');

  $('setup-go').disabled = true;
  setSetupStatus('Fetching your profile and the item catalogue. The first run downloads about 12 MB.', { busy: true });

  const res = await window.api.saveSetup({
    accountId: id,
    platform: $('setup-platform').value,
    /* Der Handweg schaltet den Speicherzugriff nicht ein - wer hierher
       gewechselt ist, hat die Berechtigungsfrage gerade nicht bejaht. */
  });

  $('setup-go').disabled = false;

  if (!res.ok) {
    setSetupStatus('');
    if (res.field === 'accountId') showSetupError(res.error);
    else setSetupStatus(res.error);
    return;
  }

  $('setup').classList.add('hidden');
  $('app').classList.remove('hidden');
  render(res.data);
  loadWorldState();
}

/* Zwischen Berechtigungsfrage und Handweg umschalten. */
function showSetupView(which) {
  $('setup-permission').classList.toggle('hidden', which !== 'permission');
  $('setup-manual').classList.toggle('hidden', which !== 'manual');
  if (which === 'manual') $('setup-id').focus();
}

function setPermStatus(msg, { busy = false } = {}) {
  const box = $('setup-perm-status');
  if (!box) return;
  if (!msg) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = (busy ? '<span class="spinner"></span>' : '') + `<span>${msg}</span>`;
}

/**
 * Der bequeme Weg: Kennung und Inventar aus dem laufenden Spiel.
 *
 * Der Speicherscan kann einige Sekunden dauern - deshalb sagt der Text, was
 * gerade passiert, statt den Knopf nur auszugrauen. Ein Programm, das ohne
 * Erklaerung sekundenlang steht, sieht abgestuerzt aus.
 */
async function allowAndDetect() {
  $('setup-allow').disabled = true;
  setPermStatus('Looking for the running game …', { busy: true });

  const res = await window.api.detectSetup();
  $('setup-allow').disabled = false;

  if (!res.ok) {
    /* Die Meldungen aus main.js sagen bereits, was zu tun ist ("Warframe is
       not running. Start the game, log in, and try again."). Ein eigener
       Satz davor waere nur Verdopplung. */
    setPermStatus(esc(res.error));
    return;
  }

  setPermStatus('');
  $('setup').classList.add('hidden');
  $('app').classList.remove('hidden');
  render(res.data);
  loadWorldState();

  /* Das Profil steht, das Inventar nicht - das ist kein Grund, die
     Einrichtung scheitern zu lassen, aber es gehoert gesagt. */
  if (res.inventoryNote) {
    showInAppToast({ title: 'Inventory not loaded', body: res.inventoryNote });
  }
}

function showSetup(state) {
  $('setup').classList.remove('hidden');
  if (state?.platform) $('setup-platform').value = state.platform;
  showSetupView('permission');
}

if ($('setup-allow')) $('setup-allow').onclick = allowAndDetect;
if ($('setup-to-manual')) $('setup-to-manual').onclick = () => showSetupView('manual');
if ($('setup-to-permission')) $('setup-to-permission').onclick = () => showSetupView('permission');

if ($('setup-go')) $('setup-go').onclick = submitSetup;
if ($('setup-id')) {
  // Enter im einzigen Pflichtfeld soll abschicken, nicht nichts tun.
  $('setup-id').addEventListener('keydown', e => { if (e.key === 'Enter') submitSetup(); });
  $('setup-id').addEventListener('input', () => showSetupError(''));
}
if ($('setup-open-warframe')) {
  $('setup-open-warframe').onclick = () =>
    window.api.openExternal('https://www.warframe.com/api/user-data');
}

/* ---------------- Laden & Refresh ---------------- */
async function boot() {
  /* Zuerst die Frage, ob ueberhaupt eine Account-ID hinterlegt ist. Ohne sie
     hat getDashboard() nichts zu laden - frueher endete das in einer roten
     Fehlerzeile, aus der kein Weg herausfuehrte. */
  const setup = await window.api.getSetupState();
  if (!setup.configured) {
    $('loading').classList.add('hidden');
    showSetup(setup);
    return;
  }

  const res = await window.api.getDashboard();
  $('loading').classList.add('hidden');
  if (!res.ok) {
    $('error').classList.remove('hidden');
    $('error').textContent = 'Error: ' + res.error;
    return;
  }
  $('app').classList.remove('hidden');
  render(res.data);
  loadWorldState();
}

let refreshTimer = null;

async function doRefreshProfile() {
  const btnHero = $('btn-refresh');

  if (refreshTimer) clearTimeout(refreshTimer);

  if (btnHero) {
    btnHero.disabled = true;
    btnHero.classList.add('is-refreshing');
    btnHero.innerHTML = Icon.refresh(15) + '<span>Loading …</span>';
  }

  const res = await window.api.refreshProfile();

  if (btnHero) {
    btnHero.disabled = false;
    btnHero.classList.remove('is-refreshing');
    btnHero.innerHTML = Icon.refresh(15) + '<span>Refresh profile</span>';
  }

  if (res.ok) render(res.data);
  else $('meta-info').textContent = res.error;
}

if ($('btn-refresh')) $('btn-refresh').onclick = doRefreshProfile;

/* ---------------- Rendern ---------------- */
function render(data) {
  state = data;
  const p = data.player;

  $('player-name').textContent = p.name || '—';
  $('mr-name').textContent     = p.mrName;
  $('mr-value').textContent    = p.mr;

  const mrIcon = $('mr-icon');
  if (mrIcon) {
    const mrVal = Number.isInteger(p.mr) && p.mr >= 0 ? p.mr : 0;
    mrIcon.src = `assets/icons/mastery/IconRank${mrVal}.png`;
    mrIcon.alt = `Mastery Rank ${p.mr}`;
    mrIcon.onerror = function() {
      if (!this.dataset.fallbackTried) {
        this.dataset.fallbackTried = '1';
        this.src = `https://wiki.warframe.com/images/IconRank${mrVal}.png`;
      } else if (this.dataset.fallbackTried === '1') {
        this.dataset.fallbackTried = '2';
        this.src = 'assets/icons/mastery-rank.png';
      }
    };
  }

  $('progress-fill').style.width = Math.min(100, p.progress.percent).toFixed(1) + '%';
  /* Bei einer bekannten Luecke ist die Summe eine Untergrenze - das "mind."
     sagt genau das, statt eine Genauigkeit vorzutaeuschen. */
  $('progress-text').textContent = (p.hiddenXP > 0 ? 'at least ' : '') + nf(p.progress.current) + ' MR XP';
  $('progress-next').textContent = nf(p.progress.remaining) + ' to go until MR ' + (p.mr + 1);

  $('stat-done').textContent      = nf(p.counts.done);
  $('stat-partial').textContent   = nf(p.counts.partial);
  $('stat-missing').textContent   = nf(p.counts.missing);
  $('stat-open').textContent      = nf(p.openGain);
  $('stat-potential').textContent = p.potentialMR;

  renderLoadout(p);
  renderHeroTags(p);
  renderXpSplit(p.breakdown, p.totalXP);

  const m = data.meta;
  const parts = [];
  parts.push(m.fetchedAt
    ? 'As of ' + new Date(m.fetchedAt).toLocaleString('en-GB')
    : 'No profile data yet');
  if (m.fromCache) parts.push('local cache');
  /* Der Rang stammt aus dem Profil. Weicht unsere XP-Summe davon ab, fehlt uns
     eine Quelle, die das oeffentliche Profil nicht ausweist - das gehoert
     dazugesagt, sonst wirkt die XP-Zahl praeziser als sie ist. */
  if (p.hiddenXP > 0) {
    parts.push(`at least ${nf(p.hiddenXP)} MR XP from sources the profile does not list`);
  }
  if (m.message)   parts.push(m.message);
  $('meta-info').textContent = parts.join(' · ');

  renderActiveGoals(data);
  renderCards('quick-wins', data.quickWins);
  renderEasyGains(data);
  renderCards('warframes', data.warframes);
  renderCategories(data.categories);
  renderGoals(data);
  renderNotes(data);
  const goalDetailsCount = $('goal-details-count');
  if (goalDetailsCount) goalDetailsCount.textContent = (data.goals || []).length;
  const openGoalCount = (data.goals || []).filter(g => !g.done).length;
  const goalCountEl = $('goal-count');
  if (goalCountEl) {
    goalCountEl.textContent = openGoalCount;
    goalCountEl.classList.toggle('hidden', openGoalCount === 0);
  }
}

/* ---------------- Profilkopf ---------------- */
function renderLoadout(p) {
  const col = $('hero-character-col');
  const img = $('hero-warframe-img');
  if (!p.loadout || !p.loadout.image) {
    if (col) col.hidden = true;
    return;
  }
  if (img) {
    img.alt = p.loadout.name || 'Warframe';
    img.title = p.loadout.name || '';
    img.onerror = () => {
      // Fallback auf 128px Thumbnail falls 512px fehlschlaegt
      if (p.loadout.uniqueName && !img.dataset.failed) {
        img.dataset.failed = '1';
        const slug = p.loadout.uniqueName.replace(/^\//, '').replaceAll('/', '.');
        img.src = `https://cdn.jsdelivr.net/gh/Aericio/warframe-exports-data/image/128x128/${slug}.png`;
      } else if (col) {
        col.hidden = true;
      }
    };
    img.onload = () => {
      if (col) col.hidden = false;
    };
    img.dataset.failed = '';
    img.src = p.loadout.image;
  }
  if (col) col.hidden = false;
}

function renderHeroTags(p) {
  const tags = [];
  if (p.clan)         tags.push([Icon.users(13),    p.clan]);
  if (p.loadout?.focus) tags.push([Icon.focusSchool(15, p.loadout.focus), p.loadout.focus]);
  if (p.yearsPlayed)  tags.push([Icon.calendar(13), 'Since ' + new Date(p.createdMs).getFullYear() + ' · ' + p.yearsPlayed + ' years']);
  if (p.nodes)        tags.push([Icon.map(13),      nf(p.nodes) + ' Nodes · ' + p.junctions + ' Junctions']);

  $('hero-tags').innerHTML = tags
    .map(([ic, text]) => `<span class="htag">${ic}${esc(text)}</span>`).join('');
}

/** Gestapelter Balken: welcher Anteil der MR-XP kommt woher. */
const XP_PARTS = [
  ['items',      'Items',      '#4a9eff'],
  ['nodes',      'Nodes',      '#7c6cff'],
  ['intrinsics', 'Intrinsics', '#f0b849'],
  ['junctions',  'Junctions',  '#4ade80']
];

function renderXpSplit(breakdown, total) {
  if (!breakdown || !total) return;
  const parts = XP_PARTS
    .map(([key, label, color]) => ({ label, color, value: breakdown[key] || 0 }))
    .filter(p => p.value > 0);

  $('xpbar').innerHTML = parts
    .map(p => `<i style="width:${(p.value / total * 100).toFixed(2)}%;background:${p.color}"></i>`)
    .join('');

  $('xplegend').innerHTML = parts.map(p =>
    `<span><em style="background:${p.color}"></em>${esc(p.label)} <b>${nf(p.value)}</b></span>`
  ).join('');
}

/* ---------------- Aktive Ziele auf dem Dashboard ---------------- */
function renderActiveGoals(data) {
  const open = (data.goals || []).filter(g => !g.done);
  const wrap = $('active-goals-wrap');

  if (!open.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  /* VIER, nicht drei: das Raster darunter ist repeat(auto-fill, minmax(330px,
     1fr)) und stellt bei der Fensterbreite von 1560 px vier Spalten. Drei
     Karten liessen die vierte Spalte leer - die Reihe sah aus, als fehlte
     etwas. */
  const shownGoals = open.slice(0, 4);

  $('active-goals').innerHTML = shownGoals.map(g => {
    const isLevel = g.owned || g.kind === 'level';
    const isArcane = g.upgradeKind === 'arcane';
    const compList = (g.components && g.components.length > 0) ? g.components : (g.materials || []);
    const shown = compList.slice(0, 5);
    const rest  = compList.length - shown.length;
    const progressPct = isArcane
      ? Math.min(100, ((g.ownedCopies || 0) / (g.copiesToMax || 21)) * 100).toFixed(1)
      : (g.maxLvl ? Math.min(100, (g.rank / g.maxLvl) * 100).toFixed(1) : 0);

    const subText = g.isUpgrade
      ? (isLevel
          ? (isArcane
              ? `<span>In inventory</span> · <span>Rank ${g.rank}/${g.maxLvl}</span> · <span>${g.ownedCopies || 0}/${g.copiesToMax || 21} copies</span>`
              : `<span>In inventory</span> · <span>Rank ${g.rank}/${g.maxLvl}</span>`)
          : `<span>${esc(g.compat ? g.compat + ' · ' : '')}${esc(g.rarityLabel || '')} ${isArcane ? 'Arcane' : 'Mod'}</span>`)
      : (isLevel
          ? `<span>In inventory</span> · <span>Rank ${g.rank}/${g.maxLvl}</span>`
          : `<span>${Icon.coin(12)} ${nf(g.credits)}</span> <span>${Icon.clock(12)} ${esc(g.buildTime)}</span>`);

    const topDropSources = g.isUpgrade && !isLevel
      ? (g.dropSources?.groups || []).flatMap(grp => grp.entries).slice(0, 3)
      : [];

    return `
    <div class="agoal ${isLevel ? 'agoal-level' : 'agoal-farm'}" data-item-u="${esc(g.uniqueName)}">
      <div class="agoal-head">
        <img src="${esc(g.image)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="agoal-head-info">
          <div class="agoal-title-row">
            <h3>${esc(g.name)}</h3>
            <span class="agoal-badge ${isLevel ? 'level' : 'farm'}">
              ${isLevel ? Icon.bolt(12) + ' Rank up' : Icon.target(12) + ' Farm'}
            </span>
          </div>
          <div class="agoal-meta">${subText}</div>
        </div>
        <div class="agoal-head-right">
          ${g.gain > 0 ? `<span class="agoal-gain">+${nf(g.gain)}</span>` : (g.isUpgrade ? `<span class="agoal-gain agoal-upgrade-type">${isArcane ? 'Arcane' : 'Mod'}</span>` : '')}
          <div class="agoal-actions">
            <button class="btn-icon ${g.done ? 'on' : ''}" data-goal-toggle="${esc(g.uniqueName)}" title="${g.done ? 'Mark as open' : 'Mark as done'}">
              ${Icon.check(13)}
            </button>
            <button class="btn-icon danger" data-goal-remove="${esc(g.uniqueName)}" title="Remove goal">
              ${Icon.trash(13)}
            </button>
          </div>
        </div>
      </div>

      ${isLevel ? `
        <div class="agoal-level-box">
          <div class="level-box-head">
            <span>${isArcane ? 'Copies progress' : 'Level progress'}</span>
            <b>${isArcane ? `${Math.max(0, (g.copiesToMax || 21) - (g.ownedCopies || 0))} more copies` : `${g.ranksLeft} more ${g.ranksLeft === 1 ? 'rank' : 'ranks'}`}</b>
          </div>
          <div class="level-track"><div class="level-fill" style="width: ${progressPct}%"></div></div>
        </div>
      ` : (g.isUpgrade ? `
        <div class="agoal-mats">
          ${topDropSources.length ? topDropSources.map(s => `
            <span class="chip">
              <span>${esc(s.place)}</span>
              ${s.chanceText ? `<b>${esc(s.chanceText)}</b>` : ''}
            </span>`).join('') : '<span class="chip"><span>Open data sheet for drop sources</span></span>'}
        </div>
      ` : `
        <div class="agoal-mats">
          ${shown.map(m => `
            <span class="chip ${Stock.cls(m)}" title="${esc(Stock.hint(m, m.name, nf))}">
              ${m.image ? `<img class="mat-icon" src="${esc(m.image)}" alt="" onerror="this.style.display='none'">` : ''}
              <span>${esc(m.name)}</span>
              ${Stock.forge(m)}
              <b>${Stock.num(m, nf)}</b>
            </span>`).join('')}
          ${rest > 0 ? `<span class="chip more">+${rest} more</span>` : ''}
        </div>
      `)}

      ${g.note && g.note.trim()
        ? `<div class="agoal-note">${Icon.note(13)}<span>${esc(g.note)}</span></div>` : ''}
    </div>`;
  }).join('');

  $('active-goals').querySelectorAll('.agoal').forEach(card => {
    card.onclick = e => {
      if (e.target.closest('[data-goal-toggle]') || e.target.closest('[data-goal-remove]')) return;
      const u = card.dataset.itemU;
      const g = (data.goals || []).find(x => x.uniqueName === u);
      if (g?.isUpgrade) {
        openUpgradeModal({
          uniqueName: g.uniqueName,
          name: g.name,
          count: g.ownedCount || 0,
          ranks: g.ownedRanks || [],
          maxRank: g.rank ?? null,
          resolved: true
        });
      } else {
        openItemModal(u);
      }
    };
  });

  $('active-goals').querySelectorAll('[data-goal-toggle]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const r = await window.api.toggleGoal(b.dataset.goalToggle);
    if (r.ok) render(r.data);
  });
  $('active-goals').querySelectorAll('[data-goal-remove]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const r = await window.api.removeGoal(b.dataset.goalRemove);
    if (r.ok) render(r.data);
  });
}


function renderCards(target, list) {
  const el = $(target);
  if (!list.length) { el.innerHTML = '<div class="empty">Nothing outstanding</div>'; return; }

  const inGoals = new Set((state?.goals || []).map(g => g.uniqueName));

  el.innerHTML = list.map(r => {
    const already = inGoals.has(r.uniqueName);
    return `
    <div class="card" data-item-u="${esc(r.uniqueName)}">
      <img src="${esc(r.image)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="card-body">
        <div class="card-title">
          <b>${esc(r.name)}</b>
          <span class="gain">+${nf(r.gain)}</span>
        </div>
        <div class="card-cat">${esc(r.label)}</div>
        <div class="card-reason">${esc(r.reason)}</div>
        <div class="card-actions">
          <button class="btn-sm ${already ? 'on' : ''}" data-add="${esc(r.uniqueName)}" data-name="${esc(r.name)}">
            ${already ? Icon.check(13) + '<span>Set as goal</span>'
                      : Icon.plus(13)  + '<span>Set as goal</span>'}
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.card').forEach(card => {
    card.onclick = e => {
      if (e.target.closest('[data-add]')) return;
      openItemModal(card.dataset.itemU);
    };
  });

  el.querySelectorAll('[data-add]').forEach(b => {
    b.onclick = async e => {
      e.stopPropagation();
      const res = await window.api.addGoal(b.dataset.add, b.dataset.name);
      if (res.ok) render(res.data);
    };
  });
}

/* Aufgeklappt oder nicht - und zwar ueber ein Neuzeichnen hinweg.
   Ein Ziel zu setzen baut das ganze Dashboard neu auf; wuerde der Zustand
   dabei zuruecksetzen, saesse man nach jedem Klick wieder vor acht Karten
   und muesste sich die Stelle neu suchen, an der man war. */
let easyGainsOpen = false;

/**
 * "Cheap to pick up" mit Aufklapper.
 *
 * Der Hauptprozess schickt EINE Liste, in der die ersten easyGainsTop
 * Eintraege die eigentliche Empfehlung sind - hier wird nur geschnitten.
 * Damit bleibt die Reihenfolge in beiden Zustaenden dieselbe: aufklappen
 * haengt an, es sortiert nicht um.
 */
function renderEasyGains(data) {
  const alle = data.easyGains || [];
  const oben = data.easyGainsTop || 8;
  const rest = Math.max(0, alle.length - oben);

  renderCards('easy-gains', easyGainsOpen ? alle : alle.slice(0, oben));

  const btn = $('btn-easy-more');
  if (!btn) return;

  /* Ohne Nachschub kein Knopf. "Show 0 more" waere ein Versprechen, hinter
     dem nichts steht. */
  btn.classList.toggle('hidden', rest === 0);
  if (rest === 0) return;

  btn.setAttribute('aria-expanded', String(easyGainsOpen));
  $('btn-easy-more-label').textContent = easyGainsOpen ? 'Show fewer' : `Show ${rest} more`;
}

const CAT_ICONS = {
  Suits: 'catWarframe',
  SpaceSuits: 'catArchwing',
  MechSuits: 'catNecramech',
  Sentinels: 'catCompanion',
  KubrowPets: 'catCompanion',
  KDrive: 'catArchwing',
  Plexus: 'catWarframe',
  LongGuns: 'catPrimary',
  Pistols: 'catSecondary',
  Melee: 'catMelee',
  SpaceGuns: 'catPrimary',
  SpaceMelee: 'catMelee',
  SentinelWeapons: 'catCompanion',
  AmpPrism: 'catAmp',
  ZawStrike: 'catMelee',
  KitgunChamber: 'catSecondary'
};

function renderCategories(cats) {
  $('categories').innerHTML = cats.map(c => {
    const pct = c.total ? (c.done / c.total * 100) : 0;
    const icKey = CAT_ICONS[c.category] || 'catWarframe';
    const ic = Icon[icKey] ? Icon[icKey](16) : '';
    return `<div class="catrow">
      <span class="cat-label-wrap">${ic}<span>${esc(c.label)}</span></span>
      <div class="catbar"><div style="width:${pct.toFixed(1)}%"></div></div>
      <span class="catnum">${c.done} / ${c.total}</span>
      <span class="catgain">${nf(c.gain)} left</span>
    </div>`;
  }).join('');
}

/* ---------------- Ziele ---------------- */
function renderGoals(data) {
  const el = $('goals');
  if (!el) return;

  if (!data.goals || !data.goals.length) {
    el.innerHTML = '<div class="empty">No goals set yet. Switch to <b>Catalogue</b> or <b>Inventory</b> above, pick an item, mod or arcane and click <b>Set as goal</b>.</div>';
    /* Ohne Ziele ist dieser Hinweis der einzige Wegweiser - der darf nicht
       hinter einem zugeklappten Abschnitt verschwinden. */
    setGoalDetailsOpen(true);
    if ($('shopping')) $('shopping').classList.add('hidden');
    if (checklistCache.length) drawChecklist();
    return;
  }

  el.innerHTML = data.goals.map(g => {
    const isLevel = g.owned || g.kind === 'level';
    const isArcane = g.upgradeKind === 'arcane';
    const progressPct = isArcane
      ? Math.min(100, ((g.ownedCopies || 0) / (g.copiesToMax || 21)) * 100).toFixed(1)
      : (g.maxLvl ? Math.min(100, (g.rank / g.maxLvl) * 100).toFixed(1) : 0);

    const subText = g.isUpgrade
      ? (isLevel
          ? (isArcane
              ? `<span>In inventory</span> · <span>Rank ${g.rank}/${g.maxLvl}</span> · <span>${g.ownedCopies || 0}/${g.copiesToMax || 21} copies</span>`
              : `<span>In inventory</span> · <span>Rank ${g.rank}/${g.maxLvl}</span>${g.ranksLeft > 0 ? ` · <span>${g.ranksLeft} ranks to max</span>` : ' · <span>Maxed</span>'}`)
          : `<span>${esc(g.compat ? g.compat + ' · ' : '')}${esc(g.rarityLabel || '')} ${isArcane ? 'Arcane' : 'Mod'}</span>`)
      : (isLevel
          ? `<span>In inventory</span> · <span>Rank ${g.rank}/${g.maxLvl}</span>`
          : `<span>${Icon.coin(13)} ${nf(g.credits)}</span> <span>${Icon.clock(13)} ${esc(g.buildTime)}</span>`);

    const dropGroups = g.isUpgrade && !isLevel ? (g.dropSources?.groups || []) : [];

    return `
    <div class="goal ${g.done ? 'done' : ''} ${isLevel ? 'goal-level' : 'goal-farm'}" data-item-u="${esc(g.uniqueName)}">
      <div class="goal-head">
        <img src="${esc(g.image)}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="goal-title-row">
            <h3>${esc(g.name)}</h3>
            <span class="agoal-badge ${isLevel ? 'level' : 'farm'}">
              ${isLevel ? Icon.bolt(12) + ' Rank up' : Icon.target(12) + ' Farm'}
            </span>
          </div>
          <div class="goal-sub">
            ${g.gain > 0 ? `<span class="gain">+${nf(g.gain)} MR XP</span>` : (g.isUpgrade ? `<span class="gain gain-upgrade">${isArcane ? 'Arcane' : 'Mod'}</span>` : '')}
            ${subText}
          </div>
        </div>
        <div class="goal-actions">
          <button class="btn-sm ${g.done ? 'on' : ''}" data-toggle="${esc(g.uniqueName)}">
            ${Icon.check(13)}<span>${g.done ? 'Done' : 'Mark done'}</span>
          </button>
          <button class="btn-sm danger" data-remove="${esc(g.uniqueName)}">
            ${Icon.trash(13)}<span>Entfernen</span>
          </button>
        </div>
      </div>
      <div class="goal-body">
        ${isLevel ? `
          <div class="goal-level-box">
            <div class="level-box-head">
              <span>Current rank: <b>${g.rank} / ${g.maxLvl}</b>${isArcane ? ` (${g.ownedCopies || 0}/${g.copiesToMax || 21} copies)` : ''}</span>
              <span><b>${isArcane ? `${Math.max(0, (g.copiesToMax || 21) - (g.ownedCopies || 0))} more copies` : `${g.ranksLeft} more ${g.ranksLeft === 1 ? 'rank' : 'ranks'}`}</b> to max (${progressPct}%)</span>
            </div>
            <div class="level-track"><div class="level-fill" style="width: ${progressPct}%"></div></div>
          </div>
        ` : (g.isUpgrade ? `
          <div class="goal-section-label">Where do I get this?</div>
          ${dropGroups.length ? `
            <div class="goal-sources-list">
              ${dropGroups.slice(0, 3).map(grp => `
                <div class="up-src-group">
                  <div class="up-src-head">${esc(grp.label)}</div>
                  ${grp.entries.slice(0, 4).map(e => `
                    <div class="up-src-row">
                      <span class="up-src-place">${esc(e.place)}</span>
                      ${e.detail ? `<span class="up-src-detail">${esc(e.detail)}</span>` : ''}
                      ${e.chanceText ? `<span class="up-src-chance">${esc(e.chanceText)}</span>` : ''}
                    </div>`).join('')}
                  ${grp.hidden ? `<div class="up-src-more">… and ${nf(grp.hidden)} more</div>` : ''}
                </div>`).join('')}
            </div>` : '<div class="up-empty">No drop locations found in official drop tables. Click card to open data sheet or look up in wiki.</div>'}
        ` : `
          ${g.components && g.components.length > 0 ? `
            <div class="goal-section-label">Required parts & components</div>
            <div class="goal-comps-grid">
              ${g.components.map(c => `
                <div class="goal-comp-item ${c.isSubRecipe ? 'craftable' : ''} ${Stock.cls(c)}"
                     title="${esc(Stock.hint(c, c.name, nf))}">
                  <img class="mat-icon" src="${esc(c.image)}" alt="" onerror="this.style.display='none'">
                  <div class="goal-comp-body">
                    <b>${esc(c.name)}</b>
                    <span>${c.isSubRecipe ? 'Forged' : 'Resource / part'}</span>
                  </div>
                  ${Stock.forge(c)}
                  <span class="goal-comp-count">${Stock.num(c, nf)}x</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${g.materials && g.materials.length > 0 ? `
            <div class="goal-section-label" style="margin-top: ${g.components && g.components.length > 0 ? '14px' : '0'};">Total resources & materials</div>
            <div class="matgrid">
              ${g.materials.map(mt => `
                <div class="mat ${Stock.cls(mt)}" title="${esc(Stock.hint(mt, mt.name, nf))}">
                  ${mt.image ? `<img class="mat-icon" src="${esc(mt.image)}" alt="" onerror="this.style.display='none'">` : ''}
                  <span>${esc(mt.name)}</span>
                  ${Stock.forge(mt)}
                  <b>${Stock.num(mt, nf)}</b>
                </div>`).join('')}
            </div>
          ` : ''}
        `)}
        <textarea class="goal-note" data-note="${esc(g.uniqueName)}"
          placeholder="A note on this goal …">${esc(g.note)}</textarea>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.goal-head').forEach(gh => {
    gh.style.cursor = 'pointer';
    gh.onclick = e => {
      if (e.target.closest('[data-toggle]') || e.target.closest('[data-remove]')) return;
      const gEl = gh.closest('.goal');
      if (!gEl || !gEl.dataset.itemU) return;
      const u = gEl.dataset.itemU;
      const g = data.goals?.find(x => x.uniqueName === u);
      if (g?.isUpgrade) {
        openUpgradeModal({
          uniqueName: g.uniqueName,
          name: g.name,
          count: g.ownedCount || 0,
          ranks: g.ownedRanks || [],
          maxRank: g.rank ?? null,
          resolved: true
        });
      } else {
        openItemModal(u);
      }
    };
  });

  el.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const r = await window.api.toggleGoal(b.dataset.toggle); if (r.ok) render(r.data);
  });
  el.querySelectorAll('[data-remove]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const r = await window.api.removeGoal(b.dataset.remove); if (r.ok) render(r.data);
  });
  el.querySelectorAll('[data-note]').forEach(t => {
    let timer;
    t.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.api.setNote(t.dataset.note, t.value), 600);
    };
  });

  const s = data.shopping;
  if (s && s.materials && s.materials.length) {
    $('shopping').classList.remove('hidden');
    $('shop-credits').textContent = nf(s.credits);
    $('shop-time').textContent    = s.buildTime;
    $('shopping-mats').innerHTML  = s.materials
      .map(mt => `
        <div class="mat ${Stock.cls(mt)}" title="${esc(Stock.hint(mt, mt.name, nf))}">
          ${mt.image ? `<img class="mat-icon" src="${esc(mt.image)}" alt="" onerror="this.style.display='none'">` : ''}
          <span>${esc(mt.name)}</span>
          ${Stock.forge(mt)}
          <b>${Stock.num(mt, nf)}</b>
        </div>`).join('');
  } else {
    $('shopping').classList.add('hidden');
  }

  if (checklistCache.length) drawChecklist();
}

/* ---------------- Zielsuche (optional) ---------------- */
if ($('goal-search')) {
  let searchTimer;
  $('goal-search').oninput = e => {
    clearTimeout(searchTimer);
    const q = e.target.value;
    searchTimer = setTimeout(async () => {
      const results = await window.api.searchItems(q);
      const box = $('goal-results');
      if (!box) return;
      if (!results.length) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      box.innerHTML = results.map(r => `
        <div class="result" data-u="${esc(r.uniqueName)}" data-n="${esc(r.name)}">
          <img src="${esc(r.image)}" alt="" onerror="this.style.visibility='hidden'">
          <span>${esc(r.name)}</span>
          <span class="result-meta">${esc(r.label)} · ${r.status === 'done' ? 'Mastered' : '+' + nf(r.gain)}</span>
        </div>`).join('');
      box.querySelectorAll('.result').forEach(row => row.onclick = () => {
        openItemModal(row.dataset.u);
        $('goal-search').value = '';
        box.classList.add('hidden');
      });
    }, 220);
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('.searchbox') && $('goal-results')) $('goal-results').classList.add('hidden');
  });
}

/* ---------------- Builds ----------------

   ZWEI ANSICHTEN IN EINEM TAB.

   Das ARSENAL zeigt jedes Item, zu dem ein Build existiert, als Kachel mit
   seiner Illustration - so, wie das Spiel sein Regal zeigt. Ein Klick oeffnet
   die DETAILANSICHT: das Item gross auf der Buehne, darunter seine Builds als
   Reiter und das Mod-Brett des aktiven.

   WARUM NICHT MEHR EIN BUILD PRO TAB: Wer drei Fassungen fuer einen Frame und je
   eine fuer vier Waffen gebaut hat, will nicht durch ein Modal blaettern, um zu
   sehen, was er ueberhaupt besitzt. Die Kacheln beantworten das ohne Klick, und
   mehrere Builds desselben Items liegen dort beieinander, wo sie hingehoeren -
   unter dem Item.

   Die Mods im Brett sind dieselben gezeichneten Karten wie im Inventar - und
   verhalten sich auch so: zugeklappt steht nur der Name da, beim Zeigen faehrt
   die Karte auf. Nur so passen alle zehn Plaetze auf ein Bild, statt dass man
   an einem Brett aus aufgeschlagenen Karten scrollen muss.

   BESITZ WIRD NICHT MEHR ANGEHAKT. Solange eine Inventardatei vorliegt, weiss
   die App selbst, welche Mods da sind und auf welchem Rang. Die Haken von Hand
   bleiben nur als Rueckfallebene fuer den Fall, dass noch nie ein Inventar
   geholt wurde.
   -------------------------------------------------------------------- */

let buildData = null;       // letzte Antwort von builds:get
let activeItem = null;      // welches Item offen ist - null heisst: Arsenal
let activeBuildId = null;   // welcher Build dieses Items auf der Buehne liegt
let buildsRestored = false; // gemerkte Auswahl nur EINMAL aufgreifen

/* Der Tab soll beim naechsten Start dort weitermachen, wo man aufgehoert hat.
   Das ist Zustand der Oberflaeche, keine Nutzdaten - deshalb localStorage und
   nicht die Datei mit den Builds. Faellt der Speicher aus, ist es auch recht:
   dann steht eben wieder das Arsenal offen. */
const LAST_BUILD_KEY = 'argus.builds.active';
const LAST_ITEM_KEY  = 'argus.builds.item';

const remember = (key, value) => {
  try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); }
  catch { /* kein Speicher - dann eben nicht */ }
};
const recall = key => {
  try { return localStorage.getItem(key); } catch { return null; }
};

/**
 * Der Aufbau des Bretts je Item-Art - so, wie das Spiel ihn zeigt.
 *
 * `special` sind die Sonderplaetze ueber dem Raster: [Slot-Index, Beschriftung,
 * Rasterspalte]. `normal` ist die Zahl der gewoehnlichen Plaetze. Was ein Item
 * gar nicht hat, wird nicht gezeigt - AUSSER es ist belegt: importierte Builds
 * kennen unsere Aufteilung nicht, und eine verschluckte Mod waere schlimmer
 * als ein Platz zu viel.
 */
const BOARD_LAYOUTS = {
  Suits:           { special: [[8, 'Aura', 1], [9, 'Exilus', 4]],   normal: 8 },
  SpaceSuits:      { special: [[8, 'Aura', 1], [9, 'Exilus', 4]],   normal: 8 },
  MechSuits:       { special: [[8, 'Aura', 1], [9, 'Exilus', 4]],   normal: 8 },
  Melee:           { special: [[8, 'Stance', 1], [9, 'Exilus', 4]], normal: 8 },
  SpaceMelee:      { special: [[8, 'Stance', 1], [9, 'Exilus', 4]], normal: 8 },
  LongGuns:        { special: [[9, 'Exilus', 4]], normal: 8 },
  Pistols:         { special: [[9, 'Exilus', 4]], normal: 8 },
  SpaceGuns:       { special: [[9, 'Exilus', 4]], normal: 8 },
  SentinelWeapons: { special: [[9, 'Exilus', 4]], normal: 8 },
  Sentinels:       { special: [], normal: 10 },   // Begleiter: zehn gleichwertige Plaetze
  KubrowPets:      { special: [], normal: 10 }
};
const DEFAULT_LAYOUT = { special: [[8, 'Aura', 1], [9, 'Exilus', 4]], normal: 8 };

const boardLayout = category => BOARD_LAYOUTS[category] || DEFAULT_LAYOUT;

/** Beschriftung eines Platzes - "Aura", "Exilus" oder schlicht die Nummer. */
function slotLabel(category, i) {
  const hit = boardLayout(category).special.find(([idx]) => idx === i);
  return hit ? hit[1] : `Slot ${i + 1}`;
}

/* Warframes, Mechs und Begleiter stehen auf dem Boden, Waffen schweben.
   Das entscheidet, wo die Illustration im Kasten verankert wird. */
const FIGURE_CATEGORIES = new Set(['Suits', 'SpaceSuits', 'MechSuits', 'Sentinels', 'KubrowPets']);
const figureClass = cat => (FIGURE_CATEGORIES.has(cat) ? 'is-figure' : 'is-object');

/* Nicht jedes Item hat beim Bilderdienst eine Illustration - Atlas etwa nicht.
   Statt eines leeren Kastens steht dann das Sinnbild seiner Gattung da. */
const CATEGORY_GLYPH = {
  Suits: 'catWarframe', SpaceSuits: 'catArchwing', MechSuits: 'catNecramech',
  LongGuns: 'catPrimary', SpaceGuns: 'catArchwing',
  Pistols: 'catSecondary',
  Melee: 'catMelee', SpaceMelee: 'catArchwing',
  Sentinels: 'catCompanion', KubrowPets: 'catCompanion', SentinelWeapons: 'catCompanion',
  AmpPrism: 'catAmp'
};
const categoryGlyph = (cat, size) => (Icon[CATEGORY_GLYPH[cat]] || Icon.cube)(size);

/* Reihenfolge im Arsenal - dieselbe wie im Spiel: erst der Frame, dann die drei
   Waffen, dann alles Weitere. Was hier fehlt, haengt sich hinten an. */
const SHELF_ORDER = ['Suits', 'LongGuns', 'Pistols', 'Melee', 'Sentinels', 'KubrowPets',
                     'SentinelWeapons', 'SpaceSuits', 'SpaceGuns', 'SpaceMelee',
                     'MechSuits', 'AmpPrism'];
const shelfRank = cat => {
  const i = SHELF_ORDER.indexOf(cat);
  return i === -1 ? SHELF_ORDER.length : i;
};

async function loadBuilds() {
  const res = await window.api.getBuilds();
  if (res.ok) { buildsLoaded = true; renderBuilds(res.data); }
  else showImportStatus('err', res.error);
}

function showImportStatus(kind, text) {
  const el = $('import-status');
  el.classList.remove('hidden', 'ok', 'err', 'busy');
  el.classList.add(kind);
  const ic = kind === 'err' ? Icon.warning(15) : kind === 'ok' ? Icon.check(15) : Icon.refresh(15);
  el.innerHTML = ic + '<span>' + esc(text) + '</span>';
}

/**
 * Builds nach Item buendeln - das ist die Einheit, die das Arsenal zeigt.
 *
 * Der Schluessel ist der uniqueName des Items; ein Build ohne Item (kaputter
 * Import) bekommt seine eigene Kachel, statt mit anderen zusammenzufallen.
 */
function buildGroups() {
  const map = new Map();

  for (const b of buildData?.builds || []) {
    const key = b.itemUniqueName || b.id;
    if (!map.has(key)) map.set(key, { key, item: b, builds: [] });
    map.get(key).builds.push(b);
  }

  return [...map.values()].sort((a, b) =>
    shelfRank(a.item.category) - shelfRank(b.item.category)
    || (a.item.itemName || '').localeCompare(b.item.itemName || '', 'en'));
}

/** Der Build, der gerade auf der Buehne liegt. */
function activeBuild(group) {
  if (!group) return null;
  return group.builds.find(b => b.id === activeBuildId) || group.builds[0];
}

function openItem(key) {
  activeItem = key;
  activeBuildId = null;
  remember(LAST_ITEM_KEY, key);
  remember(LAST_BUILD_KEY, null);
  renderBuilds(buildData);
  document.querySelector('.main-content')?.scrollTo({ top: 0 });
}

function backToArsenal() {
  activeItem = null;
  activeBuildId = null;
  remember(LAST_ITEM_KEY, null);
  remember(LAST_BUILD_KEY, null);
  renderBuilds(buildData);
}

function selectBuild(id) {
  activeBuildId = id;
  remember(LAST_BUILD_KEY, id);
  renderBuilds(buildData);
}

$('bdetail-back').onclick = backToArsenal;

function renderBuilds(data) {
  if (!data) return;
  buildData = data;
  if ($('build-count')) $('build-count').textContent = data.builds.length;

  const groups = buildGroups();

  /* Beim ersten Zeichnen die gemerkte Auswahl aufgreifen. Danach nicht mehr -
     sonst risse ein "Zurueck" die alte Ansicht wieder auf. */
  if (activeItem === null && !buildsRestored) {
    buildsRestored = true;
    activeItem = recall(LAST_ITEM_KEY);
    activeBuildId = recall(LAST_BUILD_KEY);
  }

  /* Das gemerkte Item kann weg sein - dann faellt die Ansicht zurueck aufs
     Arsenal, statt auf einen Build zu zeigen, den es nicht mehr gibt. */
  const group = groups.find(g => g.key === activeItem) || null;
  if (!group && activeItem) {
    activeItem = null;
    remember(LAST_ITEM_KEY, null);
    remember(LAST_BUILD_KEY, null);
  }
  if (!group) activeBuildId = null;

  const b = activeBuild(group);
  activeBuildId = b ? b.id : null;

  $('build-overview').classList.toggle('hidden', !!group);
  $('build-detail').classList.toggle('hidden', !group);

  if (group) {
    renderStage(group, b);
    renderProfiles(group, b);
    renderBoard(b);
  } else {
    renderShelf(groups);
  }

  renderTotals(data.totals, data.builds);
  renderMissingMods(data);
}

/* ---------------- Ansicht 1: das Arsenal ---------------- */

/**
 * Eine Kachel je Item. Die Illustration fuellt ihren Kopf aus und laeuft nach
 * unten in die Kachel aus - so, wie das Arsenal des Spiels seine Plaetze zeigt.
 *
 * Unter dem Namen steht nur, was ohne Klick beantwortet werden soll: wie viele
 * Fassungen es gibt, und ob noch etwas fehlt. Genau EIN Zustandsabzeichen, sonst
 * liest man drei Zahlen und weiss danach weniger als vorher.
 */
function renderShelf(groups) {
  const shelf = $('build-shelf');

  const intro = groups.length ? '' : `
    <div class="empty shelf-empty">
      No builds yet. Start one below — or paste an overframe.gg URL above and
      let Argus read it in.
    </div>`;

  shelf.innerHTML = intro + groups.map(g => {
    const sum     = pick => g.builds.reduce((n, b) => n + (pick(b) || 0), 0);
    const total   = sum(b => b.mods.total)       + sum(b => b.arcanes?.total);
    const missing = sum(b => b.mods.missing)     + sum(b => b.arcanes?.missing);
    const short   = sum(b => b.mods.underRanked) + sum(b => b.arcanes?.underRanked);
    const forma   = sum(b => b.requirements.forma);

    /* Ein frisch angelegter Build hat nichts, was fehlen koennte - "Ready"
       waere dort eine Luege. */
    const state =
      !total  ? `<span class="bflag">${Icon.plus(11)}empty</span>` :
      missing ? `<span class="bflag warn">${Icon.layers(11)}${missing} missing</span>` :
      short   ? `<span class="bflag half">${Icon.star(11)}${short} to rank up</span>` :
                `<span class="bflag good">${Icon.check(11)}Ready</span>`;

    const flags = state + (forma ? `<span class="bflag">${Icon.bolt(11)}${forma}</span>` : '');

    return `
      <button class="bitem ${figureClass(g.item.category)}" type="button"
              data-item="${esc(g.key)}" title="${esc(g.item.itemName || '')}">
        <span class="bitem-art ${g.item.art ? '' : 'is-blank'}">
          <span class="bitem-glyph">${categoryGlyph(g.item.category, 40)}</span>
          ${g.item.art ? `<img src="${esc(g.item.art)}" alt="" loading="lazy">` : ''}
        </span>
        <span class="bitem-body">
          <span class="bitem-cat">${esc(g.item.categoryLabel || 'Build')}</span>
          <b>${esc(g.item.itemName || g.item.name)}</b>
          <span class="bitem-sub">${g.builds.length === 1
            ? esc(g.builds[0].name)
            : g.builds.length + ' builds'}</span>
          <span class="bitem-flags">${flags}</span>
        </span>
      </button>`;
  }).join('')
  + `<button class="bitem is-new" id="bitem-new" type="button">
       <span class="bitem-art">${Icon.plus(30)}</span>
       <span class="bitem-body">
         <b>New build</b>
         <span class="bitem-sub">Pick a frame, weapon or companion</span>
       </span>
     </button>`;

  shelf.classList.toggle('is-empty', !groups.length);

  shelf.querySelectorAll('[data-item]').forEach(el =>
    el.onclick = () => openItem(el.dataset.item));

  $('bitem-new').onclick = () => openItemPicker();

  /* Fehlt die Illustration, tritt das Gattungssinnbild an ihre Stelle - ein
     ausgeblendetes Bild liesse nur ein leeres Rechteck zurueck. */
  onImageFail(shelf, '.bitem-art img', img => {
    img.closest('.bitem-art')?.classList.add('is-blank');
    img.remove();
  });
}

/* ---------------- Ansicht 2: die Buehne ---------------- */

function renderStage(group, b) {
  const slot = $('bstage-slot');
  const art  = $('bstage-art');

  slot.classList.remove('is-figure', 'is-object');
  slot.classList.add(figureClass(group.item.category));
  $('bstage-caption').textContent = group.item.categoryLabel || 'Build';

  /* Dasselbe Sinnbild wie auf der Kachel, falls der Bilderdienst dieses Item
     nicht fuehrt - der grosse Kasten waere sonst schlicht leer. */
  $('bstage-glyph').innerHTML = categoryGlyph(group.item.category, 76);
  slot.classList.remove('is-blank');

  if (group.item.art) {
    art.hidden = false;
    art.src = group.item.art;
    art.alt = group.item.itemName || '';
    onImageFail(slot, '#bstage-art', img => { img.hidden = true; slot.classList.add('is-blank'); });
  } else {
    art.hidden = true;
    art.removeAttribute('src');
    slot.classList.add('is-blank');
  }

  $('bstage-main').innerHTML = stageInfo(group, b);
  wireStage(b);
}

function stageInfo(group, b) {
  const pct = Math.min(100, Math.max(0, b.used / b.capacity * 100));
  const r = b.requirements;

  /* Ueber dem Item-Namen steht, WELCHE Fassung offen liegt - bei nur einer
     waere die Zaehlung Unsinn, dort steht stattdessen die Herkunft. */
  const lead = group.builds.length > 1
    ? `Build ${group.builds.indexOf(b) + 1} of ${group.builds.length}`
    : (b.author ? 'Overframe import' : 'Your build');

  const arc = b.arcanes || { total: 0 };

  const chips = [
    [Icon.layers(13), `${b.mods.owned} / ${b.mods.total} mods owned`, b.mods.missing ? 'warn' : 'good'],
    arc.total ? [Icon.gem(13), `${arc.owned} / ${arc.total} arcanes owned`,
                 arc.missing ? 'warn' : 'good'] : null,
    b.mods.underRanked + (arc.underRanked || 0)
      ? [Icon.star(13), `${b.mods.underRanked + (arc.underRanked || 0)} not ranked up yet`, 'half'] : null,
    r.forma      ? [Icon.bolt(13), `${r.forma} Forma`,                ''] : null,
    r.auraForma  ? [Icon.star(13), `${r.auraForma} Aura Forma`,       ''] : null,
    r.umbraForma ? [Icon.star(13), `${r.umbraForma} Umbra Forma`,     ''] : null,
    r.endo       ? [Icon.coin(13), `${nf(r.endo)} Endo${r.endoEstimated ? ' (est.)' : ''}`, ''] : null,
    [Icon.cube(13), r.orokinLabel, '']
  ].filter(Boolean);

  return `
    <div class="bstage-top">
      <div class="bstage-id">
        <span class="bstage-cat">${esc(lead)}</span>
        <h2>${esc(group.item.itemName)}</h2>
        <input id="bstage-name" class="bstage-name" value="${esc(b.name)}"
               spellcheck="false" title="Rename this build">
        ${b.author ? `<span class="bstage-by">from Overframe · by ${esc(b.author)}</span>` : ''}
      </div>
      <div class="bstage-actions">
        <button id="bstage-del" class="btn-sm danger">${Icon.trash(13)}<span>Remove</span></button>
      </div>
    </div>

    <div class="bstage-cap">
      <div class="capbar-track">
        <div class="capbar-fill ${b.overCapacity ? 'over' : ''}" style="width:${pct}%"></div>
      </div>
      <div class="capbar-label">
        <span>Capacity <b>${b.used}</b> / ${b.capacity}</span>
        <span class="${b.overCapacity ? 'is-over' : ''}">
          ${b.overCapacity ? 'Over by ' + (b.used - b.capacity) : b.free + ' free'}
        </span>
      </div>
    </div>

    <div class="bstage-chips">
      ${chips.map(([ic, text, tone]) => `<span class="bchip ${tone}">${ic}${esc(text)}</span>`).join('')}
    </div>`;
}

/**
 * Zweistufiges Loeschen.
 *
 * In einem Build steckt Arbeit - zehn Karten mit Raengen und Polaritaeten -,
 * und beide Loeschknoepfe liegen dort, wo man ohnehin klickt: auf der Buehne
 * und auf dem Reiter. Der erste Klick bewaffnet nur, der zweite loescht; nach
 * drei Sekunden entschaerft sich der Knopf von selbst.
 */
function armDelete(btn, armedHtml, run) {
  const idle = btn.innerHTML;
  let armed = false;
  let timer;

  const reset = () => {
    armed = false;
    clearTimeout(timer);
    btn.classList.remove('armed');
    btn.innerHTML = idle;
  };

  btn.onclick = e => {
    e.stopPropagation();
    if (armed) { reset(); run(); return; }
    armed = true;
    btn.classList.add('armed');
    btn.innerHTML = armedHtml;
    timer = setTimeout(reset, 3000);
  };
}

function wireStage(b) {
  armDelete($('bstage-del'), Icon.trash(13) + '<span>Sure?</span>', async () => {
    const r = await window.api.removeBuild(b.id);
    if (!r.ok) return;
    activeBuildId = null;
    remember(LAST_BUILD_KEY, null);
    renderBuilds(r.data);
  });

  // Umbenennen beim Verlassen des Feldes - kein Speichern-Knopf noetig.
  const name = $('bstage-name');
  const commit = async () => {
    const value = name.value.trim();
    if (!value || value === b.name) { name.value = b.name; return; }
    const r = await window.api.setBuildMeta(b.id, { name: value });
    if (r.ok) renderBuilds(r.data);
  };
  name.onblur = commit;
  name.onkeydown = e => {
    if (e.key === 'Enter') name.blur();
    if (e.key === 'Escape') { name.value = b.name; name.blur(); }
  };
}

/* ---------------- Die Fassungen eines Items ---------------- */

/**
 * Ein Reiter je Build desselben Items - plus einer, der eine weitere Fassung
 * anlegt. Die Reihe steht auch bei nur einem Build da: sie ist der Ort, an dem
 * man den zweiten baut, und der muss sichtbar sein.
 */
function renderProfiles(group, active) {
  const wrap = $('build-profiles');
  wrap.classList.remove('hidden');

  wrap.innerHTML = group.builds.map(b => `
    <div class="bprofile ${b.id === active.id ? 'on' : ''}" data-build="${esc(b.id)}"
         role="button" tabindex="0">
      <b>${esc(b.name)}</b>
      <small>
        ${b.mods.total} mods
        ${b.mods.missing ? `· <span class="is-warn">${b.mods.missing} missing</span>` : ''}
        ${b.requirements.forma ? `· ${b.requirements.forma} Forma` : ''}
      </small>
      <button class="bprofile-del" type="button" data-del="${esc(b.id)}"
              title="Remove this build">${Icon.trash(12)}</button>
    </div>`).join('')
    + `<button class="bprofile is-new" id="bprofile-new" type="button"
               title="Another build for ${esc(group.item.itemName || '')}">
         ${Icon.plus(15)}<span>Another build</span>
       </button>`;

  wrap.querySelectorAll('[data-build]').forEach(el => {
    const pick = () => selectBuild(el.dataset.build);
    el.onclick = pick;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  });

  wrap.querySelectorAll('[data-del]').forEach(btn =>
    armDelete(btn, Icon.check(12), async () => {
      const r = await window.api.removeBuild(btn.dataset.del);
      if (!r.ok) return;
      activeBuildId = null;
      remember(LAST_BUILD_KEY, null);
      renderBuilds(r.data);
    }));

  $('bprofile-new').onclick = () =>
    createBuildFor(group.item.itemUniqueName, group.item.itemName);
}

/** Weitere Fassung fuer ein Item, das schon im Arsenal steht - ohne Umweg. */
async function createBuildFor(itemUniqueName, itemName) {
  const n = (buildData?.builds || []).filter(b => b.itemUniqueName === itemUniqueName).length + 1;
  const res = await window.api.createBuild(itemUniqueName, `${itemName} Build ${n}`);
  if (!res.ok) { showImportStatus('err', res.error); return; }
  if (res.id) { activeBuildId = res.id; remember(LAST_BUILD_KEY, res.id); }
  renderBuilds(res.data);
}

/* ---------------- Das Mod-Brett ---------------- */

function renderBoard(b) {
  const board = $('build-board');
  if (!b) { board.classList.add('hidden'); board.innerHTML = ''; return; }
  board.classList.remove('hidden');

  const layout = boardLayout(b.category);
  const special = new Set(layout.special.map(([i]) => i));

  /* Zehn gleichwertige Plaetze (Begleiter) stehen als 5x2, alles andere als
     4x2 - so, wie das Spiel sie anordnet. */
  board.style.setProperty('--cols', layout.normal === 10 ? 5 : 4);

  const normal = [];
  for (let i = 0; i < Math.max(layout.normal, b.slots.length); i++) {
    if (special.has(i)) continue;
    if (i < layout.normal || b.slots[i]) normal.push(i);
  }

  const arcanes = b.arcaneSlots || [];

  board.innerHTML = `
    ${layout.special.length ? `
      <div class="board-special">
        ${layout.special.map(([i, kind, col]) => boardCell(b, i, kind, col)).join('')}
      </div>` : ''}
    <div class="board-grid">
      ${normal.map(i => boardCell(b, i, null, null)).join('')}
    </div>
    ${arcanes.length ? `
      <div class="board-arcanes">
        <span class="board-arcanes-label">Arcanes</span>
        <div class="arcane-row">
          ${arcanes.map((_, i) => arcaneCell(b, i)).join('')}
        </div>
      </div>` : ''}`;

  board.querySelectorAll('[data-slot]').forEach(cell => {
    cell.querySelector('.bslot-card').onclick = () =>
      openSlotEditor(b.id, Number(cell.dataset.slot), b);
  });

  board.querySelectorAll('[data-arcane]').forEach(cell => {
    cell.querySelector('.aslot-card').onclick = () =>
      openArcaneEditor(b.id, Number(cell.dataset.arcane), b);
  });

  onImageFail(board, '.mod-art img', img => { img.style.visibility = 'hidden'; });
  onImageFail(board, '.aslot-art img', img => { img.style.visibility = 'hidden'; });
}

/**
 * Ein Arcane-Platz.
 *
 * Bewusst NICHT als Mod-Karte gezeichnet: ein Arcane ist im Spiel kein
 * Kartenblatt, sondern ein Gefaess - quer, ohne Rahmen, mit dem Namen darunter.
 * Genauso steht es im Inventar, und genauso soll es hier stehen.
 */
function arcaneCell(b, i) {
  const a = (b.arcaneSlots || [])[i];
  const head = `<span class="bslot-kind">Arcane ${i + 1}</span>`;

  if (!a) {
    return `
      <div class="aslot is-empty" data-arcane="${i}">
        <div class="bslot-head">${head}</div>
        <div class="aslot-card" title="Choose an arcane">
          <div class="aslot-blank">${Icon.plus(18)}<span>Arcane</span></div>
        </div>
        <div class="bslot-foot"></div>
      </div>`;
  }

  if (a.unknown) {
    return `
      <div class="aslot is-unknown" data-arcane="${i}">
        <div class="bslot-head">${head}</div>
        <div class="aslot-card" title="No catalogue entry for this arcane">
          <div class="aslot-blank">${Icon.warning(18)}<span>Unmatched</span></div>
        </div>
        <div class="bslot-foot"></div>
      </div>`;
  }

  const state = !a.owned ? 'is-missing' : a.underRanked ? 'is-short' : 'is-owned';
  const tag = !a.owned
    ? '<span class="bslot-tag missing">missing</span>'
    : a.underRanked
      ? `<span class="bslot-tag short" title="You own it at rank ${a.ownedRank}">rank ${a.ownedRank}</span>`
      : `<span class="bslot-tag owned">${Icon.check(11)}</span>`;

  return `
    <div class="aslot ${state}" data-arcane="${i}">
      <div class="bslot-head">${head}</div>
      <div class="aslot-card" title="${esc(a.stats.join(' · '))}">
        <span class="aslot-art"><img src="${esc(a.image)}" alt="" loading="lazy"></span>
        <b>${esc(a.name)}</b>
        <span class="aslot-pips">
          ${Array.from({ length: a.maxRank }, (_, p) =>
            `<i class="${p < a.rank ? 'on' : ''}">★</i>`).join('')}
        </span>
      </div>
      <div class="bslot-foot">
        <span class="bslot-rank">${a.rank}/${a.maxRank}</span>
        ${tag}
      </div>
    </div>`;
}

/**
 * Ein Platz im Brett: Beschriftung, Karte, Fussnote.
 *
 * Die Karte liegt in einem gewoehnlichen .mod-slot, nicht in .mod-slot.is-open -
 * sie ist also zugeklappt und faehrt erst beim Zeigen auf. Zehn aufgeschlagene
 * Karten passen auf kein Bild; zehn zugeklappte schon, und das Aufklappen
 * beantwortet die Frage nach der Wirkung genau dann, wenn sie gestellt wird.
 */
function boardCell(b, i, kind, col) {
  const s = b.slots[i];
  const style = col ? ` style="grid-column:${col}"` : '';
  const head = `<span class="bslot-kind">${esc(kind || String(i + 1))}</span>`;

  if (!s) {
    return `
      <div class="bslot is-empty"${style} data-slot="${i}">
        <div class="bslot-head">${head}</div>
        <div class="bslot-card" title="Choose a mod">
          <div class="bslot-blank">
            ${Icon.plus(18)}
            <span>${esc(kind || 'Mod')}</span>
          </div>
        </div>
        <div class="bslot-foot"></div>
      </div>`;
  }

  if (s.unknown) {
    return `
      <div class="bslot is-unknown"${style} data-slot="${i}">
        <div class="bslot-head">${head}</div>
        <div class="bslot-card" title="No catalogue entry for this mod">
          <div class="bslot-blank">
            ${Icon.warning(18)}
            <span>Unmatched</span>
          </div>
        </div>
        <div class="bslot-foot"></div>
      </div>`;
  }

  const card = modCardHtml({
    name: s.name,
    art: s.art,
    stats: s.stats,
    compat: s.compat,
    // Auras GEBEN Kapazitaet - auf der Karte steht der Bonus, nicht das Minus.
    drain: s.isAura ? Math.abs(s.drain) : s.drain,
    isAura: s.isAura,
    polarity: s.modPolarityGlyph ? { glyph: s.modPolarityGlyph } : null,
    rarity: s.rarity,
    pips: s.pips,
    rank: s.rank
  });

  /* Drei Zustaende statt zwei: da, da-aber-zu-niedrig, gar nicht da. Den
     mittleren gibt es erst, seit der Rang aus dem Inventar kommt. */
  const state = !s.owned ? 'is-missing' : s.underRanked ? 'is-short' : 'is-owned';
  const tag = !s.owned
    ? '<span class="bslot-tag missing">missing</span>'
    : s.underRanked
      ? `<span class="bslot-tag short" title="You own it at rank ${s.ownedRank}">rank ${s.ownedRank}</span>`
      : `<span class="bslot-tag owned">${Icon.check(11)}</span>`;

  return `
    <div class="bslot ${state}"${style} data-slot="${i}">
      <div class="bslot-head">
        ${head}
        ${s.polarityGlyph ? `
          <span class="bslot-pol" title="Polarised: ${esc(s.polarityLabel || '')}">
            ${Icon.polarity(s.polarityGlyph, 12)}
          </span>` : ''}
      </div>
      <div class="bslot-card" title="Edit this slot">
        <div class="mod-slot">${card}</div>
      </div>
      <div class="bslot-foot">
        <span class="bslot-rank">${s.rank}/${s.maxRank}</span>
        ${tag}
      </div>
    </div>`;
}

/* ---------------- Overframe-Import ---------------- */

$('btn-import').onclick = async () => {
  const input = $('build-url').value.trim();
  if (!input) return;
  const btn = $('btn-import');
  btn.disabled = true;
  showImportStatus('busy', 'Loading the build from Overframe … this can take a moment.');

  const res = await window.api.importBuild(input);
  btn.disabled = false;

  if (!res.ok) { showImportStatus('err', res.error); return; }

  let msg = 'Build imported.';
  if (res.note) msg += ' ' + res.note + '.';
  if (res.unresolved) {
    msg += ` ${res.unresolved} entries could not be matched `
         + '(usually arcanes — they are not in the mod catalogue).';
  }
  showImportStatus('ok', msg);
  $('build-url').value = '';

  /* Direkt aufschlagen: der Import ist erst dann fertig, wenn man sieht, was
     angekommen ist - und was davon fehlt. */
  const fresh = (res.data?.builds || []).find(b => b.id === res.id);
  if (fresh) {
    activeBuildId = fresh.id;
    remember(LAST_BUILD_KEY, fresh.id);
    activeItem = fresh.itemUniqueName || fresh.id;
    remember(LAST_ITEM_KEY, activeItem);
  }
  renderBuilds(res.data);
};

$('build-url').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-import').click(); });

/* ---------------- Item-Auswahl fuer einen neuen Build ---------------- */

let BUILD_CATS = [];
let itemCat = 'Suits';          // Warframes zuerst - damit steht das Regal sofort voll

async function openItemPicker() {
  $('build-item-modal').classList.remove('hidden');
  $('newbuild-item').value = '';

  if (!BUILD_CATS.length) BUILD_CATS = await window.api.buildCategories();
  renderItemCats();
  loadPickerItems();
  $('newbuild-item').focus();
}
const closeItemPicker = () => $('build-item-modal').classList.add('hidden');

$('build-item-close').onclick = closeItemPicker;
$('build-item-modal').addEventListener('click', e => {
  if (e.target.id === 'build-item-modal') closeItemPicker();
});

function renderItemCats() {
  // "All" sucht ueber alle Kategorien - ohne Suchwort bleibt es dort leer.
  const cats = [{ key: null, label: 'All', icon: 'search' }, ...BUILD_CATS];

  $('build-item-cats').innerHTML = cats.map(c => `
    <button class="icat ${c.key === itemCat ? 'on' : ''}" type="button"
            data-cat="${esc(c.key || '')}">
      ${Icon[c.icon] ? Icon[c.icon](15) : ''}<span>${esc(c.label)}</span>
    </button>`).join('');

  $('build-item-cats').querySelectorAll('[data-cat]').forEach(btn => btn.onclick = () => {
    itemCat = btn.dataset.cat || null;
    renderItemCats();
    loadPickerItems();
  });
}

let pickerTimer;
$('newbuild-item').oninput = () => {
  clearTimeout(pickerTimer);
  pickerTimer = setTimeout(loadPickerItems, 200);
};

async function loadPickerItems() {
  const q = $('newbuild-item').value.trim();
  const box = $('newbuild-results');

  if (!itemCat && q.length < 2) {
    box.innerHTML = '<div class="empty">Type at least two letters, or pick a category above.</div>';
    return;
  }

  const results = await window.api.itemsForBuild(q, itemCat);
  if (!results.length) {
    box.innerHTML = '<div class="empty">Nothing found.</div>';
    return;
  }

  box.innerHTML = results.map(r => `
    <button class="itile ${figureClass(r.category)}" type="button"
            data-item="${esc(r.uniqueName)}" data-name="${esc(r.name)}">
      <span class="itile-art"><img src="${esc(r.image)}" alt="" loading="lazy"></span>
      <b>${esc(r.name)}</b>
      <small>${esc(r.label)}</small>
    </button>`).join('');

  onImageFail(box, '.itile img', img => { img.style.visibility = 'hidden'; });

  box.querySelectorAll('[data-item]').forEach(tile => tile.onclick = async () => {
    tile.disabled = true;
    const res = await window.api.createBuild(tile.dataset.item, `${tile.dataset.name} Build`);
    if (!res.ok) { showImportStatus('err', res.error); return; }

    /* Ein frisch angelegter Build ist leer - er will sofort befuellt werden,
       nicht erst im Arsenal wiedergefunden. */
    if (res.id) { activeBuildId = res.id; remember(LAST_BUILD_KEY, res.id); }
    activeItem = tile.dataset.item;
    remember(LAST_ITEM_KEY, activeItem);

    renderBuilds(res.data);
    closeItemPicker();
  });
}

/* ---------------- Slot-Editor ---------------- */
const editor = { buildId: null, slotIndex: null, mod: null, rank: 0, polarity: null, itemUniqueName: null };
let POLARITY_LIST = [];

async function openSlotEditor(buildId, slotIndex, build) {
  editor.buildId = buildId;
  editor.slotIndex = slotIndex;
  editor.itemUniqueName = build.itemUniqueName;
  editor.mod = null; editor.rank = 0; editor.polarity = null;

  if (!POLARITY_LIST.length) POLARITY_LIST = await window.api.getPolarities();

  const existing = build.slots[slotIndex];
  $('slot-modal-title').textContent = slotLabel(build.category, slotIndex);
  $('slot-modal-sub').textContent = build.itemName + ' · ' + build.name;
  $('modsearch').value = '';
  $('modsearch-results').innerHTML = '';
  $('slot-config').classList.add('hidden');
  $('slot-modal').classList.remove('hidden');

  /* Die Polaritaet des Platzes steht von Anfang an da - auch ohne gewaehlte
     Mod. Sie beschreibt den Platz, nicht die Karte darin. */
  editor.polarity = existing?.polarity || null;
  renderPolarities();

  $('modsearch').focus();

  // Belegten Slot direkt zum Bearbeiten oeffnen
  if (existing && existing.uniqueName) {
    selectMod({
      uniqueName: existing.uniqueName, name: existing.name,
      maxRank: existing.maxRank, baseDrain: existing.baseDrain,
      polarity: existing.modPolarity, rarityLabel: '', isAura: existing.isAura
    }, existing.rank, existing.polarity);
  }
}

/**
 * Die Polaritaetsreihe.
 *
 * Zeichen statt Buchstaben: im Spiel steht dort das Symbol der Schule, kein
 * "V" oder "D". Die Glyphen liegen bereits in icons.js - dieselben, die auch
 * ueber den Mod-Karten sitzen.
 */
function renderPolarities() {
  const row = $('sc-polarities');

  row.innerHTML =
    `<button class="polbtn ${!editor.polarity ? 'on' : ''}" type="button"
             data-pol="" title="No polarity">${Icon.minus(14)}</button>` +
    POLARITY_LIST.filter(p => !['AP_ANY', 'AP_PRECEPT'].includes(p.key)).map(p =>
      `<button class="polbtn ${editor.polarity === p.key ? 'on' : ''}" type="button"
               data-pol="${esc(p.key)}" title="${esc(p.label)}">
         ${Icon.polarity(p.glyph, 15)}
       </button>`).join('');

  row.querySelectorAll('.polbtn').forEach(b => b.onclick = () => {
    editor.polarity = b.dataset.pol || null;
    row.querySelectorAll('.polbtn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    updateDrainPreview();
  });
}

function closeSlotEditor() { $('slot-modal').classList.add('hidden'); }
$('slot-modal-close').onclick = closeSlotEditor;
$('slot-modal').addEventListener('click', e => { if (e.target.id === 'slot-modal') closeSlotEditor(); });
document.addEventListener('keydown', e => {
  /* Escape schliesst immer nur das oberste Blatt: erst den Slot-Editor, dann
     die Item-Auswahl, zuletzt fuehrt es aus der Detailansicht zurueck ins
     Arsenal. Sonst faellt bei einem Tastendruck die ganze Kette zu. */
  if (e.key !== 'Escape') return;
  if (!$('slot-modal').classList.contains('hidden')) { closeSlotEditor(); return; }
  if (!$('arcane-modal').classList.contains('hidden')) { closeArcaneEditor(); return; }
  if (!$('build-item-modal').classList.contains('hidden')) { closeItemPicker(); return; }
  if (activeItem && $('tab-builds')?.classList.contains('active')) backToArsenal();
});

let modSearchTimer;
$('modsearch').oninput = e => {
  clearTimeout(modSearchTimer);
  const q = e.target.value;
  modSearchTimer = setTimeout(async () => {
    const results = await window.api.searchMods(q, editor.itemUniqueName);
    $('modsearch-results').innerHTML = results.map((m, i) => `
      <div class="modopt" data-i="${i}">
        <b>${esc(m.name)}</b>
        ${m.isAura ? '<span class="modtag">Aura</span>' : ''}
        ${m.isExilus ? '<span class="modtag">Exilus</span>' : ''}
        <span class="mo-meta">
          ${m.polaritySymbol ? `<span class="pol">${esc(m.polaritySymbol)}</span>` : ''}
          <span>${esc(m.rarityLabel)}</span>
          <span>${m.owned ? '✓ owned' : 'missing'}</span>
        </span>
      </div>`).join('');
    $('modsearch-results').querySelectorAll('.modopt').forEach(el => {
      el.onclick = () => selectMod(results[Number(el.dataset.i)]);
    });
  }, 200);
};

function selectMod(mod, rank = null, polarity = null) {
  editor.mod = mod;
  editor.rank = rank ?? mod.maxRank ?? 0;

  /* Eine bereits gesetzte Polaritaet des Platzes bleibt stehen, wenn man nur
     die Mod darin wechselt - das Forma verschwindet ja auch nicht. */
  if (polarity !== null) { editor.polarity = polarity; renderPolarities(); }

  $('slot-config').classList.remove('hidden');
  $('sc-name').textContent = mod.name;
  $('sc-meta').textContent = [mod.rarityLabel, mod.isAura ? 'Aura' : null, mod.isExilus ? 'Exilus' : null]
    .filter(Boolean).join(' · ');

  const rangeEl = $('sc-rank');
  rangeEl.max = mod.maxRank ?? 10;
  rangeEl.value = editor.rank;
  $('sc-rank-val').textContent = editor.rank;

  updateDrainPreview();
}

$('sc-rank').oninput = e => {
  editor.rank = Number(e.target.value);
  $('sc-rank-val').textContent = editor.rank;
  updateDrainPreview();
};

/** Vorschau des Kapazitätsverbrauchs – dieselbe Regel wie im Kern. */
function updateDrainPreview() {
  const m = editor.mod;
  if (!m) return;
  const base = Math.abs(m.baseDrain || 0) + editor.rank;
  const matches = editor.polarity && (editor.polarity === m.polarity || editor.polarity === 'AP_UNIVERSAL');

  let text;
  if (m.isAura) {
    text = `Grants ${matches ? base * 2 : base} capacity${matches ? ' (polarity matches, doubled)' : ''}`;
  } else if (matches) {
    text = `Costs ${Math.ceil(base / 2)} instead of ${base} — polarity matches`;
  } else if (editor.polarity) {
    text = `Costs ${Math.ceil(base * 1.25)} instead of ${base} — polarity does not match`;
  } else {
    text = `Costs ${base} capacity`;
  }
  $('sc-drain').textContent = text;
}

$('sc-apply').onclick = async () => {
  if (!editor.mod) return;
  const res = await window.api.setBuildSlot(editor.buildId, editor.slotIndex, {
    mod: editor.mod.uniqueName, rank: editor.rank, polarity: editor.polarity
  });
  if (res.ok) { renderBuilds(res.data); closeSlotEditor(); }
};

$('sc-clear').onclick = async () => {
  const res = await window.api.setBuildSlot(editor.buildId, editor.slotIndex, null);
  if (res.ok) { renderBuilds(res.data); closeSlotEditor(); }
};

/* ---------------- Arcane-Editor ---------------- */

const arcEditor = { buildId: null, index: null, arcane: null, rank: 0, itemUniqueName: null };

async function openArcaneEditor(buildId, index, build) {
  arcEditor.buildId = buildId;
  arcEditor.index = index;
  arcEditor.itemUniqueName = build.itemUniqueName;
  arcEditor.arcane = null;
  arcEditor.rank = 0;

  const existing = (build.arcaneSlots || [])[index];
  $('arcane-modal-title').textContent = `Arcane ${index + 1}`;
  $('arcane-modal-sub').textContent = build.itemName + ' · ' + build.name;
  $('arcsearch').value = '';
  $('arcane-config').classList.add('hidden');
  $('arcane-modal').classList.remove('hidden');

  /* Ohne Suchwort steht die passende Auswahl schon da - bei 176 Arcanes ist
     ein leeres Feld keine Hilfe, sondern eine Huerde. */
  await loadArcaneResults();
  $('arcsearch').focus();

  if (existing && existing.uniqueName) {
    selectArcane({
      uniqueName: existing.uniqueName, name: existing.name,
      maxRank: existing.maxRank, rarityLabel: existing.rarityLabel,
      owned: existing.owned, ownedRank: existing.ownedRank
    }, existing.rank);
  }
}

const closeArcaneEditor = () => $('arcane-modal').classList.add('hidden');
$('arcane-modal-close').onclick = closeArcaneEditor;
$('arcane-modal').addEventListener('click', e => {
  if (e.target.id === 'arcane-modal') closeArcaneEditor();
});

let arcSearchTimer;
$('arcsearch').oninput = () => {
  clearTimeout(arcSearchTimer);
  arcSearchTimer = setTimeout(loadArcaneResults, 200);
};

async function loadArcaneResults() {
  const results = await window.api.searchArcanes($('arcsearch').value, arcEditor.itemUniqueName);
  const box = $('arcsearch-results');

  box.innerHTML = results.map((a, i) => `
    <div class="modopt arcopt" data-i="${i}">
      <img class="arcopt-ic" src="${esc(a.image)}" alt="" loading="lazy">
      <b>${esc(a.name)}</b>
      <span class="mo-meta">
        <span>${esc(a.rarityLabel)}</span>
        <span>${a.owned ? `✓ rank ${a.ownedRank}/${a.maxRank}` : 'missing'}</span>
      </span>
    </div>`).join('') || '<div class="empty">Nothing found.</div>';

  onImageFail(box, '.arcopt-ic', img => { img.style.visibility = 'hidden'; });
  box.querySelectorAll('.arcopt').forEach(el => {
    el.onclick = () => selectArcane(results[Number(el.dataset.i)]);
  });
}

function selectArcane(arcane, rank = null) {
  arcEditor.arcane = arcane;
  arcEditor.rank = rank ?? arcane.maxRank ?? 0;

  $('arcane-config').classList.remove('hidden');
  $('ac-name').textContent = arcane.name;
  $('ac-meta').textContent = [
    arcane.rarityLabel,
    arcane.owned ? `you own rank ${arcane.ownedRank ?? 0}` : 'not owned yet'
  ].filter(Boolean).join(' · ');

  const range = $('ac-rank');
  range.max = arcane.maxRank ?? 5;
  range.value = arcEditor.rank;
  $('ac-rank-val').textContent = arcEditor.rank;
  updateCopiesPreview();
}

$('ac-rank').oninput = e => {
  arcEditor.rank = Number(e.target.value);
  $('ac-rank-val').textContent = arcEditor.rank;
  updateCopiesPreview();
};

/**
 * Was der eingestellte Rang an Exemplaren kostet.
 *
 * Dieselbe Dreieckszahl wie im Kern: Rang 1 zwei Karten, Rang 5 einundzwanzig.
 * Wer schon eines auf Rang N besitzt, zahlt nur die Differenz.
 */
function updateCopiesPreview() {
  const a = arcEditor.arcane;
  if (!a) return;
  const copies = r => ((r + 1) * (r + 2)) / 2;
  const need = copies(arcEditor.rank);
  const have = a.owned ? copies(a.ownedRank ?? 0) : 0;

  $('ac-copies').textContent = have >= need
    ? `You already have this at rank ${a.ownedRank}`
    : `${need} copies in total — ${need - have} still to go`;
}

$('ac-apply').onclick = async () => {
  if (!arcEditor.arcane) return;
  const res = await window.api.setBuildArcane(arcEditor.buildId, arcEditor.index, {
    arcane: arcEditor.arcane.uniqueName, rank: arcEditor.rank
  });
  if (res.ok) { renderBuilds(res.data); closeArcaneEditor(); }
};

$('ac-clear').onclick = async () => {
  const res = await window.api.setBuildArcane(arcEditor.buildId, arcEditor.index, null);
  if (res.ok) { renderBuilds(res.data); closeArcaneEditor(); }
};

function renderTotals(t, builds) {
  const wrap = $('build-totals');
  if (!builds.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  const estimated = builds.some(b => b.requirements.endoEstimated);
  const cards = [
    [Icon.bolt(18), t.forma,        'Forma',            null],
    [Icon.star(18), t.auraForma,    'Aura Forma',       null],
    [Icon.star(18), t.umbraForma,   'Umbra Forma',      null],
    [Icon.cube(18), t.reactor,      'Orokin Reactors',  null],
    [Icon.cube(18), t.catalyst,     'Orokin Catalysts', null],
    [Icon.coin(18), nf(t.endo),     'Endo',             estimated ? 'estimated' : 'per Overframe'],
    /* Arcanes zahlt man in Exemplaren ihrer selbst, nicht in Endo. */
    [Icon.gem(18),  t.arcaneCopies, 'Arcane copies',    'to fuse']
  ].filter(c => c[1] !== 0 && c[1] !== '0');

  $('totals-grid').innerHTML = cards.map(([ic, val, label, note]) => `
    <div class="tcard">
      <span class="ticon">${ic}</span>
      <div><b>${esc(String(val))}</b><span>${esc(label)}</span>
      ${note ? `<small>${esc(note)}</small>` : ''}</div>
    </div>`).join('');
}

/**
 * Was noch fehlt - und was nur noch aufgewertet werden muss.
 *
 * MIT INVENTAR ist das eine Feststellung, kein Formular: die Liste sagt, was zu
 * farmen ist, und aendert sich beim naechsten Inventar-Abruf von selbst. OHNE
 * Inventar bleibt der alte Weg, sonst stuende dort fuer immer alles als fehlend.
 */
function renderMissingMods(data) {
  const wrap = $('missing-mods-wrap');
  const missing = data.missingMods || [];
  const short   = data.underRankedMods || [];
  const arcMissing = data.missingArcanes || [];
  const arcShort   = data.underRankedArcanes || [];

  if (!missing.length && !short.length && !arcMissing.length && !arcShort.length) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');

  const auto = data.hasInventory;
  $('missing-title').textContent = 'Still needed for your builds';
  $('missing-sub').textContent = auto
    ? 'Read straight from your inventory — refresh it to update this list'
    : 'No inventory data yet — click an entry once you own that mod';
  $('btn-all-owned').classList.toggle('hidden', auto);

  const row = (m, kind) => `
    <div class="modrow ${kind}" ${auto ? '' : `data-mod="${esc(m.uniqueName)}"`}>
      <span class="mcheck">${kind === 'short' ? Icon.star(13) : Icon.check(13)}</span>
      <div class="modrow-body">
        <b>${esc(m.name)}</b>
        <small>${kind === 'short'
          ? `Rank ${m.ownedRank} → ${m.rank} · ${esc(m.usedIn.join(', '))}`
          : `Rank ${m.rank}/${m.maxRank} · ${esc(m.usedIn.join(', '))}`}</small>
      </div>
      <span class="rarity ${esc(m.rarity)}">${esc(m.rarityLabel)}</span>
    </div>`;

  /* Arcanes stehen in derselben Liste, tragen aber ihre eigene Waehrung: nicht
     Endo, sondern die Zahl der Exemplare, die noch hineinwandern. Ein Haken von
     Hand gibt es hier nicht - ohne Inventar weiss niemand, wie viele man hat. */
  const arcRow = (a, kind) => `
    <div class="modrow ${kind} is-arcane">
      <img class="arcopt-ic" src="${esc(a.image)}" alt="" loading="lazy">
      <div class="modrow-body">
        <b>${esc(a.name)}</b>
        <small>${kind === 'short'
          ? `Rank ${a.ownedRank} → ${a.rank}, ${a.copies - a.copiesOwned} more copies`
          : `Rank ${a.rank}/${a.maxRank}, ${a.copies} ${a.copies === 1 ? 'copy' : 'copies'}`
        } · ${esc(a.usedIn.join(', '))}</small>
      </div>
      <span class="rarity ${esc(a.rarity)}">${esc(a.rarityLabel)}</span>
    </div>`;

  $('missing-mods').innerHTML =
    missing.map(m => row(m, 'gone')).join('')
    + short.map(m => row(m, 'short')).join('')
    + arcMissing.map(a => arcRow(a, 'gone')).join('')
    + arcShort.map(a => arcRow(a, 'short')).join('');

  onImageFail($('missing-mods'), '.arcopt-ic', img => { img.style.visibility = 'hidden'; });

  if (auto) return;

  $('missing-mods').querySelectorAll('[data-mod]').forEach(el => el.onclick = async () => {
    el.classList.add('owned');
    const r = await window.api.setModOwned(el.dataset.mod, true);
    if (r.ok) renderBuilds(r.data);
  });
}

$('btn-all-owned').onclick = async () => {
  const ids = [...$('missing-mods').querySelectorAll('[data-mod]')].map(r => r.dataset.mod);
  if (!ids.length) return;
  const r = await window.api.setManyModsOwned(ids, true);
  if (r.ok) renderBuilds(r.data);
};

/* ---------------- Checkliste ---------------- */
async function loadChecklist() {
  checklistCache = await window.api.getChecklist(null);
  const cats = [...new Set(checklistCache.map(i => i.category))].sort();
  $('filter-category').innerHTML = '<option value="">All categories</option>' +
    cats.map(c => {
      const label = (checklistCache.find(i => i.category === c) || {}).label || c;
      return `<option value="${esc(c)}">${esc(label)}</option>`;
    }).join('');
  drawChecklist();
}

/**
 * Die zwei Ecken einer Katalogkachel, die nicht vom Mastery-Fortschritt
 * handeln: ist das Ding ueberhaupt noch zu holen, und liegt es schon im
 * Helminth.
 *
 * BEIDE FELDER KENNEN DREI ZUSTAENDE, NICHT ZWEI. `null` heisst "keine
 * Aussage" - kein Prime, oder es wurde nie ein Inventar abgerufen. Dann steht
 * dort nichts. Ein leeres Eck ist die ehrliche Antwort auf eine Frage, die
 * niemand beantworten kann; ein graues Abzeichen waere eine.
 */
function tileMarks(i) {
  const out = [];

  if (i.vault?.vaulted) {
    /* Immer als Bruch, auch bei null: "0/4" sagt dasselbe wie ein Symbol,
       aber ohne dass man die Bedeutung erst lernen muss - und es steht in
       derselben Schreibweise da wie das halb offene "2/4" daneben. Die Farbe
       trennt die beiden Faelle: gar nichts zu holen ist rot, ein Teil davon
       noch zu holen ist gold. */
    const teils = i.vault.have > 0;
    out.push(`<span class="tile-mark vault${teils ? ' partial' : ''}"
      title="${teils
        ? `Vaulted — only ${i.vault.have} of ${i.vault.total} parts still drop`
        : 'Vaulted — none of its parts drop anywhere right now'}">${i.vault.have}/${i.vault.total}</span>`);
  }

  if (i.subsumed === true) {
    out.push(`<span class="tile-mark subsumed" title="Subsumed — its ability is available from the Helminth">${Icon.qaHelminth(11)}</span>`);
  }

  return out.length ? `<span class="tile-marks">${out.join('')}</span>` : '';
}

function drawChecklist() {
  const cat    = $('filter-category')?.value || '';
  const status = $('filter-status')?.value || '';
  const q      = ($('filter-search')?.value || '').toLowerCase().trim();

  const list = checklistCache.filter(i =>
    (!cat || i.category === cat) &&
    (!status || i.status === status) &&
    (!q || (i.name || '').toLowerCase().includes(q))
  );

  const inGoals = new Set((state?.goals || []).map(g => g.uniqueName));

  if ($('checklist-count')) $('checklist-count').textContent = nf(list.length) + ' Items';
  if ($('checklist')) {
    $('checklist').innerHTML = list.slice(0, 600).map(i => {
      const isGoal = inGoals.has(i.uniqueName);
      return `
      <div class="tile ${esc(i.status)} ${isGoal ? 'is-goal' : ''}" data-item-u="${esc(i.uniqueName)}">
        <span class="dot ${esc(i.status)}"></span>
        ${isGoal ? `<span class="tile-goal-badge" title="Active farming goal">${Icon.target(12)}</span>` : ''}
        ${tileMarks(i)}
        <img src="${esc(i.image)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="tile-name">${esc(i.name)}</div>
        <div class="tile-rank">${i.status === 'missing' ? 'Missing' : 'Rank ' + i.rank + ' / ' + i.maxLvl}</div>
      </div>`;
    }).join('');

    $('checklist').querySelectorAll('.tile').forEach(tile => {
      tile.onclick = () => openItemModal(tile.dataset.itemU);
    });
  }
}
['filter-category', 'filter-status', 'filter-search'].forEach(id => {
  if ($(id)) $(id).addEventListener('input', drawChecklist);
});

/* ---------------- Notizen ---------------- */
function renderNotes(data) {
  $('general-notes').value = data.generalNotes || '';
  const withNotes = data.goals.filter(g => g.note && g.note.trim());
  $('item-notes').innerHTML = withNotes.length
    ? withNotes.map(g => `<div class="itemnote"><b>${esc(g.name)}</b><p>${esc(g.note)}</p></div>`).join('')
    : '<div class="empty">Notes you attach to goals appear here.</div>';
}
let notesTimer;
$('general-notes').oninput = e => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => window.api.setGeneralNotes(e.target.value), 600);
};

/* ---------------- Item-Detail Modal ---------------- */
async function openItemModal(uniqueName) {
  if (!uniqueName) return;
  const modal = $('item-modal');
  const content = $('item-modal-content');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.innerHTML = `
    <div style="padding: 40px; text-align: center; color: var(--text-3);">
      ${Icon.refresh(22)}
      <div style="margin-top: 10px; font-size: 13px;">Lade Item-Details …</div>
    </div>
  `;

  const res = await window.api.getItemDetails(uniqueName);
  if (!res.ok) {
    content.innerHTML = `
      <div class="im-header">
        <h2>Error</h2>
        <button class="modal-close-icon" onclick="closeItemModal()">&times;</button>
      </div>
      <div class="im-scroll-body">
        <p style="color: var(--red);">${esc(res.error || 'Could not load the details.')}</p>
      </div>
    `;
    return;
  }

  const d = res.data;
  const inGoals = (state?.goals || []).some(g => g.uniqueName === d.uniqueName);

  let statusText = 'Missing';
  if (d.status === 'done') statusText = 'Mastered';
  else if (d.status === 'partial') statusText = `Rank ${d.rank}/${d.maxLvl}`;

  content.innerHTML = `
    <div class="im-header">
      <div class="im-header-left">
        <div class="im-art-wrap">
          <img class="im-art" src="${esc(d.image)}" alt="" onerror="this.style.visibility='hidden'">
        </div>
        <div class="im-title-group">
          <div class="im-tags">
            <span class="im-badge cat">${esc(d.categoryLabel)}</span>
            ${d.masteryReq > 0 ? `<span class="im-badge mr">MR ${d.masteryReq}</span>` : ''}
            <span class="im-badge status ${esc(d.status)}">${statusText}</span>
            ${d.vault?.vaulted ? `<span class="im-badge vaulted">Vaulted${d.vault.have > 0 ? ` · ${d.vault.have}/${d.vault.total}` : ''}</span>` : ''}
            ${d.subsumed === true ? `<span class="im-badge subsumed">Subsumed</span>` : ''}
          </div>
          <h2>${esc(d.name)}</h2>
          <div class="im-gain-hint">
            ${d.status === 'done'
              ? `<span class="gain-done">${Icon.check(13)} Fully mastered (+${nf(d.potentialXP)} XP)</span>`
              : (d.status === 'partial'
                  ? `<span class="gain-partial">${Icon.bolt(13)} In inventory (rank ${d.rank}/${d.maxLvl}) · +${nf(d.gain)} MR XP to go</span>`
                  : `<span class="gain-missing">${Icon.target(13)} Not owned · +${nf(d.potentialXP)} MR XP</span>`
                )
            }
          </div>
        </div>
      </div>
      <div class="im-header-actions">
        <button id="im-goal-btn" class="btn ${inGoals ? 'btn-secondary' : 'btn-primary'}" data-u="${esc(d.uniqueName)}" data-name="${esc(d.name)}">
          ${inGoals ? Icon.trash(14) + ' <span>Remove from goals</span>' : Icon.plus(14) + ' <span>Set as goal</span>'}
        </button>
      </div>
      <button class="modal-close-icon" id="im-close" title="Close">&times;</button>
    </div>

    <div class="im-scroll-body">
    ${d.vault?.vaulted ? `
      <div class="im-section im-vault">
        <p>
          <b>${d.vault.have > 0
            ? `Partly vaulted — ${d.vault.have} of ${d.vault.total} parts still drop.`
            : 'Vaulted — none of its parts drop anywhere right now.'}</b>
          ${d.vault.missing.length
            ? ` Missing from the current relics: ${d.vault.missing.map(esc).join(', ')}.`
            : ''}
          Trading is the reliable way in — and Varzia's Prime Resurgence
          rotates a different selection into reach every month, which no drop
          table lists.
        </p>
      </div>
    ` : ''}

    ${d.description ? `
      <div class="im-section">
        <p class="im-desc">${esc(d.description)}</p>
      </div>
    ` : ''}

    ${d.stats && d.stats.length ? `
      <div class="im-section">
        <div class="im-section-title">Attribute & Werte</div>
        <div class="im-stats-grid">
          ${d.stats.map(s => `
            <div class="im-stat-tile">
              <span class="st-label">${esc(s.label)}</span>
              <b class="st-val">${esc(String(s.val))}</b>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${d.passiveDescription ? `
      <div class="im-section">
        <div class="im-section-title">Passive ability</div>
        <div class="im-passive">${esc(d.passiveDescription)}</div>
      </div>
    ` : ''}

    ${d.abilities && d.abilities.length ? `
      <div class="im-section">
        <div class="im-section-title">Abilities</div>
        <div class="im-abilities">
          ${d.abilities.map((ab, i) => `
            <div class="im-ability">
              <div class="ab-num">${i + 1}</div>
              <div class="ab-content">
                <b>${esc(ab.name)}</b>
                <p>${esc(ab.description)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="im-section">
      <div class="im-section-title">Beschaffung & Fundort</div>
      <div class="im-source-box">
        <div class="im-source-label">${Icon.target(14)} <b>${esc(d.source)}</b></div>
        ${d.sourceNote ? `<div class="im-source-note">${esc(d.sourceNote)}</div>` : ''}
      </div>
    </div>

    ${d.components && d.components.length ? `
      <div class="im-section">
        <div class="im-section-title">Required parts & components</div>
        <div class="im-components-grid">
          ${d.components.map(c => `
            <div class="im-component-card ${c.isSubRecipe ? 'craftable' : ''}">
              <div class="im-comp-head">
                ${c.image ? `<img class="mat-icon" src="${esc(c.image)}" alt="" onerror="this.style.display='none'">` : ''}
                <div class="im-comp-info">
                  <div class="im-comp-title">
                    <b>${esc(c.name)}</b>
                    <span class="im-comp-count">${c.count}x</span>
                  </div>
                  <span class="im-comp-tag ${c.isSubRecipe ? '' : 'raw'}">
                    ${c.isSubRecipe ? 'Wird geschmiedet (12h)' : 'Ressource / Teil'}
                  </span>
                </div>
              </div>
              ${c.ingredients && c.ingredients.length ? `
                <div class="im-comp-submats">
                  ${c.ingredients.map(ing => `
                    <span class="im-subchip">
                      ${ing.image ? `<img class="mat-icon" src="${esc(ing.image)}" alt="" onerror="this.style.display='none'">` : ''}
                      <span>${esc(ing.name)}</span>
                      <b>${nf(ing.count)}</b>
                    </span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${d.materials && d.materials.length ? `
      <div class="im-section">
        <div class="im-section-title">Total resources & materials</div>
        <div class="im-recipe-meta">
          <span>${Icon.coin(13)} <b>${nf(d.credits)}</b> Credits</span>
          <span>${Icon.clock(13)} <b>${esc(d.buildTime)}</b> Gesamtbauzeit</span>
        </div>
        <div class="im-mats-grid">
          ${d.materials.map(m => `
            <div class="im-mat ${Stock.cls(m)}" title="${esc(Stock.hint(m, m.name, nf))}">
              ${m.image ? `<img class="mat-icon" src="${esc(m.image)}" alt="" onerror="this.style.display='none'">` : ''}
              <span>${esc(m.name)}</span>
              ${Stock.forge(m)}
              <b>${Stock.num(m, nf)}</b>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    </div>
  `;

  $('im-close').onclick = closeItemModal;

  const goalBtn = $('im-goal-btn');
  if (goalBtn) {
    goalBtn.onclick = async () => {
      const u = goalBtn.dataset.u;
      const n = goalBtn.dataset.name;
      const already = (state?.goals || []).some(g => g.uniqueName === u);
      const res = already ? await window.api.removeGoal(u) : await window.api.addGoal(u, n);
      if (res.ok) {
        render(res.data);
        openItemModal(u);
      }
    };
  }
}

function closeItemModal() {
  const modal = $('item-modal');
  if (modal) modal.classList.add('hidden');
}

$('item-modal').onclick = e => {
  if (e.target === $('item-modal')) closeItemModal();
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeItemModal();
    closeSlotEditor();
    closeUpgradeModal();
    closeRelicModal();
    closePartModal();
  }
});

/* ---------------- Live World-State Tracker ---------------- */
let worldStateCache = null;
let activeFissureTier = 'all';
let worldStateTimer = null;

async function loadWorldState(force = false) {
  const btn = $('btn-refresh-worldstate');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('is-refreshing');
    btn.innerHTML = Icon.refresh(14) + ' <span>Loading …</span>';
  }
  
  const data = await window.api.getWorldState(force);
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('is-refreshing');
    btn.innerHTML = Icon.refresh(14) + ' <span>Reload</span>';
  }

  if (!data || data.error) {
    $('ws-cycles').innerHTML = `<div class="empty">Could not load live data (${esc(data?.error || 'network error')}).</div>`;
    return;
  }

  worldStateCache = data;
  renderWorldState(data);

  clearInterval(worldStateTimer);
  worldStateTimer = setInterval(() => {
    const activeTab = document.querySelector('.nav-item.active')?.dataset.tab;
    if (activeTab === 'worldstate') loadWorldState(false);
  }, 30000);
}

if ($('btn-refresh-worldstate')) {
  $('btn-refresh-worldstate').onclick = () => loadWorldState(true);
}

/**
 * Die Restzeit eines Zyklus - gerechnet, nicht abgeschrieben.
 *
 * Zwei Gruende, warum hier nicht einfach `timeLeft` der Quelle steht: der Orb
 * Vallis bekommt das Feld von warframestat.us gar nicht mit (Cetus und Cambion
 * schon), und selbst wo es steht, ist es der Stand des letzten Abrufs. Aus
 * `expiry` gerechnet stimmt die Zahl in jeder Sekunde - und tickt.
 */
function cycleLeftText(expiry, fallback) {
  if (!expiry) return fallback || '—';
  const ms = new Date(expiry).getTime() - Date.now();
  if (!Number.isFinite(ms)) return fallback || '—';
  if (ms <= 0) return 'now';

  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}h ${m}m` : `${m}m ${s}s`;
}

const cycleClock = cyc =>
  `<span class="ws-cycle-clock" data-cycle-until="${esc(cyc.expiry || '')}"
         data-cycle-fallback="${esc(cyc.timeLeft || '')}">${
    esc(cycleLeftText(cyc.expiry, cyc.timeLeft))}</span>`;

/** Sekundentakt nur fuer die drei Uhren - kein Neuzeichnen der ganzen Seite. */
function tickCycleClocks() {
  document.querySelectorAll('[data-cycle-until]').forEach(el => {
    el.textContent = cycleLeftText(el.dataset.cycleUntil, el.dataset.cycleFallback);
  });
}
setInterval(tickCycleClocks, 1000);

function renderWorldState(d) {
  // 1. Zyklen
  const c = d.cetus || {};
  const v = d.vallis || {};
  const cb = d.cambion || {};

  $('ws-cycles').innerHTML = `
    <div class="ws-cycle-card map-cetus ${c.isDay ? 'day' : 'night'}">
      <div class="ws-cycle-head">
        <div>
          <div class="ws-cycle-title">Plains of Eidolon (Cetus)</div>
          <div class="ws-cycle-sub">Earth · Eidolon hunting</div>
        </div>
        <span class="ws-cycle-badge ${c.isDay ? 'day' : 'night'}">
          ${c.isDay ? Icon.sun(15) + ' Day' : Icon.moon(15) + ' Night (Eidolon)'}
        </span>
      </div>
      <div class="ws-cycle-time">${cycleClock(c)} <small>remaining</small></div>
    </div>

    <div class="ws-cycle-card map-vallis ${v.isWarm ? 'warm' : 'cold'}">
      <div class="ws-cycle-head">
        <div>
          <div class="ws-cycle-title">Orb Vallis (Fortuna)</div>
          <div class="ws-cycle-sub">Venus · thermia cycles</div>
        </div>
        <span class="ws-cycle-badge ${v.isWarm ? 'warm' : 'cold'}">
          ${v.isWarm ? Icon.flame(15) + ' Warm' : Icon.snowflake(15) + ' Cold'}
        </span>
      </div>
      <div class="ws-cycle-time">${cycleClock(v)} <small>remaining</small></div>
    </div>

    <div class="ws-cycle-card map-cambion ${cb.isFass ? 'warm' : 'night'}">
      <div class="ws-cycle-head">
        <div>
          <div class="ws-cycle-title">Cambion Drift (Deimos)</div>
          <div class="ws-cycle-sub">Deimos · worm cycle</div>
        </div>
        <span class="ws-cycle-badge ${cb.state || 'fass'}">
          ${cb.isFass ? 'Fass (orange)' : 'Vome (blue)'}
        </span>
      </div>
      <div class="ws-cycle-time">${cycleClock(cb)} <small>remaining</small></div>
    </div>
  `;

  // 2. Baro Ki'Teer
  const vt = d.voidTrader || {};
  if (vt.active) {
    $('ws-voidtrader').innerHTML = `
      <div class="ws-trader-head">
        <div class="ws-trader-info">
          <h3>${esc(vt.character)} ist anwesend!</h3>
          <p>Location: <b>${esc(vt.location)}</b> · leaves the relay in <b>${esc(vt.endString || '2 days')}</b></p>
        </div>
        <span class="ws-trader-status active">In the relay now</span>
      </div>
      ${vt.inventory && vt.inventory.length ? `
        <div class="ducats-catalog-list" style="margin-top: 14px;">
          ${vt.inventory.map(it => `
            <div class="ducat-item-row">
              <div class="ducat-item-body">
                <b>${esc(it.item)}</b>
                <span>${nf(it.credits)} Credits</span>
              </div>
              <span class="ducat-item-val"><img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Ducats"> <b>${nf(it.ducats)}</b></span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  } else {
    $('ws-voidtrader').innerHTML = `
      <div class="ws-trader-head">
        <div class="ws-trader-info">
          <h3>${esc(vt.character || "Baro Ki'Teer")} is travelling</h3>
          <p>Next arrival: <b>${esc(vt.location || 'a relay')}</b> in <b>${esc(vt.startString || 'a few days')}</b></p>
        </div>
        <span class="ws-trader-status inactive">Counting down</span>
      </div>
    `;
  }

  // 3. Sortie & Archon
  /* Restzeit nur anhaengen, wenn es eine gibt - sonst blieb hier ein
     angefangenes "Noch" ohne Wert stehen. */
  const restzeit = eta => (eta ? ` · <b>${esc(eta)}</b> left` : '');

  const sort = d.sortie;
  if (sort) {
    $('ws-sortie').innerHTML = `
      <div style="font-size: 12.5px; color: var(--text-2); margin-bottom: 8px;">
        Boss: <b style="color: var(--text);">${esc(sort.boss)}</b> (${esc(sort.faction)})${restzeit(sort.eta)}
      </div>
      ${(sort.variants || []).map((v, i) => `
        <div class="ws-mission-item">
          <div class="ws-m-num">${i + 1}</div>
          <div class="ws-m-info">
            <b>${esc(v.missionType)} (${esc(v.node)})</b>
            <p>${esc(v.modifier)}: ${esc(v.modifierDescription)}</p>
          </div>
        </div>
      `).join('')}
    `;
  } else {
    $('ws-sortie').innerHTML = '<div class="empty">No active sortie reported.</div>';
  }

  const arc = d.archonHunt;
  if (arc) {
    $('ws-archon').innerHTML = `
      <div style="font-size: 12.5px; color: var(--text-2); margin-bottom: 8px;">
        Target: <b style="color: var(--gold);">${esc(arc.boss)}</b>${restzeit(arc.eta)}
      </div>
      ${(arc.missions || []).map((m, i) => `
        <div class="ws-mission-item">
          <div class="ws-m-num">${i + 1}</div>
          <div class="ws-m-info">
            <b>${esc(m.type)}</b>
            <p>${esc(m.node)}</p>
          </div>
        </div>
      `).join('')}
    `;
  } else {
    $('ws-archon').innerHTML = '<div class="empty">No archon hunt active.</div>';
  }

  // 4. Void Fissures
  renderFissures(d.fissures || []);

  // 6. Neue Weltzustands-Abschnitte
  renderWsSource(d);
  renderWsNav(d.counts || {});
  renderNightwave(d.nightwave || []);
  renderAlerts(d);
  renderEvents(d.events || []);
  renderSteelPath(d.steelPath);
  renderInvasions(d.invasions || []);
  renderSyndicates(d.syndicates || []);
}

/* ---------------- Weltzustands-Leiste (wie in der Sternenkarte) ---------------- */

/**
 * Reihenfolge und Beschriftung wie im Spiel. icon 'img:x' nutzt ein Original-Asset
 * aus assets/icons/worldstate, 'svg:x' eine Vektorglyphe - fuer Event und Alerts
 * gibt das Wiki kein brauchbares weisses Icon her.
 */
const leerHinweis = text => `<div class="empty" style="grid-column: 1 / -1;">${esc(text)}</div>`;

/**
 * Unterseiten des Live-Trackers.
 *
 * Frueher stand alles untereinander auf einer sehr langen Seite. Die Leiste war
 * eine reine Sprungnavigation - jetzt schaltet sie echte Seiten um, damit man
 * nicht an Invasionen vorbeiscrollen muss, um zu den Rissen zu kommen.
 *
 * `count` nennt das Feld aus d.counts, das als Zahl am Reiter steht;
 * null bedeutet: dieser Bereich hat keine sinnvolle Anzahl.
 */
const WS_PANES = [
  { key: 'overview',   label: 'Overview',    icon: 'svg:globe',     count: null },
  { key: 'fissures',   label: 'Void fissures', icon: 'img:fissure', count: 'fissures' },
  { key: 'missions',   label: 'Sorties',     icon: 'img:sortie',    count: 'missions' },
  { key: 'nightwave',  label: 'Nightwave',   icon: 'img:nightwave', count: 'nightwave' },
  { key: 'alerts',     label: 'Alerts',      icon: 'img:quest',     count: 'alerts' },
  { key: 'events',     label: 'Operations',  icon: 'img:event',     count: 'events' },
  { key: 'steelpath',  label: 'Steel Path',  icon: 'img:steelpath', count: 'steelPath' },
  { key: 'invasions',  label: 'Invasions',   icon: 'img:invasion',  count: 'invasions' },
  { key: 'syndicates', label: 'Syndicates',  icon: 'img:syndicate', count: 'syndicates' }
];

let wsPane = 'overview';

function renderWsNav(counts) {
  const box = $('ws-nav');
  if (!box) return;
  box.innerHTML = WS_PANES.map(p => {
    const [kind, name] = p.icon.split(':');
    const ic = kind === 'img'
      ? `<span class="ws-stat-ic ic-${name}"></span>`
      : `<span class="ws-stat-ic is-svg">${Icon[name] ? Icon[name](18) : ''}</span>`;
    const n = p.count ? (counts[p.count] ?? 0) : null;
    return `<button class="ws-navtab${p.key === wsPane ? ' active' : ''}${n === 0 ? ' zero' : ''}"
              data-ws-go="${p.key}">${ic}<span>${esc(p.label)}</span>${
              n === null ? '' : `<b>${n}</b>`}</button>`;
  }).join('');
}

function showWsPane(key) {
  wsPane = key;
  document.querySelectorAll('.ws-pane').forEach(p =>
    p.classList.toggle('active', p.dataset.wsPane === key));
  document.querySelectorAll('.ws-navtab').forEach(t =>
    t.classList.toggle('active', t.dataset.wsGo === key));
  document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
}

$('ws-nav')?.addEventListener('click', e => {
  const btn = e.target.closest('.ws-navtab');
  if (btn) showWsPane(btn.dataset.wsGo);
});

/**
 * Zustand der Datenquelle.
 *
 * warframestat.us faellt zeitweise aus oder liefert veraltete Staende. Ohne
 * diesen Hinweis sieht der Nutzer nur eine leere Riss-Liste und haelt es fuer
 * einen Fehler der App - genau das ist am 2026-08-20 passiert.
 */
function renderWsSource(d) {
  const box = $('ws-source');
  if (!box) return;

  const alterMin = d.sourceTimestamp
    ? Math.round((Date.now() - new Date(d.sourceTimestamp).getTime()) / 60000)
    : null;

  let art = null, text = '';
  if (d.error) {
    art = 'down';
    text = `Die Datenquelle (warframestat.us) antwortet nicht: ${d.error}. `
         + 'What you see is the last thing that loaded — or nothing.';
  } else if (alterMin !== null && alterMin > 15) {
    art = 'stale';
    const h = Math.floor(alterMin / 60), m = alterMin % 60;
    text = `The data source is ${h ? h + ' h ' : ''}${m} min behind. `
         + 'Expired entries are hidden, which is why lists can look empty.';
  }

  box.classList.toggle('hidden', !art);
  if (!art) return;
  box.className = 'ws-source is-' + art;
  box.innerHTML = `<span class="ws-source-ic">${Icon.warning(16)}</span><span>${esc(text)}</span>`;
}

/* Alter Sprung-Zielcode - bleibt fuer den Fall, dass irgendwo noch data-target sitzt. */
$('ws-statusbar')?.addEventListener('click', e => {
  const btn = e.target.closest('.ws-stat');
  if (!btn) return;
  const id = btn.dataset.target;
  if (!id) return;
  const el = $(id);
  if (el && !el.classList.contains('hidden')) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

/* ---------------- Alerts & zeitlich begrenzte Missionen ---------------- */

/* Farbe und Kurzname je Art. Kuva-Fluten und Elite-Aufgaben stechen heraus,
   weil sie die lohnendsten und seltensten Eintraege der Liste sind. */
/* ---------------- Nightwave ---------------- */

const NW_ARTEN = {
  'nightwave-elite':    { label: 'Elite weekly act',    klasse: 'is-accent' },
  'nightwave':          { label: 'Weekly act',          klasse: 'is-gold' },
  'nightwave-taeglich': { label: 'Daily act',           klasse: '' }
};

function renderNightwave(list) {
  const box = $('ws-nightwave');
  if (!box) return;

  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    box.innerHTML = leerHinweis('No Nightwave acts are active right now.');
    return;
  }

  box.innerHTML = items.map(nw => {
    const art = NW_ARTEN[nw.art] || { label: nw.missionType || 'Act', klasse: '' };
    return `
      <div class="ws-alert-card ws-nw-card ${art.klasse}">
        <div class="ws-alert-head">
          <span class="ws-alert-art">${esc(art.label)}</span>
          ${nw.eta ? `<span class="ws-alert-eta">${Icon.clock(12)} ${esc(nw.eta)}</span>` : ''}
        </div>
        <b>${esc(nw.titel || 'Nightwave')}</b>
        ${nw.beschreibung ? `<p class="ws-nw-desc">${esc(nw.beschreibung)}</p>` : ''}
        ${nw.reward ? `<div class="ws-nw-reward"><span class="ws-nw-badge">${esc(nw.reward)}</span></div>` : ''}
      </div>`;
  }).join('');
}

/* ---------------- Alerts, Kuva & Schlichtung ---------------- */

const ALERT_ARTEN = {
  'kuva-flut':    { label: 'Kuva-Flut',   klasse: 'is-gold' },
  'kuva-siphon':  { label: 'Kuva-Siphon', klasse: 'is-gold' },
  'arbitration':  { label: 'Schlichtung', klasse: 'is-accent' },
  'alert':        { label: 'Alert',       klasse: '' }
};

function renderAlerts(d) {
  const box = $('ws-alerts');
  if (!box) return;

  const list = d.alerts || [];
  if (!list.length) {
    box.innerHTML = leerHinweis(d.error
      ? 'The data source is not answering right now, so there are no entries.'
      : 'Nothing time-limited is running right now.');
    return;
  }

  box.innerHTML = list.map(a => {
    const art = ALERT_ARTEN[a.art] || ALERT_ARTEN.alert;
    const ort = [a.node, a.missionType].filter(Boolean).join(' · ');
    const stufe = a.minLevel && a.maxLevel ? ` · level ${a.minLevel}–${a.maxLevel}` : '';
    return `
      <div class="ws-alert-card ${art.klasse}">
        <div class="ws-alert-head">
          <span class="ws-alert-art">${esc(art.label)}</span>
          ${a.eta ? `<span class="ws-alert-eta">${Icon.clock(12)} ${esc(a.eta)}</span>` : ''}
        </div>
        <b>${esc(a.titel || a.missionType || 'Mission')}</b>
        ${ort || stufe ? `<span class="ws-alert-ort">${esc(ort)}${esc(stufe)}</span>` : ''}
        ${a.beschreibung ? `<p>${esc(a.beschreibung)}</p>` : ''}
        ${a.reward ? `<span class="ws-alert-reward">${esc(a.reward)}</span>` : ''}
      </div>`;
  }).join('');
}

/* ---------------- Operationen / Events ---------------- */

/* Seit dem Umbau auf Unterseiten versteckt sich kein Bereich mehr selbst -
   eine leere Seite braucht eine Erklaerung, kein Verschwinden. */
function renderEvents(list) {
  if (!$('ws-events')) return;
  if (!list.length) {
    $('ws-events').innerHTML = leerHinweis('No operation is running at the moment.');
    return;
  }

  $('ws-events').innerHTML = list.map(e => `
    <div class="ws-event-card">
      <div class="ws-event-head">
        <div>
          <b>${esc(e.name)}</b>
          <span>${esc(e.node || e.tooltip || '')}</span>
        </div>
        <span class="ws-eta">${esc(e.eta)}</span>
      </div>
      ${e.progress != null ? `
        <div class="ws-progress">
          <div class="ws-progress-fill" style="width:${e.progress}%"></div>
        </div>
        <div class="ws-progress-label">${e.progress}% complete</div>` : ''}
      ${e.rewards.length ? `<div class="ws-event-rewards">${
        e.rewards.map(r => `<span>${esc(r)}</span>`).join('')}</div>` : ''}
    </div>`).join('');
}

/* ---------------- Steel Path ---------------- */

function renderSteelPath(sp) {
  if (!$('ws-steelpath')) return;
  if (!sp) {
    $('ws-steelpath').innerHTML = leerHinweis('No Steel Path data reported.');
    return;
  }

  $('ws-steelpath').innerHTML = `
    <div class="ws-sp-row">
      <div class="ws-sp-reward">
        <span class="ws-sp-label">Teshin’s offering this week</span>
        <b>${esc(sp.rewardName || '—')}</b>
        ${sp.rewardCost != null ? `<span class="ws-sp-cost">${sp.rewardCost} Steel Essence</span>` : ''}
      </div>
      <div class="ws-sp-side">
        <span class="ws-eta">${esc(sp.remaining || '')}</span>
        <span class="ws-sp-inc ${sp.incursionsActive ? 'on' : 'off'}">
          ${sp.incursionsActive ? 'Incursions active · ' + esc(sp.incursionsEta) : 'No incursions'}
        </span>
      </div>
    </div>`;
}

/* ---------------- Invasionen ---------------- */

function renderInvasions(list) {
  if (!$('ws-invasions')) return;
  if (!list.length) {
    $('ws-invasions').innerHTML = leerHinweis('No invasions are running right now.');
    return;
  }

  $('ws-invasions').innerHTML = list.map(i => `
    <div class="ws-invasion-card">
      <div class="ws-inv-head">
        <b>${esc(i.node)}</b>
        <span>${esc(i.desc)}</span>
      </div>
      <div class="ws-inv-bar" title="${i.completion}% in favour of ${esc(i.attacker)}">
        <div class="ws-inv-fill" style="width:${i.completion}%"></div>
      </div>
      <div class="ws-inv-sides">
        <div class="ws-inv-side">
          <span class="ws-inv-faction">${esc(i.attacker)}</span>
          <span class="ws-inv-reward">${esc(i.attackerReward || '—')}</span>
        </div>
        <div class="ws-inv-side right">
          <span class="ws-inv-faction">${esc(i.defender)}</span>
          <span class="ws-inv-reward">${esc(i.defenderReward || '—')}</span>
        </div>
      </div>
    </div>`).join('');
}

/* ---------------- Syndikate ---------------- */

function renderSyndicates(list) {
  if (!$('ws-syndicates')) return;
  if (!list.length) {
    $('ws-syndicates').innerHTML = leerHinweis('No syndicate bounties reported.');
    return;
  }

  $('ws-syndicates').innerHTML = list.map(sy => {
    // Bounty-Syndikate liefern Jobs, die klassischen Fraktionen stattdessen Nodes.
    const count = sy.jobCount || sy.nodeCount;
    const what = sy.jobCount ? 'bounties' : 'missions';
    return `
      <div class="ws-syndicate-card">
        <div class="ws-syn-head">
          <b>${esc(sy.syndicate)}</b>
          <span class="ws-eta">${esc(sy.eta)}</span>
        </div>
        <div class="ws-syn-count">${count} ${what}</div>
      </div>`;
  }).join('');
}

const RELIC_TIER_IMAGES = {
  lith: 'assets/icons/worldstate/relic-lith.png',
  meso: 'assets/icons/worldstate/relic-meso.png',
  neo: 'assets/icons/worldstate/relic-neo.png',
  axi: 'assets/icons/worldstate/relic-axi.png',
  requiem: 'assets/icons/worldstate/relic-requiem.png',
  omnia: 'assets/icons/worldstate/relic-omnia.png'
};

function relicTierImage(tier) {
  const t = String(tier || '').toLowerCase();
  return RELIC_TIER_IMAGES[t] || 'assets/icons/worldstate/relic-lith.png';
}

function renderFissures(list) {
  const filtered = activeFissureTier === 'all'
    ? list
    : list.filter(f => f.tier.toLowerCase() === activeFissureTier.toLowerCase());

  $('ws-fissures').innerHTML = filtered.length
    ? filtered.map(f => {
      const isMatch = isFissureAlertMatch(f, notificationSettings);
      return `
      <div class="ws-fissure-card ${isMatch ? 'is-alert-match' : ''}">
        ${isMatch ? `<span class="fissure-alert-badge" title="Fissure alarm match">${Icon.bell(12)}</span>` : ''}
        <img class="ws-fissure-img tier-${esc(String(f.tier || '').toLowerCase())}" src="${relicTierImage(f.tier)}" alt="${esc(f.tier)}" onerror="this.style.display='none'">
        <div class="ws-fissure-info">
          <span class="ws-fissure-tier ${esc(f.tier)}">${esc(f.tier)}</span>
          <b class="ws-fissure-mission">${esc(f.missionType)}${f.isHard ? ' <small style="color:var(--red); font-size:11px;">[Steel Path]</small>' : ''}</b>
          <span class="ws-fissure-node">${esc(f.node)} · ${esc(f.enemy)}</span>
        </div>
        <span class="ws-fissure-eta">${esc(f.eta)}</span>
      </div>
    `;}).join('')
    : '<div class="empty" style="grid-column: 1 / -1;">No active fissures match this filter.</div>';
}

document.querySelectorAll('.fissure-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.fissure-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFissureTier = tab.dataset.tier;
    if (worldStateCache) renderFissures(worldStateCache.fissures || []);
  };
});

/* ---------------- 2. Ressourcen & Farm-Guide ---------------- */
let farmGuideCache = [];
let miningCache = null;
let fgSearchTimer;
let fgMode = 'resources';   // 'resources' | 'mining'
let fgCategory = 'all';     // Kategoriefilter des Ressourcen-Modus

async function loadFarmGuide(q = '') {
  /* Bleibt der Aufruf ohne Antwort, darf daraus kein Fehler werden, der den
     ganzen Tab leer stehen laesst - dann eben eine leere Liste. */
  const data = (await window.api.getFarmingGuide(q)) || {};
  farmGuideCache = data.resources || [];
  renderFarmCategories(data.categories || []);
  renderFarmGuide(farmGuideCache);
}

async function loadMiningGuide(q = '') {
  miningCache = (await window.api.getMiningGuide(q)) || null;
  renderMiningGuide(miningCache);
}

/** Beide Modi haengen an derselben Suchzeile, also fuettert sie beide. */
function reloadFarmTab() {
  const q = $('fg-search') ? $('fg-search').value : '';
  return fgMode === 'mining' ? loadMiningGuide(q) : loadFarmGuide(q);
}

/* ---- Modus 1: Sternenkarten-Ressourcen ---- */

function renderFarmCategories(cats) {
  const bar = $('fg-cats');
  if (!bar || !cats.length) return;

  /* Zahl je Kategorie steht am Chip: ohne sie klickt man blind auf einen
     Filter, hinter dem drei Eintraege liegen. Gezaehlt wird auf dem, was die
     Suche zurueckgab - der Chip zeigt also, was dieser Filter JETZT braechte. */
  const count = key => key === 'all'
    ? farmGuideCache.length
    : farmGuideCache.filter(r => r.category === key).length;

  bar.innerHTML = cats.map(c => `
    <button class="filter-chip${fgCategory === c.key ? ' active' : ''}" data-fgcat="${esc(c.key)}">
      ${esc(c.label)} <span class="chip-count">${count(c.key)}</span>
    </button>
  `).join('');

  bar.querySelectorAll('[data-fgcat]').forEach(btn => {
    btn.onclick = () => {
      fgCategory = btn.dataset.fgcat;
      renderFarmCategories(cats);
      renderFarmGuide(farmGuideCache);
    };
  });
}

function renderFarmGuide(list = []) {
  const grid = $('fg-grid');
  if (!grid) return;

  const shown = fgCategory === 'all' ? list : list.filter(r => r.category === fgCategory);

  grid.innerHTML = shown.length
    ? shown.map(r => `
      <div class="fg-card">
        <div class="fg-head">
          <img class="mat-icon" src="${esc(r.image)}" alt="">
          <div class="fg-title-info">
            <h3>${esc(r.name)}</h3>
            <span class="fg-cat-badge">${esc(r.category)}</span>
          </div>
        </div>
        <p class="fg-desc">${esc(r.description)}</p>

        <div class="fg-planets">
          ${(r.planets || []).map(p => `<span class="fg-planet-tag">${esc(p)}</span>`).join('')}
        </div>

        <div class="fg-nodes">
          <b class="fg-label">Best farming nodes</b>
          ${(r.bestNodes || []).map(n => `
            <div class="fg-node-item">
              <div class="fg-node-head">
                <b>${esc(n.planet)} · ${esc(n.node)}</b>
                <span>${esc(n.type || '')}</span>
              </div>
              <div class="fg-node-desc">${esc(n.desc)}</div>
            </div>
          `).join('')}
        </div>

        ${(r.alsoFrom || []).length ? `
          <div class="fg-also">
            <b class="fg-label">Also comes from</b>
            <ul>${r.alsoFrom.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
          </div>
        ` : ''}

        <div class="fg-frames">
          <b>Recommended frames / setups:</b> ${(r.recommendedFrames || []).map(esc).join(', ')}
        </div>

        ${r.tips ? `
          <div class="fg-tip">
            <span class="tip-ic">${Icon.bulb(13)}</span><b>Tip:</b> ${esc(r.tips)}
          </div>
        ` : ''}
      </div>
    `).join('')
    /* Zwei verschiedene Leerfaelle: nichts gefunden, oder gefunden aber vom
       Kategoriefilter weggeschnitten. Die zweite Meldung sagt, wo es liegt -
       sonst sucht man den Fehler in der Suchzeile statt im Chip darueber. */
    : list.length
      ? `<div class="empty" style="grid-column: 1 / -1;">${list.length} match${list.length === 1 ? '' : 'es'}, but none in this category. Pick “All” to see them.</div>`
      : '<div class="empty" style="grid-column: 1 / -1;">No resources found for that search.</div>';

  /* onerror als Attribut laeuft hier NICHT - die Content-Security-Policy der
     Seite verwirft Inline-Handler. Ohne das blieb bei einem Bild, das der
     Bilderdienst nicht kennt, das kaputte Ersatzsymbol stehen. */
  onImageFail(grid, '.mat-icon', img => { img.style.display = 'none'; });
}

/* ---- Modus 2: Bergbau ---- */

/**
 * Der Felsen mit der leuchtenden Ader.
 *
 * Das ist die eigentliche Antwort auf "woran erkenne ich das Erz?": ein Stein
 * mit einem Riss darin, und der Riss hat die Farbe, die im Spiel darauf
 * hinweist. Gezeichnet statt fotografiert, weil ein Screenshot aus dem Spiel
 * weder in beiden Themes noch in dieser Groesse funktioniert - und weil die
 * Farbe die Information ist, nicht der Felsen.
 */
let veinSwatchSeq = 0;

function veinSwatch(vein, size = 46) {
  const c = vein || {};
  /* Der Verlauf braucht eine id, und die muss im Dokument einmalig sein: bei
     dreissig Karten mit denselben drei Adernfarben gaebe es sonst dreissig
     Elemente mit id="vgred". Sichtbar faellt das nicht auf - dieselbe
     Definition, dasselbe Bild - aber gueltiges HTML ist es nicht, und die
     naechste Ader mit abweichender Farbe wuerde still die erste erben. */
  const id = 'vg' + String(c.key || 'x') + '-' + (++veinSwatchSeq);
  return `
    <svg class="vein-swatch" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id="${id}" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="${esc(c.glow || '#fff')}" stop-opacity=".95"/>
          <stop offset="100%" stop-color="${esc(c.hex || '#888')}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <path d="M9 17 22 6l17 5 4 16-12 14-16-2-6-13Z"
            fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.16)" stroke-width="1.4"/>
      <circle cx="24" cy="24" r="17" fill="url(#${id})"/>
      <path d="M15 30c4-3 5-8 9-10s6 1 9-3"
            fill="none" stroke="${esc(c.hex || '#888')}" stroke-width="3.4"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M15 30c4-3 5-8 9-10s6 1 9-3"
            fill="none" stroke="${esc(c.glow || '#fff')}" stroke-width="1.2"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function renderMiningGuide(data) {
  if (!data) return;
  const { resources = [], worlds = [], cutters = [], facts = [], veinColors = {} } = data;

  /* Die Legende steht ueber allem anderen, weil sie die Regel ist, aus der
     sich der Rest ergibt - nicht als Fussnote darunter. */
  const key = $('fg-vein-key');
  if (key) {
    key.innerHTML = Object.values(veinColors).map(v => `
      <div class="fg-vein-key-item" style="--vein: ${esc(v.hex)};">
        ${veinSwatch(v, 40)}
        <div>
          <b>${esc(v.label)}</b>
          <span>yields ${esc(v.yields)}</span>
        </div>
      </div>
    `).join('') + `
      <div class="fg-vein-key-note">
        Ore veins are <b>red</b> on the Plains and the Vallis but <b>yellow</b> on the Cambion Drift.
        Gem veins are <b>blue</b> everywhere. That colour is the only thing you know before you cut.
      </div>`;
  }

  const worldBox = $('fg-worlds');
  if (worldBox) {
    worldBox.innerHTML = worlds.map(w => `
      <div class="fg-world">
        <div class="fg-world-head">
          <h3>${esc(w.name)}</h3>
          <span>${esc(w.hub)}</span>
        </div>
        <div class="fg-world-veins">
          <span class="fg-vein-tag" style="--vein: ${esc((veinColors[w.oreVein] || {}).hex || '#888')};">Ore · ${esc(w.oreVein)}</span>
          <span class="fg-vein-tag" style="--vein: ${esc((veinColors[w.gemVein] || {}).hex || '#888')};">Gem · ${esc(w.gemVein)}</span>
        </div>
        <div class="fg-world-meta">
          <b>Vendor:</b> ${esc(w.vendor)} · <b>Standing:</b> ${esc(w.syndicate)}<br>
          <b>Tool:</b> ${esc(w.tool)}
        </div>
        <div class="fg-nodes">
          <b class="fg-label">Densest mining spots</b>
          ${(w.bestSpots || []).map(s => `
            <div class="fg-node-item">
              <div class="fg-node-head"><b>${esc(s.name)}</b></div>
              <div class="fg-node-desc">${esc(s.desc)}</div>
            </div>
          `).join('')}
        </div>
        <div class="fg-tip"><span class="tip-ic">${Icon.bulb(13)}</span><b>Tip:</b> ${esc(w.tips)}</div>
      </div>
    `).join('');
  }

  const grid = $('fg-mining-grid');
  if (grid) {
    grid.innerHTML = resources.length
      ? resources.map(r => `
        <div class="fg-card fg-mine-card" style="--vein: ${esc(r.veinColor.hex)};">
          <!-- Das Erz zuerst, die Ader danach. Andersherum stand der Felsen
               vorne und gross, das Erz klein und abgeblendet am Rand - und was
               eine Karte anfuehrt, liest man als ihr Thema. Die Karte heisst
               aber nach dem Erz. Die Ader ist der Hinweis darauf, nicht die
               Sache selbst; was sie bedeutet, steht ohnehin in der Zeile
               direkt darunter ausgeschrieben. -->
          <div class="fg-head">
            <img class="mat-icon" src="${esc(r.image)}" alt="">
            <div class="fg-title-info">
              <h3>${esc(r.name)}</h3>
              <span class="fg-cat-badge">${esc(r.rarity)} ${esc(r.kind)} · ${esc(r.world)}</span>
            </div>
            ${veinSwatch(r.veinColor, 40)}
          </div>

          <div class="fg-vein-line">
            <span class="fg-vein-dot"></span>
            <b>${esc(r.veinColor.label)}</b>
            <span>${esc(r.veinYield.multiplier)} multiplier · max ${esc(String(r.veinYield.max))} per vein</span>
          </div>

          <div class="fg-refined">
            ${r.refinedImage ? `<img class="mat-icon" src="${esc(r.refinedImage)}" alt="">` : ''}
            <div>
              <b class="fg-label">Refines into</b>
              <span>${esc(r.refined)}</span>
            </div>
          </div>

          <div class="fg-mine-meta">
            <div><b>Cutter:</b> ${esc(r.tool)}</div>
            ${r.standing ? `<div><b>Standing:</b> ${esc(String(r.standing))} with ${esc(r.standingWith)}</div>`
                         : r.standingWith ? `<div><b>Standing:</b> ${esc(r.standingWith)}</div>` : ''}
            <div><b>Used for:</b> ${esc(r.usedFor)}</div>
          </div>

          <div class="fg-tip"><span class="tip-ic">${Icon.bulb(13)}</span>${esc(r.note)}</div>
        </div>
      `).join('')
      : '<div class="empty" style="grid-column: 1 / -1;">No ore or gem matches that search.</div>';

    onImageFail(grid, '.mat-icon', img => { img.style.display = 'none'; });
  }

  const cutterBox = $('fg-cutters');
  if (cutterBox) {
    cutterBox.innerHTML = `
      <b class="fg-label">Cutters — only the last two can produce special gems</b>
      <div class="fg-cutter-list">
        ${cutters.map(c => `
          <div class="fg-cutter${c.special === '0%' ? ' is-weak' : ''}">
            <div class="fg-cutter-head">
              <b>${esc(c.name)}</b>
              <span class="fg-cutter-special">${esc(c.special)} special</span>
            </div>
            <div class="fg-cutter-meta">${esc(c.cost)} · ${esc(c.rank)} · ${esc(c.from)}</div>
            <div class="fg-cutter-meta">${esc(c.detection)} · ${esc(c.bonus)} bonus bracket</div>
            <div class="fg-node-desc">${esc(c.note)}</div>
          </div>
        `).join('')}
      </div>`;
  }

  const factBox = $('fg-facts');
  if (factBox) {
    factBox.innerHTML = `
      <b class="fg-label">How mining actually works</b>
      <ul>${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
  }
}

/* ---- Moduswechsel und Suche ---- */

document.querySelectorAll('.fg-mode').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.fg-mode').forEach(b => b.classList.toggle('active', b === btn));
    fgMode = btn.dataset.fgmode;
    $('fg-pane-resources').hidden = fgMode !== 'resources';
    $('fg-pane-mining').hidden    = fgMode !== 'mining';
    $('fg-search').placeholder = fgMode === 'mining'
      ? 'Search an ore, gem or landscape … e.g. Hesperon, blue, Cambion Drift, rare'
      : 'Search a resource or planet … e.g. Orokin Cell, Tellurium, Saturn, Uranus';
    reloadFarmTab();
  };
});

$('fg-search').oninput = () => {
  clearTimeout(fgSearchTimer);
  fgSearchTimer = setTimeout(reloadFarmTab, 200);
};

function openFarmGuideFor(name) {
  if (!name) return;
  showTab('farmguide');
  $('fg-search').value = name;
  reloadFarmTab();
}

/* ---------------- 3. Baro Dukaten & Relikt-Helper ---------------- */
let ducatsData = null;
let sellQuantities = new Map(); // slug -> count
let currentSelectionPreset = 'none'; // 'all' | 'duplicates' | 'custom' | 'none'
let ducatsMode = 'inventory';    // 'inventory' | 'catalog' | 'sets' | 'plan'
let planTier = 'all';            // Aera-Filter des Planers
let planSort = 'plat-desc';      // Sortierung des Planers
let planOnlyTracked = false;     // nur die gemerkten Relikte zeigen
let trackedRelicIds = new Set(); // "Lith V1|Radiant" der gemerkten Relikte
let ducatsFilter = 'all';        // 'all' | 'advice-junk' | 'advice-plat' | '100' | '45' | '15'
let ducatsSort = 'ducats-desc';   // 'ducats-desc' | 'plat-desc' | 'ratio-desc' | 'count-desc' | 'name-asc'
let isFetchingDucatPrices = false;

function updateSelectionPresetButtons() {
  $('btn-ducats-select-all')?.classList.toggle('active', currentSelectionPreset === 'all');
  $('btn-ducats-select-dups')?.classList.toggle('active', currentSelectionPreset === 'duplicates');
}

async function loadDucats() {
  const res = await window.api.getDucatsData();
  ducatsData = res;
  trackedRelicIds = new Set((res?.trackedRelics || []).map(t => t.id));

  /* KEINE VORAUSWAHL. Vorher stand hier beim Oeffnen des Tabs jedes Teil des
     Inventars auf "verkaufen" - inklusive der Einzelstuecke, von denen man
     genau eines besitzt. Die Kopfzahlen zeigten damit einen Erloes, der eine
     Entscheidung vorwegnimmt, die niemand getroffen hat. Was verkauft wird,
     waehlt man selbst; "Select all" und "Duplicates only" stehen dafuer als
     Knopf in der Leiste. */

  // Modus umschalten, falls kein Inventar vorhanden ist
  if (!ducatsData?.inventory?.items?.length && ducatsMode === 'inventory') {
    ducatsMode = 'catalog';
  }

  renderDucats();
  initDucatsEventListeners();

  // Fehlende Preise im Hintergrund automatisch nachladen
  fetchMissingDucatPrices();

  /* Baros Angebot gleich mit - nicht erst beim Umschalten. Sonst stuende am
     Reiter dauerhaft eine 0, und genau die Zahl ist der Grund hinzusehen:
     wie viel von dem, was er dabei hat, einem noch fehlt. */
  loadBaroOffer();
}

async function fetchMissingDucatPrices(forceAll = false) {
  if (isFetchingDucatPrices || !ducatsData) return;
  /* Baros Waren tragen keine Marktpreise - sie kosten Dukaten und Credits.
     Ohne diese Zeile liefe hier der ganze Prime-Katalog durch die
     Preisabfrage, ohne dass eine einzige Zahl davon angezeigt wuerde. */
  if (ducatsMode === 'baro') return;

  let missingSlugs;

  if (ducatsMode === 'plan') {
    /* Ohne Preise ist der Erwartungswert nur die halbe Auskunft - hier wird
       deshalb genau das nachgeladen, was in den Tabellen steht. */
    const wanted = [];
    for (const relic of ducatsData.relicPlan || []) {
      for (const w of relic.rewards) {
        if (w.slug && (forceAll || w.plat == null)) wanted.push(w.slug);
      }
    }
    missingSlugs = [...new Set(wanted)];
  } else if (ducatsMode === 'sets') {
    /* Das Set-Item traegt einen eigenen Preis - die Summe der Teile ist etwas
       anderes und liegt regelmaessig hoeher als das fertige Set. */
    const wanted = [];
    for (const set of ducatsData.sets || []) {
      if (set.setSlug && (forceAll || !set.setPrice)) wanted.push(set.setSlug);
      for (const p of set.parts) {
        if (p.count > 0 && (forceAll || !p.price)) wanted.push(p.slug);
      }
    }
    missingSlugs = [...new Set(wanted)].filter(Boolean);
  } else {
    const targetItems = (ducatsMode === 'inventory' ? ducatsData.inventory?.items : ducatsData.catalog) || [];
    missingSlugs = targetItems
      .filter(it => forceAll || !it.price || it.price.min == null)
      .map(it => it.slug)
      .filter(Boolean);
  }

  if (!missingSlugs.length) return;

  isFetchingDucatPrices = true;
  updateDucatsPriceButtonState(true);

  try {
    const BATCH_SIZE = 10;
    for (let i = 0; i < missingSlugs.length; i += BATCH_SIZE) {
      const batch = missingSlugs.slice(i, i + BATCH_SIZE);
      const newPrices = await window.api.fetchDucatPrices(batch);

      applyDucatPrices(newPrices);
      renderDucatsKPIs();
      renderDucatsCatalog();
    }
  } catch (err) {
    console.error('Could not reload platinum prices:', err);
  } finally {
    isFetchingDucatPrices = false;
    updateDucatsPriceButtonState(false);
  }
}

function applyDucatPrices(priceMap) {
  if (!priceMap || !ducatsData) return;

  function updateItem(it) {
    if (priceMap[it.slug]) {
      it.price = priceMap[it.slug];
      const price = it.price;
      if (price && typeof price.min === 'number' && price.min > 0) {
        const ratio = +(it.ducats / price.min).toFixed(1);
        if (price.min >= 15 || ratio < 7.0) {
          it.tradeAdvice = { advice: 'plat', ratio, label: 'Sell for platinum', reason: `${price.min}p minimum price on warframe.market` };
        } else if (ratio >= 10.0) {
          it.tradeAdvice = { advice: 'ducats', ratio, label: 'Prime Junk', reason: `${ratio} ducats per platinum (high melt value)` };
        } else {
          it.tradeAdvice = { advice: 'balanced', ratio, label: 'Balanced', reason: `${ratio} ducats per platinum` };
        }
      }
    }
  }

  (ducatsData.inventory?.items || []).forEach(updateItem);
  (ducatsData.catalog || []).forEach(updateItem);

  /* Die Relikt-Karten rechnen mit denselben Preisen, stehen aber in einer
     eigenen Liste - ohne diese Runde blieben ihre Erwartungswerte auf dem
     Stand des Programmstarts, waehrend die Teileliste daneben schon frische
     Zahlen zeigt. */
  for (const relic of ducatsData.relicPlan || []) {
    let touched = false;
    for (const w of relic.rewards || []) {
      if (w.slug && priceMap[w.slug] !== undefined) {
        w.plat = priceMap[w.slug]?.min ?? null;
        touched = true;
      }
    }
    if (!touched) continue;

    /* Dieselbe Rechnung wie in core/relics.js: Chance mal Wert, und der
       Anteil der Chance, fuer den ueberhaupt ein Preis vorliegt. */
    let expPlat = 0, priced = 0, total = 0;
    for (const w of relic.rewards || []) {
      const chance = w.chance || 0;
      total += chance;
      if (w.plat != null) { expPlat += chance / 100 * w.plat; priced += chance; }
    }
    relic.expPlat = Math.round(expPlat * 10) / 10;
    relic.pricedShare = total ? priced / total : 0;
  }
}

function renderDucats() {
  if (!ducatsData) return;
  renderDucatsStatusBar();
  renderDucatsKPIs();
  updateDucatsModeTabs();
  updateSelectionPresetButtons();
  renderDucatsCatalog();
}

function renderDucatsStatusBar() {
  const bar = $('ducats-status-bar');
  if (!bar) return;

  const hasInv = ducatsData.hasInventory && ducatsData.inventory?.items?.length > 0;

  /* Nur der Warnfall bekommt einen Balken. Dass ein Inventar DA ist, sieht man
     an den Zahlen darunter - dafuer braucht es keine gruene Leiste, die auf
     Dauer nur Platz kostet und nichts entscheidet. */
  if (hasInv) { bar.className = 'ducats-status-bar hidden'; return; }

  bar.className = 'ducats-status-bar bar-warning';
  bar.innerHTML = `
    <span class="status-dot warning"></span>
    <span><b>No live inventory:</b> start Warframe and press <b>Fetch inventory</b> on the Inventory tab to read your account. Until then you are looking at the full catalogue.</span>
  `;
}

function renderDucatsKPIs() {
  if (!ducatsData) return;

  let selectedDucats = 0;
  let selectedPlatMin = 0;
  let selectedPlatMed = 0;
  let selectedItemsCount = 0;

  const allItems = [...(ducatsData.inventory?.items || []), ...(ducatsData.catalog || [])];
  const itemMap = new Map();
  for (const it of allItems) {
    if (!itemMap.has(it.slug)) itemMap.set(it.slug, it);
  }

  sellQuantities.forEach((qty, slug) => {
    if (qty <= 0) return;
    const item = itemMap.get(slug);
    if (!item) return;

    selectedDucats += item.ducats * qty;
    selectedItemsCount += qty;

    if (item.price?.min != null) {
      selectedPlatMin += item.price.min * qty;
      selectedPlatMed += (item.price.median || item.price.min) * qty;
    }
  });

  // KPI 1: Ausgewählte Dukaten
  if ($('ducats-selected-total')) $('ducats-selected-total').textContent = nf(selectedDucats);
  if ($('ducats-selected-sub')) {
    const totalInv = ducatsData.inventory?.summary?.totalItems || 0;

    /* Nichts gewaehlt ist jetzt der Startzustand, nicht mehr eine Ausnahme -
       hier steht deshalb der naechste Schritt statt "0 parts selected · no
       parts selected", was zweimal dasselbe sagte. */
    if (!selectedItemsCount) {
      /* Kurz halten: .stat-sub ist einzeilig und schneidet mit Ellipse ab.
         Wo die Knoepfe dafuer sitzen, steht eine Zeile tiefer in der Leiste -
         das muss die Karte nicht wiederholen. */
      $('ducats-selected-sub').textContent = totalInv
        ? 'Nothing selected yet — pick parts to sell'
        : 'No prime parts in your inventory';
    } else {
      const presetLabel = currentSelectionPreset === 'all' ? ' · all selected'
                        : currentSelectionPreset === 'duplicates' ? ' · duplicates selected'
                        : '';
      $('ducats-selected-sub').textContent =
        `${nf(selectedItemsCount)} parts selected ${totalInv ? `(of ${nf(totalInv)})` : ''}${presetLabel}`;
    }
  }

  // KPI 2: Platin-Wert
  if ($('ducats-selected-plat')) $('ducats-selected-plat').textContent = `~${nf(selectedPlatMin)}`;
  if ($('ducats-selected-plat-sub')) {
    $('ducats-selected-plat-sub').textContent = `Min. ${nf(selectedPlatMin)}p · Median ${nf(selectedPlatMed)}p`;
  }

  // KPI 3: Gesamt-Inventar
  const invSum = ducatsData.inventory?.summary || { totalDucats: 0, totalItems: 0, duplicateDucats: 0, duplicateItems: 0 };
  if ($('ducats-inv-total-ducats')) $('ducats-inv-total-ducats').textContent = nf(invSum.totalDucats);
  if ($('ducats-inv-total-sub')) {
    $('ducats-inv-total-sub').textContent = `${nf(invSum.totalItems)} parts owned · duplicates: ${nf(invSum.duplicateDucats)} duc.`;
  }

  // KPI 4: Baro Kaufkraft
  const baroItems = Math.floor(selectedDucats / 375);
  if ($('ducats-baro-power')) $('ducats-baro-power').textContent = `~${baroItems}`;
  if ($('ducats-baro-sub')) {
    $('ducats-baro-sub').textContent = baroItems >= 1
      ? `Enough for about ${baroItems} primed mods`
      : `Not enough for a primed mod yet`;
  }
  if ($('ic-baro-kaufkraft') && !$('ic-baro-kaufkraft').hasChildNodes()) {
    $('ic-baro-kaufkraft').innerHTML = Icon.baro(36);
  }

  // Tab Badge
  if ($('ducats-inv-badge-count')) {
    $('ducats-inv-badge-count').textContent = (ducatsData.inventory?.items || []).length;
  }
}

function updateDucatsModeTabs() {
  $('tab-ducats-mode-inv')?.classList.toggle('active', ducatsMode === 'inventory');
  $('tab-ducats-mode-cat')?.classList.toggle('active', ducatsMode === 'catalog');
  $('tab-ducats-mode-sets')?.classList.toggle('active', ducatsMode === 'sets');
  $('tab-ducats-mode-plan')?.classList.toggle('active', ducatsMode === 'plan');
  $('tab-ducats-mode-baro')?.classList.toggle('active', ducatsMode === 'baro');

  if ($('ducats-sets-badge-count')) {
    $('ducats-sets-badge-count').textContent = (ducatsData?.sets || []).length;
  }
  if ($('ducats-plan-badge-count')) {
    $('ducats-plan-badge-count').textContent = (ducatsData?.relicPlan || []).length;
  }

  /* Seltenheits-Chips und Sortierung beziehen sich auf einzelne Teile. In der
     Set- und der Baro-Ansicht haetten sie nichts zu filtern und stuenden nur
     im Weg - die Suche bleibt, die trifft auch Set- und Warennamen. */
  const flat = ducatsMode === 'inventory' || ducatsMode === 'catalog';
  const isPlan = ducatsMode === 'plan';

  $('ducats-filter-chips')?.classList.toggle('hidden', !flat);
  /* Der erste Treffer ist die Sortierung des Planers - deshalb gezielt ueber
     die Kennung, nicht ueber die Klasse. */
  $('ducats-sort')?.closest('.ducats-sort-wrap')?.classList.toggle('hidden', !flat);
  $('plan-sort-wrap')?.classList.toggle('hidden', !isPlan);
  $('plan-tier-filter')?.classList.toggle('hidden', !isPlan);

  /* "Select all", "Duplicates only" und "Clear" waehlen Teile zum Verkauf
     aus. Im Planer und bei Baro gibt es nichts auszuwaehlen - dort waeren es
     drei Knoepfe, die nichts tun. */
  $('tab-ducats')?.querySelector('.ducats-quick-actions')?.classList.toggle('hidden', !flat);
}

/**
 * Relikt-Planer: welches der eigenen Relikte lohnt sich zu oeffnen?
 *
 * Gezeigt wird der Erwartungswert - Chance mal Wert, nicht der Mittelwert der
 * sechs Belohnungen. Die Chancen sind sehr ungleich (25,33 % gegen 2 %); ein
 * Mittelwert wuerde das seltene Teil genauso zaehlen wie ein haeufiges und
 * jedes Relikt wertvoller aussehen lassen, als es ist.
 */
/** Aera-Filter des Planers - dieselbe Optik wie im Inventar. */
function renderPlanTierFilter(all) {
  const box = $('plan-tier-filter');
  if (!box) return;

  const counts = new Map();
  for (const r of all) counts.set(r.tier, (counts.get(r.tier) || 0) + 1);

  const order = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'];
  const tiers = order.filter(t => counts.has(t));
  if (!tiers.length) { box.innerHTML = ''; return; }

  /* Der Merk-Chip steht neben den Aeren, weil er dieselbe Frage beantwortet:
     welcher Ausschnitt der Liste ist gerade gemeint. Er erscheint erst, wenn
     etwas gemerkt ist - ein Filter, der garantiert nichts uebrig laesst,
     gehoert nicht in die Leiste. */
  const trackedCount = trackedRelicIds.size;
  const traces = ducatsData?.voidTraces ?? 0;

  /* ALLES IN EINER ZEILE, anders als im Inventar: hier gibt es nur eine Achse
     (die Aera), dazu den Merk-Schalter und die Spuren-Anzeige. Der
     Zeilen-Container ist trotzdem noetig - die Leiste ist eine Spalte, ohne
     ihn bekaeme jeder Chip eine eigene Zeile. */
  box.innerHTML = `<div class="chip-row">` +
    `<button class="tier-chip ${planTier === 'all' ? 'active' : ''}" type="button" data-tier="all">
       <i class="chip-ic">${Icon.grid(15)}</i>All <span>${all.length}</span>
     </button>` +
    tiers.map(t => `
      <button class="tier-chip tier-${t.toLowerCase()} ${planTier === t ? 'active' : ''}"
              type="button" data-tier="${t}">
        ${t} <span>${counts.get(t)}</span>
      </button>`).join('') +
    (trackedCount ? `
      <button class="tier-chip chip-tracked ${planOnlyTracked ? 'active' : ''}" type="button" data-tracked="1"
              title="Only the relics shown in the overlay">
        <i class="chip-ic">${Icon.star(15)}</i>Gemerkt <span>${trackedCount}</span>
      </button>` : '') +
    `<span class="tier-chip chip-traces" title="Void Traces (Spuren des Nichts)">
       <img class="chip-ic chip-ic-img" src="assets/icons/currency/traces.png" alt=""><span>${nf(traces)} Traces</span>
     </span>` +
    `</div>`;

  box.querySelectorAll('[data-tier]').forEach(btn => {
    btn.onclick = () => { planTier = btn.dataset.tier; renderDucatsRelicPlan(); };
  });
  box.querySelector('[data-tracked]')?.addEventListener('click', () => {
    planOnlyTracked = !planOnlyTracked;
    renderDucatsRelicPlan();
  });
}

/* Die vier Zustaende heissen in DEs Droptabelle genauso wie im englischen
   Spiel - die Zuordnung ist deshalb derzeit eine Eins-zu-eins-Abbildung. Sie
   bleibt trotzdem stehen: sie ist die eine Stelle, an der eine Umbenennung
   durch DE aufzufangen waere, und der Aufrufer muss davon nichts wissen. */
const RELIC_STATE_LABEL = {
  Intact: 'Intact',
  Exceptional: 'Exceptional',
  Flawless: 'Flawless',
  Radiant: 'Radiant'
};
const relicStateLabel = st => RELIC_STATE_LABEL[st] || st || '';

/**
 * Ein Relikt merken oder vergessen.
 *
 * Der Stern schaltet sofort um und wartet nicht auf die Platte: der Klick
 * soll sich wie ein Schalter anfuehlen, nicht wie ein Auftrag. Kommt die
 * gespeicherte Liste zurueck, ersetzt sie die Annahme - dann steht auch
 * wieder gerade, was ein fehlgeschlagenes Speichern verstellt haette.
 */
async function toggleTrackedRelic(id) {
  const [key, state] = id.split('|');
  const relic = (ducatsData?.relicPlan || []).find(r => r.key === key && r.state === state);

  if (trackedRelicIds.has(id)) trackedRelicIds.delete(id);
  else trackedRelicIds.add(id);
  renderDucatsRelicPlan();

  try {
    const list = await window.api.toggleTrackedRelic({
      key, state, tier: relic?.tier || '', name: relic?.name || ''
    });
    trackedRelicIds = new Set((list || []).map(t => t.id));
  } catch (err) {
    console.error('Merkliste nicht gespeichert:', err);
  }
  renderDucatsRelicPlan();
}

function renderDucatsRelicPlan() {
  const container = $('ducats-catalog');
  if (!container) return;

  const query = ($('ducat-search')?.value || '').trim().toLowerCase();
  const all = ducatsData?.relicPlan || [];

  renderPlanTierFilter(all);

  let plan = query
    ? all.filter(r => (r.tier + ' ' + r.name).toLowerCase().includes(query)
        || r.rewards.some(w => w.name.toLowerCase().includes(query)))
    : all;

  if (planTier !== 'all') plan = plan.filter(r => r.tier === planTier);
  if (planOnlyTracked) plan = plan.filter(r => trackedRelicIds.has(r.key + '|' + r.state));

  /* Sortiert wird auf einer Kopie: die Reihenfolge aus dem Hauptprozess bleibt
     erhalten, sonst wuerde jede Umsortierung die naechste beeinflussen. */
  plan = [...plan].sort((a, b) => {
    switch (planSort) {
      case 'ducats-desc': return b.expDucats - a.expDucats || b.expPlat - a.expPlat;
      case 'count-desc':  return b.count - a.count || b.expPlat - a.expPlat;
      case 'priced-desc': return b.pricedShare - a.pricedShare || b.expPlat - a.expPlat;
      case 'name-asc':    return (a.tier + a.name).localeCompare(b.tier + b.name, 'de', { numeric: true });
      default:            return b.expPlat - a.expPlat || b.expDucats - a.expDucats;
    }
  });

  if (!plan.length) {
    container.innerHTML = `
      <div class="ducats-empty-box">
        <div class="empty-icon">${Icon.relic(30)}</div>
        <h3>${all.length ? 'No matches' : 'No relics in stock'}</h3>
        <p>${!all.length
          ? 'Once you have relics in your inventory, Argus works out here which one is worth cracking.'
          : planOnlyTracked
            ? 'No tracked relic matches your search and era filter.'
            : 'No relic matches your search.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = plan.slice(0, 60).map(r => {
    const thin = r.pricedShare < 0.9;
    const id = r.key + '|' + r.state;
    const tracked = trackedRelicIds.has(id);

    const rewards = [...r.rewards]
      .sort((a, b) => (b.plat ?? -1) - (a.plat ?? -1) || b.chance - a.chance)
      .map(w => `
        <div class="plan-rw rarity-${esc(String(w.rarity || '').toLowerCase())}">
          <img class="plan-rw-img" src="${esc(w.image || '')}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'">
          <span class="plan-rw-name">${esc(w.name)}</span>
          <span class="plan-rw-chance">${w.chance}%</span>
          <span class="plan-rw-plat">${w.plat != null ? w.plat + 'p' : '–'}</span>
          <span class="plan-rw-duc">${w.ducats != null ? w.ducats : '–'}</span>
        </div>`).join('');

    return `
      <div class="plan-card tier-${esc(r.tier.toLowerCase())} ${tracked ? 'tracked' : ''}">
        <div class="plan-head">
          <img class="plan-img" src="${esc(r.image || '')}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'">
          <div class="plan-title">
            <span class="plan-tier">${esc(r.tier)}</span>
            <b>${esc(r.name)}</b>
            <span class="plan-state">${esc(relicStateLabel(r.state))}${r.count > 1 ? ' · ×' + r.count : ''}</span>
            <button class="plan-track ${tracked ? 'on' : ''}" data-track="${esc(id)}"
                    title="${tracked ? 'Aus dem Overlay nehmen' : 'Im Overlay anzeigen'}">
              ${Icon.star(14)}
            </button>
          </div>
          <div class="plan-exp">
            <span class="plan-exp-val" title="Expected platinum return per crack">
              <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platin">
              <b>${r.expPlat}</b>
            </span>
            <span class="plan-exp-val" title="Expected ducat value per crack">
              <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Ducats">
              <b>${nf(r.expDucats)}</b>
            </span>
          </div>
        </div>

        ${thin ? `<div class="plan-thin" title="Parts with no known price count as nothing">
            ${Icon.warning(12)} Prices known for ${Math.round(r.pricedShare * 100)}% of the drop chance — the platinum value is a lower bound
          </div>` : ''}

        <div class="plan-rewards">${rewards}</div>
      </div>`;
  }).join('') + (plan.length > 60
    ? `<div class="inv-more">… and ${nf(plan.length - 60)} more. Use the search.</div>`
    : '');

  container.querySelectorAll('[data-track]').forEach(btn => {
    btn.onclick = () => toggleTrackedRelic(btn.dataset.track);
  });
}

/**
 * Prime-Sets mit Besitzstand.
 *
 * Dieselbe Frage wie auf den Relikt-Karten im Spiel, nur in Ruhe: von welchem
 * Set habe ich schon was, und welches Teil fehlt noch. Eine flache Teileliste
 * beantwortet das nicht - dort steht "Lex Prime Barrel x1", ohne zu verraten,
 * ob das das letzte fehlende Teil war oder das dritte Duplikat.
 */
function updateDucatsPriceButtonState(loading) {
  const btn = $('btn-ducats-fetch-prices');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-sm"></span> Loading prices …`;
  } else {
    btn.disabled = false;
    btn.innerHTML = Icon.refresh(15) + ' <span>Load prices</span>';
  }
}

/* ---------------- Baros Einkaufszettel ----------------
   Baro steht zwei von vierzehn Tagen im Relais und bringt jedes Mal ein gutes
   Dutzend Posten mit. Welche davon man schon hat, sagt seine Liste im Spiel
   nicht - dafuer muesste man den Haendler verlassen und im Arsenal suchen.
   Hier steht es daneben, samt der Frage, ob die Dukaten ueberhaupt reichen.
   ------------------------------------------------------ */

let baroData = null;
let baroLoading = false;
/* Ob ueberhaupt schon einmal versucht wurde. Ohne diese Zeile ruft die
   Ansicht bei einem fehlgeschlagenen Abruf sofort den naechsten auf, der
   wieder scheitert, der wieder zeichnet - eine Schleife aus zwei Zeilen. */
let baroTried = false;

const BARO_KIND_LABEL = {
  mod: 'Mod', weapon: 'Weapon', warframe: 'Warframe', cosmetic: 'Cosmetic',
  blueprint: 'Blueprint', resource: 'Item', other: 'Item'
};

async function loadBaroOffer() {
  if (baroLoading) return;
  baroLoading = true;
  baroTried = true;
  try {
    const res = await window.api.getBaroOffer();
    baroData = res?.ok ? res.data : null;
  } catch (err) {
    console.error('Baros Angebot nicht ladbar:', err);
    baroData = null;
  } finally {
    baroLoading = false;
  }
  if (ducatsMode === 'baro') renderBaroOffer();
  if ($('ducats-baro-badge-count')) {
    $('ducats-baro-badge-count').textContent = baroData?.summary?.missing ?? 0;
  }
}

function renderBaroOffer() {
  const box = $('ducats-catalog');
  if (!box) return;

  if (!baroData) {
    box.innerHTML = `
      <div class="ducats-empty-box">
        <div class="empty-icon">${Icon.baro(30)}</div>
        <h3>${baroLoading ? 'Reading Baro&rsquo;s manifest …' : 'No offer to compare'}</h3>
        <p>Baro&rsquo;s wares are only published while he is standing in a relay. Once he
           arrives, this page lines his manifest up against your inventory.</p>
        ${!baroLoading && baroTried
          ? '<button class="btn btn-sm btn-action" id="btn-baro-retry">Try again</button>'
          : ''}
      </div>`;
    if (!baroLoading && !baroTried) loadBaroOffer();
    $('btn-baro-retry')?.addEventListener('click', () => { baroTried = false; loadBaroOffer(); });
    return;
  }

  const d = baroData;
  const s = d.summary;
  const q = ($('ducat-search')?.value || '').toLowerCase().trim();

  const dukat = n => `<img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Ducats"> ${nf(n)}`;
  const credit = n => `<img class="currency-ic" src="assets/icons/currency/credits.png" alt="Credits"> ${nf(n)}`;

  /* Der Kopf beantwortet zwei Fragen auf einmal: ist er da, und reicht mein
     Beutel. Beides gehoert zusammen - die zweite ist ohne die erste sinnlos. */
  const kopf = `
    <div class="baro-head ${d.active ? 'is-active' : ''}">
      <span class="baro-mark">${Icon.baro(30)}</span>
      <div class="baro-when">
        <b>${d.active ? `${esc(d.character)} is in the relay` : `${esc(d.character)} is travelling`}</b>
        <span>${d.location ? esc(d.location) : 'Relay unknown'}${
          d.active
            ? (d.endString ? ` · leaves in ${esc(d.endString)}` : '')
            : (d.startString ? ` · arrives in ${esc(d.startString)}` : '')}</span>
      </div>
      <div class="baro-purse">
        <span title="Your ducats">${dukat(d.stock.ducats ?? 0)}</span>
        <span title="Your credits">${credit(d.stock.credits ?? 0)}</span>
      </div>
    </div>`;

  if (!d.items.length) {
    box.innerHTML = kopf + `
      <div class="ducats-empty-box">
        <div class="empty-icon">${Icon.baro(30)}</div>
        <h3>Nothing on the manifest yet</h3>
        <p>DE publishes Baro&rsquo;s wares only once he has arrived — there is no list to
           compare against before that, and a guessed one would be worse than none.
           Open this page while he is in the relay and Argus keeps a copy of the offer.</p>
      </div>`;
    return;
  }

  /* Ohne Inventar ist es ein Angebot, kein Zettel - und das steht dabei,
     statt jeden Posten als "fehlt" auszugeben. */
  const hinweis = !d.matched ? `
    <div class="chain-note">${Icon.warning(13)}
      No inventory fetched yet — this is Baro&rsquo;s list without the comparison. Fetch your
      inventory once and Argus marks what you already own.
    </div>` : d.stale ? `
    <div class="chain-note">${Icon.warning(13)}
      This is the manifest from his <b>last visit</b>${
        d.savedAt ? `, saved ${new Date(d.savedAt).toLocaleDateString('en-GB')}` : ''} —
      it is what he brought then, not a promise for the next trip.
    </div>` : '';

  const zahlen = d.matched ? `
    <div class="baro-sum">
      <div><b>${nf(s.missing)}</b><span>you do not own</span></div>
      <div><b>${nf(d.cost.ducats)}</b><span>ducats for all of them</span></div>
      <div><b>${nf(d.cost.credits)}</b><span>credits for all of them</span></div>
      <div class="${s.shortDucats > 0 ? 'is-short' : 'is-ok'}">
        <b>${s.shortDucats > 0 ? nf(s.shortDucats) : nf(s.missing ? d.stock.ducats - d.cost.ducats : 0)}</b>
        <span>${s.shortDucats > 0 ? 'ducats short' : 'ducats left over'}</span>
      </div>
    </div>` : '';

  const treffer = q
    ? d.items.filter(i => i.name.toLowerCase().includes(q))
    : d.items;

  const zeile = i => `
    <div class="baro-row ${i.owned === false ? 'is-missing' : i.owned ? 'is-owned' : ''}">
      ${i.image
        ? `<img class="baro-img" src="${esc(i.image)}" alt="" loading="lazy"
                onerror="this.style.visibility='hidden'">`
        : `<span class="baro-img"></span>`}
      <div class="baro-body">
        <b>${esc(i.name)}</b>
        <span class="baro-tags">
          <span class="baro-kind">${esc(BARO_KIND_LABEL[i.kind] || 'Item')}</span>
          ${i.newMastery ? '<span class="baro-flag is-mr">new mastery</span>' : ''}
          ${i.blueprintOnly ? '<span class="baro-flag is-bp">blueprint owned</span>' : ''}
        </span>
      </div>
      <span class="baro-cost">
        <span class="baro-duc">${dukat(i.ducats)}</span>
        <span class="baro-cr">${nf(i.credits)} cr</span>
      </span>
      <span class="baro-state">${
        i.owned === true ? `${Icon.check(13)} owned`
        : i.owned === false ? 'not owned'
        : '—'}</span>
    </div>`;

  const fehlt = treffer.filter(i => i.owned === false);
  const hat = treffer.filter(i => i.owned !== false);

  const gruppe = (titel, zeilen, cls = '') => zeilen.length ? `
    <div class="baro-group ${cls}">
      <div class="forge-group-head"><span>${titel}</span><em>${zeilen.length}</em></div>
      ${zeilen.map(zeile).join('')}
    </div>` : '';

  /* Ein einziges Kind, das die ganze Breite nimmt: der Behaelter ist ein
     Raster fuer Kartenlisten, und ohne diese Klammer stuenden Kopf, Zahlen
     und Gruppen als drei Spalten nebeneinander. */
  box.innerHTML = `<div class="baro-wrap">` + kopf + hinweis + zahlen +
    (d.matched
      ? gruppe('Your shopping list', fehlt, 'is-missing') + gruppe('Already yours', hat)
      : gruppe('On the manifest', treffer)) +
    (!treffer.length ? `<div class="inv-more">Nothing on the manifest matches your search.</div>` : '') +
    `</div>`;
}

/* ---------------- Das Set hinter einem Teil ----------------
   Eine Teileliste beantwortet die Frage nicht, die vor dem Einschmelzen
   steht: WOZU gehoert das hier, und was ist davon noch offen. "Lex Prime
   Barrel x1" sagt nicht, ob es das letzte fehlende Teil ist oder das dritte
   Duplikat - und schon gar nicht, was die anderen drei Teile wert sind.

   Deshalb klappt das Set unter der Karte auf, ueber die ganze Breite: alle
   Teile, auch die, die man NICHT hat, jedes mit seinen eigenen Zahlen.
   ---------------------------------------------------------- */

/* Der Slug des Teils, dessen Set gerade offen ist. Am TEIL und nicht am Set,
   weil dieselbe Sammlung mehrfach in der Liste steht - sonst klappte sie
   unter jedem ihrer Teile gleichzeitig auf. */
let ducatSetOpen = null;

/** Das Set zu einem Teil - ueber den Slug, nicht ueber den Namen. */
function setForPart(slug) {
  return (ducatsData?.sets || []).find(s => (s.parts || []).some(p => p.slug === slug)) || null;
}

/**
 * Was das Set als Ganzes bringt, gegen die Summe seiner Teile.
 *
 * Die eine Zahl, die man sonst nirgends bekommt: warframe.market handelt das
 * fertige Set als eigenen Posten, und sein Preis ist regelmaessig ein
 * anderer als die Teile einzeln. Fehlt einer von beiden Werten, bleibt die
 * Zeile weg - ein Vergleich mit einer geschaetzten Haelfte waere geraten.
 */
function setValueLine(set) {
  const teile = (set.parts || []).filter(p => p.price?.min != null);
  if (!set.setPrice?.min || teile.length < (set.parts || []).length) return '';

  const summe = teile.reduce((s, p) => s + p.price.min * (p.required || 1), 0);
  const diff = set.setPrice.min - summe;
  if (!summe) return '';

  return `
    <div class="dset-value ${diff >= 0 ? 'is-set' : 'is-parts'}">
      <span>Full set <b>${nf(set.setPrice.min)}p</b></span>
      <i>vs</i>
      <span>parts <b>${nf(summe)}p</b></span>
      <em>${diff >= 0
        ? `+${nf(diff)}p for selling it whole`
        : `${nf(-diff)}p more if you sell the parts one by one`}</em>
    </div>`;
}

function ducatSetPanel(it) {
  const set = setForPart(it.slug);
  if (!set) return '';

  const pct = set.totalParts ? Math.min(100, Math.round((set.ownedParts / set.totalParts) * 100)) : 0;

  const zeilen = (set.parts || []).map(p => {
    const req = p.required || 1;
    const genug = p.count >= req;
    const teils = !genug && p.count > 0;
    const ratio = p.price?.min > 0 ? +(p.ducats / p.price.min).toFixed(1) : null;

    return `
      <div class="dset-part ${genug ? 'has' : teils ? 'partial' : 'missing'} ${p.slug === it.slug ? 'is-here' : ''}">
        <img class="dset-img" src="${esc(p.image || '')}" alt="" loading="lazy"
             onerror="this.style.visibility='hidden'">
        <span class="dset-name">${esc(p.shortName || p.name)}${
          req > 1 ? ` <b class="dset-req">${req}×</b>` : ''}</span>
        <span class="dset-have">${genug ? `×${p.count}` : p.count > 0 ? `${p.count}/${req}` : 'missing'}</span>
        <span class="dset-duc">
          <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Ducats">${p.ducats ?? '–'}
        </span>
        <span class="dset-plat">${p.price?.min != null ? p.price.min + 'p' : '–'}</span>
        <span class="dset-ratio">${ratio != null ? ratio + ' duc/p' : ''}</span>
        <span class="dset-vault">${p.vaulted === true ? 'vaulted' : ''}</span>
      </div>`;
  }).join('');

  /* Was noch fehlt, steht als Satz darunter und nicht nur als Farbe: es ist
     die Einkaufsliste fuer dieses Set. */
  const fehlt = (set.parts || []).filter(p => p.count < (p.required || 1));

  return `
    <div class="dset-panel">
      <div class="dset-head">
        ${set.image ? `<img class="dset-art" src="${esc(set.image)}" alt=""
                            onerror="this.style.visibility='hidden'">` : ''}
        <div class="dset-title">
          <b>${esc(set.name)}</b>
          <span>${set.ownedParts} / ${set.totalParts} parts${set.complete ? ' · complete' : ''}${
            set.fullSetsCount > 1 ? ` · ${set.fullSetsCount} full sets` : ''}${
            /* Was der eigene Bestand dieses Sets bei Baro braechte - die Zahl,
               um die es in diesem Tab ueberhaupt geht. Nur der Besitz, nicht
               das ganze Set: der Rest liegt nicht bei einem. */
            set.ownedDucats ? ` · ${nf(set.ownedDucats)} ducats in hand` : ''}</span>
          <div class="dset-bar"><i style="width:${pct}%"></i></div>
        </div>
        <button type="button" class="dset-close" data-setopen="${esc(it.slug)}" title="Close">
          ${Icon.close(13)}
        </button>
      </div>

      ${setValueLine(set)}

      <div class="dset-parts">${zeilen}</div>

      ${fehlt.length ? `
        <div class="dset-missing">
          Still missing: <b>${fehlt.map(p => esc(p.shortName || p.name)).join('</b>, <b>')}</b>${
            fehlt.some(p => p.vaulted === true)
              ? ' — some of it drops nowhere right now, so the market is the only way in.'
              : ''}
        </div>` : ''}
    </div>`;
}

/**
 * Preise fuer ein aufgeklapptes Set nachladen.
 *
 * Gezielt und nicht ueber die ganze Liste: hier fehlen genau die Teile, die
 * man NICHT besitzt - die stehen in keiner Inventarabfrage und haben deshalb
 * nie einen Preis abbekommen. Es sind hoechstens ein halbes Dutzend Slugs.
 */
async function fetchSetPrices(slug) {
  const set = setForPart(slug);
  if (!set) return;

  const offen = [
    ...(set.parts || []).filter(p => !p.price).map(p => p.slug),
    !set.setPrice && set.setSlug ? set.setSlug : null
  ].filter(Boolean);
  if (!offen.length) return;

  try {
    /* ducats:fetchPrices liefert den Preis DIREKT unter dem Slug - anders als
       der Cache auf Platte, der ihn in { price, fetchedAt } einwickelt. */
    const preise = await window.api.fetchDucatPrices(offen);
    if (!preise) return;
    for (const p of set.parts || []) if (preise[p.slug]) p.price = preise[p.slug];
    if (set.setSlug && preise[set.setSlug]) set.setPrice = preise[set.setSlug];
    if (ducatSetOpen === slug) renderDucatsCatalog();
  } catch (err) {
    console.error('Set-Preise nicht ladbar:', err);
  }
}

function renderDucatsCatalog() {
  if (!ducatsData) return;
  if (ducatsMode === 'baro') return renderBaroOffer();
  if (ducatsMode === 'plan') return renderDucatsRelicPlan();
  if (ducatsMode === 'sets') ducatsMode = 'inventory';

  const q = ($('ducat-search')?.value || '').toLowerCase().trim();
  const rawList = ducatsMode === 'inventory'
    ? (ducatsData.inventory?.items || [])
    : (ducatsData.catalog || []);

  // Filtern
  let list = rawList.filter(it => {
    // Textsuche
    if (q) {
      const matchName = it.name.toLowerCase().includes(q);
      const matchParent = it.parentItem && it.parentItem.toLowerCase().includes(q);
      if (!matchName && !matchParent) return false;
    }

    // Filter-Chips
    if (ducatsFilter === 'advice-junk') return it.tradeAdvice?.advice === 'ducats';
    if (ducatsFilter === 'advice-plat') return it.tradeAdvice?.advice === 'plat';
    /* Zwei Filter ueber den ZUSAMMENHANG statt ueber das Teil. Beide sagen
       "ueberleg es dir zweimal", und beide sieht man der Zahl auf der Karte
       nicht an. */
    if (ducatsFilter === 'vaulted') return it.vaulted === true;
    if (ducatsFilter === 'set-one') return it.set?.needsOne === true;
    if (ducatsFilter === '100') return it.ducats >= 100;
    if (ducatsFilter === '45') return it.ducats >= 45 && it.ducats < 100;
    if (ducatsFilter === '15') return it.ducats <= 25;

    return true;
  });

  // Sortieren
  list.sort((a, b) => {
    if (ducatsSort === 'ducats-desc') {
      return b.ducats - a.ducats || (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name, 'en');
    }
    if (ducatsSort === 'plat-desc') {
      const pA = a.price?.min || 0;
      const pB = b.price?.min || 0;
      return pB - pA || b.ducats - a.ducats;
    }
    if (ducatsSort === 'ratio-desc') {
      const rA = a.tradeAdvice?.ratio || 0;
      const rB = b.tradeAdvice?.ratio || 0;
      return rB - rA || b.ducats - a.ducats;
    }
    if (ducatsSort === 'count-desc') {
      return (b.count || 0) - (a.count || 0) || b.ducats - a.ducats;
    }
    if (ducatsSort === 'name-asc') {
      return a.name.localeCompare(b.name, 'en');
    }
    return 0;
  });

  const container = $('ducats-catalog');
  if (!container) return;

  if (list.length === 0) {
    if (ducatsMode === 'inventory' && !ducatsData.inventory?.items?.length) {
      container.innerHTML = `
        <div class="ducats-empty-box">
          <div class="empty-icon">${Icon.crate(30)}</div>
          <h3>No prime parts in your inventory</h3>
          <p>No prime parts found in your inventory yet. Switch to the <b>full catalogue</b>, or start Warframe and fetch your inventory.</p>
          <button class="btn btn-sm btn-action" id="btn-ducats-switch-to-cat">Zum Gesamtkatalog wechseln</button>
        </div>
      `;
      $('btn-ducats-switch-to-cat')?.addEventListener('click', () => {
        ducatsMode = 'catalog';
        updateDucatsModeTabs();
        renderDucatsCatalog();
      });
      return;
    }

    container.innerHTML = `
      <div class="ducats-empty-box">
        <div class="empty-icon">${Icon.search(30)}</div>
        <h3>No matches</h3>
        <p>Zu deinen Filter- und Suchkriterien wurden keine Prime-Teile gefunden.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.slice(0, 150).map(it => {
    const qty = sellQuantities.get(it.slug) || 0;
    const isSelected = qty > 0;
    const rarityClass = it.rarity ? `rarity-${it.rarity.toLowerCase()}` : 'rarity-common';

    // Platin-Anzeige
    let priceHtml = '';
    if (it.price && typeof it.price.min === 'number') {
      priceHtml = `
        <div class="ducat-plat-tag" title="Cheapest price (in game: ${it.price.online ? 'yes' : 'no'})">
          <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platin">
          <b>${it.price.min}p</b>
          <span class="plat-med">Med. ${it.price.median || it.price.min}p</span>
        </div>
      `;
    } else if (isFetchingDucatPrices) {
      priceHtml = `<div class="ducat-plat-tag plat-loading">loading …</div>`;
    } else {
      priceHtml = `<div class="ducat-plat-tag plat-none" title="No offer on warframe.market">-</div>`;
    }

    // Trade-Advice Badge
    let adviceHtml = '';
    if (it.tradeAdvice && it.tradeAdvice.advice !== 'unknown') {
      const adv = it.tradeAdvice;
      if (adv.advice === 'ducats') {
        adviceHtml = `<span class="trade-chip chip-junk" title="${esc(adv.reason)}"><span class="chip-dot"></span>Junk (${adv.ratio} duc/p)</span>`;
      } else if (adv.advice === 'plat') {
        adviceHtml = `<span class="trade-chip chip-plat" title="${esc(adv.reason)}"><span class="chip-dot"></span>Market (${adv.ratio} duc/p)</span>`;
      } else {
        adviceHtml = `<span class="trade-chip chip-neutral" title="${esc(adv.reason)}"><span class="chip-dot"></span>Fair (${adv.ratio} duc/p)</span>`;
      }
    }

    /* Der Zusammenhang, in dem das Teil steht - und damit der Grund, es NICHT
       einzuschmelzen. Gevaultet heisst: fuer 15 Dukaten weggeben und fuer
       Platin zurueckkaufen.

       Der Set-Knopf ist beides in einem: er ZEIGT den Stand (3/4) und er
       OEFFNET das Set darunter. Fehlt nur noch ein Teil, wird er golden -
       ein zweiter Chip, der dasselbe noch einmal sagt, waere Rauschen. */
    const kontextHtml = [
      it.vaulted === true
        ? `<span class="trade-chip chip-vault" title="Drops nowhere right now — you would have to buy it back for platinum"><span class="chip-dot"></span>Vaulted</span>`
        : '',
      it.set
        ? `<button type="button" class="trade-chip chip-set ${it.set.needsOne ? 'is-one' : ''} ${ducatSetOpen === it.slug ? 'is-open' : ''}"
                   data-setopen="${esc(it.slug)}"
                   title="${esc(it.set.name)}: ${it.set.owned}/${it.set.total} parts${
                     it.set.missingParts.length ? ` — still missing ${esc(it.set.missingParts.join(', '))}` : ' — complete'}">
             Set ${it.set.owned}/${it.set.total}
             <span class="chip-caret">${Icon.chevron(11)}</span>
           </button>`
        : ''
    ].join('');

    // Inventar-Besitz-Badge
    /* KURZ, WEIL DIE ZEILE ENG IST. "Owned: 2x (1 dup.)" stand neben dem
       Elternnamen in einer Zeile, die bei langen Namen nicht mehr aufging -
       beide brachen um, und die Karte wuchs gegenueber ihren Nachbarn.
       Ausgeschrieben steht es jetzt im Tooltip, wo es nichts verdraengt. */
    const ownedHtml = it.count != null ? `
      <span class="ducat-owned-badge ${it.count > 1 ? 'has-dups' : ''}"
            title="You own ${it.count}${it.count > 1 ? ` — ${it.count - 1} of them spare` : ''}">
        ×${it.count}${it.count > 1 ? ` <small>${it.count - 1} dup</small>` : ''}
      </span>
    ` : '';

    return `
      <div class="ducat-card ${isSelected ? 'selected' : ''} ${rarityClass}">
        <div class="ducat-card-left">
          <img class="mat-icon" src="${esc(it.image || 'assets/icons/relic.png')}" alt="" onerror="this.src='assets/icons/relic.png'">
        </div>

        <div class="ducat-card-body">
          <div class="ducat-card-title-row">
            <b class="ducat-item-name" title="${esc(it.name)}">${esc(it.name)}</b>
          </div>
          <div class="ducat-card-sub">
            <span class="ducat-parent">${esc(it.parentItem || 'Prime')}</span>
            ${ownedHtml}
          </div>
          <div class="ducat-card-badges">
            <span class="ducat-badge ducat-val-badge">
              <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Ducats">
              <b>${it.ducats}</b> <small>duc.</small>
            </span>
            ${priceHtml}
            ${adviceHtml}
            ${kontextHtml}
          </div>
        </div>

        <div class="ducat-card-right">
          <div class="ducat-card-counter">
            <button class="ducat-btn-cnt" data-dec="${esc(it.slug)}" title="Decrease quantity">-</button>
            <span class="ducat-cnt-num ${qty > 0 ? 'active' : ''}">${qty}${it.count != null ? `<small>/${it.count}</small>` : ''}</span>
            <button class="ducat-btn-cnt" data-inc="${esc(it.slug)}" title="Increase quantity">+</button>
          </div>
          ${it.count != null && it.count > 0 ? `
            <button class="btn-max-cnt ${qty === it.count ? 'is-max' : ''}" data-max="${esc(it.slug)}" title="Auf maximale Inventarmenge setzen">
              MAX
            </button>
          ` : ''}
        </div>
      </div>
      ${ducatSetOpen === it.slug ? ducatSetPanel(it) : ''}
    `;
  }).join('');

  /* Set auf- und zuklappen. Ein zweiter Klick auf denselben Knopf schliesst,
     ein Klick auf einen anderen schaltet um - es ist immer hoechstens eines
     offen, sonst zerfaellt das Raster in lauter halbe Zeilen. */
  container.querySelectorAll('[data-setopen]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.setopen;
      ducatSetOpen = ducatSetOpen === slug ? null : slug;
      renderDucatsCatalog();
      /* Erst zeichnen, dann nachladen: die Teile, die man nicht besitzt,
         haben noch nie einen Preis gesehen - das Set steht aber sofort. */
      if (ducatSetOpen) fetchSetPrices(ducatSetOpen);
    };
  });

  // Event-Handler für Zähler
  container.querySelectorAll('[data-inc]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.inc;
      const it = rawList.find(x => x.slug === slug);
      const cur = sellQuantities.get(slug) || 0;
      const max = it?.count != null ? it.count : 999;
      if (cur < max) {
        sellQuantities.set(slug, cur + 1);
        currentSelectionPreset = 'custom';
        updateSelectionPresetButtons();
        renderDucatsKPIs();
        renderDucatsCatalog();
      }
    };
  });

  container.querySelectorAll('[data-dec]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.dec;
      const cur = sellQuantities.get(slug) || 0;
      if (cur > 1) sellQuantities.set(slug, cur - 1);
      else sellQuantities.delete(slug);
      currentSelectionPreset = 'custom';
      updateSelectionPresetButtons();
      renderDucatsKPIs();
      renderDucatsCatalog();
    };
  });

  container.querySelectorAll('[data-max]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.max;
      const it = rawList.find(x => x.slug === slug);
      if (it && it.count > 0) {
        const cur = sellQuantities.get(slug) || 0;
        if (cur === it.count) sellQuantities.delete(slug);
        else sellQuantities.set(slug, it.count);
        currentSelectionPreset = 'custom';
        updateSelectionPresetButtons();
        renderDucatsKPIs();
        renderDucatsCatalog();
      }
    };
  });
}

let ducatsEventsInitialized = false;
function initDucatsEventListeners() {
  if (ducatsEventsInitialized) return;
  ducatsEventsInitialized = true;

  // Suche
  $('ducat-search')?.addEventListener('input', () => renderDucatsCatalog());

  // Modus-Umschalter
  $('tab-ducats-mode-inv')?.addEventListener('click', () => {
    ducatsMode = 'inventory';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });
  $('tab-ducats-mode-cat')?.addEventListener('click', () => {
    ducatsMode = 'catalog';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });
  $('tab-ducats-mode-sets')?.addEventListener('click', () => {
    ducatsMode = 'sets';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });
  $('tab-ducats-mode-plan')?.addEventListener('click', () => {
    ducatsMode = 'plan';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });
  $('tab-ducats-mode-baro')?.addEventListener('click', () => {
    ducatsMode = 'baro';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });

  $('plan-sort')?.addEventListener('change', e => {
    planSort = e.target.value;
    renderDucatsRelicPlan();
  });

  // Schnell-Aktionen
  $('btn-ducats-select-all')?.addEventListener('click', () => {
    if (!ducatsData?.inventory?.items) return;
    currentSelectionPreset = 'all';
    updateSelectionPresetButtons();
    for (const it of ducatsData.inventory.items) {
      if (it.count > 0) sellQuantities.set(it.slug, it.count);
    }
    renderDucatsKPIs();
    renderDucatsCatalog();
  });

  $('btn-ducats-select-dups')?.addEventListener('click', () => {
    if (!ducatsData?.inventory?.items) return;
    currentSelectionPreset = 'duplicates';
    updateSelectionPresetButtons();
    sellQuantities.clear();
    for (const it of ducatsData.inventory.items) {
      const dups = Math.max(0, it.count - 1);
      if (dups > 0) sellQuantities.set(it.slug, dups);
    }
    renderDucatsKPIs();
    renderDucatsCatalog();
  });

  $('btn-ducats-clear')?.addEventListener('click', () => {
    currentSelectionPreset = 'none';
    updateSelectionPresetButtons();
    sellQuantities.clear();
    renderDucatsKPIs();
    renderDucatsCatalog();
  });

  $('btn-ducats-fetch-prices')?.addEventListener('click', () => {
    fetchMissingDucatPrices(true);
  });

  /* Filter-Chips - AUSDRUECKLICH nur die dieses Tabs. Ueber die Klasse
     allein traf die Auswahl auch die Chips der Bauketten und des Handels:
     ein Klick hier loeschte dort die Markierung, und ein Klick dort stellte
     hier den Filter auf "alle". */
  $('ducats-filter-chips')?.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $('ducats-filter-chips').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ducatsFilter = chip.dataset.filter || 'all';
      renderDucatsCatalog();
    });
  });

  // Sortierung
  $('ducats-sort')?.addEventListener('change', (e) => {
    ducatsSort = e.target.value;
    renderDucatsCatalog();
  });
}

/* ---------------- Inventar ---------------- */

let inventoryData = null;
let invSection = 'relics';
let invTier = 'all';            // Aera-Filter, nur im Relikt-Bereich
let invSetOwnership = 'all';    // All, Owned, Not owned
let invSetOrigin = 'all';       // Prime oder Basis, nur im Sets-Bereich
let invSetKind = 'all';         // Gattung, nur im Sets-Bereich
let invModOwnership = 'all';    // All, Owned, Not owned
let invModKind = 'all';         // Gattung (Warframe, Primary, Secondary, Melee, Companion, Archwing, etc.)
let invArcaneOwnership = 'all'; // All, Owned, Not owned
let invArcaneKind = 'all';      // Gattung (Warframe, Primary, Secondary, Melee, Operator, Amp, etc.)

const QUELLEN = {
  api: { label: 'Live read from the game', stale: false }
};

/** "vor 3 Tagen" statt eines nackten Zeitstempels. */
function relativeAge(ts) {
  if (!ts) return 'unknown';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

async function loadInventoryTab() {
  if (inventoryData) return renderInventory();
  const res = await window.api.getInventory();
  if (res.ok) { inventoryData = res.data; renderInventory(); }
  else showInventoryState(res.code, res.error);
}

/** Ein Zustand statt einer Liste: nie abgerufen, Spiel aus, Drosselung, Fehler. */
function showInventoryState(code, text) {
  $('inv-body').classList.add('hidden');
  $('inv-notice').classList.add('hidden');
  const box = $('inv-state');
  box.classList.remove('hidden');

  const erklaerung = code === 'empty'
    ? 'There is no inventory data yet. Start Warframe, log in and '
    + 'press "Fetch inventory" — the credentials are only read from the '
    + 'running game and are never stored.'
    : text;

  box.innerHTML = `
    <div class="inv-state-icon">${code === 'rate_limited' ? Icon.clock(30) : Icon.warning(30)}</div>
    <b>${esc(code === 'empty' ? 'No inventory loaded yet' : 'Cannot fetch right now')}</b>
    <p>${esc(erklaerung)}</p>`;
}

function renderInventory() {
  const d = inventoryData;
  if (!d) return;

  $('inv-state').classList.add('hidden');
  $('inv-body').classList.remove('hidden');

  /* Herkunft und Alter stehen bereits neben dem Aktualisieren-Knopf - ein
     eigener Balken darueber sagte dasselbe ein zweites Mal und kostete bei
     jedem Blick eine Zeile.

     Was NICHT verloren gehen darf, ist die Drosselung: dass ein Abruf gerade
     nicht moeglich ist, gehoert an den Knopf, den man sonst vergeblich
     drueckt. */
  const q = QUELLEN[d.source] || QUELLEN.api;
  const refreshBtn = $('btn-inv-refresh');
  if (refreshBtn) {
    refreshBtn.classList.toggle('is-gated', !d.gate.allowed);
    refreshBtn.title = d.gate.allowed
      ? `${q.label} · as of ${relativeAge(d.fetchedAt)}`
      : `Next fetch in ${d.gate.waitText}`;
  }

  /* Ein Abruf, der wegen der Drosselung nicht stattgefunden hat, darf nicht
     wortlos ins Leere laufen - sonst wirkt der Knopf kaputt. */
  const notice = $('inv-notice');
  notice.classList.toggle('hidden', !d.message);
  if (d.message) notice.innerHTML = `${Icon.clock(14)}<span>${esc(d.message)}</span>`;

  /* Waehrungen aendern sich staendig. Eine acht Tage alte Zahl gross und in Gold
     zu setzen laedt dazu ein, sie fuer den aktuellen Kontostand zu halten -
     deshalb bei veralteten Daten gedaempft, gestrichelt und mit Datum am Label. */
  const stand = d.fetchedAt
    ? new Date(d.fetchedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
    : null;

  /* Waehrungen tragen die offiziellen Spielbilder statt Vektorglyphen: Credits,
     Platin und Endo erkennt man im Spiel genau an diesen drei Icons, waehrend
     Muenze, Stern und Blitz beliebig austauschbar wirken. */
  $('inv-currencies').className = 'inv-currencies' + (q.stale ? ' is-stale' : '');
  $('inv-currencies').innerHTML = [
    ['Credits', d.currencies.credits, 'credits'],
    ['Platinum', d.currencies.platinum, 'platinum'],
    ['Endo', d.currencies.endo, 'endo'],
    ['Ducats', d.currencies.ducats, 'ducats']
  ].map(([label, value, icon]) => `
    <div class="inv-cur">
      <img class="inv-cur-ic" src="assets/icons/currency/${icon}.png" alt="">
      <div>
        <b>${nf(value)}</b>
        <span>${label}${q.stale && stand ? ' · as of ' + esc(stand) : ''}</span>
      </div>
    </div>`).join('');

  $('inv-tabs').innerHTML = d.sectionMeta.map(s => {
    const total = d.totals[s.key] || { arten: 0 };
    const labelCount = (s.key === 'mods' || s.key === 'arcanes') && total.ownedArten != null
      ? `${nf(total.ownedArten)} / ${nf(total.arten)}`
      : nf(total.arten);
    return `
    <button class="inv-tab ${s.key === invSection ? 'active' : ''}" data-inv="${s.key}">
      ${esc(s.label)}<span>${labelCount}</span>
    </button>`;
  }).join('');

  $('inv-tabs').querySelectorAll('[data-inv]').forEach(btn => {
    btn.onclick = () => {
      invSection = btn.dataset.inv;
      invTier = 'all';
      invSetOwnership = 'all';
      invSetOrigin = 'all';
      invSetKind = 'all';
      invModOwnership = 'all';
      invModKind = 'all';
      invArcaneOwnership = 'all';
      invArcaneKind = 'all';
      renderInventory();
    };
  });

  renderInventoryGrid();
}

/**
 * Filter fuer Inventar-Sektionen (Relikte, Sets, Mods, Arcanes).
 */
function renderInvTierFilter(all) {
  const box = $('inv-tier-filter');
  if (!box) return;

  if (invSection === 'sets') return renderInvSetFilter(box, all);
  if (invSection === 'mods') return renderInvModFilter(box, all);
  if (invSection === 'arcanes') return renderInvArcaneFilter(box, all);

  if (invSection !== 'relics') {
    box.classList.add('hidden');
    return;
  }

  const counts = new Map();
  for (const e of all) {
    if (!e.tier) continue;
    counts.set(e.tier, (counts.get(e.tier) || 0) + (e.count || 0));
  }

  const order = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'];
  const tiers = order.filter(t => counts.has(t));
  if (!tiers.length) { box.classList.add('hidden'); return; }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  box.classList.remove('hidden');

  /* Dieselben zwei Zeilen wie in den anderen Bereichen: oben der Weg zurueck
     zur vollen Liste, unten die Aeren. Relikte kennen keinen Besitz-Filter -
     alles, was hier steht, hat man -, deshalb steht oben nur "All".

     Die Aeren tragen kein Symbol: sie tragen ihre Farbe, und die sagt schon,
     welche gemeint ist. */
  box.innerHTML =
    `<div class="chip-row"><div class="chip-group">
       <button class="tier-chip ${invTier === 'all' ? 'active' : ''}" type="button" data-tier="all">
         <i class="chip-ic">${Icon.grid(15)}</i>All <span>${nf(total)}</span>
       </button>
     </div></div>
     <div class="chip-row"><div class="chip-group">` +
    tiers.map(t => `
      <button class="tier-chip tier-${t.toLowerCase()} ${invTier === t ? 'active' : ''}"
              type="button" data-tier="${t}">
        ${t} <span>${nf(counts.get(t))}</span>
      </button>`).join('') +
    `</div></div>`;

  box.querySelectorAll('[data-tier]').forEach(btn => {
    btn.onclick = () => {
      invTier = btn.dataset.tier;
      renderInventoryGrid();
    };
  });
}

/* ---------------- Filter-Definitionen ----------------

   Jede Achse (Besitz, Herkunft, Gattung) ist eine Liste aus Schluessel,
   Beschriftung, Symbol und Pruefung. Das Symbol steht dabei nicht zur Zierde:
   die Leiste traegt bis zu zwoelf Chips, und ein Blick auf das
   Warframe-Zeichen findet die Gattung schneller als das Lesen von zwoelf
   Woertern - genau wie im Regal unter "What are you building for?".        */

const SET_OWNERSHIP = [
  { key: 'owned',     label: 'Owned',     icon: 'check',  match: s => (s.ownedParts || 0) > 0 || s.complete || s.isMastered },
  { key: 'not_owned', label: 'Not owned', icon: 'cross',  match: s => (s.ownedParts || 0) === 0 && !s.isMastered }
];

const SET_ORIGINS = [
  { key: 'prime', label: 'Prime', icon: 'star', match: s => s.kind !== 'base' },
  { key: 'base',  label: 'Base',  icon: 'cube', match: s => s.kind === 'base' }
];

const SET_KINDS = [
  { key: 'Suits',     label: 'Warframes',  icon: 'catWarframe',  match: s => s.category === 'Suits' },
  { key: 'LongGuns',  label: 'Primary',    icon: 'catPrimary',   match: s => s.category === 'LongGuns' },
  { key: 'Pistols',   label: 'Secondary',  icon: 'catSecondary', match: s => s.category === 'Pistols' },
  { key: 'Melee',     label: 'Melee',      icon: 'catMelee',     match: s => s.category === 'Melee' },
  { key: 'companion', label: 'Companions', icon: 'catCompanion',
    match: s => ['Sentinels', 'KubrowPets', 'SentinelWeapons'].includes(s.category) },
  { key: 'archwing',  label: 'Archwing',   icon: 'catArchwing',
    match: s => ['SpaceSuits', 'SpaceGuns', 'SpaceMelee'].includes(s.category) }
];

const MOD_OWNERSHIP = [
  { key: 'owned',     label: 'Owned',     icon: 'check',  match: m => (m.count || 0) > 0 },
  { key: 'not_owned', label: 'Not owned', icon: 'cross',  match: m => (m.count || 0) === 0 }
];

const MOD_KINDS = [
  { key: 'Suits',     label: 'Warframes',  icon: 'catWarframe',  match: m => m.category === 'Suits' },
  { key: 'LongGuns',  label: 'Primary',    icon: 'catPrimary',   match: m => m.category === 'LongGuns' },
  { key: 'Pistols',   label: 'Secondary',  icon: 'catSecondary', match: m => m.category === 'Pistols' },
  { key: 'Melee',     label: 'Melee',      icon: 'catMelee',     match: m => m.category === 'Melee' },
  { key: 'companion', label: 'Companions', icon: 'catCompanion', match: m => m.category === 'companion' },
  { key: 'archwing',  label: 'Archwing',   icon: 'catArchwing',  match: m => m.category === 'archwing' },
  { key: 'necramech', label: 'Necramech',  icon: 'catNecramech', match: m => m.category === 'necramech' },
  { key: 'parazon',   label: 'Parazon',    icon: 'bolt',         match: m => m.category === 'parazon' },
  { key: 'railjack',  label: 'Railjack',   icon: 'rocket',       match: m => m.category === 'railjack' },
  { key: 'other',     label: 'Other',      icon: 'catMods',      match: m => m.category === 'other' }
];

const ARCANE_OWNERSHIP = [
  { key: 'owned',     label: 'Owned',     icon: 'check',  match: a => (a.count || 0) > 0 },
  { key: 'not_owned', label: 'Not owned', icon: 'cross',  match: a => (a.count || 0) === 0 }
];

const ARCANE_KINDS = [
  { key: 'Suits',     label: 'Warframes', icon: 'catWarframe',  match: a => a.category === 'Suits' },
  { key: 'LongGuns',  label: 'Primary',   icon: 'catPrimary',   match: a => a.category === 'LongGuns' },
  { key: 'Pistols',   label: 'Secondary', icon: 'catSecondary', match: a => a.category === 'Pistols' },
  { key: 'Melee',     label: 'Melee',     icon: 'catMelee',     match: a => a.category === 'Melee' },
  { key: 'operator',  label: 'Operator',  icon: 'lotus',        match: a => a.category === 'operator' },
  { key: 'amp',       label: 'Amp',       icon: 'catAmp',       match: a => a.category === 'amp' },
  { key: 'other',     label: 'Other',     icon: 'layers',       match: a => a.category === 'other' }
];

const matchOf = (defs, key) => defs.find(f => f.key === key)?.match || (() => true);

const filterSets = list => list
  .filter(invSetOwnership === 'all' ? () => true : matchOf(SET_OWNERSHIP, invSetOwnership))
  .filter(invSetOrigin    === 'all' ? () => true : matchOf(SET_ORIGINS,   invSetOrigin))
  .filter(invSetKind      === 'all' ? () => true : matchOf(SET_KINDS,     invSetKind));

const filterMods = list => list
  .filter(invModOwnership === 'all' ? () => true : matchOf(MOD_OWNERSHIP, invModOwnership))
  .filter(invModKind      === 'all' ? () => true : matchOf(MOD_KINDS,     invModKind));

const filterArcanes = list => list
  .filter(invArcaneOwnership === 'all' ? () => true : matchOf(ARCANE_OWNERSHIP, invArcaneOwnership))
  .filter(invArcaneKind      === 'all' ? () => true : matchOf(ARCANE_KINDS,     invArcaneKind));

/* ---------------- Die Filterleiste ----------------

   Sets, Mods und Arcanes hatten bis hierher drei fast wortgleiche Zeichner.
   Was sie unterscheidet, sind allein ihre Achsen - der Rest ist dieselbe
   Leiste. Deshalb hier ein Satz Bausteine und je Bereich nur noch die
   Aufzaehlung, welche Achse in welcher Gruppe steht.                        */

/** Ein Chip: Symbol, Wort, Zahl. */
const invChip = (attr, key, label, icon, count, on) => `
  <button class="tier-chip ${on ? 'active' : ''}" type="button" data-${attr}="${esc(key)}">
    ${icon && Icon[icon] ? `<i class="chip-ic">${Icon[icon](15)}</i>` : ''}${esc(label)}
    <span>${nf(count)}</span>
  </button>`;

/**
 * Der Alles-Chip. Er steht als erster in der Leiste und raeumt JEDE Achse ab,
 * nicht nur die eigene - er ist der Weg zurueck zur vollen Liste.
 */
const invAllChip = (total, on) => invChip('inv-all', 'all', 'All', 'grid', total, on);

/**
 * Wie oft trifft jede Pruefung einer Achse zu. Ein Durchlauf je Achse, damit
 * die Zahl im Chip stehen kann, ohne die Liste dafuer mehrfach zu filtern.
 */
function countMatches(list, defs) {
  const out = {};
  for (const f of defs) out[f.key] = 0;
  for (const item of list) {
    for (const f of defs) if (f.match(item)) out[f.key]++;
  }
  return out;
}

/**
 * Die Chips einer Achse. Was null Treffer hat, faellt weg - ausser es ist
 * gerade gewaehlt: sonst verschwiege die Leiste die eigene Auswahl.
 */
const invChips = (defs, attr, active, counts) => defs
  .map(f => ({ ...f, count: counts[f.key] || 0 }))
  .filter(f => f.count > 0 || f.key === active)
  .map(f => invChip(attr, f.key, f.label, f.icon, f.count, active === f.key))
  .join('');

/** Eine Gruppe zeichnet sich nur, wenn sie Chips hat. */
const invGroup = inner => inner ? `<div class="chip-group">${inner}</div>` : '';

/**
 * Eine Zeile der Leiste.
 *
 * ZWEI FESTE ZEILEN IN JEDEM BEREICH: oben der Zustand (All, Owned, Not
 * owned), unten alles, was die Liste weiter zuschneidet. Frueher floss das
 * frei um, und wo umgebrochen wurde, hing an der Fensterbreite - beim
 * Wechsel von Relikten zu Mods sprang das Kachelraster darunter hoch und
 * runter. Zwei feste Zeilen stehen ueberall gleich hoch.
 */
const invRow = inner => inner ? `<div class="chip-row">${inner}</div>` : '';

/**
 * Leiste einhaengen. `reset` raeumt beim Klick auf "All" alle Achsen des
 * Bereichs ab. Meldet, ob ueberhaupt etwas zu zeichnen war.
 */
function mountInvFilter(box, html, reset) {
  if (!html) { box.classList.add('hidden'); return false; }
  box.classList.remove('hidden');
  box.innerHTML = html;
  box.querySelector('[data-inv-all]')?.addEventListener('click', () => {
    reset();
    renderInventoryGrid();
  });
  return true;
}

/**
 * Ein Klick auf einen bereits gewaehlten Chip nimmt die Wahl zurueck. Ohne das
 * gaebe es fuer die Gattung keinen Weg zurueck ausser ueber "All" - und der
 * raeumt nebenbei auch Besitz und Herkunft mit ab.
 */
function wireInvChips(box, attr, dsKey, get, set) {
  box.querySelectorAll(`[data-${attr}]`).forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset[dsKey];
      set(get() === key ? 'all' : key);
      renderInventoryGrid();
    };
  });
}

function renderInvSetFilter(box, all) {
  const allActive = invSetKind === 'all' && invSetOrigin === 'all' && invSetOwnership === 'all';

  /* Besitz steht neben "All", weil das die Frage ist, mit der man die Liste
     oeffnet: was habe ich, was fehlt noch. Gattung und Herkunft schneiden das
     Ergebnis danach weiter zu - und stehen deshalb in der zweiten Zeile. */
  const html =
      invRow(invGroup(invAllChip(all.length, allActive)
                    + invChips(SET_OWNERSHIP, 'set-ownership', invSetOwnership, countMatches(all, SET_OWNERSHIP))))
    + invRow(invGroup(invChips(SET_KINDS,   'set-kind',   invSetKind,   countMatches(all, SET_KINDS)))
           + invGroup(invChips(SET_ORIGINS, 'set-origin', invSetOrigin, countMatches(all, SET_ORIGINS))));

  const ok = mountInvFilter(box, html, () => {
    invSetKind = 'all';
    invSetOrigin = 'all';
    invSetOwnership = 'all';
  });
  if (!ok) return;

  wireInvChips(box, 'set-ownership', 'setOwnership', () => invSetOwnership, v => invSetOwnership = v);
  wireInvChips(box, 'set-kind',      'setKind',      () => invSetKind,      v => invSetKind = v);
  wireInvChips(box, 'set-origin',    'setOrigin',    () => invSetOrigin,    v => invSetOrigin = v);
}

function renderInvModFilter(box, all) {
  const allActive = invModKind === 'all' && invModOwnership === 'all';

  const html =
      invRow(invGroup(invAllChip(all.length, allActive)
                    + invChips(MOD_OWNERSHIP, 'mod-ownership', invModOwnership, countMatches(all, MOD_OWNERSHIP))))
    + invRow(invGroup(invChips(MOD_KINDS, 'mod-kind', invModKind, countMatches(all, MOD_KINDS))));

  const ok = mountInvFilter(box, html, () => {
    invModKind = 'all';
    invModOwnership = 'all';
  });
  if (!ok) return;

  wireInvChips(box, 'mod-ownership', 'modOwnership', () => invModOwnership, v => invModOwnership = v);
  wireInvChips(box, 'mod-kind',      'modKind',      () => invModKind,      v => invModKind = v);
}

function renderInvArcaneFilter(box, all) {
  const allActive = invArcaneKind === 'all' && invArcaneOwnership === 'all';

  const html =
      invRow(invGroup(invAllChip(all.length, allActive)
                    + invChips(ARCANE_OWNERSHIP, 'arcane-ownership', invArcaneOwnership, countMatches(all, ARCANE_OWNERSHIP))))
    + invRow(invGroup(invChips(ARCANE_KINDS, 'arcane-kind', invArcaneKind, countMatches(all, ARCANE_KINDS))));

  const ok = mountInvFilter(box, html, () => {
    invArcaneKind = 'all';
    invArcaneOwnership = 'all';
  });
  if (!ok) return;

  wireInvChips(box, 'arcane-ownership', 'arcaneOwnership', () => invArcaneOwnership, v => invArcaneOwnership = v);
  wireInvChips(box, 'arcane-kind',      'arcaneKind',      () => invArcaneKind,      v => invArcaneKind = v);
}

/**
 * Die Fusszeile einer Set-Karte.
 *
 * Prime-Sets sind handelbar - dort stehen Dukaten und der Platinpreis. Bei
 * einem Basis-Bausatz waeren beide immer null: seine Teile stehen auf keinem
 * Markt. Statt zweier Nullen steht dort die Auskunft, die es zu ihm gibt -
 * ob das Item schon gebaut ist.
 */
function setFoot(s) {
  if (s.kind === 'base') {
    return s.isMastered
      ? `<span class="set-val is-done">${Icon.check(13)} <small>already built</small></span>`
      : `<span class="set-val"><small>${s.complete
            ? 'all parts ready to build'
            : `${s.totalParts - s.ownedParts} part${s.totalParts - s.ownedParts === 1 ? '' : 's'} to go`}</small></span>`;
  }

  return `
    <span class="set-val" title="Ducats for every part you own of this set, duplicates included">
      <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Ducats">
      <b>${nf(s.ownedDucats)}</b> <small>ducats</small>
    </span>
    ${setPlatCell(s)}
    ${setTradeButtons(s)}`;
}

/**
 * Die Platin-Zelle einer Set-Karte.
 *
 * Steht als eigener Baustein da, weil sie an ZWEI Stellen entsteht: beim
 * Zeichnen der Karte und noch einmal, wenn ihr Preis nachtraeglich eintrifft.
 * Der Slug an der Zelle ist die Adresse dafuer.
 *
 * DREI ZUSTAENDE, NICHT ZWEI: ein Preis, der noch unterwegs ist, sah bisher
 * genauso aus wie ein Set, das auf warframe.market niemand anbietet - beides
 * war derselbe Strich. Der Titel sagt jetzt, welcher der beiden Faelle es ist.
 */
function setPlatCell(s) {
  const known = s.setPrice?.min != null;
  const pending = !known && Boolean(s.setSlug) && !setPriceTried.has(s.setSlug);
  const title = known
    ? 'Lowest price for the complete set on warframe.market'
    : (pending ? 'Loading the set price from warframe.market …'
               : 'No price for this set on warframe.market');

  return `<span class="set-val${pending ? ' is-pending' : ''}"${
      s.setSlug ? ` data-set-plat="${esc(s.setSlug)}"` : ''} title="${title}">
      <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platin">
      <b>${known ? nf(s.setPrice.min) : '–'}</b> <small>Set</small>
    </span>`;
}

/* Slugs, deren Set-Preis in dieser Sitzung schon einmal angefragt wurde - egal
   mit welchem Ergebnis. Ohne dieses Gedaechtnis fragte jeder Besuch des
   Bereichs die Sets erneut ab, die warframe.market gar nicht fuehrt. */
const setPriceTried = new Set();
let isFetchingSetPrices = false;

/**
 * Platinpreise der Set-Karten nachladen.
 *
 * WARUM DAS NOETIG IST: die Karten kommen mit dem Preisstand, der beim Aufbau
 * zufaellig auf Platte lag - abgefragt hat den Preis des SET-Items niemand.
 * Der Dukaten-Tab holt nur Einzelteile nach, und seine Set-Ansicht ist beim
 * Umzug in dieses Raster weggefallen. Also stand auf den meisten Karten
 * dauerhaft ein Strich, waehrend dasselbe Teil eine Ebene tiefer im Datenblatt
 * einen Preis hatte.
 *
 * DAS RASTER WIRD NICHT NEU GEZEICHNET: die eingetroffenen Preise wandern in
 * die Zellen, die schon stehen. Ein Neuaufbau waere mitten im Scrollen ein
 * Sprung nach oben und wuerde die nachgeladenen Karten verwerfen.
 */
async function fetchMissingSetPrices() {
  if (isFetchingSetPrices) return;

  const missing = (inventoryData?.sections?.sets || []).filter(s =>
    s.setSlug && s.setPrice?.min == null && !setPriceTried.has(s.setSlug));
  if (!missing.length) return;

  /* Was gerade gefiltert auf dem Schirm steht, kommt zuerst: 160 Sets im
     Mindestabstand der Warteschlange sind gut eine Minute, und in der will man
     den Preis des Sets sehen, nach dem man gesucht hat - nicht den von Ash
     Prime, nur weil A vorne im Alphabet steht. */
  const onScreen = new Set((currentInvList || []).map(s => s.setSlug));
  const queue = [...missing.filter(s => onScreen.has(s.setSlug)),
                 ...missing.filter(s => !onScreen.has(s.setSlug))];

  isFetchingSetPrices = true;
  try {
    const BATCH_SIZE = 10;
    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
      const batch = queue.slice(i, i + BATCH_SIZE);
      /* VOR dem Abruf vermerken, nicht danach: ein Fehlschlag darf denselben
         Slug nicht beim naechsten Blick wieder in die Schlange stellen. */
      batch.forEach(s => setPriceTried.add(s.setSlug));

      const prices = await window.api.fetchDucatPrices(batch.map(s => s.setSlug));
      for (const s of batch) {
        if (prices?.[s.setSlug]) s.setPrice = prices[s.setSlug];
        paintSetPlat(s);
      }
    }
  } catch (err) {
    console.error('Could not load set prices:', err);
  } finally {
    isFetchingSetPrices = false;
  }
}

/**
 * Einen eingetroffenen Preis in die Karte schreiben - falls sie gerade steht.
 *
 * Findet sich keine Zelle, ist die Karte noch nicht nachgeladen oder gerade
 * herausgefiltert. Das ist kein Fehler: der Preis haengt am Set-Objekt, und
 * beim naechsten Zeichnen holt setPlatCell ihn von dort.
 */
function paintSetPlat(s) {
  if (!s.setSlug) return;
  const cell = $('inv-grid')?.querySelector(`[data-set-plat="${CSS.escape(s.setSlug)}"]`);
  if (!cell) return;

  const tmp = document.createElement('div');
  tmp.innerHTML = setPlatCell(s);
  if (tmp.firstElementChild) cell.replaceWith(tmp.firstElementChild);
}

/**
 * Die Handelsknoepfe einer Set-Karte.
 *
 * NUR WO ES EINEN SLUG GIBT: setSlug ist die Kennung auf warframe.market.
 * Basis-Sets haben keinen - ihre Teile sind nicht handelbar -, und ohne
 * Slug gibt es nichts anzubieten. Ein Knopf, der nur eine Fehlermeldung
 * erzeugen kann, gehoert nicht auf die Karte.
 *
 * VERKAUFEN NUR MIT VOLLSTAENDIGEM SET: fullSetsCount sagt, wie viele
 * KOMPLETTE Sets zusammenkommen. Bei null waere das Angebot eine Zusage,
 * die man im Handelsfenster nicht einloesen kann - der Knopf bleibt sichtbar,
 * aber gesperrt, damit die Karte nicht je nach Bestand anders aussieht.
 */
function setTradeButtons(s) {
  if (!s.setSlug) return '';
  const have = s.fullSetsCount || 0;
  return `
    <span class="set-trade">
      <button type="button" class="set-trade-btn is-sell${have ? '' : ' is-disabled'}"
              data-set-wts="${esc(s.setSlug)}" data-set-qty="${have}"
              title="${have
                ? `List ${have} complete set${have === 1 ? '' : 's'} for sale on warframe.market`
                : 'You do not have a complete set yet'}">
        ${Icon.tag(12)}<span>WTS</span>${have > 1 ? `<b>${have}</b>` : ''}
      </button>
      <button type="button" class="set-trade-btn is-buy"
              data-set-wtb="${esc(s.setSlug)}"
              title="Post a buy order for this set on warframe.market">
        ${Icon.plus(12)}<span>WTB</span>
      </button>
    </span>`;
}

function setCardTile(s, idx) {
  const pct = s.totalParts ? Math.min(100, Math.round((s.ownedParts / s.totalParts) * 100)) : 0;

  const parts = s.parts.map(p => {
    const req = p.required || 1;
    const hasEnough = p.count >= req;
    const isPartial = !hasEnough && p.count > 0;
    const countLabel = req > 1
      ? `${p.count}/${req}`
      : (p.count > 0 ? '×' + p.count : '–');

    /* Jedes Teil ist anklickbar: die Frage vor einem fehlenden Teil ist
       immer dieselbe - aus welchem Relikt kommt das? */
    return `
    <button type="button" class="set-part ${hasEnough ? 'has' : (isPartial ? 'partial' : 'missing')}"
            data-part="${esc(p.name)}"
            title="${esc(p.name)} · ${req > 1 ? req + 'x needed · ' : ''}${p.ducats ? p.ducats + ' ducats' : 'not tradeable'}${p.price ? ' · ' + p.price.min + 'p' : ''} — click for relics">
      <img class="set-part-img" src="${esc(p.image || '')}" alt="" loading="lazy">
      <span class="set-part-name">${esc(p.shortName)}</span>
      <span class="set-part-count">${countLabel}</span>
    </button>`;
  }).join('');

  return `
    <div class="set-card ${s.complete ? 'complete' : ''}" data-idx="${idx}">
      <div class="set-card-body">
        ${s.image ? `
          <div class="set-art-showcase">
            <img class="set-art-img" src="${esc(s.image)}" alt="" loading="lazy">
          </div>` : ''}
        <div class="set-main-content">
          <div class="set-head">
            <div class="set-title">
              <b>${esc(s.name)}</b>
              <span>${s.ownedParts} / ${s.totalParts} Teile${s.complete ? ' · komplett' : ''}</span>
            </div>
            <div class="set-progress" title="${pct} % beisammen">
              <div class="set-progress-fill" style="width: ${pct}%"></div>
            </div>
          </div>
          <div class="set-parts">${parts}</div>
        </div>
      </div>

      <div class="set-foot">${setFoot(s)}</div>
    </div>`;
}

let currentInvList = [];
let invRenderedCount = 0;
let invChunkObserver = null;
const INV_CHUNK_SIZE = 60;

function setupInvGridEvents(grid) {
  if (!grid || grid.dataset.delegated) return;
  grid.dataset.delegated = 'true';

  grid.onclick = (e) => {
    /* Die Handelsknoepfe zuerst: sie sitzen im Kartenfuss und wuerden sonst
       vom Datenblatt-Zweig darunter geschluckt. */
    const wts = e.target.closest('[data-set-wts]');
    if (wts) {
      if (!wts.classList.contains('is-disabled')) {
        startOrderForSet(wts.dataset.setWts, 'sell', Number(wts.dataset.setQty) || 1);
      }
      return;
    }
    const wtb = e.target.closest('[data-set-wtb]');
    if (wtb) { startOrderForSet(wtb.dataset.setWtb, 'buy', 1); return; }

    /* Ein Set-Teil fragt nach seiner Herkunft, alles andere nach seinem
       Datenblatt - deshalb VOR data-idx geprueft. */
    const part = e.target.closest('[data-part]');
    if (part) { openPartModal(part.dataset.part); return; }

    const el = e.target.closest('[data-idx]');
    if (!el) return;
    const idx = Number(el.dataset.idx);
    const item = currentInvList?.[idx];
    if (item) {
      const open = invSection === 'relics' ? openRelicModal : openUpgradeModal;
      open(item);
    }
  };

  grid.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    if (img.matches('.mod-art img, .arc-art img, .set-part-img')) {
      img.style.visibility = 'hidden';
    } else if (img.matches('.set-art-img')) {
      /* Beim Set-Bild verschwindet der ganze Schaukasten - ein leerer Rahmen
       neben der Teileliste waere nur ein Loch. */
      img.parentElement.style.display = 'none';
    } else if (img.matches('.mat-icon')) {
      img.classList.add('is-missing');
    }
  }, true);
}

function loadNextInvChunk() {
  const grid = $('inv-grid');
  const sentinel = $('inv-sentinel');
  if (!grid || !currentInvList || invRenderedCount >= currentInvList.length) {
    if (invChunkObserver) {
      invChunkObserver.disconnect();
      invChunkObserver = null;
    }
    sentinel?.remove();
    return;
  }

  const chunkSize = invSection === 'sets' ? 36 : INV_CHUNK_SIZE;
  const nextBatch = currentInvList.slice(invRenderedCount, invRenderedCount + chunkSize);
  const tileFn = invSection === 'mods' ? modTile : (invSection === 'arcanes' ? arcaneTile : (invSection === 'sets' ? setCardTile : plainRow));
  const html = nextBatch.map((item, idx) => tileFn(item, invRenderedCount + idx)).join('');
  invRenderedCount += nextBatch.length;

  if (sentinel) {
    sentinel.insertAdjacentHTML('beforebegin', html);
    if (invRenderedCount >= currentInvList.length) {
      if (invChunkObserver) {
        invChunkObserver.disconnect();
        invChunkObserver = null;
      }
      sentinel.remove();
    }
  } else {
    grid.insertAdjacentHTML('beforeend', html);
  }
}

function renderInventoryGrid() {
  const d = inventoryData;
  if (!d || !d.sections) return;
  const query = ($('inv-search')?.value || '').toLowerCase().trim();
  const all = d.sections[invSection] || [];

  if (invChunkObserver) {
    invChunkObserver.disconnect();
    invChunkObserver = null;
  }

  /* Betriebsart des Rasters. MUSS hier oben stehen, vor allen vorzeitigen
     Ausstiegen: die Sets-Ansicht und der Leerfall steigen weiter unten aus,
     und blieben dann mit der Spaltenbreite der vorigen Ansicht zurueck -
     Set-Karten brauchen 320 px, Mod-Karten 184, und die zuletzt im
     Stilblatt stehende Regel gewinnt. */
  const grid = $('inv-grid');
  grid?.classList.toggle('is-sets', invSection === 'sets');
  grid?.classList.toggle('is-cards', invSection === 'mods');
  grid?.classList.toggle('is-arcanes', invSection === 'arcanes');

  if (grid) setupInvGridEvents(grid);

  renderInvTierFilter(all);

  let list = all;
  if (invSection === 'sets') {
    const hasQuery = Boolean(query);
    const matchOwn = invSetOwnership === 'all' ? null : matchOf(SET_OWNERSHIP, invSetOwnership);
    const matchOrigin = invSetOrigin === 'all' ? null : matchOf(SET_ORIGINS, invSetOrigin);
    const matchKind = invSetKind === 'all' ? null : matchOf(SET_KINDS, invSetKind);

    list = all.filter(s => {
      if (matchOwn && !matchOwn(s)) return false;
      if (matchOrigin && !matchOrigin(s)) return false;
      if (matchKind && !matchKind(s)) return false;
      if (hasQuery) {
        if (!s._searchName) s._searchName = s.name.toLowerCase();
        if (s._searchName.includes(query)) return true;
        return s.parts.some(p => {
          if (!p._searchName) p._searchName = p.name.toLowerCase();
          return p._searchName.includes(query);
        });
      }
      return true;
    });
  } else if (invSection === 'mods') {
    list = query ? all.filter(e => e.name.toLowerCase().includes(query) || (e.compat && e.compat.toLowerCase().includes(query))) : all;
    list = filterMods(list);
  } else if (invSection === 'arcanes') {
    list = query ? all.filter(e => e.name.toLowerCase().includes(query)) : all;
    list = filterArcanes(list);
  } else if (invSection === 'relics') {
    /* Die Suche fragt hier ZWEI Dinge auf einmal ab: den Namen des Relikts und
       seine Belohnungen. Wer "Wisp Prime Neuroptics" eintippt, will nicht
       hoeren, dass kein Relikt so heisst - er will die sieben Relikte sehen,
       in denen das Teil steckt. Was getroffen hat, merkt sich die Zeile. */
    list = all.map(e => ({ ...e, matchedReward: null }));
    if (query) {
      list = list.filter(e => {
        if (e.name.toLowerCase().includes(query)) return true;
        const reward = (e.rewards || []).find(r => r.toLowerCase().includes(query));
        if (!reward) return false;
        e.matchedReward = reward;
        return true;
      });
    }
    if (invTier !== 'all') list = list.filter(e => e.tier === invTier);
  } else {
    list = query ? all.filter(e => e.name.toLowerCase().includes(query)) : all;
  }

  const total = d.totals[invSection] || { arten: all.length, stueck: 0 };
  const alt = (QUELLEN[d.source] || QUELLEN.api).stale && d.fetchedAt
    ? ` · as of ${new Date(d.fetchedAt).toLocaleDateString('en-GB')}`
    : '';

  const isFiltered = query
    || (invSection === 'sets' && (invSetOwnership !== 'all' || invSetOrigin !== 'all' || invSetKind !== 'all'))
    || (invSection === 'mods' && (invModOwnership !== 'all' || invModKind !== 'all'))
    || (invSection === 'arcanes' && (invArcaneOwnership !== 'all' || invArcaneKind !== 'all'))
    || (invSection === 'relics' && invTier !== 'all');

  let metaText = '';
  if (isFiltered) {
    metaText = `${nf(list.length)} of ${nf(all.length)} entries`;
  } else if (invSection === 'sets') {
    metaText = `${nf(total.arten)} sets · ${nf(total.complete || 0)} complete`;
  } else if (invSection === 'mods' || invSection === 'arcanes') {
    metaText = `${nf(total.ownedArten ?? total.arten)} / ${nf(total.arten)} owned · ${nf(total.stueck)} copies in total`;
  } else {
    metaText = `${nf(total.arten)} kinds · ${nf(total.stueck)} items in total`;
  }
  $('inv-meta').innerHTML = esc(metaText) + esc(alt);

  if (!list.length) {
    currentInvList = [];
    const emptyMsg = invSection === 'sets'
      ? (query ? `No sets found matching “${esc(query)}”.` : 'No matching sets found.')
      : `Nothing found for “${esc(query)}”.`;
    $('inv-grid').innerHTML = `<div class="empty" style="grid-column: 1 / -1;">${emptyMsg}</div>`;
    return;
  }

  /* Progressives Rendern in Chunks: die ersten 36-60 Karten erscheinen sofort (<5ms),
     weitere werden beim Scrollen über einen IntersectionObserver nachgeladen. */
  currentInvList = list;
  const chunkSize = invSection === 'sets' ? 36 : INV_CHUNK_SIZE;
  const initial = list.slice(0, chunkSize);
  invRenderedCount = initial.length;

  const tileFn = invSection === 'mods' ? modTile : (invSection === 'arcanes' ? arcaneTile : (invSection === 'sets' ? setCardTile : plainRow));
  const initialHtml = initial.map((item, idx) => tileFn(item, idx)).join('');

  if (list.length > initial.length) {
    grid.innerHTML = initialHtml + '<div id="inv-sentinel" class="inv-sentinel"></div>';
    const sentinel = $('inv-sentinel');
    if (sentinel) {
      invChunkObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadNextInvChunk();
          }
        }
      }, {
        rootMargin: '600px 0px'
      });
      invChunkObserver.observe(sentinel);
    }
  } else {
    grid.innerHTML = initialHtml;
  }

  /* Erst zeichnen, dann nachladen: der Aufruf steht hinter dem Raster, damit
     er die sichtbare Liste kennt und dort anfangen kann. Laeuft im Hintergrund
     weiter, ohne dass das Zeichnen darauf wartet. */
  if (invSection === 'sets') fetchMissingSetPrices();
}

/* ---------------- Kacheln des Inventar-Rasters ---------------- */

/**
 * Ausgefallene Bilder abfangen.
 *
 * ACHTUNG: onerror="..." als Attribut laeuft hier NICHT. Die
 * Content-Security-Policy der Seite laesst nur Skripte aus eigenen Dateien zu,
 * und ein Attribut-Handler zaehlt als Inline-Skript - er wird stillschweigend
 * verworfen. Statt eines fehlenden Bildes bliebe dann der Alternativtext
 * mitten im Raster stehen.
 *
 * Der zweite Teil ist genauso wichtig: ein Bild, das schon vor dem Verdrahten
 * aufgegeben hat, feuert kein Ereignis mehr. `complete` bei Breite 0 heisst
 * genau das - fertig geladen und trotzdem nichts da.
 */
function onImageFail(root, selector, fix) {
  root.querySelectorAll(selector).forEach(img => {
    if (img.complete && img.naturalWidth === 0) fix(img);
    else img.addEventListener('error', () => fix(img), { once: true });
  });
}

/**
 * Die Mod-Karte selbst - ohne den Platz, in dem sie liegt.
 *
 * Sie wird an ZWEI Stellen gebraucht: im Inventar-Raster und im Mod-Brett des
 * Build-Tabs. Beide zeichnen dieselbe Karte, nur der Rahmen darum ist ein
 * anderer - deshalb steht das Zeichnen hier und der Platz beim Aufrufer.
 *
 * Erwartet eine bereits vereinheitlichte Karte:
 *   { name, art|image, stats[], compat, drain, isAura, polarity:{glyph},
 *     rarity, pips, rank }
 * `pips` ist die Rangzahl der KARTE, `rank` der tatsaechliche Rang - im
 * Inventar der hoechste besessene, im Build der eingestellte.
 */
function modCardHtml(c) {
  const rank = c.rank ?? 0;
  const rarity = String(c.rarity || 'common').toLowerCase();

  return `
    <div class="mod-card rar-${esc(rarity)}">
      <div class="mod-edge"></div>
      <div class="mod-inner">
        ${c.drain != null ? `
          <div class="mod-drain ${c.isAura ? 'is-aura' : ''}">
            ${c.isAura ? '+' : ''}${c.drain}
            ${c.polarity ? `<span class="mod-pol">${Icon.polarity(c.polarity.glyph, 11)}</span>` : ''}
          </div>` : ''}
        <figure class="mod-art">
          <img src="${esc(c.art || c.image || '')}" alt="" loading="lazy">
        </figure>
        <div class="mod-text">
          <p class="mod-name">${esc(c.name)}</p>
          ${(c.stats || []).map(s => `<p class="mod-stat">${esc(s)}</p>`).join('')}
        </div>
        ${c.compat ? `<div class="mod-compat"><p>${esc(c.compat)}</p></div>` : ''}
        ${c.pips ? `
          <div class="mod-pips ${rank >= c.pips ? 'is-max' : ''}">
            ${Array.from({ length: c.pips }, (_, p) =>
              `<i class="${p < rank ? 'on' : ''}">★</i>`).join('')}
          </div>` : ''}
      </div>
    </div>`;
}

/**
 * Mod-Karte mit DEN ZWEI ZUSTAENDEN, die sie im Spiel auch hat.
 *
 * ZUGEKLAPPT steht nur der Name da. AUFGEKLAPPT faehrt die Karte auf und zeigt
 * Illustration, Wirkung und Kompatibilitaet.
 *
 * WARUM SELBST GEZEICHNET UND NICHT ALS FERTIGES BILD:
 *   Ein gerendertes Kartenbild kennt nur EINEN Zustand. Den zugeklappten
 *   daraus zu schneiden geht nicht - er hat einen anderen Aufbau, und wo der
 *   Name sitzt, haengt an der Laenge des Wirkungstextes. Hier steht jedes Teil
 *   an seinem Platz, und der Wechsel ist eine Frage von Hoehe und Deckkraft.
 *
 * Der Aufbau folgt dem, was Overframe macht: Rahmenteile als Hintergrundbilder
 * (die echten Spiel-Texturen), die Illustration darin, Text darueber. Der
 * zugeklappte Zustand entsteht dadurch, dass die Karte nur 90 px hoch ist und
 * `overflow: hidden` alles darunter abschneidet - waehrend der Name mit einem
 * negativen `top` nach oben ueber die abgedunkelte Illustration rutscht.
 *
 * Im Inventar ist `maxRank` der hoechste Rang, den der Spieler von dieser Mod
 * besitzt - das ist der Rang, den die Karte zeigen soll.
 */
function modTile(e, i) {
  const isOwned = (e.count || 0) > 0;
  return `
    <div class="mod-slot ${isOwned ? '' : 'is-unowned'}" ${e.resolved ? `data-idx="${i}" title="${isOwned ? 'Open data sheet' : 'Not owned · Open data sheet'}"` : ''}>
      ${modCardHtml({ ...e, rank: e.maxRank ?? 0 })}
      <span class="mod-count ${isOwned ? '' : 'is-unowned'}">${isOwned ? nf(e.count) : '0'}</span>
    </div>`;
}

/**
 * Arcanes sind keine Karten, sondern Gefaesse - quer statt hochkant und ohne
 * Rahmen, in dem ein Name stuende. Der steht deshalb darunter.
 */
function arcaneTile(e, i) {
  const isOwned = (e.count || 0) > 0;
  return `
    <div class="arc-tile ${isOwned ? '' : 'is-unowned'}" ${e.resolved ? `data-idx="${i}" title="${isOwned ? 'Open data sheet' : 'Not owned · Open data sheet'}"` : ''}>
      <div class="arc-art">
        <img src="${esc(e.card || e.image)}" alt="" loading="lazy">
        <span class="mod-count ${isOwned ? '' : 'is-unowned'}">${isOwned ? nf(e.count) : '0'}</span>
      </div>
      <b>${esc(e.name)}</b>
      ${e.ranks?.length ? `<span class="inv-tag">${e.ranks.map(r =>
        `Rank ${r.rank}${r.count > 1 ? '×' + r.count : ''}`).join(', ')}</span>` : (!isOwned ? '<span class="inv-tag is-unowned-tag">Not owned</span>' : '')}
    </div>`;
}

/** Relikte, Materialien, Blueprints: die gewohnte Zeile. */
function plainRow(e, i) {
  const extra = e.quality ? `<span class="inv-tag">${esc(e.quality)}</span>` : '';
  const clickable = invSection === 'relics';

  /* Wurde nach einem TEIL gesucht, muss die Zeile sagen, WARUM sie dasteht -
     "Axi A22" allein beantwortet die Frage nach Wisp Prime Neuroptics nicht. */
  const hit = e.matchedReward
    ? `<span class="inv-tag is-hit">${Icon.target(10)}${esc(e.matchedReward)}</span>`
    : '';

  return `
    <div class="inv-item ${clickable ? 'is-clickable' : ''}"
         ${clickable ? `data-idx="${i}" title="Open data sheet"` : `title="${esc(e.uniqueName)}"`}>
      <img class="mat-icon" src="${esc(e.image)}" alt="" loading="lazy">
      <div class="inv-item-body">
        <b>${esc(e.name)}</b>
        ${extra}${hit}
      </div>
      <span class="inv-item-count">${nf(e.count)}</span>
    </div>`;
}

/* ---------------- Datenblatt einer Mod / eines Arcanes ---------------- */

let upgradeData = null;
let upgradeRank = 0;

/**
 * Oeffnet das Datenblatt zu einer Karte aus dem Inventar.
 *
 * Der Inventar-Eintrag wandert mit in den Hauptprozess: Anzahl und Raenge
 * liegen hier bereits vor, und die Inventardatei ist ein Megabyte gross -
 * sie je Klick neu zu lesen waere Verschwendung.
 */
async function openUpgradeModal(entry) {
  if (!entry?.uniqueName) return;
  const modal = $('upgrade-modal');
  const content = $('upgrade-modal-content');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.innerHTML = `<div class="up-loading">${Icon.refresh(22)}<span>Lade Datenblatt …</span></div>`;

  const res = await window.api.getUpgradeDetails(entry.uniqueName, {
    count: entry.count || 0,
    ranks: entry.ranks || [],
    maxRank: entry.maxRank ?? null
  });

  if (!res.ok) {
    content.innerHTML = `
      <div class="im-header">
        <div class="im-title-group"><h2>${esc(entry.name)}</h2></div>
        <button class="modal-close-icon" id="up-close" title="Close">&times;</button>
      </div>
      <div class="im-scroll-body">
        <p class="up-empty">${esc(res.error || 'Could not load the data sheet.')}</p>
      </div>`;
    $('up-close').onclick = closeUpgradeModal;
    return;
  }

  upgradeData = res.data;
  /* Startwert ist der hoechste Rang, den man BESITZT - er zeigt, was die Karte
     gerade wirklich tut. Ohne Besitz der Maximalrang, denn danach fragt, wer
     die Karte noch sucht. */
  upgradeRank = upgradeData.owned?.maxRank ?? upgradeData.maxRank;
  renderUpgradeModal();
}

function closeUpgradeModal() {
  $('upgrade-modal')?.classList.add('hidden');
}

/**
 * Adresse im offiziellen Warframe-Wiki. Dieselbe Quelle, aus der auch die
 * Kartenbilder kommen - der alte Fandom-Spiegel wird nicht mehr gepflegt.
 */
const wikiLink = name =>
  'https://wiki.warframe.com/w/' + encodeURIComponent(String(name).replace(/ /g, '_'));

/** Herkunft der Fundorte - wer die Zahlen liest, soll wissen, woher sie kommen. */
const UPGRADE_ORIGIN = {
  de:           'Drop locations from the official Digital Extremes drop tables.',
  warframestat: 'Locations via warframestat.us — offers DE does not list as drops.',
  rule:         'This card does not drop anywhere: the classification comes from the path DE filed it under.'
};

function renderUpgradeModal() {
  const d = upgradeData;
  const content = $('upgrade-modal-content');
  if (!d || !content) return;

  const row = d.ranks[upgradeRank] || d.ranks[d.ranks.length - 1] || { stats: [] };
  const owned = d.owned && d.owned.count > 0 ? d.owned : null;
  const ownedRanks = new Set((owned?.ranks || []).map(r => r.rank));

  const badges = [
    `<span class="im-badge cat">${esc(d.kindLabel)}</span>`,
    d.typeLabel ? `<span class="im-badge">${esc(d.typeLabel)}</span>` : '',
    d.rarityLabel ? `<span class="im-badge rar-${esc(String(d.rarity).toLowerCase())}">${esc(d.rarityLabel)}</span>` : '',
    /* Bei einer Aura sagt das schon der Typ - zweimal "Aura" nebeneinander
       ist keine zusaetzliche Auskunft. */
    d.isAura && d.typeLabel !== 'Aura' ? '<span class="im-badge">Aura</span>' : '',
    d.isExilus ? '<span class="im-badge">Exilus</span>' : ''
  ].join('');

  /* Kopfzeile: worauf die Karte passt und mit welcher Polaritaet. Beides ist
     die erste Frage beim Bauen, deshalb steht es unter dem Namen und nicht
     erst unten in den Werten. */
  const subline = [
    d.compat ? `Fits <b>${esc(d.compat)}</b>` : null,
    d.polarity ? `Polarity <b class="up-pol">${Icon.polarity(d.polarity.glyph, 12)}${esc(d.polarity.label)}</b>` : null
  ].filter(Boolean).join(' · ');

  /* Kosten der gewaehlten Stufe. Mods zahlen Kapazitaet und Endo, Arcanes
     bezahlen mit sich selbst - dort steht die Zahl der Exemplare. */
  const rankCost = d.kind === 'arcane'
    ? `<span>Needs <b>${nf(row.copies)}</b> copies</span>`
    : [
        `<span>${d.isAura ? 'Grants' : 'Costs'} <b>${nf(row.drain)}</b> capacity</span>`,
        row.endo ? `<span><b>${nf(row.endo)}</b> Endo bis hierher</span>` : ''
      ].join('');

  const tiles = [
    ['Max rank', d.maxRank],
    d.kind === 'arcane'
      ? ['Copies to max', nf(d.copiesToMax)]
      : [d.isAura ? 'Capacity at max' : 'Drain at max', nf(d.maxDrain)],
    d.kind === 'arcane' ? null : ['Endo bis Max', nf(d.endoToMax)],
    /* Dritter Eintrag ist fertiges Markup - nur die Polaritaet braucht es,
       weil ihr Zeichen eine Vektorgrafik ist und kein Buchstabe. */
    d.polarity
      ? ['Polarity', d.polarity.label,
         `<span class="up-pol">${Icon.polarity(d.polarity.glyph, 13)}${esc(d.polarity.label)}</span>`]
      : null,
    d.rarityLabel ? ['Seltenheit', d.rarityLabel] : null,
    d.compat ? ['Compatible with', d.compat] : null
  ].filter(Boolean);

  const wikiUrl = wikiLink(d.name);
  const inGoals = (state?.goals || []).some(g => g.uniqueName === d.uniqueName);

  content.innerHTML = `
    <div class="im-header">
      <div class="im-header-left">
        <!-- Die gerenderte Karte, wenn es sie gibt: sie zeigt Rahmen, Rang-
             punkte und Polaritaet so, wie sie im Spiel aussehen. Sonst bleibt
             das Bild aus DEs Export. -->
        <div class="im-art-wrap up-art-wrap ${d.card ? 'has-card' : ''} is-${esc(d.kind)}">
          <img class="im-art" src="${esc(d.card || d.image)}" alt="">
        </div>
        <div class="im-title-group">
          <div class="im-tags">${badges}</div>
          <h2>${esc(d.name)}</h2>
          ${subline ? `<div class="up-subline">${subline}</div>` : ''}
        </div>
      </div>
      <div class="im-header-actions">
        <button id="up-goal-btn" class="btn ${inGoals ? 'btn-secondary' : 'btn-primary'}" data-u="${esc(d.uniqueName)}" data-name="${esc(d.name)}">
          ${inGoals ? Icon.trash(14) + ' <span>Remove from goals</span>' : Icon.plus(14) + ' <span>Set as goal</span>'}
        </button>
      </div>
      <button class="modal-close-icon" id="up-close" title="Close">&times;</button>
    </div>

    <div class="im-scroll-body">
      ${owned ? `
        <div class="im-section">
          <div class="im-section-title">Owned</div>
          <div class="up-owned">
            <b>${nf(owned.count)}</b>
            <span>${owned.count === 1 ? 'copy' : 'copies'}</span>
            ${owned.ranks.length ? `<span class="up-owned-ranks">${owned.ranks.map(r =>
              `Rank ${r.rank}${r.count > 1 ? ' ×' + r.count : ''}`).join(' · ')}</span>` : ''}
            ${d.kind === 'arcane' && d.copiesToMax && owned.copies < d.copiesToMax
              ? `<span class="up-owned-ranks">${nf(d.copiesToMax - owned.copies)} more to reach rank ${d.maxRank}</span>`
              : ''}
          </div>
        </div>` : ''}

      <div class="im-section">
        <div class="im-section-title">Effect</div>
        <div class="up-ranks">
          ${d.ranks.map(r => `
            <button class="up-rank ${r.rank === upgradeRank ? 'active' : ''} ${ownedRanks.has(r.rank) ? 'has' : ''}"
                    data-rank="${r.rank}"
                    title="${ownedRanks.has(r.rank) ? 'Rank ' + r.rank + ' owned' : 'Rank ' + r.rank}">
              ${r.rank}
            </button>`).join('')}
        </div>
        <div class="up-stats">
          ${row.stats.length
            /* Alle Zeilen in EINEM Kasten, so wie die Karte im Spiel aussieht.
               Einzelne Kaesten je Zeile reissen zusammengehoerige Angaben
               auseinander ("On Energy Pickup:" stuende dann allein). */
            ? `<div class="up-stat">${row.stats.map(esc).join('<br>')}</div>`
            : '<div class="up-empty">The export lists no values for this rank.</div>'}
        </div>
        <div class="up-rank-cost">${rankCost}</div>
        ${d.description.length ? `
          <p class="im-desc up-desc">${d.description.map(esc).join('<br>')}</p>` : ''}
      </div>

      <div class="im-section">
        <div class="im-section-title">Werte</div>
        <div class="im-stats-grid">
          ${tiles.map(([label, val, html]) => `
            <div class="im-stat-tile">
              <span class="st-label">${esc(label)}</span>
              <b class="st-val">${html || esc(String(val))}</b>
            </div>`).join('')}
        </div>
      </div>

      ${d.set ? `
        <div class="im-section">
          <div class="im-section-title">Set-Bonus · ${esc(d.set.name)}</div>
          <p class="up-set-hint">Every equipped card of the set strengthens all the others.</p>
          <div class="up-set">
            ${d.set.members.map(m => `
              <span class="up-set-part ${m === d.name ? 'is-self' : ''}">${esc(m)}</span>`).join('')}
          </div>
        </div>` : ''}

      <div class="im-section">
        <div class="im-section-title">Where do I get this?</div>
        ${renderUpgradeSources(d)}
        <div class="up-src-foot">
          ${d.sources.origin ? `<span>${esc(UPGRADE_ORIGIN[d.sources.origin] || '')}</span>` : ''}
          <a class="up-wiki" href="${esc(wikiUrl)}" target="_blank" rel="noreferrer">
            ${Icon.link(13)}<span>Look it up in the wiki</span>
          </a>
        </div>
      </div>
    </div>`;

  $('up-close').onclick = closeUpgradeModal;

  const goalBtn = $('up-goal-btn');
  if (goalBtn) {
    goalBtn.onclick = async () => {
      const u = goalBtn.dataset.u;
      const n = goalBtn.dataset.name;
      const already = (state?.goals || []).some(g => g.uniqueName === u);
      const res = already ? await window.api.removeGoal(u) : await window.api.addGoal(u, n);
      if (res.ok) {
        state = res.data;
        render(res.data);
        renderUpgradeModal();
      }
    };
  }

  content.querySelectorAll('[data-rank]').forEach(btn => {
    btn.onclick = () => { upgradeRank = Number(btn.dataset.rank); renderUpgradeModal(); };
  });

  /* Bleibt die gezeichnete Karte aus, tritt das Bild aus DEs Export an ihre
     Stelle - und der Rahmen im Kopf schrumpft wieder auf Bildgroesse. */
  onImageFail(content, '.im-art', img => {
    img.src = d.image;
    img.closest('.im-art-wrap')?.classList.remove('has-card');
  });
}

/** Fundorte, nach Art gruppiert. Leer ist ein eigener Fall, kein leerer Kasten. */
function renderUpgradeSources(d) {
  const groups = d.sources?.groups || [];
  if (!groups.length) {
    return `<div class="up-empty">
      ${esc(d.dropNote || 'In den Droptabellen steht zu dieser Karte kein Fundort. '
        + 'That mostly affects time-limited rewards — you can still trade for them.')}
    </div>`;
  }

  return groups.map(g => `
    <div class="up-src-group">
      <div class="up-src-head">${esc(g.label)}</div>
      ${g.entries.map(e => `
        <div class="up-src-row">
          <span class="up-src-place">${esc(e.place)}</span>
          ${e.detail ? `<span class="up-src-detail">${esc(e.detail)}</span>` : ''}
          ${e.chanceText ? `<span class="up-src-chance">${esc(e.chanceText)}</span>` : ''}
        </div>`).join('')}
      ${g.hidden ? `<div class="up-src-more">… and ${nf(g.hidden)} more</div>` : ''}
    </div>`).join('');
}

$('upgrade-modal').onclick = e => {
  if (e.target === $('upgrade-modal')) closeUpgradeModal();
};

/* ---------------- Woher kommt dieses Teil? ----------------

   Aus "My sets" heraus: ein Klick auf ein Teil beantwortet die Frage, die vor
   jedem fehlenden Teil steht - aus welchem Relikt faellt das, und liegt eins
   davon schon bei mir? Basis-Teile kommen aus keinem Relikt; dort steht
   stattdessen der Fundort im Sternensystem.
   -------------------------------------------------------------------- */

const closePartModal = () => $('part-modal').classList.add('hidden');
$('part-modal').onclick = e => { if (e.target === $('part-modal')) closePartModal(); };

async function openPartModal(itemName) {
  if (!itemName) return;
  const modal = $('part-modal');
  const box = $('part-modal-content');
  modal.classList.remove('hidden');
  box.innerHTML = `<div class="up-loading">${Icon.refresh(22)}<span>Looking it up …</span></div>`;

  const res = await window.api.relicsForItem(itemName);
  if (!res.ok) {
    box.innerHTML = partModalShell({ itemName }, `<p class="up-empty">${esc(res.error)}</p>`);
    $('part-close').onclick = closePartModal;
    return;
  }

  const d = res.data;
  const body = d.relics?.length
    ? relicSourceList(d)
    : renderUpgradeSources({
        sources: d.sources,
        dropNote: 'This part does not come from a relic. The drop tables list no '
                + 'source for it either — that usually means it is crafted or bought.'
      });

  box.innerHTML = partModalShell(d, body);
  $('part-close').onclick = closePartModal;

  const wtsBtn = $('part-wts-btn');
  if (wtsBtn) {
    wtsBtn.onclick = () => {
      if (d.ownedCount > 0 && d.slug) {
        closePartModal();
        startOrderForSet(d.slug, 'sell', d.ownedCount);
      }
    };
  }

  const wtbBtn = $('part-wtb-btn');
  if (wtbBtn) {
    wtbBtn.onclick = () => {
      if (d.slug) {
        closePartModal();
        startOrderForSet(d.slug, 'buy', 1);
      }
    };
  }
}

function partModalShell(d, body) {
  const isObj = typeof d === 'object' && d !== null;
  const itemName = isObj ? d.itemName : d;
  const image = isObj ? d.image : null;
  const price = isObj ? d.price : null;
  const ducats = isObj ? d.ducats : null;
  const slug = isObj ? d.slug : null;
  const ownedCount = isObj ? (d.ownedCount || 0) : 0;

  const badges = [
    ducats != null ? `<span class="im-badge cat">Prime Part</span>` : `<span class="im-badge cat">Part</span>`,
    ownedCount > 0
      ? `<span class="im-badge status done">${Icon.check(11)} ${ownedCount} owned</span>`
      : `<span class="im-badge status missing">Not owned</span>`
  ].join('');

  const stats = [
    price ? `
      <span class="part-stat-val" title="Lowest price on warframe.market">
        <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platinum">
        <b>${price.min != null ? price.min : '–'}</b> <small>Plat</small>
      </span>` : '',
    ducats != null ? `
      <span class="part-stat-val" title="Ducat value at the Void Trader">
        <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Ducats">
        <b>${nf(ducats)}</b> <small>Ducats</small>
      </span>` : ''
  ].filter(Boolean).join('');

  const tradeBtns = slug ? `
    <div class="im-header-actions part-header-actions">
      <button type="button" id="part-wts-btn" class="set-trade-btn is-sell${ownedCount > 0 ? '' : ' is-disabled'}"
              title="${ownedCount > 0 ? `List ${ownedCount} for sale on warframe.market` : 'You do not own this part'}">
        ${Icon.tag(12)}<span>WTS</span>${ownedCount > 1 ? `<b>${ownedCount}</b>` : ''}
      </button>
      <button type="button" id="part-wtb-btn" class="set-trade-btn is-buy"
              title="Post a buy order on warframe.market">
        ${Icon.plus(12)}<span>WTB</span>
      </button>
    </div>` : '';

  return `
    <div class="im-header">
      <div class="im-header-left">
        <div class="im-art-wrap part-art-wrap">
          <img class="im-art" src="${esc(image || 'assets/icons/relic.png')}" alt="" onerror="this.src='assets/icons/relic.png'">
        </div>
        <div class="im-title-group">
          <div class="im-tags">${badges}</div>
          <h2>${esc(itemName)}</h2>
          ${stats ? `<div class="part-header-stats">${stats}</div>` : ''}
        </div>
      </div>
      ${tradeBtns}
      <button class="modal-close-icon" id="part-close" title="Close">&times;</button>
    </div>
    <div class="im-scroll-body">${body}</div>`;
}

/**
 * Die Relikte zu einem Teil.
 *
 * Was man selbst hat, steht oben und ist hervorgehoben: das ist der Unterschied
 * zwischen "farmen gehen" und "aufbrechen". Die Chance daneben ist die des
 * INTAKTEN Relikts - polieren hebt sie, aber das ist die Zahl, mit der man es
 * bekommt.
 */
function relicSourceList(d) {
  const mine = d.relics.filter(r => r.owned > 0);
  const rest = d.relics.filter(r => !r.owned);

  const row = r => `
    <div class="prel ${r.owned ? 'has' : ''}">
      <img class="prel-ic" src="${esc(relicTierImage(r.tier))}" alt="">
      <div class="prel-body">
        <b>${esc(r.tier)} ${esc(r.name)}</b>
        <small>${esc(r.rarity)}${r.chance != null ? ` · ${r.chance}%` : ''}${
          r.fromState !== 'Intact' ? ` · ${esc(r.fromState)} only` : ''}</small>
      </div>
      ${r.owned
        ? `<span class="prel-own" title="${esc(r.states.map(s => `${s.count}× ${s.state}`).join(', '))}">
             ${Icon.check(11)} ${nf(r.owned)}
           </span>`
        : '<span class="prel-own is-none">—</span>'}
    </div>`;

  return `
    <p class="prel-lead">
      ${d.relics.length} relic${d.relics.length === 1 ? '' : 's'} drop this part${
        d.ownedTotal ? ` — you hold ${nf(d.ownedTotal)} of them` : ' — you hold none of them'}.
    </p>
    ${mine.length ? `<div class="up-src-head">In your inventory</div>
      <div class="prel-list">${mine.map(row).join('')}</div>` : ''}
    ${rest.length ? `<div class="up-src-head">${mine.length ? 'Still to farm' : 'Drops from'}</div>
      <div class="prel-list">${rest.map(row).join('')}</div>` : ''}`;
}

/* ---------------- Datenblatt eines Relikts ---------------- */

let relicData = null;
let relicState = 'Intact';

/* Seltenheit der Belohnung - dieselben drei Stufen wie im Auswahlbildschirm. */
const REWARD_RARITY = { Common: 'Common', Uncommon: 'Uncommon', Rare: 'Rare' };

async function openRelicModal(entry) {
  if (!entry?.uniqueName) return;
  const modal = $('relic-modal');
  const content = $('relic-modal-content');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.innerHTML = `<div class="up-loading">${Icon.refresh(22)}<span>Lade Belohnungstabelle …</span></div>`;

  const res = await window.api.getRelicDetails(entry.uniqueName);
  if (!res.ok) {
    content.innerHTML = `
      <div class="im-header">
        <div class="im-title-group"><h2>${esc(entry.name)}</h2></div>
        <button class="modal-close-icon" id="rl-close" title="Close">&times;</button>
      </div>
      <div class="im-scroll-body">
        <p class="up-empty">${esc(res.error || 'Could not load the rewards.')}</p>
      </div>`;
    $('rl-close').onclick = closeRelicModal;
    return;
  }

  relicData = res.data;
  /* Die eigene Politur-Stufe zuerst - danach ist gefragt, wer im Inventar
     darauf geklickt hat. */
  relicState = relicData.currentState || 'Intact';
  renderRelicModal();
}

function closeRelicModal() {
  $('relic-modal')?.classList.add('hidden');
}

function renderRelicModal() {
  const d = relicData;
  const content = $('relic-modal-content');
  if (!d || !content) return;

  const cur = d.states.find(s => s.state === relicState) || d.states[0];

  /* Der Erwartungswert ist eine Untergrenze, solange nicht jede Belohnung
     einen Preis hat - das gehoert dazugesagt, sonst liest sich die Zahl
     genauer, als sie ist. */
  const unpriced = cur.pricedShare < 0.999;

  content.innerHTML = `
    <div class="im-header">
      <div class="im-header-left">
        <div class="im-art-wrap rl-art-wrap">
          <img class="im-art" src="${esc(d.image || '')}" alt="">
        </div>
        <div class="im-title-group">
          <div class="im-tags">
            <span class="im-badge cat">Relikt</span>
            ${d.tier ? `<span class="im-badge tier-${esc(d.tier.toLowerCase())}">${esc(d.tier)}</span>` : ''}
            ${d.vaulted ? '<span class="im-badge rar-rare">Vaulted</span>' : ''}
          </div>
          <h2>${esc(d.displayName)}</h2>
          <div class="up-subline">
            ${d.total ? `<b>${nf(d.total)}</b> in stock` : 'Not in stock'}
            ${d.vaulted ? ' · currently vaulted' : ''}
          </div>
        </div>
      </div>
      <button class="modal-close-icon" id="rl-close" title="Close">&times;</button>
    </div>

    <div class="im-scroll-body">
      <div class="im-section">
        <div class="im-section-title">Refinement</div>
        <p class="up-set-hint">
          All four refinement levels show the same six rewards — only the chances shift
          towards the rare one.
        </p>
        <div class="rl-states">
          ${d.states.map(s => `
            <button class="rl-state ${s.state === relicState ? 'active' : ''} ${s.count ? 'has' : ''}"
                    data-state="${esc(s.state)}">
              ${esc(s.label)}<span>${nf(s.count)}</span>
            </button>`).join('')}
        </div>
      </div>

      ${cur.rewards.length ? `
        <div class="im-section">
          <div class="im-section-title">Rewards</div>
          <div class="rl-rewards">
            ${cur.rewards.map(r => `
              <div class="rl-reward rar-${esc(String(r.rarity || '').toLowerCase())}">
                <img class="mat-icon" src="${esc(r.image || '')}" alt="" loading="lazy">
                <div class="rl-reward-body">
                  <b>${esc(r.name)}</b>
                  <span>${esc(REWARD_RARITY[r.rarity] || r.rarity || '')}</span>
                </div>
                <span class="rl-chance">${esc(fmtChance(r.chance))}</span>
                <span class="rl-val">
                  <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platin">
                  ${r.plat != null ? nf(r.plat) : '–'}
                </span>
                <span class="rl-val">
                  <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Ducats">
                  ${r.ducats != null ? nf(r.ducats) : '–'}
                </span>
              </div>`).join('')}
          </div>
        </div>

        <div class="im-section">
          <div class="im-section-title">What one crack returns on average</div>
          <div class="im-stats-grid">
            <div class="im-stat-tile">
              <span class="st-label">Platinum${unpriced ? ' (at least)' : ''}</span>
              <b class="st-val">${nf(cur.expPlat)}</b>
            </div>
            <div class="im-stat-tile">
              <span class="st-label">Ducats</span>
              <b class="st-val">${nf(cur.expDucats)}</b>
            </div>
          </div>
          ${unpriced ? `
            <p class="up-set-hint" style="margin-top:9px;">
              No platinum price exists for ${Math.round((1 - cur.pricedShare) * 100)}% of the drop chance —
              so the platinum value is a lower bound, not an estimate.
            </p>` : ''}
        </div>
      ` : `
        <div class="im-section">
          <div class="im-section-title">Rewards</div>
          <div class="up-empty">
            No reward table is available for this relic. DE no longer lists vaulted relics —
            the rewards stay the same, but they can only be looked up
            aber nur im Wiki.
          </div>
        </div>`}

      <div class="im-section">
        <div class="im-section-title">Where do I get this?</div>
        ${d.vaulted
          ? `<div class="up-empty">This relic is vaulted — it does not drop anywhere right now.
             That leaves trading for it, or waiting for an unvaulting.</div>`
          : renderUpgradeSources(d)}
        <div class="up-src-foot">
          ${d.sources?.origin ? `<span>${esc(UPGRADE_ORIGIN[d.sources.origin] || '')}</span>` : ''}
          <a class="up-wiki" target="_blank" rel="noreferrer" href="${esc(wikiLink(d.key))}">
            ${Icon.link(13)}<span>Look it up in the wiki</span>
          </a>
        </div>
      </div>
    </div>`;

  $('rl-close').onclick = closeRelicModal;
  content.querySelectorAll('[data-state]').forEach(btn => {
    btn.onclick = () => { relicState = btn.dataset.state; renderRelicModal(); };
  });

  /* Nicht handelbare Belohnungen haben kein Marktbild. Der Platz bleibt
     stehen, damit die Spalte daneben nicht verrutscht. */
  onImageFail(content, '.im-art, .rl-reward .mat-icon', img => { img.style.visibility = 'hidden'; });
}

/** Chancen kommen als Zahl - hier bekommen sie Komma und Prozentzeichen. */
const fmtChance = v => v == null
  ? '–'
  : `${Number(v).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;

$('relic-modal').onclick = e => {
  if (e.target === $('relic-modal')) closeRelicModal();
};

let invSearchDebounce = null;
if ($('inv-search')) {
  $('inv-search').oninput = () => {
    clearTimeout(invSearchDebounce);
    invSearchDebounce = setTimeout(() => renderInventoryGrid(), 60);
  };
}

if ($('btn-inv-refresh')) $('btn-inv-refresh').onclick = async () => {
  const btn = $('btn-inv-refresh');
  btn.disabled = true;
  btn.innerHTML = Icon.refresh(15) + '<span>Searching game memory …</span>';

  const res = await window.api.refreshInventory();

  btn.disabled = false;
  btn.innerHTML = Icon.refresh(15) + '<span>Fetch inventory</span>';

  if (res.ok) { inventoryData = res.data; renderInventory(); }
  else showInventoryState(res.code, res.error);
};

/* Auto-Sync Listener: Hauptprozess hat im Hintergrund frische Daten geliefert */
if (window.api.onInventoryUpdated) {
  window.api.onInventoryUpdated(data => {
    inventoryData = data;
    /* Die Ketten haengen am Bestand und am Rang - beides steht in genau
       diesen Daten. Ohne das Verwerfen zeigten sie bis zum Neustart einen
       Stand von vor dem Abruf. */
    chainData = null;
    if ($('mastery-pane-foundry')?.classList.contains('active')) loadChains();
    const invTab = $('tab-inventory');
    if (invTab && invTab.classList.contains('active')) {
      renderInventory();
    }
  });
}

if (window.api.onInventoryStale) {
  window.api.onInventoryStale(info => {
    if (inventoryData && info.gate) {
      inventoryData.gate = info.gate;
      const refreshBtn = $('btn-inv-refresh');
      if (refreshBtn) {
        refreshBtn.classList.toggle('is-gated', !info.gate.allowed);
        if (info.gate.waitText) {
          refreshBtn.title = `Next fetch in ${info.gate.waitText}`;
        }
      }
    }
  });
}


/* ---------------- Material Klick Verlinkung zum Farm-Guide ---------------- */
document.addEventListener('click', e => {
  const matEl = e.target.closest('.mat, .chip, .im-mat');
  if (matEl) {
    const nameEl = matEl.querySelector('span');
    if (nameEl && nameEl.textContent) {
      const name = nameEl.textContent.trim();
      if (farmGuideCache.some(r => r.name.toLowerCase() === name.toLowerCase()) || name.length > 2) {
        openFarmGuideFor(name);
      }
    }
  }
});

/* ==========================================================================
   Void-Riss Benachrichtigungssystem (Frontend)
   ========================================================================== */

/* Auswahl im Einstellungsfenster. Die Schluessel sind die Namen, die die API
   liefert - der Abgleich in fissure-filter.js vergleicht sie exakt.
   Die Zariman-Typen stehen zusammen oben, die Railjack-Typen unten: sie tauchen
   nur in Stuermen auf und haengen am Schalter "Stuerme einschliessen". */
const FISSURE_MISSION_TYPES = [
  { key: 'Void Cascade', label: 'Void Cascade (Kaskade)' },
  { key: 'Void Flood', label: 'Void-Flut (Flood)' },
  { key: 'Void Armageddon', label: 'Void-Armageddon' },
  { key: 'Capture', label: 'Gefangennahme (Capture)' },
  { key: 'Extermination', label: 'Exterminate' },
  { key: 'Survival', label: 'Survival' },
  { key: 'Defense', label: 'Verteidigung (Defense)' },
  { key: 'Mobile Defense', label: 'Mobile Verteidigung' },
  { key: 'Disruption', label: 'Disruption' },
  { key: 'Excavation', label: 'Ausgrabung (Excavation)' },
  { key: 'Alchemy', label: 'Alchemie (Alchemy)' },
  { key: 'Rescue', label: 'Rettung (Rescue)' },
  { key: 'Spy', label: 'Spionage (Spy)' },
  { key: 'Interception', label: 'Abfangen (Interception)' },
  { key: 'Sabotage', label: 'Sabotage' },
  { key: 'Skirmish', label: 'Skirmish (Railjack)' },
  { key: 'Volatile', label: 'Volatile (Railjack)' },
  { key: 'Orphix', label: 'Orphix (Railjack)' }
];

let notificationSettings = null;

/* Die Regeln stehen in fissure-filter.js - dieselbe Datei benutzt der
   Main-Prozess fuer die Toasts. Sonst markiert die Rissliste hier einen
   Treffer, fuer den nie eine Benachrichtigung kommt. */
function isFissureAlertMatch(f, cfg) {
  return FissureFilter.matches(f, cfg);
}

function updateNotificationButtonState() {
  const btn = $('btn-fissure-notif');
  const badge = $('fissure-notif-btn-badge');
  if (!btn || !badge) return;

  const active = !!(notificationSettings?.enabled && notificationSettings?.fissures?.enabled);
  btn.classList.toggle('is-active', active);
  badge.classList.toggle('is-off', !active);
  badge.textContent = active ? 'On' : 'Off';
}

async function loadNotificationSettings() {
  try {
    notificationSettings = await window.api.getNotifications();
    updateNotificationButtonState();
  } catch (err) {
    console.error('Could not load the notification settings:', err);
  }
}

function renderNotifTypesGrid() {
  const container = $('notif-types-grid');
  if (!container) return;

  const currentTypes = new Set((notificationSettings?.fissures?.missionTypes || []).map(t => t.toLowerCase()));
  const isAll = !!notificationSettings?.fissures?.allMissionTypes;

  container.innerHTML = FISSURE_MISSION_TYPES.map(t => {
    const isChecked = isAll || currentTypes.has(t.key.toLowerCase());
    return `
      <label class="type-checkbox-tile ${isChecked ? 'checked' : ''}">
        <input type="checkbox" value="${esc(t.key)}" class="notif-type-cb" ${isChecked ? 'checked' : ''}>
        <span>${esc(t.label)}</span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('.notif-type-cb').forEach(cb => {
    cb.onchange = () => {
      cb.closest('.type-checkbox-tile')?.classList.toggle('checked', cb.checked);
      updateModalMatchesHint();
    };
  });
}

function updateModalMatchesHint() {
  const hintEl = $('notif-matches-hint');
  if (!hintEl) return;

  if (!worldStateCache?.fissures?.length) {
    hintEl.innerHTML = '<span>No world-state fissures in the cache</span>';
    return;
  }

  // Temporäre Konfiguration aus Formularfeldern zusammenstellen
  const formCfg = getModalSettingsForm();
  const matches = (worldStateCache.fissures || []).filter(f => isFissureAlertMatch(f, formCfg));

  if (!formCfg.enabled || !formCfg.fissures.enabled) {
    hintEl.innerHTML = '<span style="color: var(--text-3);">Notifications are off</span>';
  } else if (matches.length) {
    const topMatches = matches.slice(0, 3).map(m => `<b>${esc(m.tier)} ${esc(m.missionType)}</b> (${esc(m.node)})`).join(', ');
    hintEl.innerHTML = `<span class="notif-hit-ic">${Icon.target(13)}</span><span><b>${matches.length} matching fissures</b> active now: ${topMatches}</span>`;
  } else {
    hintEl.innerHTML = '<span>Currently <b>no matches</b> for the selected filters</span>';
  }
}

function getModalSettingsForm() {
  /* Die drei Hauptschalter stehen jetzt im Einstellungs-Tab. Sie werden hier
     unveraendert mitgefuehrt, weil updateModalMatchesHint sie braucht: die
     Vorschau soll dasselbe Ergebnis zeigen wie der spaetere Toast, und der
     prueft zuerst enabled. */
  const enabled = notificationSettings?.enabled !== false;
  const sound = notificationSettings?.sound !== false;
  const desktopToast = notificationSettings?.desktopToast !== false;

  const selectedTiers = Array.from(document.querySelectorAll('.notif-tier-cb:checked')).map(cb => cb.value);
  const selectedTypes = Array.from(document.querySelectorAll('.notif-type-cb:checked')).map(cb => cb.value);

  const steelPathOnly = $('notif-steel-path-only')?.checked ?? false;
  const includeSteelPath = $('notif-include-steel-path')?.checked ?? true;
  const includeStorms = $('notif-include-storms')?.checked ?? true;

  return {
    enabled,
    sound,
    desktopToast,
    fissures: {
      enabled: notificationSettings?.fissures?.enabled !== false,
      allMissionTypes: false,
      missionTypes: selectedTypes,
      tiers: selectedTiers,
      steelPathOnly,
      includeSteelPath,
      includeStorms
    }
  };
}

function openNotificationModal() {
  const modal = $('fissure-notif-modal');
  if (!modal) return;

  const fCfg = notificationSettings?.fissures || {};

  if ($('notif-steel-path-only')) $('notif-steel-path-only').checked = !!fCfg.steelPathOnly;
  if ($('notif-include-steel-path')) $('notif-include-steel-path').checked = fCfg.includeSteelPath !== false;
  if ($('notif-include-storms')) $('notif-include-storms').checked = fCfg.includeStorms !== false;

  // Tiers
  const currentTiers = new Set((fCfg.tiers || ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia']).map(t => t.toLowerCase()));
  document.querySelectorAll('.notif-tier-cb').forEach(cb => {
    cb.checked = currentTiers.has(cb.value.toLowerCase());
    cb.closest('.tier-checkbox-tile')?.classList.toggle('checked', cb.checked);
    cb.onchange = () => {
      cb.closest('.tier-checkbox-tile')?.classList.toggle('checked', cb.checked);
      updateModalMatchesHint();
    };
  });

  // Mission Types
  renderNotifTypesGrid();
  updateModalMatchesHint();

  modal.classList.remove('hidden');
}

function closeNotificationModal() {
  const modal = $('fissure-notif-modal');
  if (modal) modal.classList.add('hidden');
}

// Preset-Buttons
function applyNotifPreset(name) {
  if (name === 'cascade') {
    document.querySelectorAll('.notif-type-cb').forEach(cb => {
      cb.checked = cb.value === 'Void Cascade';
      cb.closest('.type-checkbox-tile')?.classList.toggle('checked', cb.checked);
    });
    document.querySelectorAll('.notif-tier-cb').forEach(cb => {
      cb.checked = true;
      cb.closest('.tier-checkbox-tile')?.classList.add('checked');
    });
  } else if (name === 'speed') {
    document.querySelectorAll('.notif-type-cb').forEach(cb => {
      cb.checked = ['Capture', 'Extermination', 'Rescue'].includes(cb.value);
      cb.closest('.type-checkbox-tile')?.classList.toggle('checked', cb.checked);
    });
  } else if (name === 'endless') {
    document.querySelectorAll('.notif-type-cb').forEach(cb => {
      cb.checked = ['Void Cascade', 'Survival', 'Defense', 'Disruption', 'Excavation', 'Alchemy'].includes(cb.value);
      cb.closest('.type-checkbox-tile')?.classList.toggle('checked', cb.checked);
    });
  } else if (name === 'all') {
    document.querySelectorAll('.notif-type-cb').forEach(cb => {
      cb.checked = true;
      cb.closest('.type-checkbox-tile')?.classList.add('checked');
    });
  }
  updateModalMatchesHint();
}

// Event Listeners für Modal
$('btn-fissure-notif')?.addEventListener('click', openNotificationModal);
$('fissure-notif-close')?.addEventListener('click', closeNotificationModal);
$('fissure-notif-modal')?.addEventListener('click', e => {
  if (e.target === $('fissure-notif-modal')) closeNotificationModal();
});

document.querySelectorAll('.preset-chip').forEach(btn => {
  btn.onclick = () => applyNotifPreset(btn.dataset.preset);
});

$('notif-toggle-all-types')?.addEventListener('click', () => {
  const cbs = Array.from(document.querySelectorAll('.notif-type-cb'));
  const anyUnchecked = cbs.some(c => !c.checked);
  cbs.forEach(c => {
    c.checked = anyUnchecked;
    c.closest('.type-checkbox-tile')?.classList.toggle('checked', anyUnchecked);
  });
  updateModalMatchesHint();
});

$('notif-steel-path-only')?.addEventListener('change', updateModalMatchesHint);
$('notif-include-steel-path')?.addEventListener('change', updateModalMatchesHint);
$('notif-include-storms')?.addEventListener('change', updateModalMatchesHint);

$('btn-notif-test')?.addEventListener('click', async () => {
  const btn = $('btn-notif-test');
  btn.disabled = true;
  btn.innerHTML = Icon.refresh(14) + ' <span>Sende Test …</span>';
  try {
    await window.api.testNotification();
  } catch (err) {
    console.error('Test-Notification error:', err);
  }
  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = Icon.bell(14) + ' <span>Send a test</span>';
  }, 1200);
});

$('btn-notif-save')?.addEventListener('click', async () => {
  const formCfg = getModalSettingsForm();
  const res = await window.api.saveNotifications(formCfg);
  if (res.ok) {
    notificationSettings = res.data;
    updateNotificationButtonState();
    if (worldStateCache) renderFissures(worldStateCache.fissures || []);
  }
  closeNotificationModal();
});

// In-App Toast
/**
 * Der Toast in der App.
 *
 * `type` entscheidet, wohin der Klick fuehrt. Vorher gab es nur Risse, und
 * der Sprung auf die Riss-Liste stand fest verdrahtet darin - eine Meldung
 * ueber einen fertigen Bau haette einen dorthin geschickt.
 */
function showInAppToast({ title, body, type }) {
  const container = $('app-toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.innerHTML = `
    <div class="toast-ic">${Icon.bell(16)}</div>
    <div class="toast-body">
      <b>${esc(title)}</b>
      <p>${esc(body).replace(/\n/g, '<br>')}</p>
    </div>
    <button class="toast-close" title="Close">&times;</button>
  `;

  const remove = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  };

  toast.onclick = e => {
    if (e.target.closest('.toast-close')) {
      e.stopPropagation();
      remove();
      return;
    }
    if (type === 'foundry') {
      showTab('mastery');
      setMasteryMode('foundry');
    } else {
      showTab('worldstate');
      showWsPane('fissures');
    }
    remove();
  };

  container.appendChild(toast);
  setTimeout(remove, 6500);
}

// IPC Ereignisse empfangen
window.api.onNotificationEvent(data => {
  showInAppToast(data);
  /* Die Riss-Liste neu zu zeichnen ergibt nur bei einem Riss Sinn - ein
     fertiger Bau aendert dort nichts. */
  if (data?.type !== 'foundry' && worldStateCache) renderFissures(worldStateCache.fissures || []);
});

window.api.onNavigateTab((tab, subpane) => {
  showTab(tab);
  if (tab === 'worldstate' && subpane) showWsPane(subpane);
  /* Der Mastery-Tab hat drei Modi - ein Sprung dorthin ohne Angabe des
     Modus landet im Manager, und die Meldung, die ihn ausgeloest hat,
     bliebe ungezeigt. */
  if (tab === 'mastery' && MASTERY_MODES.includes(subpane)) setMasteryMode(subpane);
});

/* ---------------- Handel: Orders, Contracts, Transaktionen ----------------

   DREI LISTEN IN EINEM TAB, WEIL ES DREI ZUSTAENDE DERSELBEN SACHE SIND:
   Eine Order ist ein Angebot, ein Contract ist ein Angebot fuer ein
   Einzelstueck, eine Transaktion ist ein Angebot, aus dem etwas geworden
   ist. Wer den Preis einer Order aendert, will danach sehen, was der
   letzte Verkauf gebracht hat - nicht in einen anderen Reiter wechseln.

   WAS VON WO KOMMT:
   Orders und Contracts liegen auf warframe.market und werden dort geaendert.
   Das Handelsbuch liegt lokal, weil warframe.market keines fuehrt. Deshalb
   ueberlebt die Historie auch eine abgelaufene Anmeldung.                   */

let tradeMode = 'orders';           // 'orders' | 'contracts' | 'transactions'
let tradeAuth = null;               // { signedIn, user }
let tradeOrders = null;             // { orders, sell, buy }
let tradeContracts = null;          // { auctions, open, closed, readOnly }
let tradeTx = null;                 // { entries, summary }
let tradeFilter = 'all';
let tradeSort = 'plat-desc';
let tradeBusy = false;
let editingOrder = null;            // die Order im Bearbeiten-Fenster
let editingContract = null;
let editingTx = null;               // Transaktion, die gerade bearbeitet wird
let newOrderItem = null;            // im Neu-Fenster gewaehltes Item
let offerFilters = { type: 'sell', onlineOnly: false, sort: 'recent', platform: '' };
let contractOfferFilters = { onlineOnly: false, directSellOnly: false, sort: 'price-asc' };
let tradeSearchTimer = null;
/* Ergebnis der letzten Endpunkt-Pruefung und ob die Sitzung abgelaufen ist -
   beides faerbt den Kontoknopf und die Hinweiszeile. */
let tradeConnection = null;
let tradeSessionExpired = false;
/* 'unverified' | 'noprofile' | null - das Konto ist erreichbar, darf aber
   nicht handeln. Eine andere Lage als eine kaputte Sitzung. */
let tradeAccountBlocked = null;

/* Filter und Sortierung haengen am Modus: "cheapest first" ergibt bei
   Transaktionen keinen Sinn, "last 7 days" bei offenen Orders nicht. */
const TRADE_FILTERS = {
  orders: [
    { key: 'all',     label: 'All' },
    { key: 'sell',    label: 'Selling',  cls: 'chip-plat' },
    { key: 'buy',     label: 'Buying',   cls: 'chip-gold' },
    { key: 'hidden',  label: 'Hidden',   cls: 'chip-neutral', title: 'Orders you have switched to invisible' }
  ],
  contracts: [
    { key: 'all',     label: 'All' },
    { key: 'riven',   label: 'Rivens',   cls: 'chip-plat' },
    { key: 'lich',    label: 'Liches',   cls: 'chip-gold' },
    { key: 'sister',  label: 'Sisters',  cls: 'chip-junk' },
    { key: 'closed',  label: 'Closed',   cls: 'chip-neutral' }
  ],
  /* "Sellers" heisst: Leute, die verkaufen - also die Liste, aus der man
     KAUFT. Die Beschriftung nennt bewusst die Gegenseite und nicht die
     eigene Absicht: auf der Webseite steht dort dasselbe, und wer zwischen
     beiden hin und her springt, soll nicht jedesmal umdenken muessen. */
  market: [
    { key: 'sell',    label: 'Sellers',  cls: 'chip-plat', title: 'People selling this — the list you buy from' },
    { key: 'buy',     label: 'Buyers',   cls: 'chip-gold', title: 'People buying this — the list you sell to' }
  ],
  transactions: [
    { key: 'all',     label: 'All' },
    { key: 'sold',    label: 'Sold',     cls: 'chip-plat' },
    { key: 'bought',  label: 'Bought',   cls: 'chip-gold' },
    { key: '7',       label: 'Last 7 days' },
    { key: '30',      label: 'Last 30 days' }
  ]
};

const TRADE_SORTS = {
  orders: [
    ['plat-desc', 'Platinum (highest)'],
    ['plat-asc',  'Platinum (lowest)'],
    ['qty-desc',  'Quantity'],
    ['recent',    'Recently changed'],
    ['name-asc',  'Name (A–Z)']
  ],
  contracts: [
    ['plat-desc', 'Price (highest)'],
    ['plat-asc',  'Price (lowest)'],
    ['recent',    'Recently changed'],
    ['name-asc',  'Weapon (A–Z)']
  ],
  /* Der billigste zuerst - das ist die Frage, mit der man auf eine
     Angebotsliste schaut. Bei "Buyers" dreht der Renderer das um: dort
     sucht man den, der am meisten zahlt. */
  market: [
    ['plat-asc',   'Price (lowest)'],
    ['plat-desc',  'Price (highest)'],
    ['recent',     'Recently updated'],
    ['reputation', 'Reputation']
  ],
  transactions: [
    ['date-desc',  'Newest first'],
    ['date-asc',   'Oldest first'],
    ['total-desc', 'Biggest trade'],
    ['name-asc',   'Name (A–Z)']
  ]
};

/* Ein Fehler aus dem Hauptprozess kommt als { ok:false, error, status }.
   401 heisst immer dasselbe: die Anmeldung ist weg. */
/**
 * Fehler eines Handelsaufrufs in einen Satz - ohne dabei abzumelden.
 *
 * FRUEHER STAND HIER EIN signOut BEI 401, UND DAS WAR DER FEHLER:
 *   Eine 401 aus /v2/orders/my heisst nicht zwingend "abgelaufen". Sie kann
 *   auch heissen, dass v2 dieses Token grundsaetzlich nicht annimmt, waehrend
 *   v1 es sehr wohl tut. Das Token wegzuwerfen und das Anmeldeformular
 *   wieder hinzustellen sah von aussen so aus, als sei beim Anmelden nichts
 *   passiert - der haeufigste und verwirrendste Ausgang.
 *
 *   Jetzt bleibt die Anmeldung stehen, der Zustand wird vermerkt, und die
 *   Hinweiszeile sagt, was los ist. Wer wirklich abgelaufen ist, meldet sich
 *   ueber den Kontoknopf neu an.
 */
function tradeError(res, where) {
  /* NICHT JEDE 401 IST EINE SITZUNGSFRAGE.
     warframe.market schickt auch dann 401, wenn die Sitzung tadellos ist,
     das Konto aber nichts darf: "app.auth.user.notVerified" heisst
     unverifiziertes Konto, nicht abgelaufenes Token. Das in einen Topf zu
     werfen liest sich als "Anmeldung kaputt" und schickt Leute los, ein
     Passwort zu suchen, das nie das Problem war. */
  if (/notVerified|not verified/i.test(res?.error || '')) {
    tradeAccountBlocked = 'unverified';
    renderTradeAccount();
    return 'Your warframe.market account is not verified — that is what this needs, not a new sign-in.';
  }
  if (res?.status === 401 || res?.status === 403) {
    tradeSessionExpired = true;
    tradeConnection = { ...(tradeConnection || {}), broken: true };
    renderTradeAccount();
    return 'warframe.market did not accept your session for this. Open the account button for details.';
  }
  console.error('trade: ' + where, res?.error);
  return res?.error || 'unknown error';
}

const platImg = '<img class="currency-ic" src="assets/icons/currency/platinum.png" alt="p">';

/* --------------------------- Laden --------------------------- */

/**
 * Laedt Anmeldung, Orders, Contracts und das Handelsbuch.
 *
 * WER SCHON LAEUFT, BEKOMMT DESSEN VERSPRECHEN - NICHT undefined:
 *   Vorher stand hier ein blankes "if (tradeBusy) return". Ein Aufrufer, der
 *   await loadTrading() schreibt, wartete damit auf nichts und arbeitete mit
 *   dem Zustand von VOR dem Laden weiter. Beim Sprung aus dem Inventar in
 *   eine neue Order fiel das auf: showTab('trading') stiess den Abruf an,
 *   das direkt folgende await kehrte sofort zurueck, und die Pruefung auf
 *   "angemeldet?" lief gegen ein noch leeres tradeAuth - Ergebnis war das
 *   Anmeldefenster statt des Bestellformulars.
 */
let tradeLoadPromise = null;

async function loadTrading({ refresh = false } = {}) {
  if (tradeBusy) return tradeLoadPromise;
  tradeBusy = true;
  updateTradeRefreshButton(true);

  tradeLoadPromise = (async () => {
  try {
    const auth = await window.api.tradeAuthState();
    tradeAuth = auth?.ok ? auth : { signedIn: false, user: null };

    /* Der Schalter kommt aus der Konfiguration, nicht aus dieser Sitzung -
       er ueberlebt einen Neustart, und der Tab muss ihn beim ersten Aufbau
       richtig zeigen. */
    const pres = await window.api.tradeAutoStatus();
    if (pres) tradePresence = { enabled: !!pres.enabled, state: pres.state || 'off', error: pres.error || null };

    /* Die lokale Historie braucht keine Anmeldung - sie wird immer geladen,
       damit der Tab auch abgemeldet etwas zu zeigen hat. */
    const txRes = await window.api.tradeTransactions({});
    tradeTx = txRes?.ok ? txRes : { entries: [], summary: null, total: 0 };

    if (tradeAuth.signedIn) {
      /* Gegen /v2/me pruefen, damit ein Problem hier auffaellt und nicht
         erst beim Klick auf "Sold". Wird die Sitzung abgelehnt, wird sie
         VERMERKT und nicht weggeworfen - das Token kann fuer v1 weiter
         gelten, und ein stilles Abmelden war genau der Ausgang, bei dem
         nach dem Anmelden scheinbar nichts passierte. */
      if (refresh || !tradeOrders) {
        const verified = await window.api.tradeVerify();
        if (verified?.ok) {
          if (!verified.signedIn) {
            tradeSessionExpired = true;
            tradeAuth = { signedIn: false, user: null };
          } else {
            tradeAuth = verified;
            tradeSessionExpired = false;
          }
        }
      }
    }

    if (tradeAuth.signedIn) {
      const [ordersRes, contractsRes] = await Promise.all([
        window.api.tradeOrders(),
        window.api.tradeContracts(tradeAuth.user?.slug || null)
      ]);
      tradeOrders = ordersRes?.ok ? ordersRes : null;
      if (!ordersRes?.ok) tradeError(ordersRes, 'orders');
      tradeContracts = contractsRes?.ok ? contractsRes : null;
      if (!contractsRes?.ok) tradeError(contractsRes, 'contracts');

      /* Ging etwas schief, gleich nachsehen WARUM - sonst steht in der
         Hinweiszeile die erste plausible Vermutung aus dem Fehlercode,
         waehrend die genaue Auskunft erst kaeme, wenn jemand von sich aus
         das Kontofenster oeffnet. */
      if (!ordersRes?.ok || !contractsRes?.ok) {
        await runConnectionCheck();
      } else {
        /* Klappt wieder alles, muessen die Warnzustaende auch wieder weg.
           Ohne das bliebe der Knopf auf "Account setup" stehen, nachdem das
           Konto laengst in Ordnung ist - eine Warnung, die nicht mehr
           stimmt, ist schlimmer als keine. */
        tradeAccountBlocked = null;
        tradeSessionExpired = false;
        if (tradeConnection) tradeConnection.broken = false;
      }
    }
  } finally {
    tradeBusy = false;
    updateTradeRefreshButton(false);
    renderTrading();
  }
  })();
  return tradeLoadPromise;
}

function updateTradeRefreshButton(loading) {
  const btn = $('btn-trade-refresh');
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
}

/* -------------------------- Rendern -------------------------- */

function renderTrading() {
  renderTradeAccount();
  renderTradeKPIs();
  renderTradeFilters();
  renderTradeList();
  updateTradeModeTabs();
}

/**
 * Der Kontoknopf oben rechts - und damit die Antwort auf "bin ich drin?".
 *
 * DREI ZUSTAENDE, NICHT ZWEI:
 *   abgemeldet  - kein Token
 *   angemeldet  - Token da, und die Endpunkte antworten
 *   gestoert    - Token da, aber irgendetwas nimmt es nicht an
 *
 * Der dritte ist der Grund, warum es diesen Knopf gibt. Vorher hat die
 * Oberflaeche bei einer 401 das Token weggeworfen und wieder das
 * Anmeldeformular hingestellt - von aussen sah eine erfolgreiche Anmeldung
 * damit genauso aus wie gar keine.
 */
/**
 * Das Profilbild eines warframe.market-Kontos.
 *
 * Die API liefert einen Pfad relativ zu ihrem Ablageort ("user/avatar/…"),
 * gelegentlich aber auch eine fertige Adresse. Beides muss hier durch, sonst
 * steht im einen Fall ein kaputtes Bild.
 */
function wfmAvatarUrl(u) {
  const rel = u?.avatar;
  if (!rel) return null;
  const str = String(rel).trim();
  if (!str) return null;
  return /^https?:\/\//i.test(str)
    ? str
    : 'https://warframe.market/static/assets/' + str.replace(/^\/+/, '');
}

/**
 * Profilbild samt Anwesenheitspunkt in ein Element zeichnen.
 *
 * DER PUNKT SITZT AM BILD, nicht daneben: "wer" und "erreichbar?" sind eine
 * Auskunft, und warframe.market reiht Angebote offline stehender Verkaeufer
 * nach hinten - der Zustand gehoert also sichtbar ans Konto.
 *
 * Der Buchstabe steht ZUERST da und das Bild legt sich darueber, sobald es
 * geladen ist. So gibt es keinen Moment mit leerem Feld, und ein Bild, das
 * warframe.market gerade nicht liefert, hinterlaesst kein Loch.
 */
function renderTradeAvatar(el, u, size) {
  if (!el) return;
  const name = u?.ingameName || '';

  el.classList.remove('hidden');
  el.innerHTML =
    `<b>${esc((name[0] || '?').toUpperCase())}</b>
     <span class="trade-profile-dot status-${esc(u?.status || 'offline')}"></span>`;

  const url = wfmAvatarUrl(u);
  if (!url) return;

  /* Der Fehlerfall haengt an der Node und nicht als onerror="" im Markup:
     die Sicherheitsregel der Seite (CSP) laesst kein Skript im Attribut zu. */
  const img = new Image(size, size);
  img.alt = '';
  img.onload = () => el.prepend(img);
  img.src = url;
}

function renderTradeAccount() {
  const signedIn = !!tradeAuth?.signedIn;
  const blocked = signedIn && tradeAccountBlocked;
  const trouble = signedIn && !blocked && (tradeAuth.v2Rejected || tradeAuth.offline || tradeConnection?.broken);

  const dot = $('trade-account-dot');
  const label = $('trade-account-label');
  const btn = $('btn-trade-account');
  if (!btn) return;

  btn.classList.toggle('is-signedin', signedIn && !trouble && !blocked);
  btn.classList.toggle('is-trouble', !!trouble || !!blocked);

  /* Angemeldet traegt der Knopf das Profilbild, und der Anwesenheitspunkt
     sitzt als Abzeichen darauf. Abgemeldet gibt es kein Bild - dort bleibt
     der nackte Punkt, damit der Knopf nicht sein Zeichen verliert. */
  const avatar = $('trade-account-avatar');

  if (!signedIn) {
    avatar?.classList.add('hidden');
    dot.className = 'trade-account-dot';
    label.textContent = 'Sign in';
    btn.title = 'Sign in to warframe.market';
  } else {
    const u = tradeAuth.user || {};
    renderTradeAvatar(avatar, u, 20);
    dot.className = 'trade-account-dot hidden';
    label.textContent = blocked ? 'Account setup' : trouble ? 'Session problem' : (u.ingameName || 'Signed in');
    btn.title = blocked
      ? 'Signed in, but your warframe.market account cannot trade yet — click for details'
      : trouble
      ? 'Signed in, but warframe.market is not accepting the session everywhere — click for details'
      : `Signed in as ${u.ingameName || '?'} · click for account and connection check`;
  }

  renderTradePresence();
  renderTradeNotice();
}

/* Zustand des Anwesenheits-Schalters, wie ihn der Hauptprozess meldet. */
let tradePresence = { enabled: false, state: 'off', error: null };

/**
 * Der Schalter neben dem Konto.
 *
 * ABGEMELDET IST ER AUS UND GESPERRT, nicht bloss wirkungslos: ohne Sitzung
 * weiss warframe.market nicht, wessen Status gemeint ist. Ein Schalter, den
 * man umlegen kann und der dann nichts tut, ist schlimmer als einer, der
 * sagt, warum er nicht geht.
 */
function renderTradePresence() {
  const wrap = $('trade-presence');
  const box  = $('set-trade-presence');
  if (!wrap || !box) return;

  const signedIn = !!tradeAuth?.signedIn;
  const state = tradePresence.enabled ? tradePresence.state : 'off';

  box.checked = signedIn && tradePresence.enabled;
  box.disabled = !signedIn;
  wrap.classList.toggle('is-disabled', !signedIn);
  wrap.dataset.state = state;

  wrap.title = !signedIn
    ? 'Sign in to warframe.market first — the status belongs to an account'
    : !tradePresence.enabled
    ? 'Off. Your status on warframe.market is whatever you set there.'
    : state === 'ingame'
    ? 'You are shown as “in game” on warframe.market. Closing Warframe or Argus takes it back.'
    : state === 'error'
    ? `Could not set the status: ${tradePresence.error || 'unknown reason'}`
    : state === 'connecting'
    ? 'Connecting to warframe.market …'
    : 'On, waiting for Warframe to start. Nothing is sent until it does.';
}
function renderTradeNotice() {
  const box = $('trade-notice');
  if (!box) return;

  let msg = null;
  if (tradeAuth?.signedIn && tradeAccountBlocked === 'unverified') {
    msg = { kind: 'warn', action: 'Open account',
            text: 'Your warframe.market account is signed in but not verified, so it cannot list '
                + 'orders or auctions yet. That is set up on warframe.market, not here.' };
  } else if (tradeAuth?.signedIn && tradeAccountBlocked === 'noprofile') {
    msg = { kind: 'warn', action: 'Open account',
            text: 'No in-game name is set on your warframe.market profile — without it there is '
                + 'nothing to list and no trade history to read.' };
  } else if (tradeAuth?.signedIn && tradeAuth.v2Rejected) {
    msg = { kind: 'warn', text: 'Signed in, but warframe.market refused your session for orders. '
                             + 'Contracts and your trade history still work.', action: 'Open connection check' };
  } else if (tradeAuth?.signedIn && tradeAuth.offline) {
    msg = { kind: 'warn', text: 'warframe.market could not be reached. Showing what was loaded before.', action: null };
  } else if (tradeConnection?.broken) {
    msg = { kind: 'warn', text: 'Some parts of warframe.market are not answering with your session.',
            action: 'Open connection check' };
  } else if (tradeSessionExpired) {
    msg = { kind: 'warn', text: 'Your warframe.market session expired. Sign in again to manage orders.',
            action: 'Sign in' };
  }

  box.classList.toggle('hidden', !msg);
  if (!msg) return;

  box.className = 'trade-notice notice-' + msg.kind;
  box.innerHTML = `
    <span class="notice-ic" data-icon="warning"></span>
    <span>${esc(msg.text)}</span>
    ${msg.action ? `<button class="btn btn-sm btn-subtle" id="btn-trade-notice-action">${esc(msg.action)}</button>` : ''}
  `;
  box.querySelectorAll('[data-icon]').forEach(el => {
    const fn = Icon[el.dataset.icon];
    if (fn) el.innerHTML = fn(14);
  });
  $('btn-trade-notice-action')?.addEventListener('click', openAccountModal);
}

/* ------------------------- Konto-Fenster ------------------------- */

function openAccountModal() {
  const signedIn = !!tradeAuth?.signedIn;
  $('trade-account-signedout').classList.toggle('hidden', signedIn);
  $('trade-account-signedin').classList.toggle('hidden', !signedIn);
  $('trade-signin-status').classList.add('hidden');
  $('trade-signin-status').textContent = '';

  if (signedIn) {
    const u = tradeAuth.user || {};
    $('trade-account-title').textContent = u.ingameName || 'warframe.market account';
    $('trade-account-hint').textContent = 'Your session and what it can reach';
    $('trade-profile-name').textContent = u.ingameName || 'signed in';
    $('trade-profile-meta').textContent =
      `${(u.platform || 'pc').toUpperCase()} · ${nf(u.reputation || 0)} reputation · ${u.status || 'offline'}`;
    renderTradeAvatar($('trade-profile-avatar'), u, 44);
    runConnectionCheck();
  } else {
    $('trade-account-title').textContent = 'warframe.market account';
    $('trade-account-hint').textContent = 'Sign in to manage your orders and contracts';
  }

  $('trade-account-modal').classList.remove('hidden');
  if (!signedIn) $('trade-email').focus();
}

const closeAccountModal = () => $('trade-account-modal').classList.add('hidden');

/**
 * Endpunkt fuer Endpunkt durchgehen und zeigen, was antwortet.
 *
 * Das ist die einzige Stelle, an der sich das ueberhaupt feststellen laesst:
 * abgemeldet antwortet jeder Pfad unter /v2/me mit 401, auch ein erfundener.
 */
async function runConnectionCheck() {
  const box = $('trade-checks-list');
  if (!box) return;
  box.innerHTML = '<p class="trade-offers-empty">Checking …</p>';

  const res = await window.api.tradeDiagnose();
  if (!res?.ok || !res.checks) {
    box.innerHTML = `<p class="trade-offers-empty">Check failed: ${esc(res?.error || 'unknown error')}</p>`;
    return;
  }

  /* Ein unfertiges Konto antwortet ebenfalls mit 401 - das darf nicht als
     kaputte Sitzung durchgehen, sonst schickt die Oberflaeche zum
     Neuanmelden, was nichts aendert. */
  const acc = res.account;
  tradeAccountBlocked = acc && !acc.ready
    ? (!acc.hasName || !acc.hasProfile ? 'noprofile' : 'unverified')
    : null;

  tradeConnection = {
    checks: res.checks,
    account: acc,
    broken: !tradeAccountBlocked
         && res.checks.some(c => !c.ok && (c.status === 401 || c.status === 403))
  };

  box.innerHTML = res.checks.map(c => `
    <div class="trade-check ${c.ok ? 'is-ok' : c.status === 404 ? 'is-missing' : 'is-fail'}">
      <span class="check-mark">${c.ok ? Icon.check(13) : Icon.close(13)}</span>
      <span class="check-label">${esc(c.label)}</span>
      <code class="check-path">${esc(c.path)}</code>
      <span class="check-result">${c.ok ? esc(c.shape || 'ok') : esc(`${c.status || '—'} ${c.error || ''}`.trim())}</span>
    </div>
  `).join('');

  /* Die Deutung gehoert dazu - eine Liste von Statuscodes ist noch keine
     Auskunft darueber, was jetzt zu tun ist. Die Reihenfolge ist Absicht:
     das unfertige Konto erklaert die meisten Fehlschlaege darunter gleich
     mit, deshalb steht es zuerst. */
  const notes = [];
  if (acc && !acc.hasName) {
    notes.push('Your warframe.market profile has no in-game name. Until you set one there, you cannot '
             + 'list anything and there is no trade history to read.');
  }
  if (acc && !acc.verified) {
    notes.push('The account is not verified, which is why contracts are refused. Verification happens on '
             + 'warframe.market' + (acc.checkCode ? ` — your check code is ${acc.checkCode}.` : '.'));
  }

  if (!notes.length) {
    const orders = res.checks.find(c => c.key === 'orders');
    const tx = res.checks.find(c => c.key === 'transactions');
    if (orders && !orders.ok) {
      notes.push(orders.status === 401
        ? 'Orders are refusing the session — the sign-in worked, but this token may not manage orders.'
        : `Orders answered ${orders.status}.`);
    }
    if (tx && !tx.ok && tx.status === 404) {
      notes.push('warframe.market returned no trade history here — your history stays local.');
    }
    if (!notes.length && res.checks.every(c => c.ok)) notes.push('Everything answers. You are fully connected.');
  }

  if (notes.length) box.insertAdjacentHTML('beforeend', `<p class="trade-checks-note">${esc(notes.join(' '))}</p>`);

  renderTradeAccount();
}

function renderTradeKPIs() {
  const sell = tradeOrders?.sell || [];
  const buy = tradeOrders?.buy || [];
  const contracts = tradeContracts?.open || [];

  /* Was alles zusammen brächte, wenn jedes Stueck wegginge - nicht der Wert
     einer einzelnen Order. Deshalb Preis MAL Menge. */
  const sellWorth = sell.reduce((n, o) => n + o.platinum * o.quantity, 0);
  const buyWorth = buy.reduce((n, o) => n + o.platinum * o.quantity, 0);

  $('trade-kpi-sell').textContent = nf(sell.length);
  $('trade-kpi-sell-sub').textContent = `${nf(sellWorth)} platinum if everything sells`;
  $('trade-kpi-buy').textContent = nf(buy.length);
  $('trade-kpi-buy-sub').textContent = `${nf(buyWorth)} platinum committed`;
  $('trade-kpi-contracts').textContent = nf(contracts.length);

  const kinds = contracts.reduce((m, c) => (m[c.kind] = (m[c.kind] || 0) + 1, m), {});
  $('trade-kpi-contracts-sub').textContent = contracts.length
    ? Object.entries(kinds).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(' · ')
    : 'Rivens, liches & sisters';

  /* Die 30-Tage-Zahl wird hier gerechnet und nicht nachgeladen: die
     Einträge liegen ohnehin schon vollstaendig im Speicher. */
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = (tradeTx?.entries || []).filter(e => e.at >= since);
  const earned = recent.filter(e => e.direction === 'sold').reduce((n, e) => n + e.total, 0);
  const spent = recent.filter(e => e.direction === 'bought').reduce((n, e) => n + e.total, 0);
  const net = earned - spent;
  const netEl = $('trade-kpi-net');
  netEl.textContent = (net > 0 ? '+' : '') + nf(net);
  netEl.classList.toggle('is-positive', net > 0);
  netEl.classList.toggle('is-negative', net < 0);
  $('trade-kpi-net-sub').textContent = `${nf(earned)}p in · ${nf(spent)}p out`;

  $('trade-badge-orders').textContent = nf((tradeOrders?.orders || []).length);
  $('trade-badge-contracts').textContent = nf(contracts.length);
  $('trade-badge-tx').textContent = nf((tradeTx?.entries || []).length);

  /* Zaehler an der Sidebar: was offen steht, nicht was jemals gehandelt
     wurde - die Zahl soll zum Handeln auffordern, nicht Bilanz ziehen. */
  const open = (tradeOrders?.orders || []).length + contracts.length;
  const pill = $('trade-count');
  if (pill) {
    pill.textContent = nf(open);
    pill.classList.toggle('hidden', open === 0);
  }
}

function updateTradeModeTabs() {
  document.querySelectorAll('[data-trade-mode]').forEach(b =>
    b.classList.toggle('active', b.dataset.tradeMode === tradeMode));
  updateTradeSearchBox();

  const label = $('btn-trade-new-label');
  if (label) label.textContent = tradeMode === 'transactions' ? 'Add transaction' : 'New order';
  /* Auktionen anzulegen verlangt Waffe, Attribute, Wuerfe und MR - das ist
     ein eigenes Formular und kein Knopf. Bis es steht, fuehrt der Weg fuer
     Contracts ueber die Webseite. */
  const btn = $('btn-trade-new');
  if (btn) btn.classList.toggle('hidden', tradeMode === 'contracts');
}

/* Das Suchfeld filtert je nach Modus die eigene Liste oder befragt den
   Markt. Der Platzhalter sagt, welches von beidem gerade gilt - sonst tippt
   man einen Itemnamen in einen Filter, der nichts findet, und haelt das
   Ergebnis fuer eine Auskunft ueber den Markt. */
function updateTradeSearchBox() {
  const el = $('trade-search');
  if (!el) return;
  el.placeholder = tradeMode === 'market'
    ? 'Search warframe.market … e.g. Nidus Prime Blueprint, Serration, Axi A1 Relic'
    : 'Search your orders … e.g. Braton, Serration, Kulstar';
}

function renderTradeFilters() {
  const box = $('trade-filter-chips');
  if (box) {
    box.innerHTML = (TRADE_FILTERS[tradeMode] || []).map(f => `
      <button class="filter-chip ${f.cls || ''} ${tradeFilter === f.key ? 'active' : ''}"
              data-trade-filter="${esc(f.key)}"${f.title ? ` title="${esc(f.title)}"` : ''}>
        ${f.cls ? '<span class="chip-dot"></span>' : ''}${esc(f.label)}
      </button>
    `).join('')
    /* Anwesenheit ist keine Richtung, sondern eine zweite Frage - deshalb
       ein Chip, der sich unabhaengig von der Auswahl daneben umlegen laesst
       und nicht in die Reihe der sich ausschliessenden gehoert. */
    + (tradeMode === 'market' ? `
      <button class="filter-chip chip-toggle ${marketOnline ? 'active' : ''}"
              id="chip-market-online"
              title="Only people who are online or in game right now">
        <span class="chip-dot"></span>In game only
      </button>` : '');

    box.querySelectorAll('[data-trade-filter]').forEach(b => {
      b.onclick = () => {
        tradeFilter = b.dataset.tradeFilter;
        /* Bei Verkaeufern sucht man den billigsten, bei Kaeufern den, der am
           meisten zahlt. Die Sortierung dreht deshalb mit der Richtung mit -
           wer sie von Hand geaendert hat, bekommt sie trotzdem passend zur
           neuen Liste, weil die alte dort die falsche Frage stellt. */
        if (tradeMode === 'market') {
          tradeSort = tradeFilter === 'buy' ? 'plat-desc' : 'plat-asc';
          renderTradeFilters();
          if (marketItem) return marketLoadOffers();
          return renderTradeList();
        }
        renderTradeFilters();
        renderTradeList();
      };
    });

    $('chip-market-online')?.addEventListener('click', () => {
      marketOnline = !marketOnline;
      renderTradeFilters();
      if (marketItem) marketLoadOffers(); else renderTradeList();
    });
  }

  const sel = $('trade-sort');
  if (sel) {
    const opts = TRADE_SORTS[tradeMode] || [];
    if (!opts.some(([v]) => v === tradeSort)) tradeSort = opts[0][0];
    sel.innerHTML = opts.map(([v, l]) =>
      `<option value="${esc(v)}"${v === tradeSort ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }
}

function tradeEmpty(icon, title, text, actionId, actionLabel) {
  return `
    <div class="ducats-empty-box">
      <div class="empty-icon">${icon}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${actionId ? `<button class="btn btn-sm btn-action" id="${actionId}">${esc(actionLabel)}</button>` : ''}
    </div>`;
}

function renderTradeList() {
  const box = $('trade-list');
  if (!box) return;

  if (tradeMode === 'transactions') return renderTransactionList(box);
  /* Angebote ANDERER Leute sind oeffentlich - /v2/orders/item verlangt kein
     Token. Deshalb steht die Marktsuche vor der Anmeldungspruefung: wer
     nachsehen will, was ein Teil kostet, braucht dafuer kein Konto. Zum
     Anschreiben braucht er ohnehin nur das Spiel. */
  if (tradeMode === 'market') return renderMarketList(box);
  if (!tradeAuth?.signedIn) {
    box.innerHTML = tradeEmpty(Icon.coin(30), 'Not signed in',
      'Your orders live on warframe.market. Sign in to see and change them - your trade history works without an account.',
      'btn-trade-empty-signin', 'Sign in to warframe.market');
    $('btn-trade-empty-signin')?.addEventListener('click', openAccountModal);
    return;
  }
  if (tradeMode === 'contracts') return renderContractList(box);
  return renderOrderList(box);
}

/* ---------------------------- Market ---------------------------- */

/**
 * Bild eines Markt-Items: Grundbild, und darauf das Abzeichen des Teils.
 *
 * warframe.market legt beides uebereinander, und ohne die zweite Ebene sind
 * die vier Teile eines Primes optisch nicht zu unterscheiden - alle tragen
 * die Illustration des ganzen Frames (siehe marketSubIcon in market.js).
 * In einer Trefferliste heisst das: vier gleiche Bilder, und die Auswahl
 * haengt allein daran, den Text richtig zu lesen.
 *
 * Das Abzeichen faellt bei einem Fehler still weg statt ein Platzhalterkreuz
 * zu hinterlassen - es ist Zusatz, nicht Inhalt.
 */
function marketThumb(it, cls = '') {
  return `<span class="mthumb ${cls}">
    <img src="${esc(it?.image || '')}" alt="" onerror="this.style.visibility='hidden'">
    ${it?.subIcon ? `<img class="mthumb-sub" src="${esc(it.subIcon)}" alt=""
                          onerror="this.style.display='none'">` : ''}
  </span>`;
}

/* Der einzige Modus, in dem das Suchfeld nicht die eigene Liste filtert,
   sondern warframe.market befragt. Deshalb ein eigener Zustand statt eines
   weiteren Filters auf tradeOrders. */
let marketItem = null;       // gewaehltes Item, oder null
let marketHits = [];         // Treffer der Itemsuche
let marketOffers = null;     // Antwort von trade:offers
let marketOnline = true;     // nur Leute, die gerade erreichbar sind
let marketSubtype = null;    // Zustand bei Relikten, Variante bei Mods
let marketRank = null;       // genau dieser Rang, oder null fuer alle
let marketBusy = false;
let marketError = null;

/* Ein Angebot von jemandem, der zuletzt vor drei Tagen online war, ist eine
   Zahl und kein Preis - deshalb steht der Filter standardmaessig AN. Wer die
   ganze Preisspanne sehen will, schaltet ihn aus. */

function marketReset() {
  marketItem = null;
  marketHits = [];
  marketOffers = null;
  marketSubtype = null;
  marketRank = null;
  marketError = null;
}

/**
 * Itemsuche gegen die Marktliste - dieselbe Quelle wie beim Anlegen einer Order.
 *
 * DAS SUCHFELD IST DER RUECKWEG. Wer im Feld etwas aendert, sucht ein anderes
 * Item - dann ist die Angebotsliste, die gerade dasteht, die Antwort auf eine
 * Frage von vorhin. Sie faellt hier weg, statt dass man sie ueber einen
 * eigenen Knopf wegraeumen muss.
 */
async function marketSearch() {
  const q = ($('trade-search')?.value || '').trim();
  marketError = null;
  /* Die Auswahl loesen, aber den gewaehlten Zustand nicht: wer "Axi A1" gegen
     "Axi A2" tauscht, will weiter strahlende Relikte sehen. */
  marketItem = null;
  marketOffers = null;

  if (q.length < 2) { marketHits = []; renderTradeList(); return; }

  marketHits = await window.api.tradeSearchItems(q) || [];
  renderTradeList();
}

/** Angebote zum gewaehlten Item holen. */
async function marketLoadOffers() {
  if (!marketItem?.slug) return;
  marketBusy = true;
  marketError = null;
  renderTradeList();

  /* ZWEI SORTIER-VOKABULARE, UND SIE PASSEN NICHT ZUSAMMEN.
     Die Handelslisten heissen ihre Schluessel plat-asc/plat-desc, itemOffers
     erwartet price-asc/price-desc. Ein unbekannter Schluessel wirft dort
     nichts, er faellt still auf "zuletzt geaendert" zurueck - die Liste sah
     sortiert aus und war es nicht. Nachgemessen an Serration: 90p, 10p, 17p
     unter der Ueberschrift "Price (lowest)". */
  const SORT_KEYS = { 'plat-asc': 'price-asc', 'plat-desc': 'price-desc' };

  const res = await window.api.tradeOffers(marketItem.slug, {
    type: tradeFilter === 'buy' ? 'buy' : 'sell',
    onlineOnly: marketOnline,
    subtype: marketSubtype,
    /* Ein Rang ist bei Mods keine Eigenschaft, sondern die Ware: Serration
       Rang 0 kostet 10p, Rang 10 kostet 90p. Beides in einer nach Preis
       sortierten Liste ist kein Preisvergleich, sondern ein Missverstaendnis
       mit Zahlen. Deshalb exakt EIN Rang, wenn einer gewaehlt ist. */
    minRank: marketRank,
    maxRank: marketRank,
    sort: SORT_KEYS[tradeSort] || tradeSort,
    limit: 10,
    refresh: true
  });

  marketBusy = false;
  if (res?.ok) marketOffers = res;
  else { marketOffers = null; marketError = tradeError(res, 'offers'); }
  renderTradeList();
}

function marketPick(item) {
  marketItem = item;
  marketOffers = null;
  /* Bei Relikten und Arcanes ist der Zustand Teil der Ware. Ein zuvor
     gewaehlter bleibt stehen, WENN das neue Item ihn ueberhaupt kennt - wer
     Axi A1 strahlend angesehen hat und dann Axi A2 sucht, meint weiterhin
     strahlend. Sonst die erste Stufe, also die, die im Spiel als erstes
     anfaellt: intakt, ungerankt. */
  marketSubtype = item.subtypes?.length
    ? (item.subtypes.includes(marketSubtype) ? marketSubtype : item.subtypes[0])
    : null;
  /* Der Rang dagegen faellt zurueck auf "alle": er gehoert zu einem Mod, und
     "Rang 10" von Serration sagt nichts ueber das naechste Item aus. */
  marketRank = null;
  marketLoadOffers();
}

function renderMarketList(box) {
  if (marketItem) return renderMarketOffers(box);

  const q = ($('trade-search')?.value || '').trim();
  if (q.length < 2) {
    box.innerHTML = tradeEmpty(Icon.search(30), 'Search warframe.market',
      'Type an item name above — Nidus Prime Blueprint, Serration, Axi A1 Relic — and Argus shows the offers standing at the top, with the message to whisper in game.');
    return;
  }
  if (!marketHits.length) {
    box.innerHTML = tradeEmpty(Icon.search(30), 'No item found',
      `warframe.market lists nothing called “${q}”. Tradable items only — base sets and untradable parts are not on the market.`);
    return;
  }

  /* Dieselbe Zeile wie beim Anlegen einer Order - dort sucht man aus
     derselben Liste dasselbe Item aus. Zwei Suchen, die verschieden
     aussehen, waeren zwei Suchen zum Lernen. */
  box.innerHTML = `<div class="market-hits">${marketHits.slice(0, 24).map(it => `
    <button class="trade-pick" data-market-slug="${esc(it.slug)}">
      ${marketThumb(it, 'mthumb-30')}
      <span class="pick-name">${esc(it.name)}</span>
      ${it.ducats ? `<span class="offer-rank">${nf(it.ducats)} ducats</span>` : ''}
    </button>`).join('')}</div>`;

  box.querySelectorAll('[data-market-slug]').forEach(b => {
    b.onclick = () => marketPick(marketHits.find(h => h.slug === b.dataset.marketSlug));
  });
}

function renderMarketOffers(box) {
  const it = marketItem;
  const kaufen = tradeFilter !== 'buy';   // Verkaeuferliste = ich kaufe

  const kopf = `
    <div class="market-head">
      ${marketThumb(it, 'mthumb-38')}
      <div class="market-head-body">
        <b>${esc(it.name)}</b>
        <span>${kaufen ? 'People selling — cheapest first' : 'People buying — highest first'}${
          marketOffers?.total ? ` · showing ${marketOffers.offers.length} of ${nf(marketOffers.total)}` : ''}</span>
      </div>
      ${it.subtypes?.length ? `
        <select class="select-sm" id="market-subtype">
          ${it.subtypes.map(s => `<option value="${esc(s)}"${s === marketSubtype ? ' selected' : ''}>${esc(s)}</option>`).join('')}
        </select>` : ''}
      ${it.maxRank != null ? `
        <select class="select-sm" id="market-rank" title="Rank 0 and rank ${it.maxRank} are different goods at different prices">
          <option value="">Any rank</option>
          ${Array.from({ length: it.maxRank + 1 }, (_, r) =>
            `<option value="${r}"${marketRank === r ? ' selected' : ''}>Rank ${r}${r === it.maxRank ? ' (max)' : ''}</option>`).join('')}
        </select>` : ''}
    </div>`;

  const rumpf = marketBusy
    ? '<p class="trade-offers-empty">Loading offers …</p>'
    : marketError
    ? `<p class="trade-offers-empty">Could not load offers: ${esc(marketError)}</p>`
    : !marketOffers?.offers?.length
    ? `<p class="trade-offers-empty">${marketOnline
        ? 'Nobody offering this is in game right now. Switch off “In game only” to see the rest.'
        : 'No offer for this item.'}</p>`
    : `<div class="market-offers">${marketOffers.offers.map((f, i) => {
        const text = Whisper.build(f, it);
        return `
        <div class="trade-offer market-offer">
          <span class="market-rank">${i + 1}</span>
          <span class="offer-status status-${esc(f.user.status)}" title="${esc(f.user.status)}"></span>
          <span class="offer-price">${platImg}<b>${nf(f.platinum)}</b></span>
          <span class="offer-qty">×${nf(f.quantity)}</span>
          <span class="offer-user">
            ${esc(f.user.name)}
            <small>${nf(f.user.reputation)} rep · ${esc((f.user.platform || 'pc').toUpperCase())}</small>
          </span>
          ${f.rank != null ? `<span class="offer-rank">R${f.rank}</span>` : ''}
          <span class="offer-age">${esc(relativeAge(Date.parse(f.updatedAt || f.createdAt || 0)))}</span>
          <button class="btn-sm market-copy" data-copy="${esc(text)}" title="${esc(text)}">
            ${Icon.copy(13)}<span>Copy</span>
          </button>
        </div>`;
      }).join('')}</div>
      <p class="market-note">Copy puts the whisper on your clipboard. Paste it in Warframe yourself —
         Argus does not message anyone for you. Change the search above to look up something else.</p>`;

  box.innerHTML = kopf + rumpf;

  const sub = $('market-subtype');
  if (sub) sub.onchange = e => { marketSubtype = e.target.value; marketLoadOffers(); };
  const rk = $('market-rank');
  if (rk) rk.onchange = e => {
    marketRank = e.target.value === '' ? null : Number(e.target.value);
    marketLoadOffers();
  };

  box.querySelectorAll('[data-copy]').forEach(b => {
    b.onclick = async () => {
      const res = await window.api.copyText(b.dataset.copy);
      /* Rueckmeldung am Knopf selbst: eine Zwischenablage ist unsichtbar, und
         ohne Quittung klickt man zweimal und weiss trotzdem nichts. */
      const alt = b.innerHTML;
      b.innerHTML = res?.ok ? `${Icon.check(13)}<span>Copied</span>` : '<span>Failed</span>';
      b.classList.toggle('on', !!res?.ok);
      setTimeout(() => { b.innerHTML = alt; b.classList.remove('on'); }, 1600);
    };
  });
}

/* ---------------------------- Orders ---------------------------- */

function filterAndSortOrders() {
  const q = ($('trade-search')?.value || '').toLowerCase().trim();
  let list = (tradeOrders?.orders || []).filter(o => {
    if (q && !o.name.toLowerCase().includes(q)) return false;
    if (tradeFilter === 'sell') return o.type === 'sell';
    if (tradeFilter === 'buy') return o.type === 'buy';
    if (tradeFilter === 'hidden') return !o.visible;
    return true;
  });

  const ts = o => Date.parse(o.updatedAt || o.createdAt || 0) || 0;
  list.sort((a, b) => {
    if (tradeSort === 'plat-asc')  return a.platinum - b.platinum || a.name.localeCompare(b.name, 'en');
    if (tradeSort === 'qty-desc')  return b.quantity - a.quantity || b.platinum - a.platinum;
    if (tradeSort === 'recent')    return ts(b) - ts(a);
    if (tradeSort === 'name-asc')  return a.name.localeCompare(b.name, 'en');
    return b.platinum - a.platinum || a.name.localeCompare(b.name, 'en');
  });
  return list;
}

function renderOrderList(box) {
  const list = filterAndSortOrders();

  if (!list.length) {
    const nothing = !(tradeOrders?.orders || []).length;
    box.innerHTML = tradeEmpty(Icon.tag(30),
      nothing ? 'No open orders' : 'No matches',
      nothing ? 'You have nothing listed on warframe.market right now.'
              : 'No order matches your search and filters.',
      nothing ? 'btn-trade-empty-new' : null, 'Create your first order');
    $('btn-trade-empty-new')?.addEventListener('click', openNewOrderModal);
    return;
  }

  box.innerHTML = list.map(o => orderRowHtml(o)).join('');
  list.forEach(o => wireOrderRow(o));
}

function orderRowHtml(o) {
  const isSell = o.type === 'sell';
  const rank = o.rank != null && o.maxRank != null
    ? `<span class="trade-rank" title="Mod rank">R${o.rank}/${o.maxRank}</span>` : '';

  return `
    <div class="trade-row ${o.visible ? '' : 'is-hidden-order'}" data-order="${esc(o.id)}">
      <div class="trade-row-main">
        ${marketThumb(o, 'mthumb-42 trade-row-img')}
        <div class="trade-row-text">
          <div class="trade-row-title">
            <b>${esc(o.name)}</b>
            <span class="trade-type-chip ${isSell ? 'is-sell' : 'is-buy'}">${isSell ? 'WTS' : 'WTB'}</span>
            ${rank}
            ${o.visible ? '' : '<span class="trade-hidden-chip">hidden</span>'}
          </div>
          <div class="trade-row-meta">
            <span class="trade-price">${platImg}<b>${nf(o.platinum)}</b></span>
            <span class="trade-qty">×${nf(o.quantity)}</span>
            ${o.perTrade > 1 ? `<span class="trade-dim">${o.perTrade} per trade</span>` : ''}
            <span class="trade-dim">${nf(o.platinum * o.quantity)}p total</span>
            <span class="trade-dim">· changed ${esc(relativeAge(Date.parse(o.updatedAt || o.createdAt || 0)))}</span>
          </div>
        </div>
      </div>

      <!-- Dieselbe Knopfreihe wie auf warframe.market, damit der Griff
           sitzt, ohne neu gelernt zu werden. -->
      <div class="trade-row-actions">
        <button class="trade-btn is-sold" data-act="sold" title="One traded: counts the quantity down and books it into your history">
          ${Icon.check(14)}<span>Sold</span>
        </button>
        <button class="trade-btn" data-act="edit" title="Change price, quantity and see what others ask">
          ${Icon.pencil(14)}<span>Edit</span>
        </button>
        <button class="trade-btn is-plus" data-act="plus" title="One more in stock">+1</button>
        <button class="trade-btn ${o.visible ? 'is-visible' : 'is-invisible'}" data-act="visible"
                title="${o.visible ? 'Visible to others — click to hide' : 'Hidden — click to show again'}">
          ${o.visible ? Icon.eye(14) : Icon.eyeOff(14)}<span>${o.visible ? 'Visible' : 'Hidden'}</span>
        </button>
        <button class="trade-btn is-danger" data-act="delete" title="Delete this order">${Icon.trash(14)}</button>
      </div>
    </div>`;
}

function wireOrderRow(o) {
  const row = document.querySelector(`.trade-row[data-order="${CSS.escape(o.id)}"]`);
  if (!row) return;

  const busy = on => row.classList.toggle('is-busy', on);

  row.querySelector('[data-act="edit"]').onclick = () => openEditOrder(o);

  row.querySelector('[data-act="sold"]').onclick = async () => {
    busy(true);
    const res = await window.api.tradeMarkSold(o.id, {
      count: 1, quantity: o.quantity, type: o.type,
      slug: o.slug, itemId: o.itemId, name: o.name, image: o.image, platinum: o.platinum
    });
    busy(false);
    if (!res?.ok) return alert(tradeError(res, 'markSold'));
    await loadTrading();
  };

  row.querySelector('[data-act="plus"]').onclick = async () => {
    busy(true);
    const res = await window.api.tradeUpdateOrder(o.id, { quantity: o.quantity + 1 });
    busy(false);
    if (!res?.ok) return alert(tradeError(res, 'plusOne'));
    o.quantity = res.order?.quantity ?? o.quantity + 1;
    renderTradeKPIs();
    renderTradeList();
  };

  row.querySelector('[data-act="visible"]').onclick = async () => {
    busy(true);
    const res = await window.api.tradeUpdateOrder(o.id, { visible: !o.visible });
    busy(false);
    if (!res?.ok) return alert(tradeError(res, 'visible'));
    o.visible = res.order?.visible ?? !o.visible;
    renderTradeList();
  };

  /* Loeschen fragt einmal nach - dieselbe Mechanik wie bei den Builds. */
  armDelete(row.querySelector('[data-act="delete"]'), Icon.trash(14) + '<span>Sure?</span>', async () => {
    busy(true);
    const res = await window.api.tradeDeleteOrder(o.id);
    busy(false);
    if (!res?.ok) return alert(tradeError(res, 'deleteOrder'));
    await loadTrading();
  });
}

/* --------------------- Order bearbeiten + Angebote --------------------- */

/**
 * Fuellt ein Zustands-Auswahlfeld.
 *
 * Die erlaubten Werte kommen vom Item selbst, nicht aus einer festen Liste:
 * ein Relikt kennt intact/exceptional/flawless/radiant, ein Fisch
 * small/medium/large, eine Mod regular/atragraph. Fest verdrahtet waere das
 * bei der naechsten Itemart wieder falsch.
 */
function fillSubtypes(select, subtypes, current) {
  select.innerHTML = (subtypes || []).map(v =>
    `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(v.replace(/_/g, ' '))}</option>`).join('');
}

function openEditOrder(o) {
  editingOrder = o;
  $('trade-edit-title').textContent = o.name;
  $('trade-edit-sub').textContent =
    `${o.type === 'sell' ? 'You are selling' : 'You are buying'} · ${nf(o.platinum)}p × ${nf(o.quantity)}`;

  const img = $('trade-edit-image');
  if (o.image) { img.src = o.image; img.hidden = false; } else { img.hidden = true; }

  $('trade-edit-plat').value = o.platinum;
  $('trade-edit-qty').value = o.quantity;

  /* Nur zeigen, was warframe.market bei DIESEM Item auch annimmt - ein
     mitgeschicktes verbotenes Feld kostet den ganzen Patch. */
  $('trade-edit-pertrade-field').classList.toggle('hidden', !o.bulkTradable);
  $('trade-edit-pertrade').value = o.perTrade || 1;

  $('trade-edit-subtype-field').classList.toggle('hidden', !o.subtypes);
  if (o.subtypes) fillSubtypes($('trade-edit-subtype'), o.subtypes, o.subtype);

  /* Rang nur zeigen, wo es einen gibt: an einem Prime-Teil waere das Feld
     eine Einladung, etwas einzutragen, das die API ablehnt. */
  const hasRank = o.maxRank != null;
  $('trade-edit-rank-field').classList.toggle('hidden', !hasRank);
  if (hasRank) {
    $('trade-edit-rank').value = o.rank ?? 0;
    $('trade-edit-rank').max = o.maxRank;
  }

  $('trade-edit-status').textContent = '';
  $('trade-edit-modal').classList.remove('hidden');

  /* Beim Oeffnen den Angebotstyp auf die Gegenseite stellen: wer verkauft,
     will wissen, was andere VERKAUFEN - das ist die Konkurrenz. */
  offerFilters.type = o.type === 'sell' ? 'sell' : 'buy';
  syncOfferFilterChips();
  loadOffers();
}

const closeEditOrder = () => {
  $('trade-edit-modal').classList.add('hidden');
  editingOrder = null;
};

function syncOfferFilterChips() {
  document.querySelectorAll('[data-offer-type]').forEach(b =>
    b.classList.toggle('active', b.dataset.offerType === offerFilters.type));
  $('trade-offers-online')?.classList.toggle('active', offerFilters.onlineOnly);
  const sort = $('trade-offers-sort');
  if (sort) sort.value = offerFilters.sort;
  const plat = $('trade-offers-platform');
  if (plat) plat.value = offerFilters.platform;
}

async function loadOffers() {
  const box = $('trade-offers-list');
  if (!box || !editingOrder) return;

  if (!editingOrder.slug) {
    box.innerHTML = '<p class="trade-offers-empty">warframe.market does not list this item.</p>';
    return;
  }

  box.innerHTML = '<p class="trade-offers-empty">Loading offers …</p>';
  const res = await window.api.tradeOffers(editingOrder.slug, {
    type: offerFilters.type,
    onlineOnly: offerFilters.onlineOnly,
    platform: offerFilters.platform || null,
    sort: offerFilters.sort,
    /* Gegen den eigenen Zustand vergleichen, nicht gegen alle - siehe
       itemOffers(). Der Zustand kann im Formular daneben geaendert werden,
       deshalb wird er dort abgelesen und nicht aus der Order. */
    subtype: editingOrder.subtypes ? $('trade-edit-subtype').value : null,
    limit: 10
  });

  if (!res?.ok) {
    box.innerHTML = `<p class="trade-offers-empty">Could not load offers: ${esc(tradeError(res, 'offers'))}</p>`;
    return;
  }

  $('trade-offers-count').textContent = res.total
    ? `showing ${Math.min(10, res.offers.length)} of ${nf(res.total)}`
    : '';

  if (!res.offers.length) {
    box.innerHTML = '<p class="trade-offers-empty">No offer matches these filters.</p>';
    return;
  }

  const mine = editingOrder.platinum;
  box.innerHTML = res.offers.map(f => {
    /* Der Vergleich zum eigenen Preis ist der Grund, warum die Liste hier
       steht - deshalb faerbt er sich, statt nur dazustehen. */
    const diff = f.platinum - mine;
    const cls = diff < 0 ? 'is-cheaper' : diff > 0 ? 'is-pricier' : 'is-same';
    const label = diff === 0 ? 'same as yours' : `${diff > 0 ? '+' : ''}${nf(diff)}p vs. yours`;
    return `
      <div class="trade-offer ${cls}">
        <span class="offer-status status-${esc(f.user.status)}" title="${esc(f.user.status)}"></span>
        <span class="offer-price">${platImg}<b>${nf(f.platinum)}</b></span>
        <span class="offer-qty">×${nf(f.quantity)}</span>
        <span class="offer-user">
          ${esc(f.user.name)}
          <small>${nf(f.user.reputation)} rep · ${esc((f.user.platform || 'pc').toUpperCase())}</small>
        </span>
        ${f.rank != null ? `<span class="offer-rank">R${f.rank}</span>` : ''}
        <span class="offer-diff">${esc(label)}</span>
        <span class="offer-age">${esc(relativeAge(Date.parse(f.updatedAt || f.createdAt || 0)))}</span>
      </div>`;
  }).join('');
}

/* ---------------------------- Contracts ---------------------------- */

function contractTitle(c) {
  const weapon = (c.item.weapon || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  if (c.kind === 'riven') return `${weapon} ${c.item.name || ''}`.trim();
  return `${weapon}${c.item.element ? ` · ${c.item.element}` : ''}`;
}

function renderContractList(box) {
  const q = ($('trade-search')?.value || '').toLowerCase().trim();
  const all = tradeContracts?.auctions || [];

  let list = all.filter(c => {
    if (q && !contractTitle(c).toLowerCase().includes(q)) return false;
    if (tradeFilter === 'closed') return c.closed;
    if (['riven', 'lich', 'sister'].includes(tradeFilter)) return c.kind === tradeFilter && !c.closed;
    return !c.closed;
  });

  const price = c => c.buyoutPrice ?? c.startingPrice ?? 0;
  const ts = c => Date.parse(c.updatedAt || c.createdAt || 0) || 0;
  list.sort((a, b) => {
    if (tradeSort === 'plat-asc') return price(a) - price(b);
    if (tradeSort === 'recent')   return ts(b) - ts(a);
    if (tradeSort === 'name-asc') return contractTitle(a).localeCompare(contractTitle(b), 'en');
    return price(b) - price(a);
  });

  if (!list.length) {
    box.innerHTML = tradeEmpty(Icon.gem(30),
      all.length ? 'No matches' : 'No contracts',
      all.length ? 'No contract matches your search and filters.'
                 : 'You have no riven, lich or sister auctions running on warframe.market.');
    return;
  }

  const readOnly = !!tradeContracts?.readOnly;
  box.innerHTML = list.map(c => contractRowHtml(c, readOnly)).join('');
  list.forEach(c => wireContractRow(c, readOnly));
}

function contractRowHtml(c, readOnly) {
  const attrs = (c.item.attributes || []).map(a =>
    `<span class="riven-attr ${a.positive ? 'is-pos' : 'is-neg'}">${a.positive ? '+' : '−'}${esc(a.slug.replace(/_/g, ' '))}</span>`
  ).join('');

  const meta = c.kind === 'riven'
    ? `<span class="trade-dim">MR${c.item.masteryLevel ?? '?'}</span>
       <span class="trade-dim">${nf(c.item.reRolls ?? 0)} rolls</span>
       ${c.item.polarity ? `<span class="trade-dim">${esc(c.item.polarity)}</span>` : ''}`
    : `${c.item.damage != null ? `<span class="trade-dim">${c.item.damage}% ${esc(c.item.element || '')}</span>` : ''}
       ${c.item.hasEphemera ? '<span class="trade-chip chip-gold">ephemera</span>' : ''}`;

  return `
    <div class="trade-row ${c.visible ? '' : 'is-hidden-order'} ${c.closed ? 'is-closed' : ''}" data-contract="${esc(c.id)}">
      <div class="trade-row-main">
        <span class="trade-row-kind kind-${esc(c.kind)}">${esc(c.kind)}</span>
        <div class="trade-row-text">
          <div class="trade-row-title">
            <b>${esc(contractTitle(c))}</b>
            ${c.closed ? '<span class="trade-hidden-chip">closed</span>' : ''}
            ${c.visible || c.closed ? '' : '<span class="trade-hidden-chip">hidden</span>'}
          </div>
          <div class="trade-row-meta">
            <span class="trade-price">${platImg}<b>${nf(c.startingPrice ?? 0)}</b></span>
            ${c.buyoutPrice != null ? `<span class="trade-dim">buyout ${nf(c.buyoutPrice)}p</span>` : '<span class="trade-dim">no buyout</span>'}
            ${c.topBid != null ? `<span class="trade-chip chip-plat">top bid ${nf(c.topBid)}p</span>` : ''}
            ${meta}
          </div>
          ${attrs ? `<div class="trade-row-attrs">${attrs}</div>` : ''}
        </div>
      </div>

      <div class="trade-row-actions">
        ${readOnly || c.closed ? '' : `
          <button class="trade-btn is-sold" data-act="sold" title="Close this auction and book it into your history">
            ${Icon.check(14)}<span>Sold</span>
          </button>
          <button class="trade-btn" data-act="edit" title="Change price and note, compare with other auctions">
            ${Icon.pencil(14)}<span>Edit</span>
          </button>
          <button class="trade-btn ${c.visible ? 'is-visible' : 'is-invisible'}" data-act="visible"
                  title="${c.visible ? 'Visible to others — click to hide' : 'Hidden — click to show again'}">
            ${c.visible ? Icon.eye(14) : Icon.eyeOff(14)}<span>${c.visible ? 'Visible' : 'Hidden'}</span>
          </button>
          <button class="trade-btn is-danger" data-act="delete" title="Delete this auction">${Icon.trash(14)}</button>
        `}
        ${readOnly ? '<span class="trade-readonly" title="Loaded from your public profile — sign in to change these">read-only</span>' : ''}
      </div>
    </div>`;
}

function wireContractRow(c, readOnly) {
  const row = document.querySelector(`.trade-row[data-contract="${CSS.escape(c.id)}"]`);
  if (!row || readOnly || c.closed) return;
  const busy = on => row.classList.toggle('is-busy', on);

  row.querySelector('[data-act="edit"]').onclick = () => openEditContract(c);

  row.querySelector('[data-act="sold"]').onclick = async () => {
    const partner = prompt('Who bought it? (in-game name, optional)') ?? '';
    busy(true);
    const res = await window.api.tradeCloseContract(c.id, {
      partner: partner.trim() || null,
      name: contractTitle(c),
      platinum: c.buyoutPrice ?? c.topBid ?? c.startingPrice
    });
    busy(false);
    if (!res?.ok) return alert(tradeError(res, 'closeContract'));
    await loadTrading();
  };

  row.querySelector('[data-act="visible"]').onclick = async () => {
    busy(true);
    const res = await window.api.tradeUpdateContract(c.id, { visible: !c.visible });
    busy(false);
    if (!res?.ok) return alert(tradeError(res, 'contractVisible'));
    c.visible = res.contract?.visible ?? !c.visible;
    renderTradeList();
  };

  armDelete(row.querySelector('[data-act="delete"]'), Icon.trash(14) + '<span>Sure?</span>', async () => {
    busy(true);
    const res = await window.api.tradeDeleteContract(c.id);
    busy(false);
    if (!res?.ok) return alert(tradeError(res, 'deleteContract'));
    await loadTrading();
  });
}

function openEditContract(c) {
  editingContract = c;
  $('trade-contract-title').textContent = contractTitle(c);
  $('trade-contract-sub').textContent = `${c.kind} auction · ${c.topBid != null ? `top bid ${nf(c.topBid)}p` : 'no bids yet'}`;
  $('trade-contract-start').value = c.startingPrice ?? 1;
  $('trade-contract-buyout').value = c.buyoutPrice ?? '';
  $('trade-contract-rep').value = c.minimalReputation ?? 0;
  $('trade-contract-note').value = c.note || '';
  $('trade-contract-status').textContent = '';
  $('trade-contract-modal').classList.remove('hidden');
  loadContractOffers();
}

const closeEditContract = () => {
  $('trade-contract-modal').classList.add('hidden');
  editingContract = null;
};

async function loadContractOffers() {
  const box = $('trade-contract-offers');
  if (!box || !editingContract) return;

  box.innerHTML = '<p class="trade-offers-empty">Loading auctions …</p>';
  const res = await window.api.tradeContractOffers({
    kind: editingContract.kind,
    weapon: editingContract.item.weapon,
    onlineOnly: contractOfferFilters.onlineOnly,
    directSellOnly: contractOfferFilters.directSellOnly,
    sort: contractOfferFilters.sort,
    limit: 10
  });

  if (!res?.ok) {
    box.innerHTML = `<p class="trade-offers-empty">Could not load auctions: ${esc(tradeError(res, 'contractOffers'))}</p>`;
    return;
  }

  $('trade-contract-offers-count').textContent = res.total
    ? `showing ${Math.min(10, res.offers.length)} of ${nf(res.total)}` : '';

  if (!res.offers.length) {
    box.innerHTML = '<p class="trade-offers-empty">No comparable auction right now.</p>';
    return;
  }

  const mine = editingContract.buyoutPrice ?? editingContract.startingPrice ?? 0;
  box.innerHTML = res.offers.map(a => {
    const p = a.buyoutPrice ?? a.startingPrice ?? 0;
    const diff = p - mine;
    const cls = diff < 0 ? 'is-cheaper' : diff > 0 ? 'is-pricier' : 'is-same';
    const attrs = (a.item.attributes || []).slice(0, 4).map(x =>
      `<span class="riven-attr ${x.positive ? 'is-pos' : 'is-neg'}">${x.positive ? '+' : '−'}${esc(x.slug.replace(/_/g, ' '))}</span>`).join('');
    return `
      <div class="trade-offer trade-offer-wide ${cls}">
        <span class="offer-status status-${esc(a.owner?.status || 'offline')}" title="${esc(a.owner?.status || 'offline')}"></span>
        <span class="offer-price">${platImg}<b>${nf(p)}</b></span>
        <span class="offer-user">
          ${esc(a.owner?.name || '?')}
          <small>${a.item.masteryLevel != null ? `MR${a.item.masteryLevel} · ` : ''}${nf(a.item.reRolls ?? 0)} rolls</small>
        </span>
        <span class="offer-diff">${esc(diff === 0 ? 'same as yours' : `${diff > 0 ? '+' : ''}${nf(diff)}p vs. yours`)}</span>
        ${attrs ? `<span class="offer-attrs">${attrs}</span>` : ''}
      </div>`;
  }).join('');
}

/* --------------------------- Handelsbuch --------------------------- */

/**
 * Woher eine Zeile stammt.
 *
 * Es sind zwei Buecher: warframe.market verzeichnet, was ueber deren
 * Bestaetigung lief, das lokale, was hier abgehakt oder nachgetragen wurde.
 * Ein Handel, den du im Spiel gemacht hast, steht nur lokal. Ohne diese
 * Plakette waere nicht zu sehen, welche Zahl woher kommt.
 */
function txSourceChip(e) {
  if (e.remote || e.source === 'warframe.market')
    return '<span class="tx-source is-remote" title="Recorded by warframe.market">market</span>';
  if (e.source === 'manual')
    return '<span class="tx-source is-manual" title="You added this by hand">manual</span>';
  return '<span class="tx-source is-local" title="Recorded in Argus when you marked it sold">Argus</span>';
}

/**
 * Ob die Historie von warframe.market ueberhaupt dabei ist.
 *
 * Gezaehlt wird, was GERADE IN DER LISTE steht - nicht was insgesamt
 * abgerufen wurde. "37 von warframe.market" neben "2 trades shown" waere
 * zwar wahr, liest sich aber als Widerspruch.
 */
function txRemoteNote(shown) {
  const r = tradeTx?.remote;
  if (!r) return '';
  if (r.supported) {
    const n = (shown || []).filter(e => e.remote || e.source === 'warframe.market').length;
    return n ? `<span class="trade-dim">${nf(n)} of them from warframe.market</span>` : '';
  }
  if (r.signedIn === false) return '<span class="trade-dim">local only — not signed in</span>';
  if (r.needsProfile) return '<span class="trade-dim">local only — no warframe.market profile name</span>';
  return `<span class="trade-dim" title="${esc(r.error || '')}">local only — warframe.market has no history here</span>`;
}

function renderTransactionList(box) {
  const q = ($('trade-search')?.value || '').toLowerCase().trim();
  const all = tradeTx?.entries || [];
  const days = tradeFilter === '7' ? 7 : tradeFilter === '30' ? 30 : null;
  const since = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

  let list = all.filter(e => {
    if (q && !(e.name.toLowerCase().includes(q) || (e.partner || '').toLowerCase().includes(q))) return false;
    if (tradeFilter === 'sold') return e.direction === 'sold';
    if (tradeFilter === 'bought') return e.direction === 'bought';
    if (since) return e.at >= since;
    return true;
  });

  if (tradeSort === 'date-asc')        list.sort((a, b) => a.at - b.at);
  else if (tradeSort === 'total-desc') list.sort((a, b) => b.total - a.total);
  else if (tradeSort === 'name-asc')   list.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  else                                 list.sort((a, b) => b.at - a.at);

  if (!list.length) {
    box.innerHTML = tradeEmpty(Icon.ledger(30),
      all.length ? 'No matches' : 'Nothing traded yet',
      all.length ? 'No transaction matches your search and filters.'
                 : 'Hit "Sold" on an order and it lands here. You can also add trades you made outside Argus.',
      all.length ? null : 'btn-trade-empty-tx', 'Add a transaction');
    $('btn-trade-empty-tx')?.addEventListener('click', () => openTxModal(null));
    return;
  }

  /* Eine Summenzeile ueber der Liste: was die gerade sichtbare Auswahl
     ergibt, nicht was insgesamt gehandelt wurde. */
  const earned = list.filter(e => e.direction === 'sold').reduce((n, e) => n + e.total, 0);
  const spent = list.filter(e => e.direction === 'bought').reduce((n, e) => n + e.total, 0);

  box.innerHTML = `
    <div class="trade-tx-summary">
      <span><b>${nf(list.length)}</b> trade${list.length === 1 ? '' : 's'} shown</span>
      <span class="is-positive">+${nf(earned)}p earned</span>
      <span class="is-negative">−${nf(spent)}p spent</span>
      <span>net <b class="${earned - spent >= 0 ? 'is-positive' : 'is-negative'}">${earned - spent >= 0 ? '+' : ''}${nf(earned - spent)}p</b></span>
      ${txRemoteNote(list)}
    </div>
  ` + list.map(e => `
    <div class="trade-row trade-tx-row" data-tx="${esc(e.id)}">
      <div class="trade-row-main">
        <span class="tx-dir ${e.direction === 'sold' ? 'is-sold' : 'is-bought'}">
          ${e.direction === 'sold' ? Icon.check(13) : Icon.minus(13)}
        </span>
        <div class="trade-row-text">
          <div class="trade-row-title">
            <b>${esc(e.name)}</b>
            ${e.kind === 'contract' ? '<span class="trade-type-chip is-buy">contract</span>' : ''}
            ${txSourceChip(e)}
          </div>
          <div class="trade-row-meta">
            <span class="trade-price">${platImg}<b>${nf(e.platinum)}</b></span>
            <span class="trade-qty">×${nf(e.quantity)}</span>
            <span class="trade-dim ${e.direction === 'sold' ? 'is-positive' : 'is-negative'}">
              ${e.direction === 'sold' ? '+' : '−'}${nf(e.total)}p
            </span>
            ${e.partner ? `<span class="trade-dim">with ${esc(e.partner)}</span>` : ''}
            <span class="trade-dim">· ${e.dateUnknown ? 'date unknown' : esc(relativeAge(e.at))}</span>
          </div>
        </div>
      </div>
      <div class="trade-row-actions">
        <button class="trade-btn" data-act="edit">${Icon.pencil(14)}<span>Edit</span></button>
        <button class="trade-btn is-danger" data-act="delete">${Icon.trash(14)}</button>
      </div>
    </div>
  `).join('');

  list.forEach(e => {
    const row = document.querySelector(`.trade-row[data-tx="${CSS.escape(e.id)}"]`);
    if (!row) return;
    row.querySelector('[data-act="edit"]').onclick = () => openTxModal(e);
    armDelete(row.querySelector('[data-act="delete"]'), Icon.trash(14) + '<span>Sure?</span>', async () => {
      const res = await window.api.tradeRemoveTransaction(e.id);
      if (!res?.ok) return alert(tradeError(res, 'removeTransaction'));
      await loadTrading();
    });
  });
}

function openTxModal(entry) {
  editingTx = entry;
  $('trade-tx-title').textContent = entry ? 'Edit transaction' : 'Add transaction';
  $('trade-tx-submit-label').textContent = entry ? 'Save changes' : 'Add to history';
  $('trade-tx-direction').value = entry?.direction || 'sold';
  $('trade-tx-name').value = entry?.name || '';
  $('trade-tx-plat').value = entry?.platinum ?? '';
  $('trade-tx-qty').value = entry?.quantity ?? 1;
  $('trade-tx-partner').value = entry?.partner || '';
  $('trade-tx-status').textContent = '';
  $('trade-tx-modal').classList.remove('hidden');
}

const closeTxModal = () => {
  $('trade-tx-modal').classList.add('hidden');
  editingTx = null;
};

/* ------------------------- Neue Order ------------------------- */

/**
 * Vom Set im Inventar direkt in die fertige Order.
 *
 * Der Sinn der Knoepfe ist, dass nach dem Klick nur noch "Create order"
 * fehlt: Reiter wechseln, Fenster oeffnen, Item setzen, Menge setzen, Preis
 * vorschlagen. Was der Nutzer noch aendern WILL, kann er - was er aendern
 * MUESSTE, ist schon ausgefuellt.
 *
 * Ohne Anmeldung fuehrt der Weg nicht ins Leere, sondern ins Kontofenster:
 * eine Order anzulegen ist ohne Konto nicht moeglich, und das gehoert gesagt,
 * bevor jemand ein Formular ausfuellt.
 */
async function startOrderForSet(slug, type, quantity) {
  showTab('trading');
  await loadTrading();

  if (!tradeAuth?.signedIn) { openAccountModal(); return; }

  const item = await window.api.tradeItemBySlug(slug);
  if (!item) {
    alert('warframe.market does not list this set.');
    return;
  }

  openNewOrderModal();
  $('trade-new-type').value = type;
  await pickNewOrderItem(item);
  /* Nach pickNewOrderItem, weil das den Preisvorschlag setzt und dabei die
     Menge nicht anfasst - andersherum wuerde die Vorbelegung ueberschrieben. */
  $('trade-new-qty').value = Math.max(1, quantity);
}

function openNewOrderModal() {
  newOrderItem = null;
  $('trade-new-search').value = '';
  $('trade-new-results').innerHTML = '';
  /* Preis und Menge zuruecksetzen: sonst schlaegt der Vorschlag beim
     naechsten Item nicht an (er fuellt nur ein leeres Feld) und die Menge
     der vorigen Order steht noch da. */
  $('trade-new-plat').value = '';
  $('trade-new-qty').value = 1;
  $('trade-new-type').value = 'sell';
  $('trade-new-form').classList.add('hidden');
  $('trade-new-status').textContent = '';
  $('trade-new-modal').classList.remove('hidden');
  $('trade-new-search').focus();
}

const closeNewOrderModal = () => {
  $('trade-new-modal').classList.add('hidden');
  newOrderItem = null;
};

async function searchNewOrderItems() {
  const q = $('trade-new-search').value.trim();
  const box = $('trade-new-results');
  if (q.length < 2) { box.innerHTML = ''; return; }

  const hits = await window.api.tradeSearchItems(q);
  if (!hits.length) {
    box.innerHTML = '<p class="trade-offers-empty">Nothing tradeable matches that.</p>';
    return;
  }
  box.innerHTML = hits.map((h, i) => `
    <button class="trade-pick" data-pick="${i}">
      ${marketThumb(h, 'mthumb-30')}
      <span class="pick-name">${esc(h.name)}</span>
      ${h.maxRank != null ? `<span class="trade-dim">max rank ${h.maxRank}</span>` : ''}
      ${h.ducats ? `<span class="trade-dim">${h.ducats} ducats</span>` : ''}
    </button>
  `).join('');
  box.querySelectorAll('[data-pick]').forEach(b => {
    b.onclick = () => pickNewOrderItem(hits[+b.dataset.pick]);
  });
}

async function pickNewOrderItem(item) {
  newOrderItem = item;
  $('trade-new-results').innerHTML = '';
  $('trade-new-picked').innerHTML = `
    ${marketThumb(item, 'mthumb-34')}
    <b>${esc(item.name)}</b>
  `;
  $('trade-new-rank-field').classList.toggle('hidden', item.maxRank == null);
  if (item.maxRank != null) $('trade-new-rank').max = item.maxRank;

  /* Pflichtfelder dieses Items - fehlt eines, lehnt warframe.market die
     ganze Anlage ab ("app.field.required"). */
  $('trade-new-subtype-field').classList.toggle('hidden', !item.subtypes);
  if (item.subtypes) fillSubtypes($('trade-new-subtype'), item.subtypes, item.subtypes[0]);

  $('trade-new-pertrade-field').classList.toggle('hidden', !item.bulkTradable);
  if (item.bulkTradable) $('trade-new-pertrade').value = 1;
  $('trade-new-form').classList.remove('hidden');
  $('trade-new-plat').focus();
  suggestNewOrderPrice();
}

/**
 * Preisvorschlag fuer das gewaehlte Item.
 *
 * Steht getrennt, weil er von zwei Dingen abhaengt, die sich unabhaengig
 * aendern: dem Item und der Richtung. Beim Umschalten von WTS auf WTB darf
 * nicht das ganze Formular neu aufgebaut werden - sonst faellt eine bereits
 * getroffene Zustandswahl wieder auf den ersten Wert zurueck.
 */
async function suggestNewOrderPrice() {
  const item = newOrderItem;
  if (!item) return;
  $('trade-new-hint').textContent = 'Loading current prices …';

  /* DIE RICHTUNG ENTSCHEIDET, WELCHE SEITE INTERESSIERT:
       verkaufen -> was die anderen VERKAEUFER verlangen, guenstigste zuerst.
                    Das ist die Konkurrenz, gegen die man sich stellt.
       kaufen    -> was die anderen KAEUFER bieten, hoechste zuerst. Ein
                    Kaufgesuch unter dem besten Gebot sieht niemand.
     Ein intaktes Relikt kostet ausserdem ein Vielfaches eines strahlenden,
     deshalb geht der gewaehlte Zustand mit in die Abfrage. */
  const selling = $('trade-new-type').value !== 'buy';
  const res = await window.api.tradeOffers(item.slug, {
    type: selling ? 'sell' : 'buy',
    sort: selling ? 'price-asc' : 'price-desc',
    limit: 5,
    subtype: item.subtypes ? $('trade-new-subtype').value : null
  });
  if (!res?.ok || !res.offers.length) {
    $('trade-new-hint').textContent = selling
      ? 'Nobody is selling this right now — you set the price.'
      : 'No buy orders right now — you set the price.';
    return;
  }
  const prices = res.offers.map(o => o.platinum);
  const lead = prices[0];

  /* WAS VORGESCHLAGEN WIRD, IST NICHT IMMER DER ERSTE WERT:
       verkaufen -> der guenstigste Verkaeufer. Wer darueber liegt, verkauft
                    nichts, also ist das die Zahl, an der man sich misst.
       kaufen    -> der MITTLERE der besten Gebote, nicht das hoechste. Ein
                    einzelner Bieter, der weit ueber dem Feld liegt, ist
                    keine Marktlage - ihn als Vorgabe einzusetzen hiesse,
                    versehentlich sein Gebot zu ueberbieten. Beobachtet bei
                    einem Set mit Geboten von 175p, dann 69, 60, 60, 57. */
  const median = arr => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const suggestion = selling ? lead : median(prices);

  $('trade-new-hint').innerHTML = selling
    ? `Cheapest seller: <b>${nf(lead)}p</b> · next: ${prices.slice(1, 5).map(p => nf(p) + 'p').join(', ')}`
    : `Buyers offer ${prices.map(p => nf(p) + 'p').join(', ')} — suggesting the middle one, <b>${nf(suggestion)}p</b>`;

  if (!$('trade-new-plat').value) $('trade-new-plat').value = suggestion;
}

/* --------------------------- Verdrahtung --------------------------- */

function initTradingEvents() {
  if (initTradingEvents.done) return;
  initTradingEvents.done = true;

  $('btn-trade-refresh').onclick = () => loadTrading({ refresh: true });

  document.querySelectorAll('[data-trade-mode]').forEach(btn => {
    btn.onclick = () => {
      tradeMode = btn.dataset.tradeMode;
      /* Der erste Chip des Modus statt eines festen 'all': den Schluessel
         gibt es im Marktmodus nicht, und ein Filter, der auf nichts zeigt,
         laesst die Chipreihe ohne aktiven Eintrag stehen. */
      tradeFilter = (TRADE_FILTERS[tradeMode] || [{ key: 'all' }])[0].key;

      /* UND DIE SORTIERUNG GENAUSO. Sie blieb bisher stehen, wenn der alte
         Schluessel im neuen Modus zufaellig auch existiert - und
         plat-desc gibt es ueberall. Aus Orders ("Platinum highest") kam man
         so im Markt bei "Price (highest)" heraus, waehrend der Chip daneben
         auf "Sellers" stand: die teuersten Verkaeufer zuerst, also genau
         andersherum als gemeint. Der erste Eintrag der Liste IST die
         Voreinstellung des Modus, hier wie beim Filter. */
      tradeSort = (TRADE_SORTS[tradeMode] || [['plat-desc']])[0][0];
      /* Das Suchfeld bedeutet hier etwas anderes - was drinsteht, gilt nicht
         weiter. */
      marketReset();
      if ($('trade-search')) $('trade-search').value = '';
      renderTradeFilters();
      renderTradeList();
      updateTradeModeTabs();
    };
  });

  $('trade-sort').onchange = e => {
    tradeSort = e.target.value;
    if (tradeMode === 'market' && marketItem) return marketLoadOffers();
    renderTradeList();
  };
  $('trade-search').oninput = () => {
    /* Tippen loest sonst je Zeichen ein Neuzeichnen der ganzen Liste aus -
       im Marktmodus waere es je Zeichen eine Suche. */
    clearTimeout(tradeSearchTimer);
    tradeSearchTimer = setTimeout(
      () => (tradeMode === 'market' ? marketSearch() : renderTradeList()), 220);
  };

  $('btn-trade-new').onclick = () =>
    tradeMode === 'transactions' ? openTxModal(null) : openNewOrderModal();

  /* ---- Anwesenheit ---- */
  $('set-trade-presence').onchange = async e => {
    const on = e.target.checked;
    /* Sofort zeichnen, damit der Schalter nicht zurueckspringt, waehrend der
       Hauptprozess antwortet. Was danach kommt, korrigiert es notfalls. */
    tradePresence = { ...tradePresence, enabled: on, state: on ? 'connecting' : 'off', error: null };
    renderTradePresence();

    const res = await window.api.tradeSetAutoStatus(on);
    if (res?.ok) tradePresence = { enabled: !!res.enabled, state: res.state || 'off', error: res.error || null };
    else tradePresence = { enabled: false, state: 'error', error: res?.error || 'could not reach warframe.market' };
    renderTradePresence();
  };

  /* Der Hauptprozess meldet jeden Wechsel von sich aus - das Spiel geht auf
     oder zu, ohne dass hier jemand klickt. */
  window.api.onTradePresence(st => {
    tradePresence = { ...tradePresence, state: st.state, error: st.error };
    renderTradePresence();
  });

  /* ---- Konto-Fenster ---- */
  $('btn-trade-account').onclick = openAccountModal;
  $('trade-account-close').onclick = closeAccountModal;
  $('trade-account-modal').onclick = e => { if (e.target.id === 'trade-account-modal') closeAccountModal(); };
  $('btn-trade-recheck').onclick = runConnectionCheck;

  $('btn-trade-signout').onclick = async () => {
    await window.api.tradeSignOut();
    tradeAuth = { signedIn: false, user: null };
    tradeOrders = null;
    tradeContracts = null;
    tradeConnection = null;
    tradeSessionExpired = false;
    tradeAccountBlocked = null;
    closeAccountModal();
    await loadTrading();
  };

  /* ---- Anmeldung ---- */
  $('trade-signin-form').onsubmit = async e => {
    e.preventDefault();
    const status = $('trade-signin-status');
    const pwField = $('trade-password');
    status.classList.remove('hidden');
    status.textContent = 'Signing in …';
    $('btn-trade-signin').disabled = true;

    const res = await window.api.tradeSignIn($('trade-email').value, pwField.value);

    /* Das Passwort sofort aus dem Feld nehmen, egal wie es ausging - es hat
       im DOM nichts mehr verloren, sobald es abgeschickt ist. */
    pwField.value = '';
    $('btn-trade-signin').disabled = false;

    if (!res?.ok) { status.textContent = res?.error || 'Sign-in failed.'; return; }

    /* Ab hier ist die Anmeldung durch. Der Zustand wird uebernommen, bevor
       irgendetwas nachgeladen wird - sonst haengt der Knopf oben noch auf
       "Sign in", waehrend im Hintergrund schon Orders kommen. */
    tradeAuth = { signedIn: true, user: res.user || null, v2Rejected: !!res.v2Rejected };
    tradeSessionExpired = false;
    renderTradeAccount();

    /* Angemeldet, aber v2 nimmt das Token nicht: das Fenster bleibt offen
       und zeigt, welcher Teil antwortet. Frueher schloss sich hier alles
       kommentarlos und der Tab sah aus wie vor dem Anmelden - genau der
       Ausgang, bei dem "nichts passiert". */
    if (res.v2Rejected) {
      status.textContent = 'Signed in, but warframe.market refused the session for orders. '
                         + 'See the connection check below.';
      $('trade-account-signedout').classList.add('hidden');
      $('trade-account-signedin').classList.remove('hidden');
      openAccountModal();
      await loadTrading({ refresh: true });
      return;
    }

    status.textContent = '';
    status.classList.add('hidden');
    closeAccountModal();
    await loadTrading({ refresh: true });
  };

  /* ---- Order bearbeiten ---- */
  $('trade-edit-close').onclick = closeEditOrder;
  $('trade-edit-modal').onclick = e => { if (e.target.id === 'trade-edit-modal') closeEditOrder(); };

  $('trade-edit-form').onsubmit = async e => {
    e.preventDefault();
    if (!editingOrder) return;
    const status = $('trade-edit-status');
    status.textContent = 'Saving …';

    const patch = {
      platinum: +$('trade-edit-plat').value,
      quantity: +$('trade-edit-qty').value
    };
    /* perTrade nur bei bulkTradable - sonst weist warframe.market den
       ganzen Patch zurueck und die Preisaenderung waere gleich mit weg. */
    if (editingOrder.bulkTradable) patch.perTrade = +$('trade-edit-pertrade').value || 1;
    if (editingOrder.subtypes) patch.subtype = $('trade-edit-subtype').value;
    if (!$('trade-edit-rank-field').classList.contains('hidden')) patch.rank = +$('trade-edit-rank').value;

    /* Menge 0 heisst auf warframe.market nicht "unsichtbar", sondern
       "nichts mehr da" - die Order wird dann geloescht. */
    if (patch.quantity === 0) {
      const res = await window.api.tradeDeleteOrder(editingOrder.id);
      if (!res?.ok) { status.textContent = tradeError(res, 'deleteOrder'); return; }
      closeEditOrder();
      await loadTrading();
      return;
    }

    const res = await window.api.tradeUpdateOrder(editingOrder.id, patch, { itemId: editingOrder.itemId });
    if (!res?.ok) { status.textContent = tradeError(res, 'updateOrder'); return; }
    status.textContent = 'Saved.';
    Object.assign(editingOrder, res.order || patch);
    renderTradeKPIs();
    renderTradeList();
    loadOffers();
    setTimeout(() => { if ($('trade-edit-status')) $('trade-edit-status').textContent = ''; }, 1500);
  };

  document.querySelectorAll('[data-offer-type]').forEach(b => {
    b.onclick = () => { offerFilters.type = b.dataset.offerType; syncOfferFilterChips(); loadOffers(); };
  });
  $('trade-offers-online').onclick = () => {
    offerFilters.onlineOnly = !offerFilters.onlineOnly;
    syncOfferFilterChips();
    loadOffers();
  };
  $('trade-offers-sort').onchange = e => { offerFilters.sort = e.target.value; loadOffers(); };
  $('trade-offers-platform').onchange = e => { offerFilters.platform = e.target.value; loadOffers(); };
  /* Anderer Zustand heisst andere Ware - die Vergleichsliste muss mit. */
  $('trade-edit-subtype').onchange = () => loadOffers();

  /* ---- Contract bearbeiten ---- */
  $('trade-contract-close').onclick = closeEditContract;
  $('trade-contract-modal').onclick = e => { if (e.target.id === 'trade-contract-modal') closeEditContract(); };

  $('trade-contract-form').onsubmit = async e => {
    e.preventDefault();
    if (!editingContract) return;
    const status = $('trade-contract-status');
    status.textContent = 'Saving …';

    const buyoutRaw = $('trade-contract-buyout').value.trim();
    const res = await window.api.tradeUpdateContract(editingContract.id, {
      startingPrice: +$('trade-contract-start').value,
      buyoutPrice: buyoutRaw === '' ? null : +buyoutRaw,
      minimalReputation: +$('trade-contract-rep').value || 0,
      note: $('trade-contract-note').value
    });
    if (!res?.ok) { status.textContent = tradeError(res, 'updateContract'); return; }
    status.textContent = 'Saved.';
    Object.assign(editingContract, res.contract || {});
    renderTradeKPIs();
    renderTradeList();
    loadContractOffers();
  };

  $('trade-contract-online').onclick = () => {
    contractOfferFilters.onlineOnly = !contractOfferFilters.onlineOnly;
    $('trade-contract-online').classList.toggle('active', contractOfferFilters.onlineOnly);
    loadContractOffers();
  };
  $('trade-contract-direct').onclick = () => {
    contractOfferFilters.directSellOnly = !contractOfferFilters.directSellOnly;
    $('trade-contract-direct').classList.toggle('active', contractOfferFilters.directSellOnly);
    loadContractOffers();
  };
  $('trade-contract-sort').onchange = e => { contractOfferFilters.sort = e.target.value; loadContractOffers(); };

  /* ---- Neue Order ---- */
  $('trade-new-close').onclick = closeNewOrderModal;
  $('trade-new-modal').onclick = e => { if (e.target.id === 'trade-new-modal') closeNewOrderModal(); };
  $('btn-trade-new-back').onclick = () => {
    newOrderItem = null;
    $('trade-new-form').classList.add('hidden');
    $('trade-new-search').focus();
  };

  let newSearchTimer = null;
  $('trade-new-search').oninput = () => {
    clearTimeout(newSearchTimer);
    newSearchTimer = setTimeout(searchNewOrderItems, 220);
  };

  /* Richtung gewechselt heisst andere Vergleichsseite - Vorschlag neu holen,
     aber nur wenn der Preis noch der vorgeschlagene ist. */
  $('trade-new-type').onchange = () => {
    $('trade-new-plat').value = '';
    suggestNewOrderPrice();
  };
  /* Anderer Zustand, anderer Preis - Relikte unterscheiden sich um ein
     Vielfaches zwischen intakt und strahlend. */
  $('trade-new-subtype').onchange = () => {
    $('trade-new-plat').value = '';
    suggestNewOrderPrice();
  };

  $('trade-new-form').onsubmit = async e => {
    e.preventDefault();
    if (!newOrderItem) return;
    const status = $('trade-new-status');
    status.textContent = 'Creating …';

    const data = {
      slug: newOrderItem.slug,
      itemId: newOrderItem.itemId,
      type: $('trade-new-type').value,
      platinum: +$('trade-new-plat').value,
      quantity: +$('trade-new-qty').value || 1
    };
    if (newOrderItem.maxRank != null) data.rank = +$('trade-new-rank').value || 0;
    if (newOrderItem.subtypes) data.subtype = $('trade-new-subtype').value;
    if (newOrderItem.bulkTradable) data.perTrade = +$('trade-new-pertrade').value || 1;

    const res = await window.api.tradeCreateOrder(data);
    if (!res?.ok) { status.textContent = tradeError(res, 'createOrder'); return; }
    closeNewOrderModal();
    await loadTrading();
  };

  /* ---- Transaktion ---- */
  $('trade-tx-close').onclick = closeTxModal;
  $('trade-tx-modal').onclick = e => { if (e.target.id === 'trade-tx-modal') closeTxModal(); };

  $('trade-tx-form').onsubmit = async e => {
    e.preventDefault();
    const status = $('trade-tx-status');
    status.textContent = 'Saving …';

    const payload = {
      direction: $('trade-tx-direction').value,
      name: $('trade-tx-name').value.trim(),
      platinum: +$('trade-tx-plat').value,
      quantity: +$('trade-tx-qty').value || 1,
      partner: $('trade-tx-partner').value.trim() || null
    };

    const res = editingTx
      ? await window.api.tradeUpdateTransaction(editingTx.id, payload)
      : await window.api.tradeAddTransaction({ ...payload, source: 'manual' });

    if (!res?.ok) { status.textContent = tradeError(res, 'saveTransaction'); return; }
    closeTxModal();
    await loadTrading();
  };
}

/* Esc schliesst das oberste offene Handelsfenster - dieselbe Erwartung wie
   ueberall sonst in der Oberflaeche. */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('trade-account-modal')?.classList.contains('hidden')) return closeAccountModal();
  if (!$('trade-edit-modal')?.classList.contains('hidden')) return closeEditOrder();
  if (!$('trade-new-modal')?.classList.contains('hidden')) return closeNewOrderModal();
  if (!$('trade-contract-modal')?.classList.contains('hidden')) return closeEditContract();
  if (!$('trade-tx-modal')?.classList.contains('hidden')) return closeTxModal();
});


/* ---------------- App Start ---------------- */
loadNotificationSettings();
boot();



/* ============================================================================
   Einstellungen

   Tastenkuerzel und die drei Hauptschalter der Benachrichtigungen. Die Auswahl,
   WELCHE Risse gemeldet werden, bleibt bewusst im Live-Tracker: sie gehoert zu
   der Liste, die sie filtert, und wird dort gegengeprueft ("3 passende Risse
   jetzt aktiv"). Hier stehen nur Schalter, die immer gelten.
   ========================================================================= */

let hotkeyState = null;
let capturingHotkey = null;

const HOTKEY_LABELS = {
  overlay:  'Overlay ein-/ausblenden',
  interact: 'Mauszeiger ins Overlay holen',
  main:     'Hauptfenster nach vorn holen'
};

/* Sondertasten fuer Electron-Accelerators */
const CODE_TO_ACCEL = {
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  F13: 'F13', F14: 'F14', F15: 'F15', F16: 'F16', F17: 'F17', F18: 'F18',
  F19: 'F19', F20: 'F20', F21: 'F21', F22: 'F22', F23: 'F23', F24: 'F24',
  Space: 'Space', Tab: 'Tab', Enter: 'Return', NumpadEnter: 'Return',
  Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Pause: 'Pause', PrintScreen: 'PrintScreen', ScrollLock: 'ScrollLock',
  Numpad0: 'num0', Numpad1: 'num1', Numpad2: 'num2', Numpad3: 'num3', Numpad4: 'num4',
  Numpad5: 'num5', Numpad6: 'num6', Numpad7: 'num7', Numpad8: 'num8', Numpad9: 'num9',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
  Minus: 'Minus', Equal: 'Plus', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: '\'', Comma: ',',
  Period: '.', Slash: '/', Backquote: '`'
};

const ACCEL_NAMED = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  ' ': 'Space', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp',
  PageDown: 'PageDown', Tab: 'Tab', Escape: 'Escape'
};

function accelKeyName(e) {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return null;
  if (/^F\d{1,2}$/.test(e.key)) return e.key;
  if (CODE_TO_ACCEL[e.code]) return CODE_TO_ACCEL[e.code];
  if (ACCEL_NAMED[e.key]) return ACCEL_NAMED[e.key];
  if (/^[a-z0-9]$/i.test(e.key)) return e.key.toUpperCase();
  const m = /^(?:Digit|Key)([A-Z0-9])$/.exec(e.code || '');
  if (m) return m[1];
  return null;
}

/** Electron-Schreibweise ("Ctrl+Shift+R"), oder null wenn unbrauchbar. */
function accelFromEvent(e) {
  const key = accelKeyName(e);
  if (!key) return null;

  const mods = [];
  if (e.ctrlKey)  mods.push('Ctrl');
  if (e.altKey)   mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey)  mods.push('Super');

  const isStandaloneAllowed = /^F\d{1,2}$/.test(key)
    || ['Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Pause', 'PrintScreen', 'ScrollLock'].includes(key)
    || key.startsWith('num');

  /* Ohne Modifikator waere eine normale Buchstabentaste systemweit weg - auch im Chat, auch im Spiel. */
  if (!mods.length && !isStandaloneAllowed) return null;

  return [...mods, key].join('+');
}

function renderHotkeys() {
  for (const name of Object.keys(HOTKEY_LABELS)) {
    const btn = document.querySelector(`.hotkey-btn[data-hotkey="${name}"]`);
    if (!btn) continue;

    if (capturingHotkey === name) {
      btn.classList.add('capturing');
      btn.textContent = 'Press a key …';
      continue;
    }

    btn.classList.remove('capturing');
    const accel = (hotkeyState && hotkeyState[name]) || '';
    if (!accel || accel === '—') {
      btn.innerHTML = `<span class="hk-empty">None</span>`;
    } else {
      btn.innerHTML = accel.split('+')
        .map(k => `<kbd>${esc(k)}</kbd>`)
        .join('<span class="hk-plus">+</span>');
    }
  }
  renderHotkeyHint(hotkeyState);
}

function setHotkeyStatus(kind, text) {
  const el = $('hk-status');
  if (!el) return;
  el.className = 'settings-note ' + (kind || '');
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

function startHotkeyCapture(name) {
  capturingHotkey = name;
  renderHotkeys();
  setHotkeyStatus('', 'Press a key combination (e.g. Ctrl+R or F6). Esc or click outside cancels.');
}

function cancelHotkeyCapture() {
  if (!capturingHotkey) return;
  capturingHotkey = null;
  renderHotkeys();
  setHotkeyStatus('', '');
}

async function saveHotkey(name, accelerator) {
  capturingHotkey = null;
  const res = await window.api.setHotkeys({ [name]: accelerator });
  hotkeyState = (res && res.hotkeys) || hotkeyState;
  renderHotkeys();

  const rejected = ((res && res.failed) || []).some(f => f.name === name);
  if (rejected) {
    setHotkeyStatus('warn',
      `${accelerator} could not be registered — that combination is already taken `
      + `system-wide (often Discord, GeForce Experience or another overlay). `
      + `Active: ${hotkeyState[name] || 'None'}.`);
  } else {
    setHotkeyStatus('ok', `Hotkey updated: ${accelerator}`);
  }
}

document.querySelectorAll('.hotkey-btn').forEach(btn => {
  btn.onclick = (e) => {
    e.stopPropagation();
    const name = btn.dataset.hotkey;
    if (capturingHotkey === name) {
      cancelHotkeyCapture();
    } else {
      startHotkeyCapture(name);
    }
  };
});

/* Klick ausserhalb des Hotkey-Knopfs bricht die Erfassung ab */
document.addEventListener('pointerdown', e => {
  if (capturingHotkey && !e.target.closest('.hotkey-btn')) {
    cancelHotkeyCapture();
  }
});

/* Fokusverlust des Fensters bricht die Erfassung ab */
window.addEventListener('blur', () => {
  if (capturingHotkey) cancelHotkeyCapture();
});

/* Erfassungsphase: sonst schluckt der gerade angeklickte Knopf die Leertaste
   oder ein Eingabefeld den Buchstaben, bevor er hier ankommt. */
window.addEventListener('keydown', e => {
  if (!capturingHotkey) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') { cancelHotkeyCapture(); return; }

  const mods = [];
  if (e.ctrlKey)  mods.push('Ctrl');
  if (e.altKey)   mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey)  mods.push('Super');

  const accel = accelFromEvent(e);
  if (!accel) {
    // Live-Vorschau fuer gedrueckte Modifikatoren
    const btn = document.querySelector(`.hotkey-btn[data-hotkey="${capturingHotkey}"]`);
    if (btn) {
      btn.textContent = mods.length ? mods.join(' + ') + ' + …' : 'Press a key …';
    }
    return;
  }

  saveHotkey(capturingHotkey, accel);
}, true);

window.addEventListener('keyup', e => {
  if (!capturingHotkey) return;
  const mods = [];
  if (e.ctrlKey)  mods.push('Ctrl');
  if (e.altKey)   mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey)  mods.push('Super');

  const btn = document.querySelector(`.hotkey-btn[data-hotkey="${capturingHotkey}"]`);
  if (btn) {
    btn.textContent = mods.length ? mods.join(' + ') + ' + …' : 'Press a key …';
  }
}, true);

/* ---------------- Benachrichtigungs-Schalter ---------------- */

function renderNotifToggles() {
  const s = notificationSettings || {};
  const on = s.enabled !== false && s.fissures?.enabled !== false;
  if ($('set-notif-enabled')) $('set-notif-enabled').checked = on;
  if ($('set-notif-sound'))   $('set-notif-sound').checked   = s.sound !== false;
  if ($('set-notif-toast'))   $('set-notif-toast').checked   = s.desktopToast !== false;
}

/* Eigener Schalter, eigene Ablage: das Einblenden bei Relikt-Funden haengt am
   Overlay, nicht an den Benachrichtigungen, und liegt deshalb in config.json
   statt bei den Melde-Einstellungen. */
function renderRelicToggle(on, scan, tags) {
  if ($('set-relic-autoshow')) $('set-relic-autoshow').checked = on !== false;
  if ($('set-relic-scan'))     $('set-relic-scan').checked     = scan !== false;
  if ($('set-relic-tags'))     $('set-relic-tags').checked     = tags !== false;
}

/* Die drei Zeilen darunter haengen am Overlay-Fenster: ohne Fenster gibt es
   nichts einzublenden. Sie bleiben sichtbar statt zu verschwinden - wer den
   Hauptschalter sucht, soll sehen, was daran haengt. */
function syncOverlayDependants(enabled) {
  for (const id of ['set-relic-autoshow', 'set-relic-tags', 'set-relic-scan']) {
    const row = $(id)?.closest('.setting-row');
    if (row) row.classList.toggle('is-disabled', !enabled);
    if ($(id)) $(id).disabled = !enabled;
  }
}

/* Den Zustand danach NICHT selbst nachziehen: der Hauptprozess schickt ihn
   ohnehin an beide Fenster (broadcastOverlayState), und eine zweite Quelle
   fuer dieselbe Aussage geht irgendwann auseinander. */
$('set-overlay-enabled')?.addEventListener('change', e => {
  const on = e.target.checked;
  syncOverlayDependants(on);
  window.api.setOverlayEnabled(on).catch(() => {});
});

$('set-relic-autoshow')?.addEventListener('change', e => {
  window.api.setRelicAutoShow(e.target.checked).catch(() => {});
});

$('set-relic-scan')?.addEventListener('change', e => {
  window.api.setRelicScan(e.target.checked).catch(() => {});
});

$('set-relic-tags')?.addEventListener('change', e => {
  window.api.setRelicTags(e.target.checked).catch(() => {});
});

async function saveNotifToggles() {
  const enabled = $('set-notif-enabled').checked;
  /* Ein Schalter, zwei Ebenen: enabled und fissures.enabled hingen schon im
     alten Modal an derselben Zeile. */
  const res = await window.api.saveNotifications({
    enabled,
    sound: $('set-notif-sound').checked,
    desktopToast: $('set-notif-toast').checked,
    fissures: { enabled }
  });
  if (res.ok) {
    notificationSettings = res.data;
    updateNotificationButtonState();
    renderNotifToggles();
  }
}

['set-notif-enabled', 'set-notif-sound', 'set-notif-toast'].forEach(id => {
  $(id)?.addEventListener('change', saveNotifToggles);
});

$('set-open-fissure-notif')?.addEventListener('click', () => {
  showTab('worldstate');
  showWsPane('fissures');
  openNotificationModal();
});

/* Der Schalter fuer den Speicherzugriff. Die Rueckmeldung steht direkt
   darunter statt in einem Hinweisfenster: wer eine Erlaubnis umlegt, soll an
   Ort und Stelle sehen, was jetzt gilt. */
$('set-inventory-scan')?.addEventListener('change', async e => {
  const on = e.target.checked;
  const note = $('inv-scan-status');
  const autoRow = $('row-inventory-autosync');
  if (autoRow) autoRow.style.opacity = on ? '1' : '0.4';
  try {
    await window.api.setInventoryScan(on);
    if (note) {
      note.textContent = on
        ? 'On. The Inventory tab can now read the running game when you press "Fetch inventory".'
        : 'Off. Argus will not touch the game process.';
      note.classList.remove('hidden');
    }
  } catch (err) {
    e.target.checked = !on;   // zurueckstellen, sonst zeigt der Schalter etwas Falsches
    if (note) {
      note.textContent = 'Could not save that: ' + err.message;
      note.classList.remove('hidden');
    }
  }
});

$('set-inventory-autosync')?.addEventListener('change', async e => {
  const on = e.target.checked;
  try {
    await window.api.setAutoSync(on);
  } catch (err) {
    e.target.checked = !on;
  }
});

async function loadSettingsTab() {
  try {
    const res = await window.api.getSettings();
    if (res && res.ok) {
      hotkeyState = res.hotkeys;
      if (res.notifications) notificationSettings = res.notifications;
      renderRelicToggle(res.relicAutoShow, res.relicScan, res.relicTags);

      const overlayOn = res.overlayEnabled !== false;
      if ($('set-overlay-enabled')) $('set-overlay-enabled').checked = overlayOn;
      syncOverlayDependants(overlayOn);
    }
  } catch (err) {
    setHotkeyStatus('warn', 'Could not read the settings: ' + err.message);
  }

  /* Aus derselben Quelle wie der Setup-Screen, damit beide nie
     Unterschiedliches ueber denselben Schalter behaupten. */
  try {
    const setup = await window.api.getSetupState();
    const scanOn = setup.inventoryScan === true;
    if ($('set-inventory-scan')) $('set-inventory-scan').checked = scanOn;
    if ($('set-inventory-autosync')) $('set-inventory-autosync').checked = setup.inventoryAutoSync !== false;
    const autoRow = $('row-inventory-autosync');
    if (autoRow) autoRow.style.opacity = scanOn ? '1' : '0.4';
  } catch { /* Schalter bleibt, wie er steht */ }

  renderHotkeys();
  renderNotifToggles();
  /* Nur, wenn der Abruf beim Start nicht durchkam - Version und Unterbau
     aendern sich waehrend einer Sitzung nicht. */
  if (!appInfo) loadAboutBox();
}

/* ---------------- Updates ---------------- */

/* EIN Zustand, drei Anzeigen: das Abzeichen in der Titelleiste, das Fenster
   dahinter und die Zeile in den Einstellungen. Alle drei lesen aus
   updateState - deshalb kann keine davon etwas anderes behaupten als die
   anderen beiden. Gefuellt wird es aus dem Hauptprozess, hier wird nichts
   dazuerfunden. */
let updateState = { status: 'idle' };
let appInfo = null;

const UPDATE_MB = n => (n / 1048576).toFixed(1) + ' MB';

/**
 * Die Release-Notizen sind Markdown von GitHub. Sie kommen aus dem Netz -
 * also erst entschaerfen, dann die drei Formen nachbilden, die darin
 * ueberhaupt vorkommen: Ueberschrift, Aufzaehlung, Absatz. Kein Markdown-
 * Umsetzer fuer eine Handvoll Zeilen, und vor allem keiner, der HTML
 * durchreicht.
 */
function renderUpdateNotes(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  let list = false;
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    if (/^#{1,6}\s/.test(line)) {
      closeList();
      out.push(`<h4>${inlineNotes(line.replace(/^#{1,6}\s*/, ''))}</h4>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li>${inlineNotes(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else {
      closeList();
      out.push(`<p>${inlineNotes(line)}</p>`);
    }
  }
  closeList();
  return out.join('') || '<p class="hint">No release notes for this version.</p>';
}

/* Fett und Code, nachdem alles escaped ist - die Auszeichnung entsteht also
   aus unserem eigenen Text, nie aus dem der Notizen. Die vollen URLs, die
   GitHub in jede Zeile haengt, fliegen raus: im Fenster ist ohnehin nichts
   anklickbar, und sie machen jede Zeile doppelt so lang.
   Das " in <url>" davor muss mit weg - sonst endet jede automatisch erzeugte
   Zeile auf ein nacktes "in". Das "by @name" bleibt: bei einem fremden
   Beitrag ist das die einzige Stelle, an der es steht. */
const inlineNotes = s => esc(s)
  .replace(/\s+in\s+https?:\/\/\S+/gi, '')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`(.+?)`/g, '<code>$1</code>')
  .trim();

function renderUpdateBadge() {
  const badge = $('update-badge');
  const text  = $('update-badge-text');
  if (!badge || !text) return;

  const st = updateState.status;
  /* Sichtbar nur, wenn es wirklich etwas zu tun gibt. Ein Abzeichen, das
     "alles aktuell" meldet, ist ein Abzeichen, das man wegsieht. */
  const show = st === 'available' || st === 'downloading' || st === 'ready' || st === 'installing';
  badge.classList.toggle('hidden', !show);
  if (!show) return;

  if (st === 'downloading') {
    const pct = updateState.size ? Math.floor((updateState.received || 0) / updateState.size * 100) : 0;
    text.textContent = updateState.size ? `${pct}%` : 'Loading …';
    badge.title = 'Downloading the update';
  } else if (st === 'installing') {
    /* Das Abzeichen ist das Einzige, was von hier aus in jedem Bereich zu
       sehen ist - auch wenn das Fenster dahinter gerade zugeklickt wurde. */
    text.textContent = 'Installing';
    badge.title = 'Argus is installing the update and will restart';
  } else if (st === 'ready') {
    text.textContent = 'Install';
    badge.title = `Version ${updateState.latest} is ready to install`;
  } else {
    text.textContent = 'Update';
    badge.title = `Version ${updateState.latest} is available — you are on ${updateState.current}`;
  }
  badge.classList.toggle('is-ready', st === 'ready');
}

function renderUpdateModal() {
  if ($('update-modal').classList.contains('hidden')) return;

  const st       = updateState.status;
  const title    = $('update-modal-title');
  const sub      = $('update-modal-sub');
  const action   = $('update-action');
  const progress = $('update-progress');
  const status   = $('update-status');

  title.textContent =
      st === 'installing' ? 'Installing the update'
    : st === 'ready'      ? 'Ready to install'
    : `Version ${updateState.latest || ''} is available`;

  const published = updateState.publishedAt
    ? new Date(updateState.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  sub.textContent = [
    `You are running ${updateState.current}`,
    published && `published ${published}`,
    updateState.size && UPDATE_MB(updateState.size)
  ].filter(Boolean).join(' · ');

  $('update-notes').innerHTML = renderUpdateNotes(updateState.notes);

  /* Balken nur waehrend des Ladens. Ein Balken auf 100%, der stehen bleibt,
     sieht aus wie ein haengender Vorgang. */
  progress.classList.toggle('hidden', st !== 'downloading');
  if (st === 'downloading') {
    const known = updateState.size > 0;
    const pct = known ? Math.min(100, (updateState.received || 0) / updateState.size * 100) : 0;
    $('update-bar-fill').style.width = known ? pct + '%' : '100%';
    $('update-bar-fill').classList.toggle('indeterminate', !known);
    $('update-progress-text').textContent = known
      ? `${UPDATE_MB(updateState.received || 0)} of ${UPDATE_MB(updateState.size)}`
      : 'Downloading …';
  }

  if (st === 'installing') {
    /* Der einzige Moment, in dem das Fenster erklaert statt meldet: gleich
       verschwindet die App, und ohne diese Zeile saehe das aus wie ein
       Absturz - der Installer selbst zeigt ja nichts mehr an. */
    status.className = 'settings-note';
    status.textContent = 'Argus is closing. The installer runs in the background and starts the new version when it is done.';
    status.classList.remove('hidden');
  } else if (st === 'ready') {
    /* Die Pruefsumme steht ausgeschrieben da: sie laesst sich mit der
       SHA256SUMS.txt des Releases vergleichen, ohne uns zu glauben. */
    status.className = 'settings-note ok';
    status.innerHTML = `Checksum verified.<br><code class="update-hash">${esc(updateState.sha256 || '')}</code>`;
    status.classList.remove('hidden');
  } else if (updateState.error) {
    status.className = 'settings-note warn';
    status.textContent = updateState.error;
    status.classList.remove('hidden');
  } else {
    status.classList.add('hidden');
  }

  action.disabled = st === 'downloading' || st === 'installing';
  if (st === 'downloading') {
    action.innerHTML = 'Downloading …';
  } else if (st === 'installing') {
    action.innerHTML = 'Installing …';
  } else if (st === 'ready') {
    action.innerHTML = updateState.portable
      ? Icon.download(15) + '<span>Show the file</span>'
      : Icon.download(15) + '<span>Install and restart Argus</span>';
  } else if (updateState.downloadable) {
    action.innerHTML = Icon.download(15) + `<span>Download ${esc(updateState.latest || '')}</span>`;
  } else {
    action.innerHTML = Icon.link(15) + '<span>Open the release page</span>';
  }
}

function applyUpdateState(st) {
  if (st) updateState = { ...updateState, ...st };
  renderUpdateBadge();
  renderUpdateModal();
  renderAboutUpdateRow();
}

function openUpdateModal() {
  $('update-modal').classList.remove('hidden');
  renderUpdateModal();
}

const closeUpdateModal = () => $('update-modal').classList.add('hidden');

$('update-badge')?.addEventListener('click', openUpdateModal);
$('update-modal-close')?.addEventListener('click', closeUpdateModal);
$('update-modal')?.addEventListener('click', e => {
  if (e.target.id === 'update-modal') closeUpdateModal();
});

$('update-open-page')?.addEventListener('click', () => {
  window.api.openExternal(updateState.pageUrl || 'https://github.com/Kr3akz/Argus/releases').catch(() => {});
});

$('update-action')?.addEventListener('click', async () => {
  const st = updateState.status;

  if (st === 'ready') {
    const res = await window.api.installUpdate();
    /* Beim portablen Build oeffnet sich nur der Ordner - dann bleibt das
       Fenster stehen und sagt, was jetzt zu tun ist. Beim Installer kommt der
       Zustand "installing" ueber onUpdateChanged herein, und kurz darauf ist
       die App zu; hier ist dann nichts mehr zu tun. */
    if (res && res.ok && res.portable) {
      applyUpdateState({ error: 'The new file is in the folder that just opened. Close Argus and replace the old .exe with it.' });
    } else if (res && !res.ok) {
      applyUpdateState({ error: res.error });
    }
    return;
  }

  if (!updateState.downloadable) {
    window.api.openExternal(updateState.pageUrl || 'https://github.com/Kr3akz/Argus/releases').catch(() => {});
    return;
  }

  /* Der Zustand kommt ueber onUpdateChanged zurueck - hier wird nur
     angestossen und ein Fehler eingesammelt, falls es gar nicht erst
     losgeht. */
  const res = await window.api.downloadUpdate();
  if (res && !res.ok) applyUpdateState({ status: 'available', error: res.error });
});

/* ---------------- "About Argus" in den Einstellungen ---------------- */

function renderAboutUpdateRow() {
  const text = $('update-settings-text');
  const btn  = $('btn-update-check');
  if (!text) return;

  const when = updateState.checkedAt
    ? new Date(updateState.checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  switch (updateState.status) {
    case 'checking':
      text.textContent = 'Checking GitHub for a newer release …';
      break;
    case 'available':
      text.textContent = `Version ${updateState.latest} is available. Open it from the Update badge in the title bar.`;
      break;
    case 'downloading':
      text.textContent = `Downloading version ${updateState.latest} …`;
      break;
    case 'ready':
      text.textContent = `Version ${updateState.latest} has been downloaded and verified.`;
      break;
    case 'installing':
      text.textContent = `Installing version ${updateState.latest} — Argus will close and reopen.`;
      break;
    case 'error':
      text.textContent = 'Could not check for updates: ' + (updateState.error || 'unknown error');
      break;
    case 'uptodate':
      text.textContent = when
        ? `You are on the latest version. Last checked at ${when}.`
        : 'You are on the latest version.';
      break;
    default:
      text.textContent = appInfo && !appInfo.packaged
        ? 'Running from the source folder — automatic checks are off here. "Check now" still works.'
        : 'Not checked yet.';
  }

  $('update-settings-row')?.classList.toggle('warn', updateState.status === 'error');
  $('update-settings-row')?.classList.toggle('ok', updateState.status === 'ready');
  if (btn) {
    btn.disabled = updateState.status === 'checking'
                || updateState.status === 'downloading'
                || updateState.status === 'installing';
    btn.classList.toggle('is-refreshing', updateState.status === 'checking');
  }
  if ($('set-update-check')) $('set-update-check').checked = updateState.auto !== false;
}

async function loadAboutBox() {
  try {
    appInfo = await window.api.getAppInfo();
  } catch { appInfo = null; }

  if (appInfo && appInfo.ok) {
    $('about-version').textContent = 'v' + appInfo.version;
    /* Der Commit beantwortet die Frage, die eine Versionsnummer offen laesst:
       WELCHER Stand ist das - besonders, wenn zwischen zwei Releases von Hand
       etwas nachgebaut wurde. */
    $('about-build').textContent = appInfo.commit
      ? appInfo.commit.slice(0, 7) + (appInfo.builtAt
          ? ' · ' + new Date(appInfo.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : '')
      : 'development build';
    $('about-platform').textContent = appInfo.packaged
      ? (appInfo.portable ? 'Windows · portable' : 'Windows · installed')
      : 'Windows · running from source';
    $('about-runtime').textContent = `Electron ${appInfo.electron} · Chromium ${appInfo.chrome.split('.')[0]} · Node ${appInfo.node.split('.')[0]}`;
  }

  try {
    applyUpdateState(await window.api.getUpdateState());
  } catch { /* Zeile bleibt, wie sie steht */ }
}

$('set-update-check')?.addEventListener('change', async e => {
  const res = await window.api.setUpdateCheck(e.target.checked);
  applyUpdateState({ auto: !!(res && res.auto) });
});

$('btn-update-check')?.addEventListener('click', async () => {
  applyUpdateState({ status: 'checking', error: null });
  try {
    applyUpdateState(await window.api.checkForUpdates());
  } catch (err) {
    applyUpdateState({ status: 'error', error: err.message });
  }
});

$('btn-update-open')?.addEventListener('click', () => {
  /* Gibt es eine neuere Fassung, gehoert der Klick dem Fenster mit ihren
     Notizen - sonst der Release-Liste im Browser. */
  if (updateState.status === 'available' || updateState.status === 'ready' || updateState.status === 'downloading') {
    openUpdateModal();
  } else {
    window.api.openExternal('https://github.com/Kr3akz/Argus/releases').catch(() => {});
  }
});

/* Der Hauptprozess meldet jeden Schritt von sich aus - Prueflauf, Fortschritt
   und Ergebnis. Deshalb muss hier nichts abgefragt werden, was nicht
   ohnehin ankommt. */
window.api.onUpdateChanged(applyUpdateState);
if ($('update-head-icon')) $('update-head-icon').innerHTML = Icon.download(18);

/* Gleich beim Start, nicht erst beim Oeffnen der Einstellungen: das Abzeichen
   in der Titelleiste ist von ueberall aus sichtbar, und die Angaben zur
   Fassung aendern sich waehrend einer Sitzung ohnehin nicht. Frueher hing das
   an loadSettingsTab() - und damit an einem Abruf davor, der damit nichts zu
   tun hat. */
loadAboutBox();

/* ---------------- Wochenrotation ---------------- */

/* Der zuletzt geladene Stand. Gebraucht fuer die Zaehlerpille in der
   Seitenleiste, die auch dann stimmen soll, wenn der Reiter gar nicht offen
   ist - und fuer den Klick auf einen manuellen Haken, der nur die eine
   betroffene Karte neu zeichnen soll, nicht die ganze Liste neu laden. */
let weeklyState = null;
let weeklyMode = 'content';   // 'content' | 'vendors'

/* Sinnbild je Eintrag. Steht hier und nicht im Kern: welches Zeichen etwas
   traegt, ist eine Frage der Oberflaeche, nicht der Daten. */
const WEEKLY_ICONS = {
  archon: 'narmer', circuit: 'bolt',
  'deep-archimedea': 'biotics', 'temporal-archimedea': 'clock',
  netracells: 'cube', kahl: 'steelpath',
  teshin: 'steelpath', bird3: 'traces', yonta: 'biotics',
  acrithis: 'star', palladino: 'lotus', nightwave: 'nightwave'
};

const weeklyIcon = (key, size) => {
  const name = WEEKLY_ICONS[key];
  return name && Icon[name] ? Icon[name](size) : Icon.calendar(size);
};

const weeklySrcTag = quelle => quelle === 'api'
  ? '<span class="weekly-src weekly-src-live" title="Own expiry from the world state">live</span>'
  : '<span class="weekly-src weekly-src-reset" title="No expiry in the API — follows the common weekly reset">reset</span>';

/* Punktreihe fuer Archon (3) und Netracells (5) - eine gefuellte Zelle je
   erledigtem Lauf. Fuer 3 und 5 liest sich das auf einen Blick, fuer den
   Circuit mit seinen zehn Stufen waere es nur noch eine Perlenkette;
   dafuer gibt es weiter unten den Balken. */
function renderPips(fortschritt) {
  const { erledigt, von } = fortschritt;
  const voll = erledigt >= von;
  const zellen = Array.from({ length: von }, (_, i) =>
    `<span class="wk-pip${i < erledigt ? ' filled' : ''}"></span>`).join('');
  return `
    <div class="wk-progress">
      <div class="wk-pips${voll ? ' is-complete' : ''}">
        ${zellen}
        <span class="wk-pip-label">${erledigt} / ${von}</span>
      </div>
    </div>`;
}

/* Zwei Balken - normaler Circuit und Steel Path teilen sich dieselbe Woche,
   aber getrennte Fortschrittsleisten, weil man beide unabhaengig spielt. */
function renderCircuitProgress(fortschritt) {
  const zeile = (label, rang) => {
    if (!rang) return '';
    const pct = rang.von ? Math.round(rang.erledigt / rang.von * 100) : 0;
    const voll = rang.erledigt >= rang.von;
    return `
      <div class="wk-bar-row">
        <span class="wk-bar-label">${esc(label)}</span>
        <div class="wk-bar"><div class="wk-bar-fill${voll ? ' is-complete' : ''}" style="width:${pct}%"></div></div>
        <span class="wk-bar-num">${rang.erledigt}/${rang.von}</span>
      </div>
      ${rang.unclaimed ? '<div class="wk-unclaimed">Unclaimed rewards waiting</div>' : ''}`;
  };
  return `
    <div class="wk-progress">
      ${zeile('Normal', fortschritt.normal)}
      ${zeile('Steel Path', fortschritt.hard)}
    </div>`;
}

/* Fuer alles ohne Nachweis (Archimedea, Kahl): ein echter Kippschalter statt
   eines erfundenen Fortschrittsbalkens. Persistiert ueber den Reset-
   Zeitpunkt als Schluessel - siehe store.setWeeklyDone. */
function renderManualToggle(e) {
  return `
    <label class="wk-manual">
      <span class="wk-manual-label">Mark this week's run as done</span>
      <input type="checkbox" class="toggle-checkbox wk-manual-check" data-weekly-key="${esc(e.key)}"
             ${e.manuellErledigt ? 'checked' : ''}>
      <span class="toggle-switch"></span>
    </label>`;
}

function renderWeeklyContentCard(e) {
  const auto = AUTO_KEYS.has(e.key) && e.progress;
  const manuell = !AUTO_KEYS.has(e.key);
  const fertig = auto
    ? (e.key === 'circuit'
        ? [e.progress.normal, e.progress.hard].every(r => !r || r.erledigt >= r.von)
        : e.progress.erledigt >= e.progress.von)
    : e.manuellErledigt;

  /* Der Circuit bekommt Bilder statt einer Namensliste - Warframes und
     Waffen sind das, was man auf einen Blick erkennt. Alles andere
     (Archimedea-Missionen, Kahl) hat keine Item-Entsprechung und bleibt
     Text. */
  const zeilen = (e.eintraege || []).map(x => {
    if (x.picks && x.picks.length) {
      const bilder = x.picks.map(p => `
        <div class="wk-pick" title="${esc(p.name)}">
          ${p.image ? `<img src="${esc(p.image)}" alt="" loading="eager" onerror="this.style.visibility='hidden'">` : ''}
          <span>${esc(p.name)}</span>
        </div>`).join('');
      return `<div class="wk-picks-group">
        ${x.unter ? `<div class="wk-picks-label">${esc(x.unter)}</div>` : ''}
        <div class="wk-picks">${bilder}</div>
      </div>`;
    }
    return `
    <div class="wk-row">
      <b>${esc(x.titel)}</b>
      ${x.unter ? `<span>${esc(x.unter)}</span>` : ''}
    </div>`;
  }).join('');

  const unterschrift = [e.detail, e.ort].filter(Boolean).map(esc).join(' · ');

  let fortschrittHtml = '';
  if (e.key === 'circuit' && e.progress) fortschrittHtml = renderCircuitProgress(e.progress);
  else if (auto) fortschrittHtml = renderPips(e.progress);
  else if (manuell) fortschrittHtml = renderManualToggle(e);

  return `
    <div class="wk-card${fertig ? ' is-complete' : ''}" data-weekly-card="${esc(e.key)}">
      <div class="wk-head">
        <span class="wk-icon">${weeklyIcon(e.key, 17)}</span>
        <div class="wk-id">
          <b>${esc(e.name)}</b>
          ${unterschrift ? `<span>${unterschrift}</span>` : ''}
        </div>
        <div class="wk-time">
          ${e.eta ? `<span class="wk-eta">${esc(e.eta)}</span>` : ''}
          ${auto ? '<span class="weekly-src weekly-src-auto" title="Read from your own game data">tracked</span>' : weeklySrcTag(e.quelle)}
        </div>
      </div>
      ${fortschrittHtml}
      ${zeilen ? `<div class="wk-body">${zeilen}</div>` : ''}
    </div>`;
}

function renderWeeklyVendorCard(e) {
  /* Mit Ueberschrift, sonst liest sich jede Chipreihe als "das gibt es
     diese Woche" - bei Teshins Dauersortiment waere das schlicht falsch. */
  const rotation = (e.angebotBekannt && e.rotation && e.rotation.length)
    ? `<div class="wk-rotation">
         ${e.rotationTitel ? `<div class="wk-rotation-title">${esc(e.rotationTitel)}</div>` : ''}
         <div class="wk-chips">${e.rotation.slice(0, 12).map(r => `<span class="wk-chip">${esc(r)}</span>`).join('')}</div>
       </div>`
    : '';

  return `
    <div class="wk-card">
      <div class="wk-head">
        <span class="wk-icon">${weeklyIcon(e.key, 17)}</span>
        <div class="wk-id">
          <b>${esc(e.name)}</b>
          ${e.ort ? `<span>${esc(e.ort)}</span>` : ''}
        </div>
        <div class="wk-time">
          ${e.eta ? `<span class="wk-eta">${esc(e.eta)}</span>` : ''}
          ${weeklySrcTag(e.quelle)}
        </div>
      </div>
      <div class="wk-body" style="margin-top:11px;padding-top:0;border-top:none;">
        <div class="wk-vendor-what">${esc(e.was || '')}</div>
      </div>
      ${rotation}
    </div>`;
}

/* Nur diese drei lassen sich aus dem eigenen Spielstand nachweisen - siehe
   AUTO_ERKENNBAR in core/weekly.js, dessen Kommentar den Grund fuer jedes
   einzelne Feld traegt. Dieselbe Liste hier, weil der Renderer wissen muss,
   ob eine Karte eine Punktreihe oder einen Kippschalter bekommt. */
const AUTO_KEYS = new Set(['archon', 'netracells', 'circuit']);

function renderWeekly(w) {
  weeklyState = w;

  $('weekly-reset-eta').textContent = w.resetEta || 'unknown';
  const wann = w.resetAt
    ? new Date(w.resetAt).toLocaleString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      })
    : '';
  $('weekly-reset-when').textContent = wann;

  $('weekly-content').innerHTML = w.content.map(renderWeeklyContentCard).join('');

  /* Zwei Spalten von Hand statt column-count: nur so lassen sich beide
     unten buendig abschliessen. Der Spaltenumbruch des Browsers verteilt
     zwar gleichmaessig, kennt aber kein "streck die letzte Karte auf den
     Rest" - und genau die paar Pixel Versatz waren das Stoerende.
     Aufgeteilt wird der Reihe nach; die letzte Karte jeder Spalte bekommt
     per CSS flex:1 und fuellt die Differenz. */
  const haelfte = Math.ceil(w.vendors.length / 2);
  const spalten = [w.vendors.slice(0, haelfte), w.vendors.slice(haelfte)];
  $('weekly-vendors').innerHTML = spalten
    .map(sp => `<div class="wk-vcol">${sp.map(renderWeeklyVendorCard).join('')}</div>`)
    .join('');

  document.querySelectorAll('.wk-manual-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      const key = cb.dataset.weeklyKey;
      cb.disabled = true;
      try {
        await window.api.setWeeklyDone(key, weeklyState.resetAt, cb.checked);
        const entry = weeklyState.content.find(c => c.key === key);
        if (entry) entry.manuellErledigt = cb.checked;
        /* $ ist im ganzen Haus ausschliesslich getElementById (siehe
           Kopf der Datei) - fuer einen Attribut-Selektor braucht es
           echtes querySelector, sonst findet das still und leise
           nichts. */
        document.querySelector(`[data-weekly-card="${key}"]`)?.classList.toggle('is-complete', cb.checked);
      } catch { cb.checked = !cb.checked; }
      finally { cb.disabled = false; }
    });
  });

  /* Die Pille zeigt, wie viel diese Woche noch offen ist - Inhalte UND
     Haendler, alles mit einer Restzeit oder einem noch nicht gesetzten
     Haken zaehlt als offen. */
  const nochOffen = e => AUTO_KEYS.has(e.key)
    ? (e.key === 'circuit'
        ? [e.progress?.normal, e.progress?.hard].some(r => r && r.erledigt < r.von)
        : (e.progress ? e.progress.erledigt < e.progress.von : true))
    : (e.eta != null || (e.eintraege !== undefined && !e.manuellErledigt));
  const offen = w.content.filter(nochOffen).length + w.vendors.filter(v => v.eta).length;
  const pille = $('weekly-count');
  if (pille) {
    pille.textContent = offen;
    pille.classList.toggle('hidden', !offen);
  }
}

function setWeeklyError(text) {
  const el = $('weekly-error');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

async function loadWeekly(force = false) {
  const btn = $('btn-weekly-refresh');
  if (btn) { btn.disabled = true; btn.classList.add('is-refreshing'); }
  try {
    const res = await window.api.getWeekly(force);
    if (res && res.ok) { setWeeklyError(''); renderWeekly(res.data); }
    else setWeeklyError((res && res.error) || 'Could not load the weekly rotation');
  } catch (err) {
    setWeeklyError('Could not load the weekly rotation: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('is-refreshing'); }
  }
}

$('btn-weekly-refresh')?.addEventListener('click', () => loadWeekly(true));

/* Content <-> Haendler, dasselbe Muster wie Manager/Katalog im Mastery-Tab. */
const WEEKLY_MODE_HINTS = {
  content: "Missions and modes that reset this week",
  vendors: 'Vendors whose stock or offer changes weekly'
};

function applyWeeklyMode() {
  $('tab-weekly-mode-content')?.classList.toggle('active', weeklyMode === 'content');
  $('tab-weekly-mode-vendors')?.classList.toggle('active', weeklyMode === 'vendors');
  $('weekly-pane-content')?.classList.toggle('active', weeklyMode === 'content');
  $('weekly-pane-vendors')?.classList.toggle('active', weeklyMode === 'vendors');
  $('weekly-mode-hint').textContent = WEEKLY_MODE_HINTS[weeklyMode];
}

document.querySelectorAll('#tab-weekly-mode-content, #tab-weekly-mode-vendors').forEach(btn => {
  btn.onclick = () => { weeklyMode = btn.dataset.mode; applyWeeklyMode(); };
});
applyWeeklyMode();
