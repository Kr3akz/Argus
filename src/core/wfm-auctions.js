/**
 * Contracts - die Auktionen auf warframe.market: Rivenmods, Kuva-Liches und
 * Sisters of Parvos.
 *
 * WARUM DAS NICHT MIT DEN ORDERS ZUSAMMENFAELLT:
 *   Eine Order handelt ein Item, das es tausendfach gibt: "Braton Prime Set,
 *   12p, drei Stueck". Eine Auktion handelt EIN Stueck mit eigenen
 *   Eigenschaften - dieses Riven mit diesen Werten, dieser Lich mit diesem
 *   Element. Deshalb gibt es dort keine Menge, dafuer Startpreis, Sofortkauf
 *   und Gebote. Es sind zwei verschiedene Dinge, und warframe.market fuehrt
 *   sie in zwei getrennten APIs.
 *
 * DIE VERSIONSLUECKE:
 *   Auktionen gibt es NUR in v1. /v2/auctions* antwortet durchgaengig 404,
 *   nachgemessen am 22.08.2026. Die Referenzlisten dagegen (Waffen,
 *   Attribute, Ephemera, Quirks) sind bereits nach v2 gewandert. Dieses
 *   Modul greift deshalb bewusst auf beide Staende zu - das ist kein
 *   Versehen, sondern der aktuelle Stand des Anbieters.
 *
 * UNGEPRUEFTE STELLEN:
 *   Lesen ist gegen die echte API gemessen. Die schreibenden Aufrufe
 *   (create, update, close, delete) verlangen eine Anmeldung und liessen
 *   sich ohne fremde Zugangsdaten nicht ausprobieren. Sie folgen dem
 *   v1-Muster von warframe.market; wo der Pfad geraten ist, steht es am
 *   Aufruf.
 */
import { request } from './wfm-http.js';

/* Referenzlisten aendern sich nur, wenn DE eine Waffe nachliefert. */
const REF_TTL_MS = 24 * 60 * 60 * 1000;
let refCache = null;      // { fetchedAt, riven, lich, sister }

/* --------------------------- Referenz --------------------------- */

const slugName = list => (list || []).map(e => ({
  slug: e.slug,
  name: e.i18n?.en?.name || e.slug,
  gameRef: e.gameRef || null,
  group: e.group || null
}));

/**
 * Waffen, Attribute, Ephemera und Quirks - alles, was ein Auktionsformular
 * zur Auswahl stellen muss.
 *
 * Acht Abrufe hintereinander, aber nur einmal am Tag: die Warteschlange in
 * wfm-http.js haelt dabei den Mindestabstand ein.
 */
export async function auctionReference({ refresh = false } = {}) {
  if (refCache && !refresh && Date.now() - refCache.fetchedAt < REF_TTL_MS) return refCache;

  const get = p => request(p).catch(() => []);
  const [rivenWeapons, rivenAttributes, lichWeapons, lichEphemeras, lichQuirks,
         sisterWeapons, sisterEphemeras, sisterQuirks] = await Promise.all([
    get('v2/riven/weapons'), get('v2/riven/attributes'),
    get('v2/lich/weapons'), get('v2/lich/ephemeras'), get('v2/lich/quirks'),
    get('v2/sister/weapons'), get('v2/sister/ephemeras'), get('v2/sister/quirks')
  ]);

  refCache = {
    fetchedAt: Date.now(),
    riven:  { weapons: slugName(rivenWeapons), attributes: slugName(rivenAttributes) },
    lich:   { weapons: slugName(lichWeapons), ephemeras: slugName(lichEphemeras), quirks: slugName(lichQuirks) },
    sister: { weapons: slugName(sisterWeapons), ephemeras: slugName(sisterEphemeras), quirks: slugName(sisterQuirks) }
  };
  return refCache;
}

/* -------------------------- Anreicherung -------------------------- */

/**
 * v1 spricht snake_case, der Rest der Anwendung camelCase. Die Uebersetzung
 * gehoert hierher und nicht in die Oberflaeche - sonst zieht sich der
 * Formatunterschied durch jede Vorlage.
 */
function decorate(a) {
  if (!a) return null;
  const item = a.item || {};
  return {
    id: a.id,
    kind: item.type || 'riven',              // 'riven' | 'lich' | 'sister'
    startingPrice: a.starting_price ?? null,
    buyoutPrice: a.buyout_price ?? null,
    topBid: a.top_bid ?? null,
    visible: a.visible !== false,
    closed: !!a.closed,
    isDirectSell: !!a.is_direct_sell,
    minimalReputation: a.minimal_reputation ?? 0,
    note: a.note_raw || stripHtml(a.note),
    platform: a.platform || 'pc',
    crossplay: a.crossplay ?? null,
    createdAt: a.created || null,
    updatedAt: a.updated || null,
    owner: a.owner ? {
      name: a.owner.ingame_name || '?',
      slug: a.owner.slug || null,
      status: a.owner.status || 'offline',
      reputation: a.owner.reputation ?? 0,
      platform: a.owner.platform || 'pc',
      lastSeen: a.owner.last_seen || null
    } : null,
    winner: a.winner || null,
    item: {
      weapon: item.weapon_url_name || null,
      /* Der Riven-Name ist die Silbenkennung ("mantinok"), nicht der
         Waffenname - beides zusammen ergibt erst "Kulstar Mantinok". */
      name: item.name || null,
      masteryLevel: item.mastery_level ?? null,
      modRank: item.mod_rank ?? null,
      reRolls: item.re_rolls ?? null,
      polarity: item.polarity || null,
      attributes: (item.attributes || []).map(x => ({
        slug: x.url_name, value: x.value, positive: !!x.positive
      })),
      /* Lich und Sister: Element und Schadenswert statt Attributen. */
      element: item.element || null,
      damage: item.damage ?? null,
      quirk: item.quirk || null,
      hasEphemera: item.having_ephemera ?? null
    }
  };
}

/* Die Notiz kommt als HTML-Schnipsel. note_raw ist der Rohtext, aber nicht
   jede Antwort fuehrt ihn - dann bleibt nur, die Tags herauszunehmen. */
const stripHtml = s => String(s || '').replace(/<[^>]*>/g, '').trim();

/* ---------------------------- Lesen ---------------------------- */

/**
 * Eigene Auktionen.
 *
 * Zwei Wege, und der zweite ist kein Notnagel: /v1/profile/auctions braucht
 * eine Anmeldung, /v1/profile/{slug}/auctions ist oeffentlich. Faellt die
 * Anmeldung aus, bleibt die Liste damit trotzdem lesbar - nur eben ohne die
 * Knoepfe, die etwas aendern.
 */
export async function myAuctions({ slug = null } = {}) {
  let raw = null;
  let readOnly = false;

  try {
    raw = await request('v1/profile/auctions', { auth: true });
  } catch (err) {
    if (!slug) throw err;
    raw = await request(`v1/profile/${encodeURIComponent(slug)}/auctions`);
    readOnly = true;
  }

  const list = (raw?.auctions || raw || []).map(decorate).filter(Boolean);
  return {
    auctions: list,
    open: list.filter(a => !a.closed),
    closed: list.filter(a => a.closed),
    readOnly
  };
}

/**
 * Vergleichbare Auktionen zu einer Waffe - das Gegenstueck zur Angebotsliste
 * bei den Orders. Wer seinen Riven-Preis setzt, will sehen, was dieselbe
 * Waffe gerade bringt.
 */
export async function auctionOffers({
  kind = 'riven', weapon, polarity = null, onlineOnly = false,
  directSellOnly = false, sort = 'price-asc', limit = 10
} = {}) {
  if (!weapon) return { offers: [], total: 0 };

  const params = new URLSearchParams({ type: kind, weapon_url_name: weapon });
  if (polarity) params.set('polarity', polarity);
  /* sort_by geht an die API, weil sie den ganzen Bestand kennt - der
     Feinschliff darunter passiert hier. */
  params.set('sort_by', sort === 'price-desc' ? 'price_desc' : 'price_asc');
  if (directSellOnly) params.set('buyout_policy', 'direct');

  const raw = await request(`v1/auctions/search?${params}`);
  let list = (raw?.auctions || []).map(decorate).filter(Boolean)
    .filter(a => !a.closed && a.visible);

  if (onlineOnly) list = list.filter(a => a.owner?.status === 'ingame' || a.owner?.status === 'online');

  const ts = a => Date.parse(a.updatedAt || a.createdAt || 0) || 0;
  const price = a => a.buyoutPrice ?? a.startingPrice ?? Infinity;
  if (sort === 'recent') list.sort((a, b) => ts(b) - ts(a));
  else if (sort === 'price-desc') list.sort((a, b) => price(b) - price(a));
  else list.sort((a, b) => price(a) - price(b));

  return { offers: list.slice(0, limit), total: list.length };
}

export async function getAuction(id) {
  const raw = await request(`v1/auctions/entry/${encodeURIComponent(id)}`);
  return decorate(raw?.auction || raw);
}

/* --------------------------- Schreiben --------------------------- */

/**
 * Preis, Sichtbarkeit, Notiz oder Mindestruf aendern.
 *
 * PFAD GERATEN: PUT auf den Eintrag ist das v1-Muster von warframe.market,
 * liess sich aber ohne Anmeldung nicht bestaetigen. Schlaegt es fehl, meldet
 * die Leitung Status und Begruendung des Servers durch.
 */
export async function updateAuction(id, patch = {}) {
  if (!id) throw new Error('auction id is required');

  const body = {};
  if (patch.startingPrice != null) body.starting_price = Math.max(1, Math.round(Number(patch.startingPrice)));
  if (patch.buyoutPrice !== undefined) {
    body.buyout_price = patch.buyoutPrice == null ? null : Math.max(1, Math.round(Number(patch.buyoutPrice)));
  }
  if (patch.visible != null) body.visible = !!patch.visible;
  if (patch.note != null) body.note = String(patch.note);
  if (patch.minimalReputation != null) body.minimal_reputation = Math.max(0, Math.round(Number(patch.minimalReputation)));
  if (!Object.keys(body).length) throw new Error('nothing to update');

  const raw = await request(`v1/auctions/entry/${encodeURIComponent(id)}`, {
    method: 'PUT', body, auth: true
  });
  return decorate(raw?.auction || raw);
}

/**
 * Auktion schliessen - das "Sold" der Contracts.
 *
 * warframe.market will dabei wissen, WER gekauft hat; ohne Gegenueber wird
 * die Auktion nur beendet. PFAD GERATEN, siehe updateAuction().
 */
export async function closeAuction(id, { winnerSlug = null } = {}) {
  if (!id) throw new Error('auction id is required');
  const raw = await request(`v1/auctions/entry/${encodeURIComponent(id)}/close`, {
    method: 'PUT',
    body: winnerSlug ? { winner: winnerSlug } : {},
    auth: true
  });
  return decorate(raw?.auction || raw);
}

export async function deleteAuction(id) {
  if (!id) throw new Error('auction id is required');
  await request(`v1/auctions/entry/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
  return { ok: true, id };
}

/**
 * Neue Auktion.
 *
 * Der item-Teil sieht je nach Art anders aus, weil die Dinge verschieden
 * sind: ein Riven hat Attribute und Wuerfe, ein Lich hat Element und
 * Schaden. Deshalb baut jede Art ihren eigenen Block.
 */
export async function createAuction({
  kind = 'riven', weapon, startingPrice, buyoutPrice = null, note = '',
  minimalReputation = 0, visible = true,
  // Riven
  rivenName = null, masteryLevel = null, modRank = 0, reRolls = 0, polarity = null, attributes = [],
  // Lich / Sister
  element = null, damage = null, quirk = null, hasEphemera = false
} = {}) {
  if (!weapon) throw new Error('weapon is required');

  const item = kind === 'riven'
    ? {
        type: 'riven',
        weapon_url_name: weapon,
        name: rivenName,
        mastery_level: Number(masteryLevel) || 8,
        mod_rank: Number(modRank) || 0,
        re_rolls: Number(reRolls) || 0,
        polarity: polarity || 'madurai',
        attributes: (attributes || []).map(a => ({
          url_name: a.slug, value: Number(a.value), positive: !!a.positive
        }))
      }
    : {
        type: kind,
        weapon_url_name: weapon,
        element,
        damage: Number(damage) || 0,
        having_ephemera: !!hasEphemera,
        ...(quirk ? { quirk } : {})
      };

  const body = {
    item,
    starting_price: Math.max(1, Math.round(Number(startingPrice) || 1)),
    buyout_price: buyoutPrice == null ? null : Math.max(1, Math.round(Number(buyoutPrice))),
    note: String(note || ''),
    minimal_reputation: Math.max(0, Math.round(Number(minimalReputation) || 0)),
    visible: visible !== false
  };

  const raw = await request('v1/auctions/create', { method: 'POST', body, auth: true });
  return decorate(raw?.auction || raw);
}
