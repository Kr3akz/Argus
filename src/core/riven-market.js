/**
 * Marktwissen fuer Rivens: welche Waffe warframe.market unter welchem slug
 * fuehrt, und was die teuren Auktionen je Waffe tragen (riven-wants.js).
 *
 * WARUM EIN EIGENER SPEICHER AUF DER PLATTE:
 *   Die Auktionssuche ist gedrosselt - rund zehn Suchen je Minute, danach
 *   sperrt Cloudflare (siehe wfm-auctions.js). Eine Suche je Waffe und Woche
 *   ist aber genug: welche Werte eine Waffe will, aendert sich mit einer
 *   Dispositionsrunde oder einer neuen Mode, nicht von heute auf morgen.
 *   Deshalb steht jedes Ergebnis sieben Tage in data/riven-market.json, und
 *   auch danach gilt der alte Stand weiter, bis ein neuer da ist.
 *
 *   Die Waffenliste kommt mit in die Datei: ohne sie laesst sich kein Riven
 *   einer Waffe zuordnen, und offline soll die Zuordnung trotzdem stehen.
 *
 * NACHGELADEN WIRD LANGSAM UND IM HINTERGRUND (ensureWants): mit dem
 * Hintergrundbudget der Suchspur, eine Waffe nach der anderen. Bei 14 Rivens
 * dauert der erste Durchgang knapp drei Minuten - bis dahin gilt fuer jede
 * Waffe das gemessene Mittel ihrer Klasse.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './paths.js';
import { request } from './wfm-http.js';
import { rivenSearch } from './wfm-auctions.js';
import {
  deriveWants, rivenClass, classWants, mergeClassNegatives, gradeRiven, labelWants,
  attrLabel, formatAuctionValue, auctionValueAtMax, auctionUnit, RIVEN_ATTRS
} from './riven-wants.js';
import { FACTOR, ROLL_HIGH } from './rivens.js';
import { RIVEN_MAX_RANK } from './mods.js';

const FILE = 'riven-market.json';
const WANTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WEAPONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/* Nach einem Fehlschlag nicht gleich wieder: ohne Netz oder bei einer Sperre
   waere jede Wiederholung nur eine weitere gezaehlte Suche. */
const RETRY_MS = 30 * 60 * 1000;

let memo = null;            // { weapons: { fetchedAt, list }, wants: { slug: {...} } }
let dataDirUsed = null;
let saveTimer = null;
const failedAt = new Map(); // slug -> Zeitpunkt des letzten Fehlschlags
let weaponsInflight = null;

async function load(dataDir = defaultDataDir()) {
  if (memo && dataDirUsed === dataDir) return memo;
  dataDirUsed = dataDir;
  memo = { weapons: null, wants: {} };
  const file = path.join(dataDir, FILE);
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(await readFile(file, 'utf8'));
      memo = { weapons: raw.weapons || null, wants: raw.wants || {} };
    } catch { /* kaputte Datei: neu anfangen */ }
  }
  return memo;
}

/* Zusammengefasst schreiben - der Nachlader liefert Waffe um Waffe. */
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await mkdir(dataDirUsed, { recursive: true });
      await writeFile(path.join(dataDirUsed, FILE), JSON.stringify(memo));
    } catch (err) {
      console.warn('[Markt] riven-market.json nicht geschrieben:', err.message);
    }
  }, 500);
}

/* ------------------------------ Waffen ------------------------------ */

/**
 * Die Riven-Waffen von warframe.market: slug, Name, gameRef (Pfad der Waffe
 * im Spiel), rivenType, group, Disposition. Eine Woche gueltig; scheitert der
 * Abruf, gilt der gespeicherte Stand.
 */
export async function rivenWeapons({ dataDir, refresh = false } = {}) {
  const m = await load(dataDir);
  const fresh = m.weapons && Date.now() - m.weapons.fetchedAt < WEAPONS_TTL_MS;
  if (fresh && !refresh) return m.weapons.list;

  const refetch = () => {
    if (weaponsInflight) return weaponsInflight;
    weaponsInflight = fetchWeapons(m).finally(() => { weaponsInflight = null; });
    return weaponsInflight;
  };
  /* Eine aeltere Liste gilt sofort, die neue kommt im Hintergrund - der
     Umwandeln-Bildschirm soll nicht auf das Netz warten. Nur ganz ohne Liste
     wird gewartet. */
  if (m.weapons?.list?.length && !refresh) {
    refetch();
    return m.weapons.list;
  }
  return refetch();
}

async function fetchWeapons(m) {
  try {
    const list = await request('v2/riven/weapons');
    if (!Array.isArray(list) || !list.length) return m.weapons?.list || [];
    m.weapons = {
      fetchedAt: Date.now(),
      list: list.map(w => ({
        slug: w.slug,
        name: w.i18n?.en?.name || w.slug,
        gameRef: w.gameRef || null,
        rivenType: w.rivenType || null,
        group: w.group || null,
        disposition: w.disposition ?? null
      }))
    };
    saveSoon();
    return m.weapons.list;
  } catch (err) {
    console.warn('[Markt] Riven-Waffenliste nicht geholt:', err.message);
    return m.weapons?.list || [];
  }
}

/**
 * Der Eintrag von warframe.market zu einem Riven.
 *
 * compat nennt die Grundwaffe, bei Familien mit "Base" am Ende (Hek:
 * QuadShotgunBase) - dann gilt der Pfad ohne. Das trifft alle 14 Rivens in
 * Kaans Inventar (2026-09-29).
 */
export function weaponForPath(list, compat, uniqueName = null) {
  if (!list?.length || !compat) return null;
  const byRef = weaponIndex(list);
  return byRef.get(compat) || byRef.get(String(compat).replace(/Base$/, '')) ||
         (uniqueName ? byRef.get(uniqueName) : null) || null;
}

let indexFor = null;
let index = null;
function weaponIndex(list) {
  if (indexFor !== list) {
    indexFor = list;
    index = new Map(list.filter(w => w.gameRef).map(w => [w.gameRef, w]));
  }
  return index;
}

/* ------------------------------ Wuensche ------------------------------ */

/**
 * Was gespeichert ist - auch wenn es aelter als eine Woche ist. stale sagt,
 * ob es erneuert werden sollte.
 */
export async function cachedWants(slug, { dataDir } = {}) {
  const m = await load(dataDir);
  const e = m.wants[slug];
  if (!e) return null;
  return { ...e, stale: Date.now() - e.fetchedAt >= WANTS_TTL_MS };
}

/** Alle gespeicherten, fuer einen Durchgang ueber viele Rivens. */
export async function allCachedWants({ dataDir } = {}) {
  const m = await load(dataDir);
  const now = Date.now();
  const out = {};
  for (const [slug, e] of Object.entries(m.wants)) out[slug] = { ...e, stale: now - e.fetchedAt >= WANTS_TTL_MS };
  return out;
}

/**
 * Die Wuensche einer Waffe frisch vom Markt: eine Suche nach Preis
 * absteigend, daraus das teuerste Viertel (riven-wants.js).
 */
export async function fetchWants(slug, { dataDir, priority = 'background' } = {}) {
  const m = await load(dataDir);
  try {
    const list = await rivenSearch({ weapon: slug, sort: 'price_desc', priority });
    const auctions = list.map(a => ({
      price: a.buyoutPrice ?? a.startingPrice,
      pos: a.item.attributes.filter(x => x.positive).map(x => x.slug),
      neg: a.item.attributes.filter(x => !x.positive).map(x => x.slug)
    }));
    const wants = deriveWants(auctions);
    m.wants[slug] = { fetchedAt: Date.now(), ...wants };
    failedAt.delete(slug);
    saveSoon();
    return { ...m.wants[slug], stale: false };
  } catch (err) {
    failedAt.set(slug, Date.now());
    throw err;
  }
}

/* --------------------------- Nachlader --------------------------- */

const pending = new Set();
let loopRunning = false;
const listeners = new Set();

/** Wird nach jeder nachgeladenen Waffe gerufen: (slug, wants). */
export function onWantsLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Fehlende und veraltete Waffen im Hintergrund nachladen. Mehrfache Aufrufe
 * sammeln sich in derselben Schlange; jede Waffe wird hoechstens einmal
 * geholt.
 */
export async function ensureWants(slugs, { dataDir } = {}) {
  const m = await load(dataDir);
  const now = Date.now();
  for (const slug of slugs || []) {
    if (!slug) continue;
    const e = m.wants[slug];
    if (e && now - e.fetchedAt < WANTS_TTL_MS) continue;
    if (now - (failedAt.get(slug) || 0) < RETRY_MS) continue;
    pending.add(slug);
  }
  if (!loopRunning && pending.size) runLoop(dataDir);
}

async function runLoop(dataDir) {
  loopRunning = true;
  try {
    while (pending.size) {
      const slug = pending.values().next().value;
      pending.delete(slug);
      try {
        const wants = await fetchWants(slug, { dataDir, priority: 'background' });
        for (const fn of listeners) {
          try { fn(slug, wants); } catch { /* ein Zuhoerer darf den Rest nicht aufhalten */ }
        }
      } catch (err) {
        console.warn(`[Markt] Wuensche fuer ${slug} nicht geholt:`, err.message);
        /* Gesperrt: den Rest dieser Runde nicht mehr versuchen, sie kaeme
           nach der Pause ohnehin wieder. */
        if (err?.status === 429) { pending.clear(); break; }
      }
    }
  } finally {
    loopRunning = false;
  }
}

/* ------------------------ Noten und Finder ------------------------

   Hier und nicht im Hauptprozess, damit es ohne Electron pruefbar ist: der
   Riven-Test rechnet damit, und die Vorschau der Oberflaeche auch. */

/**
 * Welche Wuensche fuer eine Waffe gelten: die vom Markt, wenn gespeichert und
 * nicht zu duenn - sonst das gemessene Mittel der Klasse.
 *
 * thin heisst "der Markt ist abgefragt, gibt aber zu wenig her" - eine
 * Auskunft, kein fehlender Abruf; die Oberflaeche sagt dann etwas anderes.
 */
export function wantsFor(cls, cached) {
  if (cached && !cached.thin) {
    return {
      wants: mergeClassNegatives(cached, cls),
      source: 'market',
      sample: cached.sample ?? null,
      topFrom: cached.topFrom ?? null,
      fetchedAt: cached.fetchedAt ?? null
    };
  }
  return { wants: classWants(cls), source: 'class', thin: cached?.thin ? (cached.sample ?? 0) : null };
}

/**
 * Note und Wuensche fuer einen Riven, so wie Reiter und Overlay sie zeigen.
 *
 * @param view        Ansicht aus rivens.js (rivenView)
 * @param marketList  Waffenliste aus rivenWeapons()
 * @param cachedAll   gespeicherte Wuensche je slug
 */
export function rateRiven(view, marketList, cachedAll) {
  const market = weaponForPath(marketList, view.weapon.path, view.weapon.uniqueName);
  const cls = rivenClass(view.kind, market);
  const w = wantsFor(cls, market ? cachedAll?.[market.slug] : null);
  const g = gradeRiven(view.stats, w.wants);
  return {
    slug: market?.slug || null,
    cls,
    letter: g.letter,
    word: g.word,
    score: g.score,
    stats: g.stats.map(s => ({ slug: s.slug, fit: s.fit, letter: s.letter })),
    wants: labelWants(w.wants, cls),
    source: w.source,
    sample: w.sample ?? null,
    topFrom: w.topFrom ?? null,
    fetchedAt: w.fetchedAt ?? null,
    thin: w.thin ?? null
  };
}

/* Welche Attribute eine Klasse ueberhaupt tragen kann - aus den Riven-
   Vorlagen im Export, nicht aus einer Liste von Hand: der Schrotflinte fehlt
   Zoom, der Arch-Gun Projektiltempo und Infested, dem Nahkampf alles, was mit
   Schuessen zu tun hat. */
const RIVEN_TEMPLATES = {
  rifle: 'LotusRifleRandomModRare', shotgun: 'LotusShotgunRandomModRare', pistol: 'LotusPistolRandomModRare',
  melee: 'PlayerMeleeWeaponRandomModRare', kitgun: 'LotusModularPistolRandomModRare',
  zaw: 'LotusModularMeleeRandomModRare', archgun: 'LotusArchgunRandomModRare'
};
const TAG_SLUG = new Map(RIVEN_ATTRS.flatMap(a => a.tags.map(t => [t, a.slug])));

/**
 * @param byUniqueName  Katalog (uniqueName -> Eintrag) mit den Riven-Vorlagen
 */
export function classAttributes(cls, byUniqueName) {
  const tpl = byUniqueName?.get(`/Lotus/Upgrades/Mods/Randomized/${RIVEN_TEMPLATES[cls] || RIVEN_TEMPLATES.rifle}`);
  const slugs = tpl?.upgradeEntries
    ? [...new Set(tpl.upgradeEntries.map(e => TAG_SLUG.get(e.tag)).filter(Boolean))]
    : RIVEN_ATTRS.map(a => a.slug);
  /* Zwei Nahkampfwerte gibt es nur in eine Richtung (warframe.market:
     positiveOnly / negativeOnly) - an den Vorlagen nicht abzulesen. */
  return slugs.map(slug => ({
    slug,
    label: attrLabel(slug, cls),
    name: attrLabel(slug, cls, { short: false }),
    positive: slug !== 'chance_to_gain_combo_count',
    negative: slug !== 'chance_to_gain_extra_combo_count'
  })).sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

const finiteOrNull = v => (v === '' || v == null || !Number.isFinite(Number(v))) ? null : Number(v);

/**
 * Was ein Wert auf Rang 8 hoechstens sein kann - fuer eine Waffe, in den
 * Einheiten von warframe.market. Dieselbe Rechnung wie in rivens.js
 * (computeStat), mit dem besten Wurf: Basis aus der Riven-Vorlage der Klasse,
 * Disposition der Waffe, Faktor nach Zusammensetzung.
 *
 * WOFUER: Verkaeufer stellen einen Riven oft mit Rang 0 ein, tippen aber die
 * Werte von Rang 8 ab. Am 2026-09-29 unter den Torid-Auktionen: Rang 0 mit
 * "+199.8% Critical Chance" - auf Rang 8 hochgerechnet +1798 %, also Unsinn.
 * Mit dem Hoechstwert laesst sich das erkennen, statt zu raten.
 *
 * GEMESSEN an den gespeicherten Auktionen von 22 Waffen: von 21.012 Werten auf
 * Rang 8 lagen 80 (0,38 %) ueber dem Hoechstwert mal MAX_SLACK - Tippfehler
 * wie Punch Through mal 40. Die Rechnung haelt also. Und von 3.089 Auktionen
 * unter Rang 8 standen 836 schon mit Rang-8-Werten da - ohne die Pruefung
 * waere mehr als jede vierte hochgerechnete Auktion falsch gewesen.
 *
 * @returns (slug, { positive, buffCount, hasCurse }) -> Hoechstbetrag oder null
 *          (Faktor: nur der Aufschlag ueber 1), oder null ohne Vorlage
 */
export function auctionMaxima(cls, byUniqueName, disposition) {
  const tpl = byUniqueName?.get(`/Lotus/Upgrades/Mods/Randomized/${RIVEN_TEMPLATES[cls] || RIVEN_TEMPLATES.rifle}`);
  if (!tpl?.upgradeEntries || !Number.isFinite(disposition) || disposition <= 0) return null;
  const base = new Map();
  for (const e of tpl.upgradeEntries) {
    const slug = TAG_SLUG.get(e.tag);
    const v = Math.abs(Number(e.upgradeValues?.[0]?.value));
    if (slug && Number.isFinite(v) && v > 0 && !base.has(slug)) base.set(slug, v);
  }
  return (slug, { positive, buffCount, hasCurse }) => {
    const b = base.get(slug);
    const f = positive
      ? FACTOR.buff[buffCount] * (hasCurse ? FACTOR.curseLift : 1)
      : FACTOR.curse[buffCount];
    if (!b || !f) return null;
    const frac = b * disposition * (RIVEN_MAX_RANK + 1) * f * ROLL_HIGH;
    return auctionUnit(slug) === 'percent' ? frac * 100 : frac;
  };
}

/* Spielraum ueber dem Hoechstwert: die Anzeige rundet auf eine Stelle, und
   eine Auktion kann von vor einer Dispositionsrunde stammen. Knapp unter
   9/8: ein Rang-7-Riven mit abgetippten Rang-8-Werten waere hochgerechnet
   genau 12,5 % zu gross - der soll auffallen. */
const MAX_SLACK = 1.12;

/**
 * Stehen die Werte einer Auktion auf ihrem Rang - oder schon auf Rang 8?
 * Entschieden wird fuer die ganze Auktion: ein Verkaeufer tippt alle Werte
 * vom selben Bildschirm ab.
 *
 * @returns 'scaled' | 'maxed' | 'unknown'
 */
function auctionScale(item, maxima) {
  const rank = item?.modRank;
  if (rank == null || rank >= RIVEN_MAX_RANK) return 'maxed';
  if (!maxima) return 'unknown';
  const attrs = item.attributes || [];
  const buffCount = attrs.filter(x => x.positive).length;
  const hasCurse = attrs.some(x => !x.positive);
  const k = (RIVEN_MAX_RANK + 1) / (rank + 1);
  let checked = 0;
  for (const x of attrs) {
    const max = maxima(x.slug, { positive: x.positive, buffCount, hasCurse });
    if (!max) continue;
    const mag = auctionUnit(x.slug) === 'factor' ? Math.abs(Number(x.value) - 1) : Math.abs(Number(x.value));
    if (!Number.isFinite(mag)) continue;
    checked++;
    if (mag * k > max * MAX_SLACK) return 'maxed';
  }
  return checked ? 'scaled' : 'unknown';
}

/**
 * Auktionen aus rivenSearch fuer den Finder: Werte als Text, wie gut jeder zur
 * Waffe passt, Aehnlichkeit zum eigenen Riven - und die Filter, fuer die
 * warframe.market keine Parameter hat.
 *
 * AEHNLICHKEIT: wie viele Werte des eigenen Rivens eine Auktion mit derselben
 * Richtung traegt, als Anteil seiner Werte. Sucht man mit einer Vorlage, steht
 * das Aehnlichste vorn, sonst das Billigste.
 *
 * RANG: die Werte stehen auf Rang 8, damit Angebote vergleichbar sind - aber
 * nur, wenn sie hochgerechnet noch moeglich sind (auctionMaxima). Sonst hat
 * der Verkaeufer schon Rang-8-Werte eingetragen, und sie bleiben, wie sie sind.
 *
 * @param raw     geschmueckte Auktionen (wfm-auctions.js decorate)
 * @param maxima  aus auctionMaxima, oder null - dann wird nicht hochgerechnet
 * @param opts    { onlineOnly, hideOnePlat, priceMin, priceMax, similarityMin,
 *                  reference: { pos: [slug], neg: slug|null } }
 * @returns { total, offers }  offers hoechstens `limit`
 */
export function shapeFinderOffers(raw, { cls, wants, maxima = null, opts = {}, limit = 60 } = {}) {
  const inList = (key, slug) => (wants?.[key] || []).some(w => w.slug === slug);
  const fitOf = (slug, positive) => {
    if (inList('best', slug)) return 'best';
    if (inList('good', slug)) return 'good';
    return !positive && inList('harmless', slug) ? 'harmless' : 'neutral';
  };

  const ref = opts.reference && Array.isArray(opts.reference.pos)
    ? { pos: new Set(opts.reference.pos), neg: opts.reference.neg || null } : null;
  const refCount = ref ? ref.pos.size + (ref.neg ? 1 : 0) : 0;
  const priceMin = finiteOrNull(opts.priceMin);
  const priceMax = finiteOrNull(opts.priceMax);
  const simMin = finiteOrNull(opts.similarityMin);

  let offers = (raw || []).map(a => {
    /* Werte auf Rang 8, wenn das moeglich ist - der eingestellte Wert steht
       daneben (listed). Ohne Pruefmoeglichkeit wird nicht hochgerechnet:
       lieber ungleich als falsch. */
    const rank = a.item?.modRank ?? null;
    const scale = auctionScale(a.item, maxima);
    const stats = (a.item?.attributes || []).map(x => ({
      slug: x.slug,
      label: attrLabel(x.slug, cls),
      value: x.value,
      text: formatAuctionValue(x.slug, scale === 'scaled' ? auctionValueAtMax(x.slug, x.value, rank) : x.value),
      listed: scale === 'scaled' ? formatAuctionValue(x.slug, x.value) : null,
      positive: x.positive,
      fit: fitOf(x.slug, x.positive)
    }));
    let similarity = null;
    if (ref && refCount) {
      const hits = stats.filter(s => (s.positive ? ref.pos.has(s.slug) : ref.neg === s.slug)).length;
      similarity = Math.round(hits / refCount * 100);
    }
    return {
      id: a.id,
      url: `https://warframe.market/auction/${a.id}`,
      price: a.buyoutPrice ?? a.startingPrice ?? null,
      buyout: a.buyoutPrice != null,
      topBid: a.topBid ?? null,
      /* warframe.market fuehrt den Namen klein ("crita-satitis"), das Spiel
         schreibt nur den ersten Buchstaben gross. */
      name: a.item?.name ? a.item.name.charAt(0).toUpperCase() + a.item.name.slice(1) : null,
      mr: a.item?.masteryLevel ?? null,
      rank: a.item?.modRank ?? null,
      /* scaled: auf Rang 8 hochgerechnet; maxed: stand schon auf Rang 8 (oder
         war eingetragen, als ob); unknown: nicht pruefbar, wie eingetragen. */
      scale,
      rerolls: a.item?.reRolls ?? 0,
      polarity: a.item?.polarity || null,
      owner: a.owner ? { name: a.owner.name, status: a.owner.status, reputation: a.owner.reputation } : null,
      updatedAt: a.updatedAt || a.createdAt || null,
      stats,
      similarity
    };
  });

  if (opts.onlineOnly) offers = offers.filter(o => o.owner?.status === 'ingame' || o.owner?.status === 'online');
  /* "1p" heisst bei Auktionen fast immer "Gebote willkommen" - kein Preis. */
  if (opts.hideOnePlat) offers = offers.filter(o => (o.price ?? 0) > 1);
  if (priceMin != null) offers = offers.filter(o => o.price != null && o.price >= priceMin);
  if (priceMax != null) offers = offers.filter(o => o.price != null && o.price <= priceMax);
  if (ref && simMin != null) offers = offers.filter(o => (o.similarity ?? 0) >= simMin);

  const price = o => o.price ?? Infinity;
  offers.sort(ref
    ? (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0) || price(a) - price(b)
    : (a, b) => price(a) - price(b));

  return { total: offers.length, offers: offers.slice(0, limit) };
}
