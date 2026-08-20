/**
 * Mastery-Berechnung fuer Warframe.
 *
 * Alle Konstanten wurden gegen ein echtes Profil verifiziert (MR 27 exakt reproduziert),
 * nicht aus Dokumentation uebernommen. Quellen:
 *   - wiki.warframe.com/w/Mastery_Rank (Punktwerte)
 *   - Gegenprobe: Braton Rang 30 => sqrt(450000/500) = 30 => 100*30 = 3000
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
export const XP_PER_NODE = 100;

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
 * Braucht es, weil das oeffentliche Profil nicht alle MR-Quellen ausweist: bei
 * einem Steel-Path-Spieler faellt unsere XP-Summe unter die Schwelle des Rangs,
 * den das Spiel selbst meldet. Der Rang aus dem Profil ist die Wahrheit, unsere
 * Summe nur eine Untergrenze - deshalb wird sie auf die Schwelle angehoben,
 * statt einen negativen Restwert auszurechnen.
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
    percent: ((known - cur) / (next - cur)) * 100
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
