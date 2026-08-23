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
import { imageUrl, cleanGameText } from './catalog.js';
import { POLARITIES, modDrain, auraBonus, isAuraMod } from './mods.js';
import { isInternalArcane } from './arcanes.js';

export const SECTIONS = [
  { key: 'relics',     label: 'Relics' },
  { key: 'sets',       label: 'My sets' },
  { key: 'mods',       label: 'Mods' },
  { key: 'arcanes',    label: 'Arcanes' },
  { key: 'materials',  label: 'Materials' },
  { key: 'blueprints', label: 'Blueprints' }
];

/* Reliktzustand steckt als Suffix im Pfad, nicht im Namen: der Katalog nennt
   jede Stufe gleich ("Lith V1 Relic"). */
const RELIC_QUALITY = {
  Bronze:   'Intact',
  Silver:   'Exceptional',
  Gold:     'Flawless',
  Platinum: 'Radiant'
};

const isRelic  = u => u.includes('/Types/Game/Projections/');
const isArcane = u => u.includes('/CosmeticEnhancers/') && !u.includes('/Peculiars/');

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

/**
 * Alles, was die Oberflaeche braucht, um die Mod-Karte selbst zu ZEICHNEN.
 *
 * Die Karte wird nicht als fertiges Bild geholt, sondern aus ihren Teilen
 * gebaut - Rahmen, Illustration, Name, Wirkung, Kompatibilitaet, Kosten mit
 * Polaritaet und Rangpunkte. Nur so gibt es die beiden Zustaende, die das
 * Spiel auch hat: zugeklappt nur der Name, aufgeklappt die ganze Karte.
 *
 * Der Renderer hat keinen Katalog, deshalb haengt alles hier an der Zeile.
 *
 * ACHTUNG: `pips` ist die Rangzahl der KARTE, nicht der eigene Rang. Der steht
 * in `maxRank` und wird hier nicht angefasst.
 */
function decorateUpgrade(entry, catalog) {
  const mod = catalog.byUniqueName?.get(entry.uniqueName);
  if (!mod) return entry;

  const pol = POLARITIES[mod.polarity];
  const aura = isAuraMod(mod);
  const pips = mod.fusionLimit ?? Math.max(0, (mod.levelStats?.length || 1) - 1);

  entry.rarity = mod.rarity || null;
  entry.polarity = pol ? { glyph: pol.glyph, label: pol.label } : null;
  entry.pips = pips;
  entry.isAura = aura;
  /* Kosten bei vollem Rang - dieselbe Zahl, die auch im Spiel auf der voll
     aufgewerteten Karte steht. Auras GEBEN Kapazitaet, dort ist es der Bonus. */
  entry.drain = aura ? auraBonus(mod, pips) : modDrain(mod, pips);

  /* Die Illustration in Kartenbreite. 128 px reichen fuer eine Zeile, aber
     nicht fuer eine Karte, die beim Aufklappen auf 200 px waechst. */
  entry.art = imageUrl(entry.uniqueName, 256);

  /* Wirkung bei vollem Rang - dieselbe Zeile wie auf der Karte im Spiel. */
  entry.stats = (mod.levelStats?.[pips]?.stats || [])
    .flatMap(s => String(s ?? '').split(/\r?\n/))
    .map(cleanGameText)
    .filter(Boolean);

  /* Der Balken am unteren Rand. Im Spiel steht dort der englische Begriff in
     Grossbuchstaben - bei einem Augment der Warframe, sonst die Waffenklasse. */
  entry.compat = mod.compatName ? String(mod.compatName).toUpperCase() : null;
  return entry;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'en');

export function classifyMod(m) {
  const t = String(m?.type || '').toUpperCase();
  const cp = String(m?.compatName || '').toUpperCase();
  const u = String(m?.uniqueName || '');

  if (t === 'PARAZON' || cp === 'PARAZON' || u.includes('/Parazon/')) return 'parazon';
  if (t === 'WARFRAME' || t === 'AURA' || cp === 'WARFRAME' || cp === 'AURA' || u.includes('/Warframe/') || u.includes('/Suits/')) return 'Suits';
  if (t === 'PRIMARY' || ['RIFLE', 'SHOTGUN', 'BOW', 'SNIPER', 'ASSAULT RIFLE', 'PRIMARY'].includes(cp) || u.includes('/Rifle/') || u.includes('/Shotgun/') || u.includes('/Bow/')) return 'LongGuns';
  if (t === 'SECONDARY' || cp === 'PISTOL' || cp === 'SECONDARY' || u.includes('/Pistol/')) return 'Pistols';
  if (t === 'MELEE' || t === 'STANCE' || cp === 'MELEE' || cp === 'STANCE' || u.includes('/Melee/') || u.includes('/Stances/')) return 'Melee';
  if (['SENTINEL', 'KUBROW', 'KAVAT', 'HELMINTH CHARGER'].includes(t) || ['SENTINEL', 'KUBROW', 'KAVAT', 'BEAST', 'ROBOTIC', 'COMPANION'].includes(cp) || u.includes('/Sentinels/') || u.includes('/Pets/')) return 'companion';
  if (['ARCHWING', 'ARCH-GUN', 'ARCH-MELEE'].includes(t) || ['ARCHGUN', 'ARCHMELEE', 'ARCHWING'].includes(cp) || u.includes('/Space/')) return 'archwing';
  if (cp === 'NECRAMECH' || u.includes('/Mech/')) return 'necramech';
  if (u.includes('/Railjack/')) return 'railjack';
  return 'other';
}

export function classifyArcane(a) {
  const n = String(a?.name || '');
  const p = n.split(' ')[0];
  if (['Primary', 'Longbow', 'Shotgun', 'Fractalized'].includes(p)) return 'LongGuns';
  if (['Secondary', 'Akimbo', 'Pax', 'Cascadia', 'Residual', 'Conjunction'].includes(p)) return 'Pistols';
  if (['Melee', 'Exodia'].includes(p)) return 'Melee';
  if (['Magus', 'Zid-An'].includes(p)) return 'operator';
  if (['Virtuos', 'Eternal', 'Emergence'].includes(p)) return 'amp';
  if (['Arcane', 'Molt', 'Theorem'].includes(p)) return 'Suits';
  return 'other';
}

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

  /* Alle Katalog-Mods und Arcanes erfassen, damit auch unbesessene Eintraege
     angezeigt und gefiltert werden koennen. */
  const allCatalogUpgrades = (catalog?.lookup || []).filter(item => item.uniqueName && item.name && !item.uniqueName.includes('/Focus/'));

  const allModsMap = new Map();
  const allArcanesMap = new Map();

  for (const item of allCatalogUpgrades) {
    if (isArcane(item.uniqueName)) {
      if (isInternalArcane(item.uniqueName)) continue;
      if (!allArcanesMap.has(item.uniqueName)) {
        allArcanesMap.set(item.uniqueName, {
          ...baseEntry(item.uniqueName, catalog),
          category: classifyArcane(item),
          ranks: [],
          maxRank: null,
          count: 0,
          owned: false
        });
      }
    } else if (item.uniqueName.includes('/Upgrades/')) {
      if (item.name === 'Unfused Artifact' || item.uniqueName.includes('/Test/') || item.uniqueName.includes('/Debug/')) continue;
      if (!allModsMap.has(item.uniqueName)) {
        const entry = baseEntry(item.uniqueName, catalog);
        entry.category = classifyMod(item);
        entry.ranks = [];
        entry.maxRank = null;
        entry.count = 0;
        entry.owned = false;
        decorateUpgrade(entry, catalog);
        allModsMap.set(item.uniqueName, entry);
      }
    }
  }

  // Besessene Exemplare einpflegen
  for (const entry of upgrades) {
    if (isArcane(entry.uniqueName)) {
      const existing = allArcanesMap.get(entry.uniqueName);
      if (existing) {
        Object.assign(existing, entry, {
          category: existing.category || classifyArcane(catalog?.byUniqueName?.get(entry.uniqueName)),
          owned: entry.count > 0
        });
      } else {
        const cat = classifyArcane(catalog?.byUniqueName?.get(entry.uniqueName));
        allArcanesMap.set(entry.uniqueName, { ...entry, category: cat, owned: entry.count > 0 });
      }
    } else {
      const existing = allModsMap.get(entry.uniqueName);
      if (existing) {
        Object.assign(existing, entry, {
          category: existing.category || classifyMod(catalog?.byUniqueName?.get(entry.uniqueName)),
          owned: entry.count > 0
        });
        decorateUpgrade(existing, catalog);
      } else {
        const decorated = decorateUpgrade(entry, catalog);
        decorated.category = classifyMod(catalog?.byUniqueName?.get(entry.uniqueName));
        decorated.owned = entry.count > 0;
        allModsMap.set(entry.uniqueName, decorated);
      }
    }
  }

  const sections = {
    relics:     misc.filter(e => isRelic(e.uniqueName)).map(decorateRelic).sort(byName),
    sets:       [],
    materials:  misc.filter(e => !isRelic(e.uniqueName)).sort(byName),
    arcanes:    [...allArcanesMap.values()].sort(byName),
    mods:       [...allModsMap.values()].sort(byName),
    blueprints: collect(inv.Recipes, catalog).sort(byName)
  };

  const totals = {};
  for (const { key } of SECTIONS) {
    const list = sections[key] || [];
    totals[key] = {
      arten: list.length,
      ownedArten: list.filter(e => (e.count || 0) > 0).length,
      stueck: list.reduce((sum, e) => sum + (e.count || 0), 0)
    };
  }

  const unresolved = Object.values(sections).flat().filter(e => !e.resolved);

  return {
    sections,
    totals,
    currencies: {
      credits:  inv.RegularCredits ?? 0,
      platinum: inv.PremiumCredits ?? 0,
      endo:     inv.FusionPoints ?? 0,
      ducats:   inv.PrimeTokens ?? 0,
      traces:   (inv.MiscItems || []).find(e => typeof e.ItemType === 'string' && e.ItemType.includes('VoidTearDrop'))?.ItemCount ?? 0
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

/**
 * Welche Mods der Spieler besitzt - und bis zu welchem Rang.
 *
 * Fuer das Build-Brett: solange das Inventar vorliegt, muss dort nichts mehr von
 * Hand angehakt werden. Beide Quellen zaehlen, denn derselbe Mod kann ungerankt
 * im Vorrat (RawUpgrades, mit Anzahl) UND geranked als Einzelstueck (Upgrades)
 * liegen.
 *
 * Ergebnis ist eine Map uniqueName -> hoechster besessener Rang. Eine Map und
 * kein Set, weil `has` den Besitz beantwortet, `get` aber zusaetzlich sagt, ob
 * das Exemplar schon den Rang hat, den der Build verlangt. Beides zusammen
 * unterscheidet "fehlt" von "liegt da, muss noch aufgewertet werden".
 */
export function ownedUpgradeRanks(inventory) {
  const owned = new Map();

  const note = (uniqueName, rank) => {
    if (!uniqueName) return;
    owned.set(uniqueName, Math.max(owned.get(uniqueName) ?? 0, rank));
  };

  for (const row of inventory?.RawUpgrades || []) note(row.ItemType, 0);
  for (const row of inventory?.Upgrades   || []) note(row.ItemType, rankOf(row));

  return owned;
}
