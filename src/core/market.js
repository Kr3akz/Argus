/**
 * Preise von warframe.market.
 *
 * EIGENE DROSSELUNG, NICHT DIE AUS ratelimit.js:
 *   ratelimit.js schuetzt vor DEs IP-Sperre, deren Folge ein blockierter
 *   Spiel-Login ist - deshalb teilen sich Profil und Inventar dort einen Topf.
 *   warframe.market ist ein fremder Host ohne diese Kopplung; ein Abruf hier
 *   kann den Spiel-Login nicht gefaehrden. Beides in denselben Topf zu werfen
 *   wuerde das knappe DE-Budget fuer Preisabfragen verbrauchen.
 *   Stattdessen: eine Warteschlange mit Mindestabstand, wie es die
 *   Nutzungsbedingungen von warframe.market verlangen.
 *
 * API-VERSION:
 *   v1 ist abgeschaltet - /v1/items antwortet 404, /v1/items/<slug>/orders
 *   liefert 403. Nachgemessen am 20.08.2026. Wer eine aeltere Anleitung
 *   findet, findet eine tote Schnittstelle.
 *
 * BINDEGLIED ZUM KATALOG:
 *   Jeder Eintrag traegt gameRef - DEs uniqueName, also genau den Schluessel,
 *   unter dem catalog.js seine Items fuehrt. Damit entfaellt jedes Raten ueber
 *   Namensgleichheit ("Gauss Prime Systems" vs "Gauss Prime Systems Blueprint").
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const HOST = 'https://api.warframe.market';
const USER_AGENT = 'Cephalon-Argus/0.1 (persoenlicher Mastery-Planer)';

const ITEM_CACHE  = () => path.join('data', 'market-items.json');
const PRICE_CACHE = () => path.join('data', 'market-prices.json');

/* Die Itemliste aendert sich nur, wenn DE etwas Handelbares hinzufuegt. */
const ITEMS_TTL_MS  = 24 * 60 * 60 * 1000;
/* Preise altern schnell, aber nicht im Minutentakt - und ein Relikt mit sechs
   Belohnungen soll nicht sechs Abrufe pro Blick kosten. */
const PRICE_TTL_MS  = 30 * 60 * 1000;
/* warframe.market erlaubt drei Anfragen je Sekunde. 350 ms Abstand liegt
   darunter und laesst Luft fuer alles andere im Prozess. */
const MIN_GAP_MS = 350;

let items = null;          // { list, bySlug, byGameRef, byName }
let priceCache = null;     // slug -> { fetchedAt, sell, buy, sellers }
let queueTail = Promise.resolve();
let lastRequestAt = 0;

/* Alle Abrufe laufen durch dieselbe Kette, damit sich parallele Aufrufe nicht
   gegenseitig ueberholen und den Mindestabstand aushebeln. */
function queued(task) {
  const run = queueTail.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return task();
  });
  /* Ein Fehlschlag darf die Kette nicht abreissen lassen. */
  queueTail = run.catch(() => {});
  return run;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`warframe.market: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function readCache(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function writeCache(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

/* ------------------------------ Itemliste ------------------------------ */

function indexItems(list) {
  const bySlug = new Map();
  const byGameRef = new Map();
  const byName = new Map();
  for (const it of list) {
    const name = it.i18n?.en?.name || '';
    bySlug.set(it.slug, it);
    if (it.gameRef) byGameRef.set(it.gameRef, it);
    if (name) byName.set(name.toLowerCase(), it);
  }
  return { list, bySlug, byGameRef, byName };
}

/** Handelbare Items inklusive Dukatenwert. Faellt auf den Cache zurueck. */
export async function loadMarketItems({ refresh = false } = {}) {
  if (items && !refresh) return items;

  const cached = await readCache(ITEM_CACHE());
  const fresh = cached && (Date.now() - cached.fetchedAt < ITEMS_TTL_MS);
  if (cached && fresh && !refresh) {
    items = indexItems(cached.list);
    return items;
  }

  try {
    const json = await queued(() => getJson(`${HOST}/v2/items`));
    const list = json.data || [];
    if (!list.length) throw new Error('leere Itemliste');
    await writeCache(ITEM_CACHE(), { fetchedAt: Date.now(), list });
    items = indexItems(list);
  } catch (err) {
    /* Ein alter Stand ist hier deutlich besser als keiner: Namen und
       Dukatenwerte veralten in Monaten, nicht in Stunden. */
    if (cached) {
      items = indexItems(cached.list);
      items.stale = err.message;
    } else {
      throw err;
    }
  }
  return items;
}

/** Markt-Eintrag zu einem Item finden - erst ueber uniqueName, dann ueber den Namen. */
export function findMarketItem(idx, { uniqueName, name } = {}) {
  if (!idx) return null;
  if (uniqueName && idx.byGameRef.has(uniqueName)) return idx.byGameRef.get(uniqueName);
  if (!name) return null;

  const key = name.toLowerCase().trim();
  if (idx.byName.has(key)) return idx.byName.get(key);

  /* Droptabellen und Markt benennen dieselbe Sache unterschiedlich: die
     Tabelle sagt "Trinity Prime Systems Blueprint", der Markt fuehrt manche
     Teile ohne und manche mit "Blueprint". Beide Richtungen probieren, statt
     das Item als unbekannt zu melden. */
  if (key.endsWith(' blueprint')) {
    const without = key.slice(0, -' blueprint'.length);
    if (idx.byName.has(without)) return idx.byName.get(without);
  } else if (idx.byName.has(key + ' blueprint')) {
    return idx.byName.get(key + ' blueprint');
  }
  return null;
}

/* -------------------------------- Preise ------------------------------- */

async function loadPriceCache() {
  if (priceCache) return priceCache;
  const cached = await readCache(PRICE_CACHE());
  priceCache = cached && typeof cached === 'object' ? cached : {};
  return priceCache;
}

let priceSaveTimer = null;
function schedulePriceSave() {
  clearTimeout(priceSaveTimer);
  priceSaveTimer = setTimeout(() => {
    writeCache(PRICE_CACHE(), priceCache).catch(() => {});
  }, 1500);
}

/**
 * Verdichtet die Angebotsliste zu dem, was beim Handeln zaehlt.
 *
 * Nur Verkaeufer im Spiel ("ingame"): ein Angebot von jemandem, der seit drei
 * Tagen offline ist, ist kein Preis, sondern eine Zahl. Genau daran gehen
 * naive Preisanzeigen vorbei, die das billigste Angebot ueberhaupt nehmen.
 * Steht niemand im Spiel, faellt die Auswertung auf alle Angebote zurueck und
 * sagt das ueber online: false.
 */
function summarise(orders) {
  const sell = (orders.sell || []).filter(o => o.type === 'sell' || !o.type);
  const inGame = sell.filter(o => o.user?.status === 'ingame');
  const used = inGame.length ? inGame : sell;

  const prices = used.map(o => o.platinum).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!prices.length) return null;

  const mid = Math.floor(prices.length / 2);
  return {
    min: prices[0],
    median: prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2),
    offers: prices.length,
    online: inGame.length > 0
  };
}

/** Preisbild eines Items. null, wenn der Markt es nicht fuehrt. */
export async function getPrice(slug, { maxAgeMs = PRICE_TTL_MS } = {}) {
  if (!slug) return null;
  const cache = await loadPriceCache();

  const hit = cache[slug];
  if (hit && Date.now() - hit.fetchedAt < maxAgeMs) return hit.price;

  try {
    const json = await queued(() => getJson(`${HOST}/v2/orders/item/${encodeURIComponent(slug)}/top`));
    const price = summarise(json.data || {});
    cache[slug] = { fetchedAt: Date.now(), price };
    schedulePriceSave();
    return price;
  } catch (err) {
    /* Abgelaufen ist besser als nichts - mit Altersangabe, damit die
       Oberflaeche einen alten Preis als solchen zeigen kann. */
    if (hit) return { ...hit.price, stale: true, fetchedAt: hit.fetchedAt };
    if (err.status === 404) {
      cache[slug] = { fetchedAt: Date.now(), price: null };
      schedulePriceSave();
    }
    return null;
  }
}

/** Preise fuer mehrere Items. Nacheinander, die Warteschlange haelt den Takt. */
export async function getPrices(slugs, opts) {
  const out = {};
  for (const slug of [...new Set(slugs.filter(Boolean))]) {
    out[slug] = await getPrice(slug, opts);
  }
  return out;
}
