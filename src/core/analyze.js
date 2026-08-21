/**
 * Abgleich Katalog <-> Profil und Empfehlungs-Engine.
 */
import { classify } from './classify.js';
import { xpToMR, mrToXP, XP_PER_JUNCTION, XP_PER_INTRINSIC, XP_PER_NODE } from './mastery.js';
import { ownedXPMap, starChart, intrinsics } from './profile.js';
import { acquisitionOf, levelingEffort } from './acquisition.js';

const STATUS = { DONE: 'done', PARTIAL: 'partial', MISSING: 'missing' };
export { STATUS };

/** Founders-Items sind nicht mehr erhaeltlich - nicht als "fehlend" melden. */
const UNOBTAINABLE = new Set(['Excalibur Prime', 'Skana Prime', 'Lato Prime']);

/**
 * Vergleicht den Katalog mit dem Profil.
 * Liefert je Item Status, aktuellen Rang und offenen MR-Gewinn.
 */
export function analyze(profile, catalog) {
  const owned = ownedXPMap(profile);
  const chart = starChart(profile);
  const intr = intrinsics(profile);

  const entries = [];
  let earnedFromItems = 0;

  for (const item of catalog.items) {
    const cls = classify(item);
    if (!cls.countsForMastery) continue;
    if (UNOBTAINABLE.has(item.name)) continue;

    const maxLvl = item.maxLevelCap || 30;
    const perRank = cls.xpPerRank;
    const potential = perRank * maxLvl;
    const xp = owned.get(item.uniqueName);

    let status, rank;
    if (xp === undefined) {
      status = STATUS.MISSING;
      rank = 0;
    } else {
      rank = Math.min(Math.floor(Math.sqrt(xp / (perRank * 5))), maxLvl);
      status = rank >= maxLvl ? STATUS.DONE : STATUS.PARTIAL;
    }

    const earned = perRank * rank;
    earnedFromItems += earned;

    entries.push({
      uniqueName: item.uniqueName,
      name: item.name,
      category: cls.category,
      masteryReq: item.masteryReq ?? 0,
      status, rank, maxLvl, perRank,
      earned,
      potential,
      gain: potential - earned,
      isPrime: /\bPrime\b/.test(item.name || '')
    });
  }

  const xpJunctions = chart.junctions * XP_PER_JUNCTION;
  const xpNodes = chart.nodes * XP_PER_NODE;
  const xpIntrinsics = intr * XP_PER_INTRINSIC;
  const totalXP = earnedFromItems + xpJunctions + xpNodes + xpIntrinsics;

  const openGain = entries.reduce((s, e) => s + e.gain, 0);

  /**
   * Der Rang kommt aus dem Profil, nicht aus unserer Rechnung.
   *
   * Gegenprobe an echten Daten: das Spiel meldet MR 27, unsere Summe ergibt 26.
   * Die 440 XPInfo-Eintraege sind bis auf einen Railjack-Harness vollstaendig
   * aufgeloest, Intrinsics stimmen (62 Raenge, Railjack und Drifter tragen beide
   * das Praefix LPS_), alle 322 Missions-Tags sind eindeutig. Es fehlt also eine
   * Quelle, die das oeffentliche Profil gar nicht ausweist - naheliegend der
   * Steel Path, belegen laesst es sich an diesen Daten nicht.
   *
   * Deshalb: PlayerLevel gewinnt, totalXP gilt als Untergrenze. Lieber eine
   * ehrliche Luecke ausweisen als dem Nutzer einen falschen Rang anzeigen.
   */
  const computedMR = xpToMR(totalXP);
  const mr = Number.isInteger(profile.PlayerLevel) ? profile.PlayerLevel : computedMR;
  const hiddenXP = Math.max(0, mrToXP(mr) - totalXP);

  return {
    entries,
    summary: {
      mr,
      computedMR,
      hiddenXP,
      reportedMR: profile.PlayerLevel,
      totalXP,
      breakdown: {
        items: earnedFromItems,
        junctions: xpJunctions,
        nodes: xpNodes,
        intrinsics: xpIntrinsics
      },
      counts: {
        done: entries.filter(e => e.status === STATUS.DONE).length,
        partial: entries.filter(e => e.status === STATUS.PARTIAL).length,
        missing: entries.filter(e => e.status === STATUS.MISSING).length
      },
      openGain,
      /* Auch hier mit der Luecke rechnen - sonst sagt die Vorschau einen Rang
         voraus, den der Nutzer laengst hat. */
      potentialMR: xpToMR(totalXP + hiddenXP + openGain),
      nextMRneeds: Math.max(0, mrToXP(mr + 1) - (totalXP + hiddenXP))
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Empfehlungs-Engine                                                 */
/* ------------------------------------------------------------------ */

/**
 * Gesamtaufwand eines Ziels.
 * Beschaffung (entfaellt bei Besitz) + Leveln.
 */
function scoreEntry(entry, catalog, item, playerMR) {
  const acq = acquisitionOf(item);
  const ranksLeft = entry.maxLvl - entry.rank;
  const levelCost = levelingEffort(ranksLeft, entry.maxLvl);

  // Bereits im Besitz -> nur noch leveln, kein Beschaffungsaufwand.
  const owned = entry.status === STATUS.PARTIAL;
  let effort = owned ? levelCost : acq.effort + levelCost;

  // Bauaufwand oben drauf, wenn ein Rezept bekannt ist.
  if (!owned) {
    const r = catalog.recipeFor.get(entry.uniqueName);
    if (r) {
      effort += (r.buildPrice || 0) / 25000 * 3;
      effort += (r.buildTime || 0) / 86400 * 6;
    }
  }
  if (entry.masteryReq > playerMR) effort += 9999; // gesperrt

  return { effort: Math.max(1, effort), acq, owned, ranksLeft };
}

function buildReason(entry, catalog, acq, owned, ranksLeft) {
  if (owned) {
    return entry.maxLvl > 30
      ? `You own it — rank ${entry.rank}/${entry.maxLvl}, ${ranksLeft} ranks via forma`
      : `You own it — only ${ranksLeft} ${ranksLeft === 1 ? 'rank' : 'ranks'} left`;
  }
  const r = catalog.recipeFor.get(entry.uniqueName);
  const build = r
    ? ` | Build: ${(r.buildPrice || 0).toLocaleString('en-GB')} cr, ${Math.round((r.buildTime || 0) / 3600)}h`
    : '';
  return `${acq.label}: ${acq.note}${build}`;
}

/**
 * Liefert drei getrennte Listen statt einer vermischten Rangliste:
 *   quickWins - schon im Besitz, nur noch hochleveln (kein Farmen)
 *   easyGains - guenstig zu beschaffen
 *   bigGains  - grosser MR-Sprung, dafuer mehr Aufwand
 */
export function recommend(analysis, catalog, { limit = 10, playerMR = null, categories = null } = {}) {
  const mr = playerMR ?? analysis.summary.mr;

  const scored = analysis.entries
    .filter(e => e.status !== STATUS.DONE && e.gain > 0)
    .filter(e => !categories || categories.includes(e.category))
    .filter(e => e.masteryReq <= mr)
    .map(e => {
      const item = catalog.byUniqueName.get(e.uniqueName) || {};
      const { effort, acq, owned, ranksLeft } = scoreEntry(e, catalog, item, mr);
      return {
        ...e,
        effort: Math.round(effort),
        efficiency: e.gain / effort,
        source: acq.key,
        sourceLabel: acq.label,
        owned,
        ranksLeft,
        reason: buildReason(e, catalog, acq, owned, ranksLeft)
      };
    });

  const byEff = (a, b) => b.efficiency - a.efficiency;

  const quickWins = scored.filter(r => r.owned).sort((a, b) => a.effort - b.effort).slice(0, limit);
  const easyGains = scored.filter(r => !r.owned).sort(byEff).slice(0, limit);
  const shown = new Set(easyGains.map(r => r.uniqueName));
  // Grosse Brocken: hoechster Absolutgewinn, ohne Wiederholung aus easyGains
  const bigGains = scored
    .filter(r => !r.owned && !shown.has(r.uniqueName) && r.gain >= 6000)
    .sort((a, b) => b.gain - a.gain || a.effort - b.effort)
    .slice(0, limit);
  return { quickWins, easyGains, bigGains, all: scored.sort(byEff) };
}

/**
 * Begrenzt Wiederholungen: hoechstens maxPerCat Eintraege je Kategorie.
 * Ohne das ueberschwemmen 19 gleichwertige K-Drives jede Liste.
 */
export function diversify(list, maxPerCat = 2, limit = 8) {
  const seen = {};
  const out = [];
  for (const r of list) {
    seen[r.category] = (seen[r.category] || 0) + 1;
    if (seen[r.category] > maxPerCat) continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
