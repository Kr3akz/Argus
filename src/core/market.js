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
 *   Nutzungsbedingungen von warframe.market verlangen. Sie liegt seit der
 *   Order-Anbindung in wfm-http.js, damit Preise, Orders und Auktionen sich
 *   EINE Kette teilen statt drei nebeneinander zu fahren.
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
import { dataFile } from './paths.js';
import { queued } from './wfm-http.js';

const HOST = 'https://api.warframe.market';
const USER_AGENT = 'Argus/0.1 (persoenlicher Mastery-Planer)';

const ITEM_CACHE  = () => dataFile('market-items.json');
const PRICE_CACHE = () => dataFile('market-prices.json');

/* Die Itemliste aendert sich nur, wenn DE etwas Handelbares hinzufuegt. */
const ITEMS_TTL_MS  = 24 * 60 * 60 * 1000;
/* Preise altern schnell, aber nicht im Minutentakt - und ein Relikt mit sechs
   Belohnungen soll nicht sechs Abrufe pro Blick kosten. */
const PRICE_TTL_MS  = 30 * 60 * 1000;

let items = null;          // { list, bySlug, byGameRef, byName }
let priceCache = null;     // slug -> { fetchedAt, sell, buy, sellers }
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
  /* Orders und Auktionen verweisen ueber itemId auf den Markt-Eintrag, nicht
     ueber den Slug - ohne diesen Index waere jede Orderzeile eine Suche
     ueber 3.800 Eintraege. */
  const byId = new Map();
  for (const it of list) {
    const name = it.i18n?.en?.name || '';
    bySlug.set(it.slug, it);
    if (it.id) byId.set(it.id, it);
    if (it.gameRef) byGameRef.set(it.gameRef, it);
    if (name) byName.set(name.toLowerCase(), it);
  }
  return { list, bySlug, byId, byGameRef, byName };
}

/**
 * Bildadresse eines Markt-Eintrags.
 *
 * warframe.market liefert im Item nur den relativen Pfad; der Host steht
 * nirgends in der Antwort. thumb ist die 128er-Fassung und reicht fuer
 * Listenzeilen - icon waere das Vielfache an Bytes fuer dieselbe Kachel.
 * Die Adresse muss in der CSP von index.html stehen, sonst laedt sie nicht.
 */
export function marketImage(item, { full = false } = {}) {
  const rel = full ? item?.i18n?.en?.icon : (item?.i18n?.en?.thumb || item?.i18n?.en?.icon);
  return rel ? `https://warframe.market/static/assets/${rel}` : null;
}

/**
 * Das Abzeichen, das ein Teil von seinem Set unterscheidet.
 *
 * WARUM ES DAS BRAUCHT: Das Grundbild ist bei allen Teilen eines Primes
 * DASSELBE. "Nidus Prime Systems Blueprint" traegt dieselbe Illustration wie
 * "Nidus Prime Set" - unterschieden wird ausschliesslich ueber dieses zweite
 * Bild, das warframe.market in die Ecke legt:
 *
 *   Nidus Prime Blueprint            blueprint_128x128.png
 *   Nidus Prime Systems Blueprint    prime_systems_128x128.png
 *   Nidus Prime Neuroptics Blueprint prime_helmet_128x128.png
 *   Nidus Prime Chassis Blueprint    prime_chassis_128x128.png
 *   Nidus Prime Set                  keins
 *
 * Ohne diese Ebene sehen in einer Trefferliste alle fuenf Zeilen gleich aus,
 * und die Auswahl haengt allein am Text. 787 der 3840 Markt-Items haben eins;
 * wer keins hat, ist selbst schon eindeutig.
 */
export function marketSubIcon(item) {
  const rel = item?.i18n?.en?.subIcon;
  return rel ? `https://warframe.market/static/assets/${rel}` : null;
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

/**
 * Was ueber diesen Slug auf der Platte steht - OHNE Netz, sofort.
 *
 * WOZU ES DAS GIBT: getPrice haelt eine Frist von 30 Minuten. Was aelter ist,
 * gilt dort als nicht vorhanden und kostet einen Abruf. Fuer den Dukaten-Tab
 * war das nie ein Thema - der liest die Datei direkt und zeigt jeden Eintrag,
 * egal wie alt (siehe readPriceCache in main.js). Die Preisschilder im Spiel
 * gingen dagegen ueber getPrice und standen deshalb vor einer Uhr: nachgemessen
 * waren von 751 gemerkten Preisen nur 119 innerhalb der Frist, der Median lag
 * bei acht Tagen. Vier Karten hiessen also fast immer vier Netzabrufe - und
 * zwar in den fuenfzehn Sekunden, die der Bildschirm ueberhaupt offen ist.
 *
 * Ein acht Tage alter Platinpreis beantwortet "lohnt sich das oder mache ich
 * Dukaten draus" genauso gut wie ein frischer. Er kommt deshalb SOFORT auf das
 * Schild, mit stale-Marke, und der frische loest ihn ab, sobald er da ist.
 *
 * null heisst hier "darueber ist nichts bekannt" - auch dann, wenn der Markt
 * das Teil gar nicht fuehrt und als Preis null gemerkt wurde.
 */
export async function cachedPrice(slug, { maxAgeMs = PRICE_TTL_MS } = {}) {
  if (!slug) return null;
  const cache = await loadPriceCache();

  const hit = cache[slug];
  if (!hit || !hit.price) return null;
  if (Date.now() - hit.fetchedAt < maxAgeMs) return hit.price;
  return { ...hit.price, stale: true, fetchedAt: hit.fetchedAt };
}

/* Nur ein Vorlauf gleichzeitig. Ein zweiter wuerde sich mit dem ersten in
   dieselbe Warteschlange stellen und beide verdoppelt langsam machen. */
let vorlauf = null;

/**
 * Preise im Voraus holen, solange niemand auf sie wartet.
 *
 * WARUM DAS DIE EIGENTLICHE ANTWORT IST: Auf dem Belohnungsbildschirm stehen
 * bis zu vier Karten, und drei davon stammen aus den Relikten der Mitspieler.
 * Welche das sind, steht nirgends - das Log nennt nur die ANZAHL der Spieler,
 * nie ihre Items (siehe logwatch.js). Das eigene Relikt vorzuwaermen deckt
 * also genau eine der vier Karten ab.
 *
 * Die Menge aller ueberhaupt moeglichen Karten ist aber klein: nachgezaehlt
 * an data/relic-drops.json sind es 596 verschiedene Belohnungen ueber saemtliche
 * Relikte, 425 bis 441 je Aera. Wer die Aera kennt - und die steht fest, sobald
 * ein Relikt eingelegt ist -, kann jede Karte abdecken, die auf diesem
 * Bildschirm erscheinen kann. Bei 350 ms Abstand sind das rund zweieinhalb
 * Minuten Hintergrundarbeit, und eine Rissmission dauert laenger.
 *
 * Abgebrochen wird ueber stop(): wer aus der Mission zurueck ist, braucht den
 * Rest nicht mehr, und die Leitung soll dann dem gehoeren, der wirklich wartet.
 */
export function prewarmPrices(slugs, { maxAgeMs = PRICE_TTL_MS, onProgress } = {}) {
  vorlauf?.stop();

  let gestoppt = false;
  const handle = { stop() { gestoppt = true; }, get stopped() { return gestoppt; } };
  vorlauf = handle;

  handle.done = (async () => {
    const cache = await loadPriceCache();
    /* Was schon frisch dasteht, wird nicht noch einmal geholt. Nach der ersten
       Mission ist das die grosse Mehrheit, und dann kostet der Vorlauf nichts. */
    const offen = [...new Set(slugs.filter(Boolean))]
      .filter(s => !(cache[s] && Date.now() - cache[s].fetchedAt < maxAgeMs));

    let geholt = 0;
    for (const slug of offen) {
      if (gestoppt) break;
      await getPrice(slug, { maxAgeMs }).catch(() => null);
      geholt++;
      onProgress?.(geholt, offen.length);
    }
    if (vorlauf === handle) vorlauf = null;
    return { geholt, offen: offen.length, abgebrochen: gestoppt };
  })();

  return handle;
}

/** Einen laufenden Vorlauf abbrechen. Ohne Vorlauf passiert nichts. */
export function stopPrewarm() {
  vorlauf?.stop();
  vorlauf = null;
}

/** Preise fuer mehrere Items. Nacheinander, die Warteschlange haelt den Takt. */
export async function getPrices(slugs, opts) {
  const out = {};
  for (const slug of [...new Set(slugs.filter(Boolean))]) {
    out[slug] = await getPrice(slug, opts);
  }
  return out;
}
