/**
 * Build-Modell: Kapazitaet, benoetigte Ressourcen, fehlende Mods und Arcanes.
 *
 * Ein Build sieht so aus:
 *   {
 *     id, name, itemUniqueName, itemName, itemRank, orokin,
 *     slots:   [ { mod: uniqueName, rank, polarity } | null, ... ],
 *     arcanes: [ { arcane: uniqueName, rank } | null, ... ],
 *     source: 'manual' | 'overframe', sourceUrl, formaOverride
 *   }
 *
 * `arcanes` darf fehlen - aeltere Builds und jeder Overframe-Import kennen das
 * Feld nicht, und ein Item ohne Arcane-Plaetze braucht es nie.
 */
import { modDrain, endoCost, itemCapacity, POLARITIES, isAuraMod, isExilusMod, auraBonus,
         maxRankOf } from './mods.js';
import { arcaneSlotCount, maxArcaneRank, arcaneCopies } from './arcanes.js';
import { cleanGameText } from './catalog.js';

/** Warframes bekommen einen Reaktor, alles andere einen Katalysator. */
const REACTOR_CATEGORIES = new Set(['Suits', 'SpaceSuits', 'MechSuits', 'Sentinels', 'KubrowPets']);

export function orokinTypeFor(productCategory) {
  return REACTOR_CATEGORIES.has(productCategory)
    ? { key: 'reactor',  label: 'Orokin Reactor' }
    : { key: 'catalyst', label: 'Orokin Catalyst' };
}

/**
 * Hoechster besessener Rang eines Mods - oder null, wenn der Bestand ihn nicht
 * kennt.
 *
 * `ownedMods` darf ein Set (nur Besitz, aus der von Hand gepflegten Liste) oder
 * eine Map uniqueName -> Rang (aus dem Inventar) sein. Beide beantworten `has`;
 * nur die Map weiss zusaetzlich, WIE WEIT das Exemplar aufgewertet ist.
 */
function ownedRankOf(ownedMods, uniqueName) {
  if (typeof ownedMods.get !== 'function') return null;
  const rank = ownedMods.get(uniqueName);
  return typeof rank === 'number' ? rank : null;
}

/**
 * Rechnet einen Build durch.
 *
 * @param build      Build-Objekt (siehe oben)
 * @param modIndex   { byUniqueName } aus loadMods()
 * @param ownedMods  Set von uniqueNames ODER Map uniqueName -> besessener Rang
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

    const rank = slot.rank ?? maxRankOf(mod);
    const ownedRank = ownedRankOf(ownedMods, mod.uniqueName);

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
      maxRank: maxRankOf(mod),
      baseDrain: mod.baseDrain ?? 0,
      drain,
      isAura,
      polarity: slot.polarity || null,
      polaritySymbol: slot.polarity ? POLARITIES[slot.polarity]?.symbol : null,
      polarityGlyph: slot.polarity ? POLARITIES[slot.polarity]?.glyph : null,
      polarityLabel: slot.polarity ? POLARITIES[slot.polarity]?.label : null,
      modPolarity: mod.polarity || null,
      modPolarityGlyph: mod.polarity ? POLARITIES[mod.polarity]?.glyph : null,
      rarity: mod.rarity,
      owned: ownedMods.has(mod.uniqueName),
      /* Besitz allein reicht nicht: eine Serration Rang 3 im Bestand erfuellt
         keinen Build, der Rang 10 verlangt. Nur das Inventar kennt den Rang -
         aus der Handliste kommt null, dann bleibt es beim reinen Besitz. */
      ownedRank,
      underRanked: ownedMods.has(mod.uniqueName) && ownedRank != null && ownedRank < rank,
      description: mod.description || '',
      stats: statsForRank(mod, rank),

      /* Ab hier nur fuer die GEZEICHNETE Karte im Build-Brett: Rangpunkte,
         Kompatibilitaetsbalken und der Hinweis, ob die Mod in den Exilus-Platz
         darf. Das steht hier und nicht im Renderer - der hat keinen Katalog. */
      pips: maxRankOf(mod),
      compat: mod.compatName ? String(mod.compatName).toUpperCase() : null,
      isExilus: isExilusMod(mod)
    });
  }

  const capacity = itemCapacity({
    rank: build.itemRank ?? 30,
    orokin: build.orokin !== false
  });

  const filled = slots.filter(Boolean);
  const missing = filled.filter(s => !s.unknown && !s.owned);
  const underRanked = filled.filter(s => !s.unknown && s.underRanked);
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
      missingList: missing,
      underRanked: underRanked.length,
      underRankedList: underRanked
    }
  };
}

/**
 * Werte eines Mods auf einem bestimmten Rang.
 *
 * Dieselbe Aufbereitung wie im Inventar: DEs Rohtext traegt Auszeichnungen, und
 * ein Eintrag kann mehrere Zeilen fuehren. Auf der Karte muss jede davon eine
 * eigene Zeile sein, sonst laeuft der Wirkungstext als Wurst durch.
 */
function statsForRank(mod, rank) {
  const raw = (Array.isArray(mod.levelStats) && mod.levelStats[rank])
    ? (mod.levelStats[rank].stats || [])
    : (mod.stats || []);

  return [...new Set(raw
    .flatMap(s => String(s ?? '').split(/\r?\n/))
    .map(cleanGameText)
    .filter(Boolean))];
}

/**
 * Die Arcane-Plaetze eines Builds.
 *
 * Bewusst GETRENNT von den Mod-Plaetzen ausgewertet und nicht in dieselbe
 * Liste geworfen: ein Arcane kostet keine Kapazitaet, hat keine Polaritaet und
 * kein Forma. Waere es ein Slot wie jeder andere, muesste jede Rechnung
 * darueber erst wieder Ausnahmen machen.
 *
 * Wie viele Plaetze es gibt, entscheidet die Kategorie des Items - AUSSER es
 * ist mehr belegt als vorgesehen. Dann bleiben die zusaetzlichen stehen, aus
 * demselben Grund wie bei den Mods: eine verschluckte Karte waere schlimmer
 * als ein Platz zu viel.
 *
 * @param arcaneIndex  { byUniqueName } aus indexArcanes()
 * @param ownedArcanes Set von uniqueNames ODER Map uniqueName -> besessener Rang
 */
export function evaluateArcanes(build, arcaneIndex, ownedArcanes = new Set(), category = null) {
  const placed = Array.isArray(build.arcanes) ? build.arcanes : [];
  const count = Math.max(arcaneSlotCount(category), placed.length);
  const slots = [];

  for (let i = 0; i < count; i++) {
    const slot = placed[i];
    if (!slot || !slot.arcane) { slots.push(null); continue; }

    const arcane = arcaneIndex.byUniqueName.get(slot.arcane);
    if (!arcane) {
      slots.push({ unknown: true, uniqueName: slot.arcane, rank: slot.rank ?? 0 });
      continue;
    }

    const maxRank = maxArcaneRank(arcane);
    const rank = Math.min(slot.rank ?? maxRank, maxRank);
    const ownedRank = ownedRankOf(ownedArcanes, arcane.uniqueName);
    const owned = ownedArcanes.has(arcane.uniqueName);

    slots.push({
      uniqueName: arcane.uniqueName,
      name: arcane.name,
      rank,
      maxRank,
      rarity: arcane.rarity || null,
      owned,
      ownedRank,
      underRanked: owned && ownedRank != null && ownedRank < rank,
      /* Was der Platz an Exemplaren kostet - die Waehrung der Arcanes.
         Besitzt man schon eines auf Rang N, ist der Rest die Differenz. */
      copies: arcaneCopies(rank),
      copiesOwned: owned ? arcaneCopies(ownedRank ?? 0) : 0,
      stats: statsForRank(arcane, rank)
    });
  }

  const filled = slots.filter(Boolean);
  const missing = filled.filter(s => !s.unknown && !s.owned);
  const underRanked = filled.filter(s => !s.unknown && s.underRanked);

  return {
    slots,
    total: filled.length,
    owned: filled.filter(s => s.owned).length,
    missing: missing.length,
    missingList: missing,
    underRanked: underRanked.length,
    underRankedList: underRanked
  };
}

/**
 * Fasst mehrere Builds zusammen: was muss insgesamt beschafft werden?
 * Ein Mod, der in drei Builds steckt, wird nur einmal gezaehlt.
 */
export function combineBuilds(builds, modIndex, ownedMods = new Set(), itemLookup = () => null,
                              { arcaneIndex = null, categoryOf = () => null } = {}) {
  const missingMods = new Map();
  const underRankedMods = new Map();
  const missingArcanes = new Map();
  const underRankedArcanes = new Map();
  let forma = 0, auraForma = 0, umbraForma = 0, endo = 0, arcaneCopiesNeeded = 0;
  const orokin = { reactor: 0, catalyst: 0 };
  const perBuild = [];

  /* Derselbe Mod in drei Builds ist EIN Eintrag mit drei Verwendungen - und
     beim wiederholten Treffer zaehlt der hoechste verlangte Rang, denn wer den
     erreicht, hat alle drei Builds bedient. */
  const gather = (map, mod, buildLabel) => {
    const seen = map.get(mod.uniqueName);
    if (seen) {
      seen.usedIn.push(buildLabel);
      seen.rank = Math.max(seen.rank, mod.rank);
      return false;
    }
    map.set(mod.uniqueName, { ...mod, usedIn: [buildLabel] });
    return true;
  };

  for (const b of builds) {
    const item = itemLookup(b.itemUniqueName);
    const ev = evaluateBuild(b, modIndex, ownedMods, item);
    const arcanes = arcaneIndex
      ? evaluateArcanes(b, arcaneIndex, ownedMods, categoryOf(b))
      : null;
    perBuild.push({ build: b, evaluation: ev, arcanes });

    forma      += ev.requirements.forma;
    auraForma  += ev.requirements.auraForma;
    umbraForma += ev.requirements.umbraForma;
    if (ev.requirements.orokin) orokin[ev.requirements.orokinType]++;

    const label = b.name || b.itemName;

    for (const m of ev.mods.missingList)      gather(missingMods, m, label);
    for (const m of ev.mods.underRankedList)  gather(underRankedMods, m, label);

    if (arcanes) {
      for (const a of arcanes.missingList)     gather(missingArcanes, a, label);
      for (const a of arcanes.underRankedList) gather(underRankedArcanes, a, label);
    }
  }

  /* Die Kosten ERST JETZT, aus den zusammengefassten Eintraegen. Waehrend der
     Schleife waeren sie zu niedrig: ein Mod, den zwei Builds auf verschiedenen
     Raengen wollen, kostet den hoeheren - und der steht erst fest, wenn beide
     Builds durch sind. */
  for (const m of missingMods.values()) {
    endo += endoCost({ rarity: m.rarity, fusionLimit: m.maxRank }, m.rank);
  }
  for (const m of underRankedMods.values()) {
    const spec = { rarity: m.rarity, fusionLimit: m.maxRank };
    endo += Math.max(0, endoCost(spec, m.rank) - endoCost(spec, m.ownedRank ?? 0));
  }

  /* Arcanes zahlt man nicht in Endo, sondern in weiteren Exemplaren ihrer
     selbst - deshalb eine eigene Summe. */
  for (const a of missingArcanes.values()) arcaneCopiesNeeded += arcaneCopies(a.rank);
  for (const a of underRankedArcanes.values()) {
    arcaneCopiesNeeded += Math.max(0, arcaneCopies(a.rank) - arcaneCopies(a.ownedRank ?? 0));
  }

  const byUse = (a, b) => b.usedIn.length - a.usedIn.length;

  return {
    perBuild,
    totals: { forma, auraForma, umbraForma, endo, arcaneCopies: arcaneCopiesNeeded, ...orokin },
    missingMods: [...missingMods.values()].sort(byUse),
    underRankedMods: [...underRankedMods.values()].sort(byUse),
    missingArcanes: [...missingArcanes.values()].sort(byUse),
    underRankedArcanes: [...underRankedArcanes.values()].sort(byUse)
  };
}
