/**
 * Uebersetzt die Inventar-Rohdaten in anzeigbare Eintraege.
 *
 * Die API liefert nur Pfade und Zahlen: {"ItemCount":148524,"ItemType":
 * "/Lotus/Types/Items/MiscItems/Rubedo"}. Hier wird daraus "Rubedo" mit Bild,
 * Kategorie und Anzahl.
 *
 * KATEGORIEN kommen aus dem Pfad, nicht aus dem Feld, in dem der Eintrag steht -
 * denn beides deckt sich nicht: Relikte liegen mit den Materialien zusammen in
 * MiscItems, und Arcanes stecken zwischen den Mods in RawUpgrades/Upgrades.
 */
import { imageUrl } from './catalog.js';

export const SECTIONS = [
  { key: 'relics',     label: 'Relikte' },
  { key: 'mods',       label: 'Mods' },
  { key: 'arcanes',    label: 'Arcanes' },
  { key: 'materials',  label: 'Materialien' },
  { key: 'blueprints', label: 'Blueprints' }
];

/* Reliktzustand steckt als Suffix im Pfad, nicht im Namen: der Katalog nennt
   jede Stufe gleich ("Lith V1 Relic"). */
const RELIC_QUALITY = {
  Bronze:   'Intakt',
  Silver:   'Außergewöhnlich',
  Gold:     'Makellos',
  Platinum: 'Strahlend'
};

const isRelic  = u => u.includes('/Types/Game/Projections/');
const isArcane = u => u.includes('/CosmeticEnhancers/');

/** Letztes Pfadsegment lesbar machen - Notnagel fuer Eintraege ohne Katalogtreffer. */
function humanize(uniqueName) {
  const last = uniqueName.split('/').filter(Boolean).pop() || uniqueName;
  return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
}

/* DE stellt Kategorie-Marker voran ("<ARCHWING> Agkuza"). In der Liste stoeren sie
   nur und verderben ausserdem die alphabetische Sortierung. */
const stripTag = name => name.replace(/^<[^>]+>\s*/, '').trim();

/**
 * Anzeigename. Blueprints tragen selbst keinen - sie kommen ueber ihr Rezept
 * an das Ergebnis-Item und damit an dessen Namen.
 */
function displayName(uniqueName, catalog) {
  const item = catalog.byUniqueName.get(uniqueName);
  if (item?.name) return { name: stripTag(item.name), resolved: true };

  const recipe = catalog.recipeByUniqueName?.get(uniqueName);
  if (recipe?.resultType) {
    const result = catalog.byUniqueName.get(recipe.resultType);
    if (result?.name) return { name: stripTag(result.name), resolved: true };
  }
  return { name: humanize(uniqueName), resolved: false };
}

/** Rang eines gerankten Mods. Der Fingerprint ist ein JSON-String im JSON. */
function rankOf(row) {
  if (!row.UpgradeFingerprint) return 0;
  try {
    return JSON.parse(row.UpgradeFingerprint).lvl || 0;
  } catch {
    return 0;
  }
}

function baseEntry(uniqueName, catalog) {
  const { name, resolved } = displayName(uniqueName, catalog);
  return { uniqueName, name, resolved, image: imageUrl(uniqueName, 128), count: 0 };
}

/**
 * Fasst Eintraege desselben Items zusammen.
 *
 * Noetig, weil Upgrades EINZELSTUECKE sind: derselbe Mod taucht mehrfach auf,
 * je einmal pro Exemplar mit eigener ItemId und eigenem Rang. RawUpgrades
 * dagegen zaehlen ueber ItemCount.
 */
function collect(rows, catalog, { ranked = false } = {}) {
  const byItem = new Map();

  for (const row of rows || []) {
    const uniqueName = row.ItemType;
    if (!uniqueName) continue;

    let entry = byItem.get(uniqueName);
    if (!entry) {
      entry = baseEntry(uniqueName, catalog);
      if (ranked) entry.ranks = [];
      byItem.set(uniqueName, entry);
    }

    const count = ranked ? 1 : (row.ItemCount || 0);
    entry.count += count;

    if (ranked) {
      const rank = rankOf(row);
      const slot = entry.ranks.find(r => r.rank === rank);
      if (slot) slot.count += 1;
      else entry.ranks.push({ rank, count: 1 });
      entry.maxRank = Math.max(entry.maxRank || 0, rank);
    }
  }

  for (const entry of byItem.values()) {
    if (entry.ranks) entry.ranks.sort((a, b) => a.rank - b.rank);
  }
  return [...byItem.values()];
}

/* Aera als Ziffer im Pfad: T1VoidProjection... ist Lith, T4 ist Axi. */
const TIER_BY_NUM = { 1: 'Lith', 2: 'Meso', 3: 'Neo', 4: 'Axi', 5: 'Requiem', 6: 'Omnia' };
const TIERS = new Set(Object.values(TIER_BY_NUM));

/** Relikte bekommen Stufe, Aera und einen Namen ohne das angehaengte "Relic". */
function decorateRelic(entry) {
  const m = /(Bronze|Silver|Gold|Platinum)$/.exec(entry.uniqueName);
  entry.quality = m ? RELIC_QUALITY[m[1]] : null;
  entry.name = entry.name.replace(/\s*Relic$/i, '');

  /* Aera fuer den Filter. Zuerst aus dem Namen ("Axi A22"), weil der bereits
     aufgeloest ist; faellt der Name aus, bleibt die Ziffer im Pfad - die
     steht auch dann, wenn das Relikt nirgends benannt ist. */
  const first = entry.name.split(' ')[0];
  if (TIERS.has(first)) {
    entry.tier = first;
  } else {
    const t = /Projections\/T(\d)/.exec(entry.uniqueName);
    entry.tier = t ? (TIER_BY_NUM[Number(t[1])] || null) : null;
  }
  return entry;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'de');

/**
 * Baut die Ansicht fuer den Inventar-Tab.
 *
 * Zusammenfuehrung ueber die Kategorie, nicht ueber das Quellfeld: Mods aus
 * RawUpgrades (ungerankt, mit Anzahl) und Upgrades (Einzelstuecke mit Rang)
 * landen in derselben Liste, Arcanes werden aus beiden herausgezogen.
 */
export function buildInventory(inventory, catalog) {
  const inv = inventory || {};

  const misc = collect(inv.MiscItems, catalog);
  const raw  = collect(inv.RawUpgrades, catalog);
  const rank = collect(inv.Upgrades, catalog, { ranked: true });

  /* Ungerankte und gerankte Exemplare desselben Mods zu einer Zeile vereinen. */
  const merged = new Map();
  for (const entry of [...raw, ...rank]) {
    const existing = merged.get(entry.uniqueName);
    if (!existing) { merged.set(entry.uniqueName, entry); continue; }
    existing.count += entry.count;
    if (entry.ranks) existing.ranks = [...(existing.ranks || []), ...entry.ranks]
      .reduce((acc, r) => {
        const slot = acc.find(x => x.rank === r.rank);
        if (slot) slot.count += r.count; else acc.push({ ...r });
        return acc;
      }, [])
      .sort((a, b) => a.rank - b.rank);
    if (entry.maxRank != null) existing.maxRank = Math.max(existing.maxRank || 0, entry.maxRank);
  }
  const upgrades = [...merged.values()];

  const sections = {
    relics:     misc.filter(e => isRelic(e.uniqueName)).map(decorateRelic).sort(byName),
    materials:  misc.filter(e => !isRelic(e.uniqueName)).sort(byName),
    arcanes:    upgrades.filter(e => isArcane(e.uniqueName)).sort(byName),
    mods:       upgrades.filter(e => !isArcane(e.uniqueName)).sort(byName),
    blueprints: collect(inv.Recipes, catalog).sort(byName)
  };

  const totals = {};
  for (const { key } of SECTIONS) {
    totals[key] = {
      arten: sections[key].length,
      stueck: sections[key].reduce((sum, e) => sum + e.count, 0)
    };
  }

  const unresolved = Object.values(sections).flat().filter(e => !e.resolved);

  return {
    sections,
    totals,
    currencies: {
      credits:  inv.RegularCredits ?? 0,
      platinum: inv.PremiumCredits ?? 0,
      endo:     inv.FusionPoints ?? 0
    },
    unresolved
  };
}

/** Freitextsuche ueber eine Sektion. */
export function filterEntries(entries, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return entries;
  return entries.filter(e => e.name.toLowerCase().includes(q));
}
