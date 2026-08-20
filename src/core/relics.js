/**
 * Relikt-Belohnungstabellen aus DEs offiziellen Droptabellen.
 *
 * QUELLE:
 *   drops.warframestat.us spiegelt die HTML-Droptabellen, die DE selbst
 *   veroeffentlicht, als JSON. Damit sind Belohnungen, Seltenheit und Chance
 *   dieselben Zahlen, die im Spiel gelten - keine Schaetzung, keine Pflegeliste.
 *
 * ZUSTAND:
 *   Jedes Relikt steht viermal in der Datei, einmal je Politur-Stufe. Die
 *   BELOHNUNGEN sind in allen vier gleich, nur die Chancen unterscheiden sich
 *   (Intact 25,33 % auf Uncommon, Radiant 20 % - dafuer steigt Rare von 2 % auf
 *   10 %). Deshalb wird nach Relikt gruppiert und der Zustand als Auswahl
 *   gefuehrt, statt vier getrennte Relikte zu fuehren.
 *
 * VAULTED:
 *   Steht ein Relikt nicht mehr in der Tabelle, ist es nicht mehr farmbar.
 *   Diese Datei ist damit auch die Antwort auf die offene Frage im README,
 *   welche Prime-Teile noch erreichbar sind - hier aber nur als Datenquelle,
 *   nicht ausgewertet.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const URL = 'https://drops.warframestat.us/data/relics.json';
const CACHE = () => path.join('data', 'relic-drops.json');
const USER_AGENT = 'Cephalon-Argus/0.1 (persoenlicher Mastery-Planer)';

/* Die Tabellen aendern sich nur zu Updates und Prime-Access-Wechseln. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/* Reihenfolge der Politur-Stufen, wie sie im Spiel aufeinander folgen. */
export const RELIC_STATES = ['Intact', 'Exceptional', 'Flawless', 'Radiant'];
export const RELIC_TIERS  = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'];

let index = null;   // { relics: [...], byKey: Map }

export const relicKey = (tier, name) => `${tier} ${name}`.trim();

function build(list) {
  const byKey = new Map();

  for (const entry of list) {
    if (!entry?.tier || !entry?.relicName) continue;
    const key = relicKey(entry.tier, entry.relicName);

    let relic = byKey.get(key);
    if (!relic) {
      relic = { key, tier: entry.tier, name: entry.relicName, states: {} };
      byKey.set(key, relic);
    }

    relic.states[entry.state || 'Intact'] = (entry.rewards || []).map(r => ({
      itemName: r.itemName,
      rarity: r.rarity,
      chance: r.chance
    }));
  }

  const relics = [...byKey.values()].sort((a, b) => {
    const t = RELIC_TIERS.indexOf(a.tier) - RELIC_TIERS.indexOf(b.tier);
    return t !== 0 ? t : a.name.localeCompare(b.name, 'en', { numeric: true });
  });

  return { relics, byKey };
}

export async function loadRelicTables({ refresh = false } = {}) {
  if (index && !refresh) return index;

  let cached = null;
  if (existsSync(CACHE())) {
    try { cached = JSON.parse(await readFile(CACHE(), 'utf8')); } catch { cached = null; }
  }

  const fresh = cached && (Date.now() - cached.fetchedAt < TTL_MS);
  if (cached && fresh && !refresh) {
    index = build(cached.list);
    return index;
  }

  try {
    const res = await fetch(URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const list = json.relics || [];
    if (!list.length) throw new Error('leere Relikttabelle');

    await mkdir('data', { recursive: true });
    await writeFile(CACHE(), JSON.stringify({ fetchedAt: Date.now(), list }));
    index = build(list);
  } catch (err) {
    if (!cached) throw err;
    index = build(cached.list);
    index.stale = err.message;
  }
  return index;
}

/**
 * Alle Namen, die ueberhaupt als Reliktbelohnung auftauchen koennen.
 * Das Kandidatenfeld fuer die Bildschirmerkennung - rund 600 Eintraege.
 */
export function allRewardNames(idx) {
  const names = new Set();
  for (const relic of idx?.relics || []) {
    for (const rewards of Object.values(relic.states || {})) {
      for (const r of rewards) if (r.itemName) names.add(r.itemName);
    }
  }
  return [...names];
}

/** Belohnungen eines Relikts in einem Zustand, beste Seltenheit zuerst. */
export function rewardsFor(idx, key, state = 'Intact') {
  const relic = idx?.byKey.get(key);
  if (!relic) return null;

  const rewards = relic.states[state] || relic.states.Intact || [];
  const order = { Rare: 0, Uncommon: 1, Common: 2 };

  return {
    ...relic,
    state,
    rewards: [...rewards].sort((a, b) =>
      (order[a.rarity] ?? 9) - (order[b.rarity] ?? 9) || (b.chance || 0) - (a.chance || 0))
  };
}

/**
 * Relikt aus einem Inventarpfad aufloesen.
 *
 * WARUM UEBER DIE MARKTLISTE:
 *   DEs interner Pfad hat mit dem Anzeigenamen nichts zu tun -
 *   T1VoidProjectionD heisst im Spiel "Lith V1", nicht "Lith D". Ableiten
 *   laesst sich das nicht, es braucht eine Zuordnungstabelle.
 *
 *   Der Katalog (PublicExport) fuehrt nur die 31 aktuell erhaeltlichen
 *   Relikte. Die Droptabellen ebenfalls nur die farmbaren. Beide kennen die
 *   vaulted Relikte nicht - und genau die machen den Grossteil eines
 *   gewachsenen Inventars aus (hier: 214 von 215 Sorten).
 *
 *   Die Itemliste von warframe.market fuehrt alle 774, weil vaulted Relikte
 *   weiter gehandelt werden. Deshalb ist sie hier die Namensquelle. Der Index
 *   wird uebergeben, statt market.js zu importieren: die Relikttabellen
 *   sollen ohne Marktzugriff benutzbar bleiben.
 */
const STATE_BY_METAL = { Bronze: 'Intact', Silver: 'Exceptional', Gold: 'Flawless', Platinum: 'Radiant' };

/** Trennt die Politur-Stufe ab. Der Rest ist der gameRef der Marktliste. */
export function parseRelicPath(uniqueName = '') {
  if (!uniqueName.includes('/Projections/')) return null;

  const m = /^(.+?)(Bronze|Silver|Gold|Platinum)$/.exec(uniqueName);
  /* Requiem- und Omnia-Relikte lassen sich nicht polieren. Dort fehlt das
     Metall-Suffix, und der ganze Pfad ist bereits der gameRef - ohne diesen
     Zweig faellt jedes Requiem-Relikt aus der Aufloesung. */
  if (!m) return { base: uniqueName, state: 'Intact' };

  return { base: m[1], state: STATE_BY_METAL[m[2]] || 'Intact' };
}

/** "Lith V1 Relic" -> "Lith V1", der Schluessel der Droptabelle. */
export const relicKeyFromName = name => String(name || '').replace(/\s+Relic$/i, '').trim();

/**
 * Inventarpfad -> { key, state, slug, displayName } oder null.
 * marketIdx ist das Ergebnis von loadMarketItems().
 */
export function resolveInventoryRelic(marketIdx, uniqueName) {
  const parsed = parseRelicPath(uniqueName);
  if (!parsed) return null;

  const item = marketIdx?.byGameRef?.get(parsed.base);
  if (!item) return { key: null, state: parsed.state, slug: null, displayName: null, base: parsed.base };

  const displayName = item.i18n?.en?.name || '';
  return {
    key: relicKeyFromName(displayName),
    state: parsed.state,
    slug: item.slug,
    displayName,
    base: parsed.base
  };
}
