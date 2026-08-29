/**
 * Eigene Verkaufs- und Kaufauftraege auf warframe.market.
 *
 * DIE ENDPUNKTE (nachgemessen am 22.08.2026):
 *   GET    /v2/orders/my              eigene Orders, braucht Anmeldung
 *   POST   /v2/order                  neue Order
 *   GET    /v2/order/{id}             eine Order
 *   PATCH  /v2/order/{id}             Preis, Menge, Sichtbarkeit aendern
 *   DELETE /v2/order/{id}             Order entfernen
 *   GET    /v2/orders/item/{slug}     ALLE Angebote zu einem Item, oeffentlich
 *   GET    /v2/orders/item/{slug}/top die je fuenf besten, oeffentlich
 *
 * WARUM /orders/item UND NICHT /top FUER DIE ANGEBOTSLISTE:
 *   /top liefert fuenf Kauf- und fuenf Verkaufsangebote, nach Preis sortiert,
 *   ohne Stellschrauben. Die Liste im Bearbeiten-Fenster soll aber nach
 *   Aktualitaet gehen und filterbar sein - das geht nur mit dem vollen
 *   Bestand. Der ist gross (ueber 1.000 Angebote bei gefragten Items),
 *   deshalb wird er hier einmal geholt, kurz gehalten und im Speicher
 *   gefiltert, statt je Filterklick neu abgerufen zu werden.
 *
 * WAS "VERKAUFT" HEISST:
 *   warframe.market kennt keinen Endpunkt "einen davon verkauft". Der Knopf
 *   auf der Webseite zaehlt die Menge herunter und loescht die Order, wenn
 *   nichts mehr uebrig ist. Genau das macht markSold() - und schreibt den
 *   Vorgang zusaetzlich ins lokale Handelsbuch, das die Webseite nicht hat.
 */
import { request } from './wfm-http.js';
import { loadMarketItems, marketImage, marketSubIcon } from './market.js';

/* Der volle Angebotsbestand eines Items je Slug. Kurz gehalten: wer ein
   Angebot vergleicht, will den Stand von eben, nicht von vor einer Stunde. */
const OFFER_TTL_MS = 3 * 60 * 1000;
const offerCache = new Map();   // slug -> { fetchedAt, orders }

/* ------------------------- Anreicherung ------------------------- */

/**
 * Eine Order aus der API in das, was die Oberflaeche braucht.
 *
 * Die API liefert zur Order nur itemId - keinen Namen, kein Bild. Ohne
 * diesen Schritt stuende in der Liste eine Reihe von Hexadezimalkennungen.
 */
function decorate(order, idx) {
  const item = order.itemId ? idx?.byId?.get(order.itemId) : null;
  return {
    id: order.id,
    type: order.type,                       // 'sell' | 'buy'
    platinum: order.platinum ?? 0,
    quantity: order.quantity ?? 0,
    perTrade: order.perTrade ?? 1,
    visible: order.visible !== false,
    rank: order.rank ?? null,
    subtype: order.subtype ?? null,
    createdAt: order.createdAt || null,
    updatedAt: order.updatedAt || null,
    itemId: order.itemId || null,
    slug: item?.slug || null,
    name: item?.i18n?.en?.name || order.itemId || 'Unknown item',
    image: item ? marketImage(item) : null,
    /* Ohne das Abzeichen sehen alle Teile eines Primes gleich aus - siehe
       marketSubIcon(). Gilt fuer die eigenen Orders genauso wie fuer die
       Suche: "Nidus Prime Systems" traegt das Bild von Nidus Prime. */
    subIcon: item ? marketSubIcon(item) : null,
    maxRank: item?.maxRank ?? null,
    /* Die Oberflaeche muss wissen, welche Zusatzfelder dieses Item
       verlangt - sonst baut sie ein Formular, das die API ablehnt. */
    subtypes: item?.subtypes?.length ? item.subtypes : null,
    bulkTradable: !!item?.bulkTradable,
    tags: item?.tags || [],
    ducats: item?.ducats ?? null
  };
}

/* --------------------------- Lesen --------------------------- */

/** Eigene Orders, angereichert und nach Typ getrennt. */
export async function myOrders() {
  const [raw, idx] = await Promise.all([
    request('v2/orders/my', { auth: true }),
    loadMarketItems().catch(() => null)
  ]);

  /* Die API hat den Aufbau schon zweimal gewechselt: mal eine flache Liste,
     mal { sell, buy }. Beides annehmen kostet vier Zeilen und erspart einen
     leeren Tab nach dem naechsten Umbau. */
  const list = Array.isArray(raw)
    ? raw
    : [...(raw?.sell || []), ...(raw?.buy || []), ...(raw?.orders || [])];

  const orders = list.map(o => decorate(o, idx));
  return {
    orders,
    sell: orders.filter(o => o.type === 'sell'),
    buy:  orders.filter(o => o.type === 'buy')
  };
}

/**
 * Angebote anderer Spieler zu einem Item.
 *
 * Standard sind die zehn zuletzt aktualisierten - "zuletzt" heisst hier
 * updatedAt, nicht createdAt: eine Order von 2019, deren Preis heute
 * angefasst wurde, ist ein aktuelles Angebot. createdAt waere das
 * Eroeffnungsdatum und damit die falsche Frage.
 */
export async function itemOffers(slug, {
  type = 'sell',            // 'sell' | 'buy' | 'all'
  onlineOnly = false,       // nur ingame/online
  platform = null,          // 'pc' | 'ps4' | 'xbox' | 'switch' | null
  maxRank = null,           // fuer Mods: nur Angebote bis zu diesem Rang
  minRank = null,
  /* Ein intaktes Relikt und ein strahlendes sind verschiedene Waren zu
     verschiedenen Preisen. Ohne diesen Filter waere der Vergleich eine
     Mischung aus beidem und damit fuer keine Seite brauchbar. */
  subtype = null,
  sort = 'recent',          // 'recent' | 'price-asc' | 'price-desc' | 'reputation'
  limit = 10,
  refresh = false
} = {}) {
  if (!slug) return { offers: [], total: 0 };

  const hit = offerCache.get(slug);
  let orders;
  if (hit && !refresh && Date.now() - hit.fetchedAt < OFFER_TTL_MS) {
    orders = hit.orders;
  } else {
    orders = await request(`v2/orders/item/${encodeURIComponent(slug)}`) || [];
    offerCache.set(slug, { fetchedAt: Date.now(), orders });
  }

  let list = orders.filter(o => {
    if (type !== 'all' && o.type !== type) return false;
    /* Unsichtbare Orders sind vom Besitzer stillgelegt - sie stehen in der
       Antwort, aber niemand handelt darueber. */
    if (o.visible === false) return false;
    if (onlineOnly && !(o.user?.status === 'ingame' || o.user?.status === 'online')) return false;
    if (platform && o.user?.platform !== platform) return false;
    if (subtype && o.subtype && o.subtype !== subtype) return false;
    if (minRank != null && (o.rank ?? 0) < minRank) return false;
    if (maxRank != null && (o.rank ?? 0) > maxRank) return false;
    return true;
  });

  const ts = o => Date.parse(o.updatedAt || o.createdAt || 0) || 0;
  const rankStatus = o => (o.user?.status === 'ingame' ? 2 : o.user?.status === 'online' ? 1 : 0);
  list.sort((a, b) => {
    if (sort === 'price-asc')  return a.platinum - b.platinum || rankStatus(b) - rankStatus(a);
    if (sort === 'price-desc') return b.platinum - a.platinum || rankStatus(b) - rankStatus(a);
    if (sort === 'reputation') return (b.user?.reputation ?? 0) - (a.user?.reputation ?? 0);
    return ts(b) - ts(a);
  });

  const offers = list.slice(0, limit).map(o => ({
    id: o.id,
    type: o.type,
    platinum: o.platinum,
    quantity: o.quantity,
    perTrade: o.perTrade ?? 1,
    rank: o.rank ?? null,
    subtype: o.subtype ?? null,
    updatedAt: o.updatedAt || null,
    createdAt: o.createdAt || null,
    user: {
      name: o.user?.ingameName || '?',
      slug: o.user?.slug || null,
      status: o.user?.status || 'offline',
      reputation: o.user?.reputation ?? 0,
      platform: o.user?.platform || 'pc',
      crossplay: o.user?.crossplay ?? null,
      locale: o.user?.locale || null,
      lastSeen: o.user?.lastSeen || null
    }
  }));

  /* Was der Filter weggelassen hat, gehoert zur Auskunft: "10 von 3
     Angeboten" waere sonst nicht von "10 von 800" zu unterscheiden. */
  return {
    offers,
    total: list.length,
    totalUnfiltered: orders.length,
    fetchedAt: (offerCache.get(slug) || {}).fetchedAt || Date.now()
  };
}

/* -------------------------- Schreiben -------------------------- */

/**
 * Neue Order.
 *
 * itemId ist die Markt-Kennung, nicht der Slug - beim Anlegen erwartet die
 * API die id aus /v2/items. Der Aufrufer reicht den Slug herein, weil das
 * die Kennung ist, die in der Oberflaeche sichtbar ist.
 */
/**
 * Welche Zusatzfelder eine Order zu DIESEM Item braucht.
 *
 * WARUM DAS VOM ITEM ABHAENGT - alles am 22.08.2026 gegen echte Orders
 * gemessen, weil nichts davon dokumentiert ist:
 *
 *   bulkTradable  ->  perTrade ist PFLICHT, und beim Anlegen muss es die
 *                     Menge glatt teilen ("perTradeMustDivideQuantity").
 *                     Das sind Relikte, Arcanes, Fische: Dinge, von denen
 *                     man mehrere in einem Handel uebergibt.
 *   sonst         ->  perTrade ist VERBOTEN ("app.field.notAllowed").
 *   subtypes      ->  subtype ist PFLICHT, einer aus der Liste. Beim Relikt
 *                     der Zustand, beim Fisch die Groesse.
 *   maxRank       ->  rank ist PFLICHT.
 *
 * Ein verbotenes ODER fehlendes Feld laesst warframe.market die GANZE
 * Anfrage verwerfen - deshalb steht die Regel hier einmal und nicht in
 * jeder Aufrufstelle.
 */
export function orderFieldRules(item) {
  return {
    needsPerTrade: !!item?.bulkTradable,
    subtypes: item?.subtypes?.length ? item.subtypes : null,
    maxRank: item?.maxRank ?? null
  };
}

export async function createOrder({
  slug, itemId, type = 'sell', platinum, quantity = 1,
  visible = true, rank = null, subtype = null, perTrade = null
} = {}) {
  const idx = await loadMarketItems().catch(() => null);
  const item = itemId ? idx?.byId?.get(itemId) : idx?.bySlug?.get(slug);
  const id = itemId || item?.id;
  if (!id) throw new Error(`unknown item: ${slug || itemId}`);

  const rules = orderFieldRules(item);
  const qty = Math.max(1, Math.round(Number(quantity) || 1));

  const body = {
    itemId: id,
    type,
    platinum: Math.max(1, Math.round(Number(platinum) || 0)),
    quantity: qty,
    visible: visible !== false
  };

  if (rules.subtypes) {
    if (!subtype) throw new Error(`this item needs a subtype: ${rules.subtypes.join(', ')}`);
    if (!rules.subtypes.includes(subtype)) {
      throw new Error(`unknown subtype "${subtype}" - allowed: ${rules.subtypes.join(', ')}`);
    }
    body.subtype = subtype;
  }

  if (rules.maxRank != null) {
    if (rank == null) throw new Error(`this item needs a rank (0 to ${rules.maxRank})`);
    body.rank = Math.min(rules.maxRank, Math.max(0, Math.round(Number(rank))));
  }

  if (rules.needsPerTrade) {
    const per = Math.max(1, Math.round(Number(perTrade) || 1));
    /* Lieber hier abfangen als die Anfrage in einen Serverfehler laufen
       lassen, dessen Wortlaut niemand versteht. */
    if (qty % per !== 0) {
      throw new Error(`"per trade" (${per}) has to divide the quantity (${qty}) evenly`);
    }
    body.perTrade = per;
  }

  const created = await request('v2/order', { method: 'POST', body, auth: true });
  return decorate(created?.order || created, idx);
}

/**
 * Preis, Menge, Sichtbarkeit, Rang oder Zustand aendern.
 *
 * perTrade NUR BEI bulkTradable-ITEMS:
 *   Bei allem anderen lehnt PATCH das Feld mit "app.field.notAllowed" ab -
 *   und verwirft dabei den GANZEN Patch. Wer Preis und Menge aendert und
 *   perTrade nur mitschickt, weil es im Formular steht, verliert damit auch
 *   die Preisaenderung. Genau das ist passiert, bevor diese Regel hier
 *   stand. Deshalb wird aussortiert statt sich auf den Aufrufer zu
 *   verlassen; itemId sagt, welcher Fall vorliegt.
 *
 *   Anders als beim Anlegen muss perTrade die Menge beim Aendern NICHT
 *   glatt teilen - nachgemessen, Menge 3 mit perTrade 4 ging durch.
 *
 * Menge 0 ist kein "unsichtbar", sondern das Ende der Order - das
 * entscheidet die Oberflaeche und loescht dann bewusst.
 */
export async function updateOrder(orderId, patch = {}, { itemId = null } = {}) {
  if (!orderId) throw new Error('orderId is required');

  const idx = await loadMarketItems().catch(() => null);
  const item = itemId ? idx?.byId?.get(itemId) : null;

  const body = {};
  if (patch.platinum != null) body.platinum = Math.max(1, Math.round(Number(patch.platinum)));
  if (patch.quantity != null) body.quantity = Math.max(0, Math.round(Number(patch.quantity)));
  if (patch.visible  != null) body.visible  = !!patch.visible;
  if (patch.rank     != null) body.rank     = Math.max(0, Math.round(Number(patch.rank)));
  if (patch.subtype  != null) body.subtype  = patch.subtype;

  /* Ohne bekanntes Item lieber weglassen: ein zu Unrecht mitgeschicktes
     perTrade kostet den ganzen Patch, ein fehlendes nur diese eine
     Einstellung. */
  if (patch.perTrade != null) {
    if (item && orderFieldRules(item).needsPerTrade) {
      body.perTrade = Math.max(1, Math.round(Number(patch.perTrade)));
    } else {
      console.warn('wfm: perTrade not accepted for this item, left out of the patch');
    }
  }

  if (!Object.keys(body).length) throw new Error('nothing to update');

  const updated = await request(`v2/order/${encodeURIComponent(orderId)}`, {
    method: 'PATCH', body, auth: true
  });
  return decorate(updated?.order || updated, idx);
}

export async function deleteOrder(orderId) {
  if (!orderId) throw new Error('orderId is required');
  await request(`v2/order/${encodeURIComponent(orderId)}`, { method: 'DELETE', auth: true });
  return { ok: true, id: orderId };
}

/**
 * Einen (oder mehrere) Posten als gehandelt abhaken.
 *
 * Gibt zurueck, was daraus geworden ist: eine verkleinerte Order oder eine
 * geloeschte. Der Aufrufer schreibt daraufhin den Eintrag ins Handelsbuch -
 * hier nicht, damit dieses Modul nichts ueber lokale Dateien wissen muss.
 */
export async function markSold(orderId, { count = 1, quantity = null } = {}) {
  if (!orderId) throw new Error('orderId is required');

  let current = quantity != null ? Number(quantity) : null;
  if (current == null) {
    /* Die Antwort auf eine einzelne Order kam schon in zwei Formen vor -
       flach und in { order }. Beide lesen, denn ein nicht gefundenes
       quantity wuerde hier sonst als 0 durchgehen. */
    const res = await request(`v2/order/${encodeURIComponent(orderId)}`, { auth: true });
    current = res?.quantity ?? res?.order?.quantity ?? null;
  }

  /* Eine unbekannte Menge darf NICHT als 0 gelten: daraus wuerde unten ein
     Loeschen, und eine Order mit zwoelf Stueck waere wegen einer unklaren
     Antwort verschwunden. Lieber hier abbrechen und nichts anfassen. */
  if (current == null || !Number.isFinite(Number(current))) {
    throw new Error('could not read the current quantity - order left untouched');
  }

  const left = Math.max(0, Math.round(Number(current)) - Math.max(1, Math.round(count)));
  if (left <= 0) {
    await deleteOrder(orderId);
    return { removed: true, id: orderId, quantity: 0 };
  }
  const order = await updateOrder(orderId, { quantity: left });
  return { removed: false, id: orderId, quantity: left, order };
}

/** Nach jeder eigenen Aenderung: der Angebotsbestand ist nicht mehr aktuell. */
export function forgetOfferCache(slug = null) {
  if (slug) offerCache.delete(slug);
  else offerCache.clear();
}

/* ------------------- Handelsbuch von warframe.market ------------------- */

/**
 * Die Historie, die warframe.market selbst fuehrt: die abgeschlossenen
 * Orders im Profil.
 *
 * WO SIE STEHT - mit einem angemeldeten Konto nachgemessen am 22.08.2026:
 *   /v1/profile/{slug}/statistics  ->  { closed_orders: [...] }
 *
 *   NICHT unter /v2/me/transactions, wie zuerst angenommen. Unter /v2/me
 *   gibt es ueberhaupt nur /v2/me selbst - jeder Unterpfad antwortet mit
 *   404. Abgemeldet war das nicht zu sehen, weil dort jeder Pfad unter
 *   /v2/me eine 401 liefert, auch ein erfundener: die Anmeldung wird vor
 *   dem Routing geprueft.
 *
 * DER SLUG IST PFLICHT:
 *   Der Endpunkt haengt am Profilnamen. Wer auf warframe.market keinen
 *   Ingame-Namen gesetzt hat, hat auch keinen Slug - dann gibt es dort
 *   nichts abzuholen, und das ist eine Auskunft, kein Fehler.
 *
 * WOZU ES NEBEN DEM LOKALEN BUCH STEHT:
 *   Es sind zwei verschiedene Dinge. warframe.market verzeichnet, was ueber
 *   deren Bestaetigung lief; das lokale Buch verzeichnet, was du hier
 *   abgehakt oder von Hand nachgetragen hast. Ein Handel im Spiel, den
 *   niemand auf der Webseite bestaetigt, steht nur lokal. Deshalb werden
 *   beide gezeigt und nicht eines durch das andere ersetzt.
 */
export const TX_PATH = slug => `v1/profile/${encodeURIComponent(slug)}/statistics`;

/**
 * Datum aus einer Zeichenkette. Gibt null zurueck, wenn nichts Brauchbares
 * dasteht - und das ist der Punkt.
 *
 * Vorher stand hier `Date.parse(a || b || c || 0)`. Greift keiner der Namen,
 * landet die 0 in Date.parse, wird zu "0" und ergibt den 1. Januar 2000.
 * Jede Zeile trug dann ein Datum von vor 26 Jahren, und weil es ein
 * gueltiges Datum ist, faellt so etwas nirgends als Fehler auf.
 */
function parseDate(...candidates) {
  for (const c of candidates) {
    if (typeof c !== 'string' || !c) continue;
    const t = Date.parse(c);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/**
 * Eine Zeile aus closed_orders in die Form des Handelsbuchs.
 *
 * DIE FELDNAMEN SIND GEMESSEN, NICHT GERATEN (22.08.2026, echtes Konto):
 *   closed_date   Zeitpunkt des Abschlusses   (NICHT createdAt)
 *   order_type    'sell' | 'buy'              (NICHT type/direction)
 *   platinum      Preis JE STUECK             - gegen die Tagespreise
 *                 gegengerechnet: 28p/Stueck bei einem Marktpreis von 29p,
 *                 15p bei 15p. Die Gesamtsumme ist Preis mal Menge.
 *   quantity      Anzahl im Handel
 *   item.url_name Slug, item.en.item_name der Name, item.thumb das Bild
 *   mod_rank      Rang, wenn es eine Mod war
 *
 * KEIN HANDELSPARTNER: warframe.market fuehrt in closed_orders nicht, mit
 * wem gehandelt wurde. Das Feld bleibt leer, statt etwas zu erfinden.
 */
function normaliseRemote(row, idx) {
  if (!row || typeof row !== 'object') return null;

  const raw = row.item || {};
  const itemId = raw.id || row.itemId || row.item_id || null;
  const item = itemId ? idx?.byId?.get(itemId) : null;
  const slug = raw.url_name || item?.slug || null;

  /* 'sell' heisst: DU hast verkauft, es ist Einnahme. Alles andere gilt als
     Kauf - lieber eine Ausgabe zu viel als eine erfundene Einnahme. */
  const direction = String(row.order_type || row.orderType || row.type || '').toLowerCase() === 'sell'
    ? 'sold' : 'bought';

  const at = parseDate(row.closed_date, row.updated_at, row.createdAt, row.created_at);
  const quantity = Math.max(1, Number(row.quantity ?? 1) || 1);
  const platinum = Math.max(0, Number(row.platinum ?? 0) || 0);

  /* Der Name kommt bevorzugt aus unserem Marktindex, weil der zu allen
     anderen Ansichten passt; die Antwort traegt ihn nur als Rueckfall. */
  const name = item?.i18n?.en?.name || raw.en?.item_name || slug || 'Unknown item';
  const image = item ? marketImage(item)
              : raw.thumb ? `https://warframe.market/static/assets/${raw.thumb}` : null;

  return {
    id: 'wfm-' + (row.id || `${slug}-${at}-${platinum}`),
    /* Ohne verwertbares Datum lieber gar keines vortaeuschen: die Zeile
       rutscht ans Ende statt sich als "heute" auszugeben. */
    at: at ?? 0,
    dateUnknown: at == null,
    direction,
    kind: 'order',
    slug,
    itemId,
    name,
    image,
    platinum,
    quantity,
    total: platinum * quantity,
    rank: row.mod_rank ?? null,
    partner: null,
    note: null,
    /* Der Herkunftsstempel - danach unterscheidet die Oberflaeche, was von
       warframe.market kam und was hier entstanden ist. */
    source: 'warframe.market',
    remote: true,
    orderId: row.id || null,
    auctionId: null
  };
}

export async function remoteTransactions({ slug = null, limit = 200 } = {}) {
  if (!slug) {
    return {
      entries: [], path: null, supported: false, needsProfile: true,
      error: 'no warframe.market profile name - set your in-game name there first'
    };
  }

  const idx = await loadMarketItems().catch(() => null);
  const path = TX_PATH(slug);
  try {
    const data = await request(path, { auth: true });
    const list = data?.closed_orders;
    if (!Array.isArray(list)) {
      return { entries: [], path, supported: false, error: 'no closed_orders in the response' };
    }
    return {
      entries: list.slice(0, limit).map(r => normaliseRemote(r, idx)).filter(Boolean),
      path,
      supported: true
    };
  } catch (err) {
    return { entries: [], path, supported: false, error: err.message, status: err.status || 0 };
  }
}
