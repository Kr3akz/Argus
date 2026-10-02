/* Argus auf dem Handy - Start, Reiter, Daten und die Verbindung zum PC.
 *
 * EINE APP, ZWEI WEGE ZU DEN DATEN:
 *   'web'  unter https (GitHub Pages, installiert auf dem Home-Bildschirm):
 *          Live-Tracker und Droptabellen aus den oeffentlichen Quellen, Push-
 *          Meldungen vom PC. Laeuft ueberall, auch ohne PC.
 *   'pc'   unter http vom PC im Heimnetz (core/phone-server.js): alles kommt
 *          von Argus am PC, samt Foundry, Zielen, Inventar und Preisen.
 *   Welcher Weg gilt, entscheidet allein die Adresse - dieselben Dateien
 *   laufen an beiden Orten.
 *
 * Fuer die Entwicklung schaltet ?mode=web auf http://localhost den
 * Unterwegs-Weg ein (localhost zaehlt als sicherer Ursprung). */

import { esc, tick, Icon } from './lib/ui.js';
import * as store from './lib/store.js';
import * as pairing from './lib/pairing.js';
import * as pc from './lib/source-pc.js';
import * as Live from './views/live.js';
import * as Foundry from './views/foundry.js';
import * as Inv from './views/inventory.js';
import * as Drops from './views/drops.js';
import * as More from './views/more.js';

const MODE = location.protocol === 'https:' || new URLSearchParams(location.search).get('mode') === 'web' ? 'web' : 'pc';

let web = null;
const loadWeb = async () => (web ??= await import('./lib/source-web.js'));

const $ = id => document.getElementById(id);
const main = $('view');

const TABS = [
  { key: 'live', label: 'Live', icon: Icon.live },
  { key: 'foundry', label: 'Foundry', icon: Icon.foundry },
  { key: 'inventory', label: 'Inventory', icon: Icon.inventory },
  { key: 'drops', label: 'Drops', icon: Icon.drops },
  { key: 'more', label: 'More', icon: Icon.more }
];

/* Was die Ansichten sich ueber einen Neustart hinweg merken - gewaehlte
   Unterseite, Filter. Suchtexte nicht: die gelten fuer den Moment. */
const MERKEN = ['fissureKind', 'fissureTier', 'relicTier', 'dropMode'];
const st = Object.fromEntries(Object.entries(store.get('ui', {})).filter(([k]) => MERKEN.includes(k)));
const merken = () => store.set('ui', Object.fromEntries(MERKEN.map(k => [k, st[k]])));

/* Zustand fuer "More" im Unterwegs-Weg. */
/* registerUrl steht auch im Speicher: "Connect to ..." oeffnet eine Seite
   des PCs, und iOS laedt die App beim Zurueckkommen oft neu - ohne den
   Speicher fing man dann wieder bei "Turn on notifications" an. */
const env = {
  subscribed: false, registerUrl: store.get('push.registerUrl') || null,
  confirmedAt: store.get('push.confirmedAt'), copied: false, inbox: []
};

/* ------------------------------- Routen ------------------------------- */

function parseRoute() {
  /* Frisch aus dem QR-Code steht #pair=... in der Adresse - dann geht es um
     die Kopplung, also "More". */
  if (/^#pair=/.test(location.hash)) return { tab: 'more', sub: null };
  const [tab, sub] = pc.routeHash(location.hash).split('/');
  return { tab: TABS.some(t => t.key === tab) ? tab : 'live', sub: sub || null };
}
let route = parseRoute();

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/* ------------------------------- Daten ------------------------------- */

const SOURCES = {
  world: () => (MODE === 'pc' ? pc.world() : loadWeb().then(w => w.world())),
  dashboard: () => pc.dashboard(),
  foundry: () => pc.foundry(),
  inventory: () => pc.inventory(),
  hello: () => pc.hello()
};
/* Wie lange eine Antwort als frisch gilt. Der Weltzustand aendert sich mit
   jedem neuen Riss; die Uhren darin zaehlen ohnehin selbst (ui.tick). */
const MAX_AGE = { world: 60000, dashboard: 120000, foundry: 60000, inventory: 300000, hello: 300000 };

const memo = new Map();
const inflight = new Map();

/**
 * Die Daten zu einem Namen - sofort, was da ist (auch einen alten Stand aus
 * dem letzten Start), und im Hintergrund frisch, wenn es nicht mehr frisch
 * ist. Ist der frische Stand da, zeichnet sich die Seite neu.
 */
function data(name) {
  let m = memo.get(name);
  if (!m) {
    const alt = store.recall(`${MODE}.${name}`);
    if (alt) { m = { data: alt.data, at: alt.at, stale: true }; memo.set(name, m); }
  }
  if (!m || m.stale || Date.now() - m.at > MAX_AGE[name]) refresh(name);
  return m || null;
}

function refresh(name) {
  if (inflight.has(name)) return inflight.get(name);
  const p = SOURCES[name]()
    .then(d => {
      memo.set(name, { data: d, at: Date.now(), stale: false });
      store.remember(`${MODE}.${name}`, d);
    })
    .catch(err => {
      const m = memo.get(name);
      const fehler = { error: err.message, unpaired: err instanceof pc.Unpaired };
      memo.set(name, m ? { ...m, stale: true, ...fehler } : { data: null, at: 0, stale: true, ...fehler });
    })
    .finally(() => {
      inflight.delete(name);
      busy();
      render();
    });
  inflight.set(name, p);
  busy();
  return p;
}

function busy() {
  const btn = $('btn-refresh');
  if (btn) btn.classList.toggle('spin', inflight.size > 0);
}

/* Welche Quellen die aktuelle Seite braucht - fuer den Knopf oben rechts. */
function quellenDerSeite() {
  if (route.tab === 'live') return ['world'];
  if (MODE !== 'pc') return [];
  if (route.tab === 'foundry') return (route.sub || 'foundry') === 'goals' ? ['dashboard'] : ['foundry'];
  if (route.tab === 'inventory') return (route.sub || 'relics') === 'prices' ? [] : ['inventory'];
  if (route.tab === 'more') return ['hello'];
  return [];
}

/* ----------------------------- Bausteine ----------------------------- */

function toast(text, ms = 3200) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), ms);
}

const laden = text => `<div class="empty"><p>${esc(text || 'Loading …')}</p></div>`;

function fehlerSeite(m, was) {
  if (m?.unpaired) {
    return `<div class="empty"><div class="big">🔗</div><h3>Not paired</h3><p>${esc(m.error)}</p>
      <button class="btn primary" data-go="#more">How to pair</button></div>`;
  }
  return `<div class="empty"><div class="big">⚠</div><h3>${esc(was)} is not available</h3><p>${esc(m?.error || '')}</p>
    <button class="btn primary" data-act="retry">Try again</button></div>`;
}

/* Unterwegs: was nur am PC steht - je Seite ein eigener Satz, damit nicht
   "Your the foundry" aus einem Baukasten herausfaellt. */
/* Titel, Text, und wohin der Knopf in der Ansicht vom PC springt. */
const NUR_AM_PC = {
  foundry: ['The foundry lives on your PC', 'What is building and when it is done comes from the game on your PC.',
            'foundry', 'Open foundry'],
  goals: ['Your goals live on your PC', 'Your goals and the shopping list come from Argus on your PC.',
          'foundry/goals', 'Open goals'],
  inventory: ['Your inventory lives on your PC', 'Relics, prime sets, parts and mods come from the game on your PC.',
              'inventory/relics', 'Open inventory']
};

/* Ein Knopf in die Ansicht vom PC - gleich an der richtigen Stelle, nicht
   erst auf der Startseite. Ohne Kopplung fuehrt er zum Koppeln. */
function zumPc(ziel, label, klasse = 'primary') {
  const p = pairing.current();
  return p
    ? `<a class="btn ${klasse}" href="${esc(pairing.pcViewUrl(p, ziel))}" target="_blank" rel="noopener">${Icon.pc(18)} ${esc(label)}</a>`
    : `<button class="btn ${klasse}" data-go="#more">Pair with your PC</button>`;
}

function pcNoetig(was) {
  const [titel, text, ziel, label] = NUR_AM_PC[was];
  return `<div class="empty"><div class="big">🖥</div><h3>${esc(titel)}</h3>
    <p>${esc(text)}</p>
    ${zumPc(ziel, label)}
    ${pairing.current() ? '<p class="muted small" style="margin:12px auto 0">Works at home, in the same Wi-Fi as your PC.</p>' : ''}</div>`;
}

/** Ein Hinweis ueber dem Inhalt, wenn er nicht frisch ist. */
function standHinweis(m) {
  if (!m?.stale || !m.error || !m.data) return '';
  const wann = m.at ? new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="note warn">Showing the state from ${esc(wann)} — ${esc(m.error)}</div>`;
}

/* ------------------------------ Ansichten ------------------------------ */

function seiteLive() {
  const m = data('world');
  if (!m?.data) return m?.error ? fehlerSeite(m, 'The world state') : laden('Loading the world state …');
  const page = Live.ALIASES[route.sub] || route.sub || 'overview';
  return standHinweis(m) + Live.render(m.data, page, st) + Live.footnote(m.data, { at: m.at, source: MODE });
}

function seiteFoundry() {
  if (MODE !== 'pc') return pcNoetig((route.sub || 'foundry') === 'goals' ? 'goals' : 'foundry');
  if ((route.sub || 'foundry') === 'goals') {
    const m = data('dashboard');
    if (!m?.data) return m?.error ? fehlerSeite(m, 'Your goals') : laden();
    return standHinweis(m) + Foundry.renderGoals(m.data, st);
  }
  const m = data('foundry');
  if (!m?.data) return m?.error ? fehlerSeite(m, 'The foundry') : laden();
  return standHinweis(m) + Foundry.renderFoundry(m.data);
}

function seiteInventar() {
  const page = route.sub || (MODE === 'pc' ? 'relics' : 'prices');
  if (page === 'prices') {
    return {
      head: (MODE === 'pc' ? '' : `<div class="note pc-note"><span>Your relics, sets, parts and mods are on your PC.
          Price checks work anywhere.</span>${zumPc('inventory/relics', 'Open inventory', 'small')}</div>`)
        + Inv.priceSearch(st),
      body: Inv.renderPrices(st)
    };
  }
  if (MODE !== 'pc') return pcNoetig('inventory');
  const m = data('inventory');
  if (!m?.data) return m?.error ? fehlerSeite(m, 'Your inventory') : laden('Reading your inventory on the PC …');
  const inv = m.data;
  if (inv.empty) {
    return `<div class="empty"><div class="big">📦</div><h3>No inventory yet</h3>
      <p>Argus on your PC has not read your inventory. Turn on inventory access there and start the game once.</p></div>`;
  }
  const kopf = standHinweis(m) + Inv.wallet(inv);
  if (page === 'sets') return { head: kopf + Inv.setSearch(st), body: Inv.renderSets(inv, st) + Inv.stand(inv) };
  if (page === 'parts') return { head: kopf + Inv.partSearch(st), body: Inv.renderParts(inv, st) + Inv.stand(inv) };
  if (page === 'mods') return kopf + Inv.renderMods(inv) + Inv.stand(inv);
  return { head: kopf + Inv.relicHead(st), body: Inv.renderRelics(inv, st) + Inv.stand(inv) };
}

function seiteDrops() {
  return { head: Drops.head(st), body: Drops.body(st) };
}

function seiteMehr() {
  if (MODE === 'pc') {
    const m = data('hello');
    if (!pc.hasToken()) return unverbunden();
    if (!m?.data) return m?.error ? fehlerSeite(m, 'Argus on your PC') : laden();
    const h = m.data;
    return More.render({
      mode: 'pc', hello: h, types: st.types || h.device?.types,
      push: pairing.pushSupport(),
      appLink: pairing.pairingLink(h.appUrl, {
        name: h.pc?.name, url: location.origin, key: h.pc?.key, token: pc.token(), id: h.device?.id
      })
    });
  }
  const p = pairing.current();
  return More.render({
    mode: 'web',
    pc: p,
    pcViewUrl: p ? pairing.pcViewUrl(p) : null,
    push: pairing.pushSupport(),
    ...env
  });
}

/* Zuhause ohne Kennung: die Seite wurde direkt geoeffnet statt aus der App. */
function unverbunden() {
  return `<div class="empty"><div class="big">🔗</div><h3>Open this from the Argus app</h3>
    <p>This page comes from Argus on your PC. Pair your phone under <b>Settings → Phone</b> on the PC, then use
      <b>Open my PC</b> in the Argus app.</p></div>`;
}

const SEITEN = { live: seiteLive, foundry: seiteFoundry, inventory: seiteInventar, drops: seiteDrops, more: seiteMehr };

function unterseiten() {
  if (route.tab === 'live') {
    const c = Live.counts(memo.get('world')?.data);
    return Live.PAGES.map(([k, label]) => [k, label, c[k]]);
  }
  if (route.tab === 'foundry') {
    const c = MODE === 'pc' ? Foundry.counts({ foundry: memo.get('foundry')?.data, dashboard: memo.get('dashboard')?.data }) : {};
    return Foundry.PAGES.map(([k, label]) => [k, label, c[k]]);
  }
  if (route.tab === 'inventory') return (MODE === 'pc' ? Inv.PAGES_PC : Inv.PAGES_WEB).map(([k, label]) => [k, label]);
  return [];
}

/* ------------------------------- Zeichnen ------------------------------- */

let letzterKopf = null;
let letzteRoute = null;

function render() {
  const tab = TABS.find(t => t.key === route.tab);
  $('top-title').textContent = route.tab === 'live' ? 'Argus' : tab.label;

  const quelle = $('source');
  const welt = memo.get('world');
  if (MODE === 'pc') {
    const name = memo.get('hello')?.data?.pc?.name;
    quelle.textContent = name ? `At home · ${name}` : 'At home';
    quelle.className = 'source pc';
  } else {
    quelle.textContent = welt?.stale && welt?.error ? 'Offline' : 'On the go';
    quelle.className = `source${welt?.stale && welt?.error ? ' stale' : ''}`;
  }

  const subs = unterseiten();
  const aktiv = route.sub || subs[0]?.[0];
  $('subnav').innerHTML = subs.map(([k, label, n]) =>
    `<button class="${k === aktiv || Live.ALIASES[route.sub] === k ? 'active' : ''}" data-go="#${route.tab}/${k}">${esc(label)}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('');

  $('tabbar').innerHTML = TABS.map(t =>
    `<button class="${t.key === route.tab ? 'active' : ''}" data-go="#${t.key}" aria-label="${t.label}">${t.icon(25)}<span>${t.label}</span></button>`).join('');

  /* Kopf und Rumpf getrennt: ein Suchfeld im Kopf wird nicht neu gezeichnet,
     solange jemand darin tippt - sonst verliert es auf dem iPhone bei jedem
     Buchstaben den Fokus, und die Tastatur klappt zu. */
  const out = SEITEN[route.tab]();
  const { head = '', body = '' } = typeof out === 'string' ? { body: out } : out;
  const routeKey = `${route.tab}/${route.sub}`;
  let kopfEl = $('view-head'), rumpfEl = $('view-body');
  if (!kopfEl || letzteRoute !== routeKey) {
    main.innerHTML = '<div id="view-head"></div><div id="view-body"></div>';
    kopfEl = $('view-head');
    rumpfEl = $('view-body');
    letzterKopf = null;
  }
  const tippt = kopfEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (head !== letzterKopf && !tippt) {
    kopfEl.innerHTML = head;
    letzterKopf = head;
  }
  rumpfEl.innerHTML = body;
  if (letzteRoute !== routeKey) {
    window.scrollTo(0, 0);
    if (route.sub === 'worlds') $('worlds')?.scrollIntoView();
  }
  letzteRoute = routeKey;
  tick(main);
}

/* ------------------------------- Suchen ------------------------------- */

let suchTimer = null;
function suchen(id, wert) {
  if (id === 'q-relics') { st.relicQuery = wert; render(); return; }
  if (id === 'q-sets') { st.setQuery = wert; render(); return; }
  if (id === 'q-parts') { st.partQuery = wert; render(); return; }
  clearTimeout(suchTimer);
  if (id === 'q-drops') {
    st.dropQuery = wert;
    suchTimer = setTimeout(dropSuche, 300);
  }
  if (id === 'q-price') {
    st.priceQuery = wert;
    suchTimer = setTimeout(preisSuche, 350);
  }
}

async function dropSuche() {
  const q = (st.dropQuery || '').trim();
  if (q.length < 2) { st.dropResult = null; st.dropError = null; render(); return; }
  const anfrage = Symbol('drop');
  dropSuche.letzte = anfrage;
  try {
    const opts = { q, mode: st.dropMode || 'item' };
    const res = MODE === 'pc'
      ? await pc.drops(opts)
      : await (await loadWeb()).drops(opts, status => { st.dropStatus = status; render(); });
    if (dropSuche.letzte !== anfrage) return;
    st.dropResult = res;
    st.dropError = res.error || null;
  } catch (err) {
    if (dropSuche.letzte !== anfrage) return;
    st.dropError = err.message;
  }
  st.dropStatus = null;
  render();
}

const markt = () => (MODE === 'pc' ? Promise.resolve(pc) : loadWeb());

async function preisSuche() {
  const q = (st.priceQuery || '').trim();
  st.priceSearchError = null;
  if (q.length < 2) { st.priceHits = []; render(); return; }
  st.priceSearching = true;
  try {
    st.priceHits = await (await markt()).marketSearch(q);
  } catch (err) {
    st.priceHits = [];
    st.priceSearchError = MODE === 'pc' ? err.message
      : `warframe.market could not be reached from this phone (${err.message}). At home, the price check works through your PC.`;
  }
  st.priceSearching = false;
  render();
}

async function preisHolen(hit) {
  st.pricePick = hit;
  st.price = null;
  st.priceError = null;
  st.priceLoading = true;
  render();
  try {
    st.price = await (await markt()).price(hit.slug);
  } catch (err) {
    st.priceError = err.message;
  }
  st.priceLoading = false;
  render();
}

/* ------------------------------- Aktionen ------------------------------- */

async function aktion(act, val, el) {
  switch (act) {
    case 'retry':
      for (const q of quellenDerSeite()) refresh(q);
      return;
    case 'fissure-kind': st.fissureKind = val; merken(); return render();
    case 'fissure-tier': st.fissureTier = val || null; merken(); return render();
    case 'relic-tier': st.relicTier = val || null; merken(); return render();
    case 'goals-done': st.showDone = !st.showDone; return render();
    case 'drop-mode':
      st.dropMode = val; merken();
      render();
      return dropSuche();
    case 'price-pick': return preisHolen(st.priceHits?.[Number(val)]);
    case 'type-toggle': {
      const types = { ...(st.types || memo.get('hello')?.data?.device?.types || {}) };
      types[val] = types[val] === false;
      st.types = types;
      render();
      try { st.types = await pc.setTypes({ [val]: types[val] }); toast('Saved'); }
      catch (err) { toast(err.message); }
      return render();
    }
    case 'paste-code': return codeEinfuegen();
    case 'copy-code': {
      const p = pairing.current();
      try {
        await navigator.clipboard.writeText(p.code);
        env.copied = true;
        toast('Pairing code copied');
      } catch {
        toast('Copying did not work — long-press the address bar and copy the whole address instead.', 6000);
      }
      return render();
    }
    case 'push-on': return pushEinschalten(el);
    case 'unpair': {
      if (!confirm('Unpair this phone? Remove it on the PC too, under Settings → Phone.')) return;
      const sub = await pairing.existingSubscription();
      await sub?.unsubscribe().catch(() => {});
      pairing.forget();
      store.del('push.confirmedAt');
      Object.assign(env, { subscribed: false, registerUrl: null, confirmedAt: null });
      store.del('push.registerUrl');
      return render();
    }
    default:
  }
}

async function codeEinfuegen() {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* Feld zeigen */ }
  const p = text ? pairing.parseCode(text) : null;
  if (p) return gekoppelt(p, text);
  const feld = $('code-input');
  if (feld) {
    feld.classList.remove('hidden');
    feld.focus();
    toast(text ? 'That is not a pairing code from Argus.' : 'Paste the code into the field.');
  }
}

function gekoppelt(p, code, { navigieren = true } = {}) {
  pairing.save({ ...p, code: String(code).replace(/^.*#pair=/, '').trim() });
  env.registerUrl = null;
  store.del('push.registerUrl');
  toast(`Paired with ${p.name}`);
  if (navigieren) go('#more');
}

async function pushEinschalten(btn) {
  const p = pairing.current();
  if (!p) return;
  if (btn) btn.disabled = true;
  try {
    const sub = await pairing.subscribe(p);
    env.subscribed = true;
    env.registerUrl = pairing.registerUrl(p, sub);
    env.confirmedAt = null;
    store.set('push.registerUrl', env.registerUrl);
    store.del('push.confirmedAt');
  } catch (err) {
    toast(err.message, 6000);
  }
  render();
}

/* ------------------------------ Ereignisse ------------------------------ */

document.addEventListener('click', e => {
  const zu = e.target.closest('[data-go]');
  if (zu) { e.preventDefault(); go(zu.dataset.go); return; }
  const a = e.target.closest('[data-act]');
  if (a && !a.disabled) {
    /* Verweise (Connect, Open my PC) oeffnen sich selbst - die Aktion dazu
       merkt sich nur, dass man unterwegs war. */
    if (a.tagName !== 'A') e.preventDefault();
    aktion(a.dataset.act, a.dataset.val, a);
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'code-input') {
    const p = pairing.parseCode(t.value);
    if (p) gekoppelt(p, t.value);
    return;
  }
  if (/^q-/.test(t.id)) suchen(t.id, t.value);
});

$('btn-refresh').innerHTML = Icon.refresh(20);
$('btn-refresh').addEventListener('click', () => {
  const q = quellenDerSeite();
  if (!q.length) { render(); return; }
  for (const name of q) refresh(name);
});

window.addEventListener('hashchange', () => {
  route = parseRoute();
  render();
});

/* Zurueck in der App (vom Sperrbildschirm, aus dem Fenster des PCs): die
   Seite nachladen, die man sieht - und nachsehen, ob die Probemeldung
   inzwischen da war. */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (MODE === 'web') await swZustand();
  for (const q of quellenDerSeite()) {
    const m = memo.get(q);
    if (!m || Date.now() - m.at > 15000) refresh(q);
  }
  render();
});

/* --------------------------- Service Worker --------------------------- */

/* Was der Service Worker festhaelt, waehrend die App zu ist: die letzten
   Meldungen und eine neue Adresse des PCs (siehe sw.js). */
async function swZustand() {
  try {
    const box = await caches.open('argus-state');
    const inbox = await box.match('state/inbox').then(r => (r ? r.json() : []));
    env.inbox = Array.isArray(inbox) ? inbox : [];
    const neu = await box.match('state/pc').then(r => (r ? r.json() : null));
    if (neu?.url) pairing.updateUrl(neu.url);
    const letzte = env.inbox[0]?.ts;
    if (letzte && (!env.confirmedAt || letzte > env.confirmedAt)) {
      env.confirmedAt = letzte;
      store.set('push.confirmedAt', letzte);
    }
  } catch { /* ohne Speicher eben ohne Liste */ }
  env.subscribed = !!(await pairing.existingSubscription());
}

function serviceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  /* Uebernimmt eine neue Fassung die Seite (sw.js: skipWaiting, claim), wird
     einmal neu geladen - sonst saehe man sie erst beim uebernaechsten Start.
     Beim allerersten Start gibt es keinen Vorgaenger, da bleibt alles stehen. */
  const hatteVorgaenger = !!navigator.serviceWorker.controller;
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteVorgaenger || neuGeladen) return;
    neuGeladen = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker:', err.message));
  navigator.serviceWorker.addEventListener('message', async e => {
    const m = e.data || {};
    if (m.type === 'push') {
      if (m.payload?.pc) pairing.updateUrl(m.payload.pc);
      env.confirmedAt = Date.now();
      store.set('push.confirmedAt', env.confirmedAt);
      await swZustand();
      if (route.tab === 'more') render();
    }
    if (m.type === 'nav' && m.nav) go(`#${m.nav}`);
  });
}

/* --------------------------------- Start --------------------------------- */

async function start() {
  if (MODE === 'web') {
    serviceWorker();
    /* Aus dem QR-Code: #pair=... in der Adresse.
     *
     * AUF DEM iPHONE IM BROWSER BLEIBT ER STEHEN: "Zum Home-Bildschirm" nimmt
     * die Adresse mit, auf der man gerade steht (das Manifest hat dafuer
     * absichtlich kein start_url), und die installierte App findet den Code
     * dann von selbst - ihr Speicher ist ein anderer als der von Safari. Der
     * Code steht hinter #, geht also nie an GitHub. Klappt es nicht, bleibt
     * "Copy pairing code".
     *
     * Ueberall sonst wird die Adresse geputzt. Und startet die installierte
     * App immer wieder mit demselben, laengst benutzten Code, fuehrt das
     * nicht jedes Mal nach "More", sondern zum Live-Tracker. */
    const code = /#pair=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1];
    if (code) {
      const p = pairing.parseCode(code);
      const neu = !!p && pairing.current()?.token !== p.token;
      if (neu) gekoppelt(p, code, { navigieren: false });
      if (!pairing.pushSupport().needsInstall) {
        history.replaceState(null, '', `${location.pathname}${location.search}#${neu || !p ? 'more' : 'live'}`);
      }
      route = parseRoute();
    }
    await swZustand();
  } else {
    pc.adoptToken();
    if (pc.hasToken()) data('hello');
  }
  render();

  /* Eine Uhr fuer alle Countdowns, und alle 30 Sekunden ein Blick, ob die
     sichtbare Seite neue Daten braucht (data() fragt nur, wenn sie alt sind). */
  setInterval(() => tick(main), 1000);
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    for (const q of quellenDerSeite()) {
      const m = memo.get(q);
      if (m && Date.now() - m.at > MAX_AGE[q]) refresh(q);
    }
  }, 30000);
}

start();
