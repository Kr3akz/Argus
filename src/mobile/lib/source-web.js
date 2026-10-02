/* Unterwegs: die App fragt die oeffentlichen Quellen selbst - dieselben, die
 * Argus am PC fragt (docs/security.md, "Endpoints"), und sie rechnet mit
 * denselben Regeln aus src/core.
 *
 * Wird nur unter https geladen (GitHub Pages) und erst bei Bedarf, per
 * import() aus app.js: zuhause liefert der PC alles fertig, und dort waere
 * das hier nur Ballast.
 *
 * DIE MODULE AUS src/core LIEGEN NEBEN DIESER DATEI UNTER core/ - im Paket fuer
 * GitHub Pages (tools/build-mobile.mjs) wie beim Server am PC
 * (phone-server.js). Im Quellbaum stehen sie in src/core, nicht in
 * src/mobile/core; ohne einen der beiden Wege laedt diese Datei also nicht.
 *
 * Was unterwegs fehlt, ist alles, was am eigenen Konto haengt - Besitz,
 * Mastery, Inventar. Das steht nur am PC; die Ansichten zeigen dann eben den
 * Weltzustand ohne die Haken. */

import { formatWorldState } from '../core/worldstate.js';
import { buildWorldView } from '../core/world-view.js';
import { buildDropRows, searchDrops } from '../core/drop-search.js';
import { liveRelics } from '../core/droptables.js';
import { summariseForTest as summarise } from '../core/market.js';
import * as store from './store.js';

const WORLD_URL = 'https://api.warframestat.us/pc/';
const DROPS_URL = 'https://drops.warframestat.us/data/all.json';
const DROPS_INFO = 'https://drops.warframestat.us/data/info.json';
const WFM = 'https://api.warframe.market';

/* Ohne eigene Kopfzeilen: jede zusaetzliche (auch User-Agent) macht aus der
   Abfrage eine mit Voranfrage (CORS-Preflight), und die beantworten nicht
   alle Quellen. Der PC schickt seine Kennung mit, das Handy nicht. */
async function getJson(url, timeoutMs = 12000) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store', credentials: 'omit' });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'The source took too long to answer' : 'No connection to the source');
  }
  if (!res.ok) throw new Error(`The source answered with HTTP ${res.status}`);
  return res.json();
}

/** Der Live-Tracker - Weltzustand plus Uhren, ohne Konto. */
export async function world() {
  const data = await getJson(WORLD_URL);
  const ws = formatWorldState(data, { source: 'warframestat' });
  return buildWorldView(ws, {});
}

/* ----------------------------- Droptabellen ----------------------------- */

let rows = null;
let rowsHash = null;

/**
 * DEs Droptabellen: rund 6 MB beim ersten Mal, danach aus dem Speicher des
 * Browsers, bis DE sie aendert (info.json traegt dafuer einen Hash - dieselbe
 * Pruefung wie am PC in droptables.js).
 */
async function loadRows(onStatus = () => {}) {
  let info = null;
  try { info = await getJson(DROPS_INFO, 6000); } catch { /* dann eben der Stand im Speicher */ }
  if (rows && (!info || info.hash === rowsHash)) return rows;

  const box = await caches.open('argus-drops');
  const meta = store.get('drops.meta');
  let res = await box.match(DROPS_URL);
  if (!res || (info?.hash && meta?.hash !== info.hash)) {
    onStatus('Downloading the drop tables (about 6 MB, only this once) …');
    try {
      const frisch = await fetch(DROPS_URL, { signal: AbortSignal.timeout(60000), credentials: 'omit' });
      if (!frisch.ok) throw new Error(`HTTP ${frisch.status}`);
      await box.put(DROPS_URL, frisch.clone());
      store.set('drops.meta', { hash: info?.hash || null, at: Date.now() });
      res = frisch;
    } catch (err) {
      if (!res) throw new Error('The drop tables could not be downloaded. Check your connection.');
    }
  }
  onStatus('Reading the drop tables …');
  const de = await res.json();
  rows = buildDropRows(de, { live: liveRelics(de), wf: [] });
  rowsHash = info?.hash || meta?.hash || null;
  return rows;
}

export async function drops(opts, onStatus) {
  const alle = await loadRows(onStatus);
  const r = searchDrops(alle, { ...opts, sort: 'match' });
  return {
    rows: r.rows.slice(0, 120),
    total: r.total,
    shown: Math.min(r.total, 120),
    fetchedAt: store.get('drops.meta')?.at || null
  };
}

/* -------------------------------- Preise -------------------------------- */

/* Die Itemliste von warframe.market einmal am Tag - Namen und Dukaten
   aendern sich in Monaten, nicht in Stunden. */
let markt = null;

async function marketItems() {
  if (markt) return markt;
  const alt = store.get('wfm.items');
  if (alt && Date.now() - alt.at < 24 * 3600 * 1000) return (markt = alt.list);
  const json = await getJson(`${WFM}/v2/items`, 15000);
  const list = (json.data || []).map(it => ({
    slug: it.slug,
    name: it.i18n?.en?.name || it.slug,
    thumb: it.i18n?.en?.thumb ? `https://warframe.market/static/assets/${it.i18n.en.thumb}` : null,
    maxRank: it.maxRank ?? null,
    ducats: it.ducats ?? null
  }));
  store.set('wfm.items', { at: Date.now(), list });
  return (markt = list);
}

export async function marketSearch(q) {
  const s = String(q || '').toLowerCase().trim();
  if (s.length < 2) return [];
  const list = await marketItems();
  return list
    .map(it => ({ it, at: it.name.toLowerCase().indexOf(s) }))
    .filter(x => x.at >= 0)
    .sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) || a.it.name.length - b.it.name.length)
    .slice(0, 20)
    .map(x => ({ slug: x.it.slug, name: x.it.name, image: x.it.thumb, maxRank: x.it.maxRank, ducats: x.it.ducats }));
}

/** Dieselbe Rechnung wie am PC (market.js): nur Verkaeufer im Spiel, Ausreisser nach unten weg. */
export async function price(slug, rank = null) {
  if (!/^[a-z0-9_]{1,100}$/.test(String(slug))) throw new Error('Unknown item');
  const url = `${WFM}/v2/orders/item/${encodeURIComponent(slug)}/top` + (rank == null ? '' : `?rank=${encodeURIComponent(rank)}`);
  const json = await getJson(url);
  return summarise(json.data || {});
}
