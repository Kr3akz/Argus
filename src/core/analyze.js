/**
 * Abgleich Katalog <-> Profil und Empfehlungs-Engine.
 */
import { classify } from './classify.js';
import { xpToMR, mrToXP, XP_PER_INTRINSIC, starChartXP } from './mastery.js';
import { ownedXPMap, intrinsics } from './profile.js';
import { acquisitionOf, levelingEffort } from './acquisition.js';

const STATUS = { DONE: 'done', PARTIAL: 'partial', MISSING: 'missing' };
export { STATUS };

/** Founders-Items sind nicht mehr erhaeltlich - nicht als "fehlend" melden. */
const UNOBTAINABLE = new Set(['Excalibur Prime', 'Skana Prime', 'Lato Prime']);

/* Gibt Mastery, steht aber in keiner Exportdatei: das Plexus des Railjacks.
   In XPInfo laeuft es unter dieser Kennung (bei Kaan Rang 30, 6.000 MR-XP). */
const EXTRA_ITEMS = [
  { uniqueName: '/Lotus/Types/Game/CrewShip/RailJack/DefaultHarness', name: 'Plexus' }
];

/**
 * Vergleicht den Katalog mit dem Profil.
 * Liefert je Item Status, aktuellen Rang und offenen MR-Gewinn.
 *
 * @param nodeTable  Mastery je Knoten aus node-mastery.js. Ohne sie zaehlen
 *                   die Knoten 0, und die Summe ist nur eine Untergrenze.
 */
export function analyze(profile, catalog, nodeTable = null) {
  const owned = ownedXPMap(profile);
  const chart = starChartXP(profile?.Missions, nodeTable);
  const intr = intrinsics(profile);

  const entries = [];
  let earnedFromItems = 0;

  /* Gegen items pruefen, nicht gegen byUniqueName: dort stehen auch die
     Nachschlage-Eintraege, und die zaehlen nicht. */
  const listed = new Set(catalog.items.map(i => i.uniqueName));
  const extra = EXTRA_ITEMS.filter(i => !listed.has(i.uniqueName));
  for (const item of [...catalog.items, ...extra]) {
    const cls = classify(item);
    if (!cls.countsForMastery) continue;
    const xp = owned.get(item.uniqueName);
    /* Nur nicht als FEHLEND melden - wer sie hat, bekommt die Mastery. */
    if (UNOBTAINABLE.has(item.name) && xp === undefined) continue;

    const maxLvl = item.maxLevelCap || 30;
    const perRank = cls.xpPerRank;
    const potential = perRank * maxLvl;

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

  const xpJunctions = chart.junctions + chart.steelPathJunctions;
  const xpNodes = chart.nodes + chart.steelPathNodes;
  const xpIntrinsics = intr * XP_PER_INTRINSIC;
  const totalXP = earnedFromItems + xpJunctions + xpNodes + xpIntrinsics;

  const openGain = entries.reduce((s, e) => s + e.gain, 0);

  /* Was in XPInfo steht und trotzdem nicht gezaehlt wurde. Bei Kaan ist die
     Liste leer - jeder Eintrag dort gibt Mastery. Steht hier etwas, kennt
     classify.js eine neue Art Gegenstand noch nicht (fuer report.js und den
     Test, nicht fuer die Oberflaeche). */
  const counted = new Set(entries.filter(e => e.status !== STATUS.MISSING).map(e => e.uniqueName));
  const uncounted = [...owned.keys()].filter(u => !counted.has(u));

  /**
   * Der Rang kommt aus dem Profil, nicht aus unserer Rechnung.
   *
   * Die Rechnung trifft seit dem 05.10.2026 Kaans Stand auf den Punkt (siehe
   * mastery.js) - die Luecke von damals war der Steel Path, die Knotenwerte
   * und eine Handvoll unerkannter Items. Der Rang aus dem Profil bleibt
   * trotzdem die Wahrheit: ohne Knotentabelle oder mit einem Item, das Argus
   * noch nicht kennt, faellt die Summe wieder darunter. Dann gilt sie als
   * Untergrenze, und die Oberflaeche sagt das dazu.
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
      /* false: Knotentabelle fehlte, die Knoten zaehlten 0. */
      nodesKnown: chart.nodesKnown,
      uncounted,
      reportedMR: profile.PlayerLevel,
      totalXP,
      breakdown: {
        items: earnedFromItems,
        junctions: xpJunctions,
        nodes: xpNodes,
        intrinsics: xpIntrinsics
      },
      starChart: chart,
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
  const acq = acquisitionOf(item, catalog);
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
      /* Der Eintrag selbst, wenn der Katalog das Item nicht fuehrt (Plexus):
         Kennung und Name reichen acquisitionOf, um die Quelle zu finden. */
      const item = catalog.byUniqueName.get(e.uniqueName) || e;
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
