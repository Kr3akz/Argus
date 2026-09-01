/**
 * Mod-Katalog und Kapazitaetsrechnung.
 *
 * Datenquelle ist DEs offizieller PublicExport (ExportUpgrades) - dieselbe Quelle
 * wie beim Item-Katalog, also kein Datamining und keine fremde Datenbank.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './paths.js';

const CDN = 'https://cdn.jsdelivr.net/gh/Aericio/warframe-exports-data/export';

/**
 * Polaritaeten, wie sie im Spiel heissen.
 *
 * `glyph` benennt das echte Zeichen (siehe icons.js), `symbol` bleibt als
 * Notbehelf fuer Stellen ohne Vektorzeichnung - etwa eine Konsolenausgabe.
 */
export const POLARITIES = {
  AP_ATTACK:    { key: 'madurai',   glyph: 'madurai', symbol: 'V', label: 'Madurai' },
  AP_DEFENSE:   { key: 'vazarin',   glyph: 'vazarin', symbol: 'D', label: 'Vazarin' },
  AP_TACTIC:    { key: 'naramon',   glyph: 'naramon', symbol: '—', label: 'Naramon' },
  AP_POWER:     { key: 'zenurik',   glyph: 'zenurik', symbol: '=', label: 'Zenurik' },
  AP_WARD:      { key: 'unairu',    glyph: 'unairu',  symbol: 'Ψ', label: 'Unairu' },
  AP_UMBRA:     { key: 'umbra',     glyph: 'umbra',   symbol: 'U', label: 'Umbra' },
  AP_PRECEPT:   { key: 'precept',   glyph: 'penjaga', symbol: 'P', label: 'Penjaga' },
  AP_UNIVERSAL: { key: 'universal', glyph: 'any',     symbol: '★', label: 'Universal (Aura Forma)' },
  AP_ANY:       { key: 'any',       glyph: 'any',     symbol: '★', label: 'Beliebig' }
};

export const RARITY_LABELS = {
  COMMON: 'Common', UNCOMMON: 'Uncommon',
  RARE: 'Rare', LEGENDARY: 'Legendary'
};

/**
 * Endo-Grundkosten je Seltenheit.
 *
 * Die Kosten VERDOPPELN sich mit jedem Rang, die Gesamtkosten bis Rang r sind
 * daher base * (2^r - 1). Eine lineare Rechnung unterschaetzt teure Mods
 * dramatisch (gemessen an Overframe: 16.740 statt 217.520 fuer denselben Build).
 *
 * DIE ZAHLEN SIND KEINE SCHAETZUNG. Es sind DEs eigene Grundkosten, und die
 * Formel ist die des Spiels - Gegenprobe unten. Hier standen vorher 4/6/10/20,
 * also durchweg ein Drittel bis die Haelfte des Richtigen. Bei Legendary faellt
 * es am meisten auf, weil sich der Fehler ueber zehn Raenge mitverdoppelt: eine
 * halbierte Basis ist rechnerisch dasselbe wie ein fehlender Rang, und genau so
 * sah es auch aus - Primed Continuity stand auf 20.460 statt auf 40.920.
 *
 * Gegenprobe gegen die Fusionstabelle des Wikis, Spalte "From Rank 0":
 *   Common    Rang 10 -> 10 * 1023 = 10.230
 *   Uncommon  Rang 10 -> 20 * 1023 = 20.460
 *   Rare      Rang 10 -> 30 * 1023 = 30.690
 *   Legendary Rang 10 -> 40 * 1023 = 40.920   (Primed Continuity)
 *
 * NICHT ERFASST: Antique-Mods (die Zid-An-Karten) haben eine eigene, weit
 * hoehere Basis - 160/320/480 nach Common/Uncommon/Rare. Sie laufen derzeit
 * ohnehin durch den Arcane-Zweig, siehe isArcane() in upgrade-details.js.
 */
const ENDO_BASE = { COMMON: 10, UNCOMMON: 20, RARE: 30, LEGENDARY: 40 };

/**
 * Rivens, und warum sie eine Sonderbehandlung brauchen.
 *
 * DEs Export fuehrt sie als VORLAGEN unter /Mods/Randomized/, und die tragen
 * Platzhalter statt Werten: fusionLimit 689 und rarity COMMON. Ungebremst wird
 * daraus eine Rangleiter mit 690 Stufen und ein Endo-Betrag von 2,5e+208 -
 * gesehen an "Melee Riven Mod", von dem 13 Stueck im Inventar liegen.
 *
 * Die echten Zahlen stehen nicht im Export, sie sind Spielregeln:
 *   Hoechstrang 8, und fuer die Fusion zaehlt ein Riven als Rare.
 *   30 * (2^8 - 1) = 7.650 Endo bis Rang 8 - so steht es auch im Wiki.
 *
 * Es gibt zwei Vorlagenfamilien, und BEIDE fallen hierunter: Raw*RandomMod
 * sind die verhuellten (liegen als blosse Stueckzahl in RawUpgrades),
 * Lotus*RandomModRare die enthuellten (mit eigenem Fingerprint in Upgrades).
 * Nur die zweite traegt die 689 - der Pfad fasst trotzdem beide, weil ein
 * Riven so oder so Rang 8 und Rare ist.
 */
const RIVEN_PATH = '/Upgrades/Mods/Randomized/';
export const RIVEN_MAX_RANK = 8;
const RIVEN_RARITY = 'RARE';

/** Ist das eine Riven-Vorlage aus dem Export? */
export function isRivenMod(mod) {
  return String(mod?.uniqueName || '').includes(RIVEN_PATH);
}

/**
 * Der Hoechstrang einer Karte - die EINE Stelle, die fusionLimit auslegt.
 *
 * Ohne levelStats und ohne fusionLimit bleibt 0 uebrig, und das ist richtig so:
 * eine Karte ohne Rangstufen hat genau eine.
 */
export function maxRankOf(mod) {
  if (isRivenMod(mod)) return RIVEN_MAX_RANK;
  return mod?.fusionLimit ?? Math.max(0, (mod?.levelStats?.length || 1) - 1);
}

/**
 * Der Rang, mit dem gerechnet wird.
 *
 * NUR bei Rivens gedeckelt, und das mit Absicht. Eine allgemeine Deckelung auf
 * maxRankOf() sieht harmlos aus und ist es nicht: builds.js reicht Teil-Objekte
 * herein ({ rarity, fusionLimit }), und wo fusionLimit fehlt, faellt maxRankOf
 * auf 0 zurueck. Aus Math.min(10, 0) wird dann still eine Null - ein ganzer
 * Build stand damit auf 0 Endo, ohne dass irgendwo etwas schiefging.
 *
 * Ein ausdruecklich uebergebener Rang gilt also. Nur die 689 der Riven-Vorlage
 * wird eingefangen, denn die ist kein Rang, sondern ein Platzhalter.
 */
function rangFuer(mod, rank) {
  if (isRivenMod(mod)) return Math.min(rank ?? RIVEN_MAX_RANK, RIVEN_MAX_RANK);
  return rank ?? mod?.fusionLimit ?? 0;
}

function flatten(json) {
  const out = [];
  for (const key of Object.keys(json)) if (Array.isArray(json[key])) out.push(...json[key]);
  return out;
}

export async function loadMods({ dataDir = defaultDataDir(), force = false } = {}) {
  await mkdir(dataDir, { recursive: true });
  const cacheFile = path.join(dataDir, 'mods.json');

  if (existsSync(cacheFile) && !force) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
      if (cached.mods) return index(cached.mods);
    } catch {
      // Beschädigte Datei -> neu laden
    }
  }

  const res = await fetch(`${CDN}/ExportUpgrades_en.json`);
  if (!res.ok) throw new Error(`Mod-Katalog: HTTP ${res.status}`);

  const mods = flatten(await res.json())
    .filter(m => m.uniqueName && m.name)
    .filter(m => /\/Upgrades\/Mods\//.test(m.uniqueName));

  await writeFile(cacheFile, JSON.stringify({ fetchedAt: Date.now(), mods }));
  return index(mods);
}

function index(mods) {
  const byUniqueName = new Map();
  const byName = new Map();
  for (const m of mods) {
    byUniqueName.set(m.uniqueName, m);
    // Namen sind nicht garantiert eindeutig - der erste Treffer gewinnt.
    if (!byName.has(m.name.toLowerCase())) byName.set(m.name.toLowerCase(), m);
  }
  return { mods, byUniqueName, byName };
}

/* ------------------------------------------------------------------ */
/*  Kapazitaet                                                         */
/* ------------------------------------------------------------------ */

/**
 * Kapazitaetsverbrauch eines Mods.
 *
 * Grundkosten steigen um 1 pro Rang. Passende Polaritaet halbiert (aufgerundet),
 * eine falsche Polaritaet im Slot verteuert um 25 % (aufgerundet).
 */
export function modDrain(mod, rank = null, slotPolarity = null) {
  const r = rangFuer(mod, rank);
  const base = (mod.baseDrain || 0) + r;

  if (!slotPolarity) return base;
  if (slotPolarity === mod.polarity || slotPolarity === 'AP_UNIVERSAL') {
    return Math.ceil(base / 2);
  }
  return Math.ceil(base * 1.25);
}

/** Endo-Kosten, um einen Mod von Rang 0 auf `rank` zu bringen. */
export function endoCost(mod, rank = null) {
  const r = rangFuer(mod, rank);
  if (r <= 0) return 0;
  /* Die COMMON-Vorlage eines Rivens waere hier die falsche Spalte. */
  const base = ENDO_BASE[isRivenMod(mod) ? RIVEN_RARITY : mod.rarity] || ENDO_BASE.COMMON;
  return base * (Math.pow(2, r) - 1);
}

/**
 * Verfuegbare Kapazitaet eines Items.
 * Rang 30 gibt 30 Punkte, ein Orokin-Reaktor/Katalysator verdoppelt auf 60.
 * Der Aura- bzw. Stance-Slot bringt zusaetzliche Kapazitaet statt welche zu kosten.
 */
export function itemCapacity({ rank = 30, orokin = true, auraBonus = 0 } = {}) {
  return (orokin ? rank * 2 : rank) + auraBonus;
}

/** Aura-Mods kosten keine Kapazitaet, sie geben welche dazu. */
export function isAuraMod(mod) {
  return mod?.compatName === 'AURA' || mod?.type === 'AURA';
}

/** Exilus-Mods (Utility) haben einen eigenen Slot. */
export function isExilusMod(mod) {
  return mod?.isUtility === true;
}

/**
 * Kapazitaetsgewinn eines Aura-Mods.
 *
 * ACHTUNG: Aura-Mods tragen im Export einen NEGATIVEN baseDrain (Steel Charge: -4),
 * weil sie Kapazitaet geben statt sie zu kosten. Ohne Math.abs kommt Unsinn heraus.
 * Passende Polaritaet verdoppelt den Bonus, statt ihn zu halbieren.
 *
 * Gegenprobe Steel Charge (Rang 5, Madurai): |-4| + 5 = 9, verdoppelt 18 -
 * exakt der Wert, den Overframe meldet.
 */
export function auraBonus(mod, rank = null, slotPolarity = null) {
  const r = rangFuer(mod, rank);
  const base = Math.abs(mod.baseDrain || 0) + r;
  const matches = slotPolarity && (slotPolarity === mod.polarity || slotPolarity === 'AP_UNIVERSAL');
  return matches ? base * 2 : base;
}

/** Welche Mods passen auf ein Item? compatName grenzt grob vor. */
export const COMPAT_BY_CATEGORY = {
  Suits: ['WARFRAME', 'AURA', 'ANY'],
  SpaceSuits: ['Archwing', 'ANY'],
  MechSuits: ['Necramech', 'ANY'],
  Sentinels: ['SENTINEL', 'ROBOTIC', 'ANY'],
  KubrowPets: ['Kubrow', 'Kavat', 'BEAST', 'ANY'],
  LongGuns: ['Rifle', 'Shotgun', 'Bow', 'ANY'],
  Pistols: ['Pistol', 'ANY'],
  Melee: ['Melee', 'Claws', 'ANY'],
  SpaceGuns: ['Archgun', 'ANY'],
  SpaceMelee: ['Archmelee', 'ANY'],
  SentinelWeapons: ['Rifle', 'Pistol', 'ANY'],
  KDrive: ['K-Drive', 'ANY']
};

/**
 * Mod-Suche fuer den Build-Editor.
 * Passende Mods zuerst, der Rest danach - so blockiert eine unvollstaendige
 * Kompatibilitaetsliste niemanden beim Bauen.
 */
export function searchMods({ mods }, query, { category = null, limit = 40 } = {}) {
  const q = String(query || '').toLowerCase().trim();
  if (q.length < 2) return [];

  const compat = category ? COMPAT_BY_CATEGORY[category] : null;
  const hits = mods.filter(m => m.name && m.name.toLowerCase().includes(q));

  const score = m => {
    let s = 0;
    if (compat && compat.includes(m.compatName)) s -= 100;      // passende zuerst
    if (m.name.toLowerCase().startsWith(q)) s -= 10;            // Praefix schlaegt Teiltreffer
    return s + m.name.length / 100;
  };
  hits.sort((a, b) => score(a) - score(b));

  // Der Export enthaelt denselben Mod mehrfach (alte Fassungen, Varianten).
  // Doppelte Namen wuerden die Auswahl unbrauchbar machen - der bestbewertete gewinnt.
  const seen = new Set();
  const unique = [];
  for (const m of hits) {
    const key = m.name.toLowerCase() + '|' + (m.compatName || '');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
    if (unique.length >= limit) break;
  }
  return unique;
}
