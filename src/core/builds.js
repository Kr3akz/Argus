/**
 * Build-Modell: Kapazitaet, benoetigte Ressourcen, fehlende Mods.
 *
 * Ein Build sieht so aus:
 *   {
 *     id, name, itemUniqueName, itemName, itemRank, orokin,
 *     slots: [ { mod: uniqueName, rank, polarity } | null, ... ],
 *     source: 'manual' | 'overframe', sourceUrl, formaOverride
 *   }
 */
import { modDrain, endoCost, itemCapacity, POLARITIES, isAuraMod, isExilusMod, auraBonus } from './mods.js';

/** Warframes bekommen einen Reaktor, alles andere einen Katalysator. */
const REACTOR_CATEGORIES = new Set(['Suits', 'SpaceSuits', 'MechSuits', 'Sentinels', 'KubrowPets']);

export function orokinTypeFor(productCategory) {
  return REACTOR_CATEGORIES.has(productCategory)
    ? { key: 'reactor',  label: 'Orokin-Reaktor' }
    : { key: 'catalyst', label: 'Orokin-Katalysator' };
}

/**
 * Rechnet einen Build durch.
 *
 * @param build      Build-Objekt (siehe oben)
 * @param modIndex   { byUniqueName } aus loadMods()
 * @param ownedMods  Set von uniqueNames, die der Spieler besitzt
 * @param item       Katalog-Item (fuer productCategory)
 */
export function evaluateBuild(build, modIndex, ownedMods = new Set(), item = null) {
  const slots = [];
  let used = 0;
  let endo = 0;
  let forma = 0;
  let auraForma = 0;
  let umbraForma = 0;

  for (const slot of build.slots || []) {
    if (!slot || !slot.mod) { slots.push(null); continue; }

    const mod = modIndex.byUniqueName.get(slot.mod);
    if (!mod) {
      // Mod aus dem Katalog verschwunden (umbenannt/entfernt) - nicht verschlucken.
      slots.push({ unknown: true, uniqueName: slot.mod, rank: slot.rank ?? 0 });
      continue;
    }

    const rank = slot.rank ?? mod.fusionLimit ?? 0;

    // Aura- und Stance-Mods kosten keine Kapazitaet, sie geben welche dazu.
    // Beim Import erkennbar am negativen drain (Steel Charge: -18), bei eigenen
    // Builds am Mod selbst (compatName AURA).
    const isAura = typeof slot.drainFromSource === 'number'
      ? slot.drainFromSource < 0
      : isAuraMod(mod);

    let drain;
    if (slot.drainFromSource != null) {
      drain = slot.drainFromSource;                                  // exakter Wert der Quelle
    } else if (isAura) {
      drain = -auraBonus(mod, rank, slot.polarity || null);          // negativ = gibt Kapazitaet
    } else {
      drain = modDrain(mod, rank, slot.polarity || null);
    }

    used += drain;                       // negativer Wert erhoeht die freie Kapazitaet
    endo += endoCost(mod, rank);

    // Jede gesetzte Polaritaet kostet ein Forma - Sonderformen zaehlen extra.
    if (slot.polarity) {
      if (slot.polarity === 'AP_UNIVERSAL') auraForma++;
      else if (slot.polarity === 'AP_UMBRA') umbraForma++;
      else forma++;
    }

    slots.push({
      uniqueName: mod.uniqueName,
      name: mod.name,
      rank,
      maxRank: mod.fusionLimit ?? 0,
      baseDrain: mod.baseDrain ?? 0,
      drain,
      isAura,
      polarity: slot.polarity || null,
      polaritySymbol: slot.polarity ? POLARITIES[slot.polarity]?.symbol : null,
      modPolarity: mod.polarity || null,
      rarity: mod.rarity,
      owned: ownedMods.has(mod.uniqueName),
      description: mod.description || '',
      stats: statsForRank(mod, rank)
    });
  }

  const capacity = itemCapacity({
    rank: build.itemRank ?? 30,
    orokin: build.orokin !== false
  });

  const filled = slots.filter(Boolean);
  const missing = filled.filter(s => !s.unknown && !s.owned);
  const orokinType = orokinTypeFor(item?.productCategory);

  return {
    slots,
    capacity,
    used,
    free: capacity - used,
    overCapacity: used > capacity,
    requirements: {
      // Overframe liefert die Forma-Zahl direkt mit - die ist verlaesslicher.
      forma: build.formaOverride ?? forma,
      auraForma,
      umbraForma,
      orokin: build.orokin !== false ? 1 : 0,
      orokinType: orokinType.key,
      orokinLabel: orokinType.label,
      // Liegt ein exakter Wert der Quelle vor, hat der Vorrang - die eigene
      // Formel ist nur eine Naeherung (siehe endoCost in mods.js).
      endo: build.endoFromSource ?? endo,
      endoEstimated: build.endoFromSource == null
    },
    mods: {
      total: filled.length,
      owned: filled.filter(s => s.owned).length,
      missing: missing.length,
      missingList: missing
    }
  };
}

/** Werte eines Mods auf einem bestimmten Rang. */
function statsForRank(mod, rank) {
  if (Array.isArray(mod.levelStats) && mod.levelStats[rank]) {
    return mod.levelStats[rank].stats || [];
  }
  return mod.stats || [];
}

/**
 * Fasst mehrere Builds zusammen: was muss insgesamt beschafft werden?
 * Ein Mod, der in drei Builds steckt, wird nur einmal gezaehlt.
 */
export function combineBuilds(builds, modIndex, ownedMods = new Set(), itemLookup = () => null) {
  const missingMods = new Map();
  let forma = 0, auraForma = 0, umbraForma = 0, endo = 0;
  const orokin = { reactor: 0, catalyst: 0 };
  const perBuild = [];

  for (const b of builds) {
    const item = itemLookup(b.itemUniqueName);
    const ev = evaluateBuild(b, modIndex, ownedMods, item);
    perBuild.push({ build: b, evaluation: ev });

    forma      += ev.requirements.forma;
    auraForma  += ev.requirements.auraForma;
    umbraForma += ev.requirements.umbraForma;
    if (ev.requirements.orokin) orokin[ev.requirements.orokinType]++;

    for (const m of ev.mods.missingList) {
      if (missingMods.has(m.uniqueName)) {
        missingMods.get(m.uniqueName).usedIn.push(b.name || b.itemName);
      } else {
        missingMods.set(m.uniqueName, { ...m, usedIn: [b.name || b.itemName] });
        endo += endoCost({ rarity: m.rarity, fusionLimit: m.maxRank }, m.rank);
      }
    }
  }

  return {
    perBuild,
    totals: { forma, auraForma, umbraForma, endo, ...orokin },
    missingMods: [...missingMods.values()].sort((a, b) => b.usedIn.length - a.usedIn.length)
  };
}
