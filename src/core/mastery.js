/**
 * Mastery-Berechnung fuer Warframe.
 *
 * GEGENPROBE (05.10.2026, Kaans Konto): Das Spiel nannte 128.762 MR-XP bis
 * MR 31, also 2.268.738 insgesamt. Argus kommt auf den Punkt genau dahin:
 *
 *     Items                   2.106.500   (554 XPInfo-Eintraege, alle gezaehlt)
 *     Intrinsics                114.000   (76 Raenge x 1.500)
 *     Junctions                  25.000   (13 normal + 12 Steel Path, je 1.000)
 *     Knoten                     23.238   (14.569 normal + 8.669 Steel Path)
 *
 * Vorher fehlten 30.438: der Steel Path ganz, die Knotenwerte (pauschal 100
 * statt der echten, siehe node-mastery.js) und sieben Items, die classify.js
 * nicht erkannte. Dafuer zaehlte der Mausolon dreifach.
 *
 * Punktwerte: wiki.warframe.com/w/Mastery_Rank. Rang aus Affinity:
 * Braton Rang 30 => sqrt(450000/500) = 30 => 100*30 = 3000.
 */

/** Kategorien, die 200 MR-XP pro Rang geben. Alles andere gibt 100. */
export const BIG_XP_CATEGORIES = new Set([
  'Suits',        // Warframes
  'SpaceSuits',   // Archwings
  'MechSuits',    // Necramechs
  'Sentinels',
  'KubrowPets',   // Kubrows + Kavats
  'Hoverboards',  // K-Drives
  'Plexus'
]);

/** Kategorien, die ueberhaupt Mastery geben (alles andere ignorieren wir). */
export const MASTERY_CATEGORIES = new Set([
  ...BIG_XP_CATEGORIES,
  'LongGuns', 'Pistols', 'Melee',
  'SpaceGuns', 'SpaceMelee',
  'SentinelWeapons',
  'OperatorAmps'
]);

export const XP_PER_JUNCTION = 1000;
export const XP_PER_INTRINSIC = 1500;

/* Junctions erkennt auch ihr Kennungsname ("EarthToVenusJunction") - so
   zaehlen sie ohne Knotentabelle und auch eine neue, die sie noch nicht kennt. */
const JUNCTION_TAG = /junction/i;

/**
 * MR-XP aus der Sternenkarte: Knoten und Junctions, normal und Steel Path.
 *
 * STEEL PATH ZAEHLT EIGENS:
 *   Jeder Knoten und jede Junction gibt im Steel Path ein zweites Mal
 *   dieselbe Mastery. Im Profil steht dafuer kein eigener Eintrag, sondern
 *   `Tier: 1` am Eintrag des Knotens (bei Kaan 177 von 331; die Kennungen
 *   sind eindeutig). Gegenprobe: ohne Steel Path enden die Knoten auf ...69,
 *   das Spiel auf ...38 - mit ihm passt es. Andere Tier-Werte (2, 4, 5)
 *   tragen nur die Descent-Knoten, und die geben keine Mastery.
 *
 * @param missions  profile.Missions
 * @param table     aus node-mastery.js, oder null - dann zaehlen die Knoten 0
 *                  und `nodesKnown` ist false; die Junctions zaehlen trotzdem.
 */
export function starChartXP(missions, table) {
  const out = { nodes: 0, steelPathNodes: 0, junctions: 0, steelPathJunctions: 0, nodesKnown: !!table };
  for (const m of missions || []) {
    const steel = m.Tier === 1;
    if (!steel && !(m.Completes > 0)) continue;
    const junction = table?.junctions.has(m.Tag) || JUNCTION_TAG.test(m.Tag || '');
    if (junction) {
      out.junctions += XP_PER_JUNCTION;
      if (steel) out.steelPathJunctions += XP_PER_JUNCTION;
      continue;
    }
    /* Unbekannte Kennungen (Event-Knoten, Railjack, ganz neue Knoten) mit 0:
       bei Kaan stehen 13 davon im Profil, und die Gegenprobe geht ohne sie auf. */
    const xp = table?.nodes.get(m.Tag) || 0;
    out.nodes += xp;
    if (steel) out.steelPathNodes += xp;
  }
  return out;
}

/** MR-XP pro Rang fuer eine Item-Kategorie. */
export function xpPerRank(productCategory) {
  return BIG_XP_CATEGORIES.has(productCategory) ? 200 : 100;
}

/** Maximaler Rang. Kuva/Tenet/Coda/Paracesis haben maxLevelCap 40. */
export function maxRank(item) {
  return item.maxLevelCap || 30;
}

/**
 * Rang aus roher Affinity.
 * Affinity laeuft ueber den Maximalrang hinaus weiter - deshalb der Deckel.
 */
export function rankFromXP(xp, productCategory, item = {}) {
  const per = xpPerRank(productCategory);
  return Math.min(Math.floor(Math.sqrt(xp / (per * 5))), maxRank(item));
}

/** Bereits verdiente Mastery-Punkte eines Items. */
export function masteryFromXP(xp, productCategory, item = {}) {
  return xpPerRank(productCategory) * rankFromXP(xp, productCategory, item);
}

/** Maximal erreichbare Mastery-Punkte eines Items. */
export function masteryPotential(item) {
  return xpPerRank(item.productCategory) * maxRank(item);
}

/** Gesamt-MR-XP -> Mastery Rank. Ab MR 30 lineare Legendary-Ranks. */
export function xpToMR(xp) {
  let mr = Math.floor(Math.sqrt(xp / 2500));
  if (mr >= 30) mr = 30 + Math.floor((xp - 2250000) / 147500);
  return mr;
}

/** Mastery Rank -> benoetigte Gesamt-MR-XP. */
export function mrToXP(mr) {
  return mr > 30 ? 2250000 + 147500 * (mr - 30) : 2500 * mr * mr;
}

/**
 * Fortschritt zum naechsten Rang bei VORGEGEBENEM Rang.
 *
 * Der Rang aus dem Profil ist die Wahrheit. Faellt unsere Summe doch einmal
 * unter seine Schwelle (Knotentabelle nicht geladen, ein Item, das Argus nicht
 * kennt), wird sie auf die Schwelle angehoben, statt einen negativen Restwert
 * auszurechnen.
 *
 * Umgekehrt kann die Summe die NAECHSTE Schwelle schon ueberschreiten: dann
 * fehlt keine XP mehr, sondern nur der Rangtest - `ready`.
 */
export function progressForMR(xp, mr) {
  const cur = mrToXP(mr);
  const next = mrToXP(mr + 1);
  const known = Math.max(xp, cur);
  return {
    mr,
    current: known,
    needed: next,
    remaining: Math.max(0, next - known),
    percent: ((known - cur) / (next - cur)) * 100,
    ready: known >= next
  };
}

/** Fortschritt zum naechsten Rang, fuer Progressbars. */
export function progressToNextMR(xp) {
  return progressForMR(xp, xpToMR(xp));
}

export function masteryRankName(mr) {
  if (mr > 30) return `Legendary ${mr - 30}`;
  if (mr === 0) return 'Unranked';
  if (mr >= 28) return mr === 28 ? 'Master' : `${mr === 29 ? 'Middle' : 'True'} Master`;
  const names = ['Unranked', 'Initiate', 'Novice', 'Disciple', 'Seeker',
                 'Hunter', 'Eagle', 'Tiger', 'Dragon', 'Sage'];
  const base = names[Math.ceil(mr / 3)];
  const tier = mr % 3;
  return tier === 1 ? base : `${tier === 0 ? 'Gold' : 'Silver'} ${base}`;
}
