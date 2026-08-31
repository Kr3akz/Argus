/**
 * Bauketten: Waffen, die andere Waffen verschlucken.
 *
 * DIE FRAGE, DIE HIER BEANTWORTET WIRD:
 *   Die Akjagara braucht eine Akbolto, die Akbolto zwei Bolto, die Bolto eine
 *   Lato. Wer die Akjagara baut, ohne das zu wissen, hat am Ende EIN Item
 *   gemeistert statt vier - denn jede Stufe wird beim Bau VERBRAUCHT. Das
 *   Spiel sagt das nirgends: im Rezept steht nur die naechste Zutat, nie die
 *   Kette darunter, und schon gar nicht, welches Glied man noch nie besass.
 *
 * WARUM DAS TEURER IST ALS EIN VERPASSTER RANG:
 *   Eine Bolto auf Rang 30 sind 3.000 Mastery-Punkte. Baut man sie ungerankt
 *   in die Akbolto ein, ist sie weg - zurueckholen heisst neu farmen, neu
 *   bauen, neu leveln. Deshalb traegt hier JEDES Glied seinen eigenen
 *   Mastery-Stand, nicht nur die Waffe am Ende der Kette.
 *
 * WOHER DIE KETTEN KOMMEN:
 *   Aus DEs Rezepten, nicht aus einer gepflegten Liste. Eine Zutat gilt als
 *   Kettenglied, wenn sie selbst ein Item ist, das Mastery gibt - alles
 *   andere (Ferrit, Orokin-Zellen, Forma) ist Material und gehoert nicht
 *   hierher. Kommt morgen eine Waffe aus zwei alten dazu, steht sie ohne
 *   Zutun in der Liste.
 *
 * WAS EIN "GLIED" NICHT IST:
 *   Warframe-Komponenten. Ein Chassis gibt keine Mastery und ist deshalb
 *   keine Stufe, sondern ein Bauteil - dafuer ist recipes.js zustaendig.
 */
import { classify } from './classify.js';

/* DE stellt Kategorie-Marker voran ("<ARCHWING> Knux"). Dieselbe Saeuberung
   wie in inventory-items.js - sie stoeren im Namen und in der Sortierung. */
const stripTag = name => String(name || '').replace(/^<[^>]+>\s*/, '').trim();

/**
 * Rang aus roher Affinity.
 *
 * Eigene Zeile statt rankFromXP aus mastery.js: dort haengt die Rechnung an
 * DEs productCategory, hier an der bereinigten Kategorie aus classify.js -
 * und nur die weiss, dass ein K-Drive 200 XP je Rang gibt und ein Zaw-Griff
 * gar keine.
 */
const rankOf = (xp, perRank, maxRank) =>
  Math.min(Math.floor(Math.sqrt(xp / (perRank * 5))), maxRank);

/**
 * Alle Items, die Mastery geben, nach uniqueName.
 * Einmal gebaut und weitergereicht - der Katalog hat 800+ davon.
 */
function masteryIndex(catalog) {
  const idx = new Map();
  for (const it of catalog?.items || []) {
    const cls = classify(it);
    if (cls.countsForMastery) idx.set(it.uniqueName, { item: it, cls });
  }
  return idx;
}

/**
 * Die Vorstufen EINES Rezepts.
 *
 * Zwei Schreibweisen, beide kommen vor: die Zutat ist entweder das Item
 * selbst (".../Bolto") oder dessen Blaupause (".../BoltoBlueprint"). Ohne den
 * zweiten Schritt faellt ein Teil der Ketten stillschweigend aus.
 *
 * Gleiche Zutaten werden ZUSAMMENGEZAEHLT: DE fuehrt die Akbolto als "1x
 * Bolto + 1x Bolto" in zwei Zeilen. Auf dem Bildschirm ist das eine Angabe -
 * zwei Bolto -, nicht zwei Zutaten.
 */
function prerequisites(uniqueName, catalog, idx) {
  const recipe = catalog?.recipeFor?.get(uniqueName);
  if (!recipe) return [];

  const merged = new Map();
  for (const ing of recipe.ingredients || []) {
    let target = ing.ItemType;
    if (!idx.has(target)) {
      const sub = catalog.recipeByUniqueName?.get(ing.ItemType);
      if (sub?.resultType && idx.has(sub.resultType)) target = sub.resultType;
    }
    if (!idx.has(target)) continue;
    merged.set(target, (merged.get(target) || 0) + (ing.ItemCount || 1));
  }
  return [...merged].map(([type, need]) => ({ uniqueName: type, need }));
}

/**
 * Ein Kettenglied mit allem, was die Oberflaeche darueber sagen kann.
 *
 * @param need  wie viele Stueck das ELTERNrezept davon braucht
 * @param ctx   { catalog, idx, xp, owned, building, hasInventory }
 */
function node(uniqueName, need, ctx, depth, seen) {
  const { item, cls } = ctx.idx.get(uniqueName);
  const maxRank = item.maxLevelCap || 30;
  const perRank = cls.xpPerRank || 100;

  const xp = ctx.xp.get(uniqueName);
  const rank = xp === undefined ? 0 : rankOf(xp, perRank, maxRank);
  const status = xp === undefined ? 'missing' : (rank >= maxRank ? 'mastered' : 'leveling');

  /* Ein Zyklus ist in DEs Daten nicht vorgesehen, waere hier aber eine
     Endlosschleife statt einer Fehlermeldung. Der Besuchspfad kostet nichts
     und macht die Rekursion unabhaengig davon, was im Export steht. */
  const next = seen.has(uniqueName) ? [] : prerequisites(uniqueName, ctx.catalog, ctx.idx);
  const weiter = new Set(seen).add(uniqueName);
  const steps = next.map(p => node(p.uniqueName, p.need, ctx, depth + 1, weiter));

  const ownedCount = ctx.owned.get(uniqueName) || 0;

  /* Nur Zutaten koennen "gedeckt" sein. Die Waffe am Ende der Kette wird
     gebaut, nicht eingelegt - dort waere die Angabe eine Antwort auf eine
     Frage, die niemand stellt. */
  const covered = depth === 0 || !ctx.hasInventory ? null : ownedCount >= need;

  return {
    uniqueName,
    name: stripTag(item.name),
    category: cls.category,
    masteryReq: item.masteryReq ?? 0,
    depth,
    need,
    /* Wie viele Exemplare gerade im Besitz sind. Zaehlt, weil der Bau der
       naechsten Stufe sie verbraucht: wer zwei Bolto braucht und eine hat,
       muss noch eine bauen. */
    owned: ownedCount,
    /* Reicht der Bestand fuer das Elternrezept? Ohne Inventar bleibt es null
       statt false - "wissen wir nicht" ist etwas anderes als "nein". */
    covered,
    /* Liegen ALLE direkten Zutaten bereit? Dann fehlt zwischen hier und dem
       naechsten Rang nur noch der Knopf in der Schmiede. */
    ready: !steps.length || !ctx.hasInventory
      ? null
      : steps.every(s => s.covered === true),
    building: ctx.building.has(uniqueName),
    rank,
    maxRank,
    status,
    /* Offene Mastery-Punkte dieses Glieds - die Zahl, um die es geht. */
    earned: perRank * rank,
    potential: perRank * maxRank,
    gain: perRank * (maxRank - rank),
    steps
  };
}

/** Alle Glieder einer Kette flach, Wurzel zuerst. */
function flatten(n, out = []) {
  out.push(n);
  for (const s of n.steps) flatten(s, out);
  return out;
}

/* Aus welchen Inventarfeldern ein Besitzstand zaehlt. Jede Zeile ist EIN
   Exemplar - anders als bei Materialien gibt es hier kein ItemCount. */
const OWNED_FIELDS = ['Suits', 'LongGuns', 'Pistols', 'Melee', 'SpecialItems',
  'SpaceSuits', 'SpaceGuns', 'SpaceMelee', 'MechSuits',
  'Sentinels', 'SentinelWeapons', 'KubrowPets', 'Hoverboards', 'OperatorAmps'];

/**
 * Alle Bauketten des Spiels.
 *
 * @param catalog    Item- und Rezeptkatalog
 * @param xpMap      uniqueName -> Affinity. Aus dem Profil (ownedXPMap) oder
 *                   dem Inventar (XPInfo); fehlt beides, ist alles "missing"
 *                   und die Liste dient als Nachschlagewerk.
 * @param inventory  optional - fuer Bestand und laufende Baue
 * @returns Liste der WURZELN (Waffen, die selbst in keiner anderen Kette
 *          stecken), jede mit ihrem Baum darunter und einer Zusammenfassung.
 */
export function buildCraftChains(catalog, { xpMap = new Map(), inventory = null } = {}) {
  if (!catalog?.items?.length) return [];

  const idx = masteryIndex(catalog);

  /* Erst die Kanten: wer hat Vorstufen, und wer ist selbst eine. Eine Wurzel
     ist, was Vorstufen HAT und selbst keine IST - sonst stuende die Bolto
     einmal als eigene Kette und einmal unter der Akbolto. */
  const hasSteps = new Map();
  const isStep = new Set();
  for (const uniqueName of idx.keys()) {
    const pre = prerequisites(uniqueName, catalog, idx);
    if (!pre.length) continue;
    hasSteps.set(uniqueName, pre);
    for (const p of pre) isStep.add(p.uniqueName);
  }

  /* Bestand und laufende Baue. Beides nur, wenn ein Inventar vorliegt - die
     Ketten selbst stehen auch ohne. */
  const owned = new Map();
  const building = new Set();
  for (const field of OWNED_FIELDS) {
    for (const row of inventory?.[field] || []) {
      if (!row?.ItemType) continue;
      owned.set(row.ItemType, (owned.get(row.ItemType) || 0) + 1);
    }
  }
  for (const row of inventory?.PendingRecipes || []) {
    const recipe = catalog.recipeByUniqueName?.get(row.ItemType);
    if (recipe?.resultType) building.add(recipe.resultType);
  }

  const ctx = { catalog, idx, xp: xpMap, owned, building, hasInventory: !!inventory };

  const chains = [];
  for (const uniqueName of hasSteps.keys()) {
    if (isStep.has(uniqueName)) continue;

    const root = node(uniqueName, 1, ctx, 0, new Set());
    const all = flatten(root);

    /* Die Zahlen der ganzen Kette. Die Wurzel zaehlt mit: sie ist das letzte
       Glied, nicht der Rahmen darum. */
    const mastered = all.filter(n => n.status === 'mastered').length;
    const missing = all.filter(n => n.status === 'missing').length;

    chains.push({
      ...root,
      links: all.length,
      mastered,
      missing,
      leveling: all.length - mastered - missing,
      complete: mastered === all.length,
      /* Was in dieser Kette noch zu holen ist - danach lohnt sie sich. */
      openGain: all.reduce((s, n) => s + n.gain, 0),
      totalGain: all.reduce((s, n) => s + n.potential, 0),
      depthMax: Math.max(...all.map(n => n.depth)),
      /* Glieder, die man BESITZT und noch nicht gemeistert hat, waehrend die
         naechste Stufe sie verbrauchen wuerde - genau hier geht Mastery
         verloren. Ohne Inventar bleibt die Liste leer statt falsch. */
      atRisk: all.filter(n => n.depth > 0 && n.status === 'leveling' && n.owned > 0)
                 .map(n => n.name)
    });
  }

  /* Unfertige zuerst, darin die groesste offene Ausbeute - die Reihenfolge,
     in der man die Liste abarbeitet. Fertige Ketten rutschen ans Ende, statt
     zu verschwinden: dass etwas erledigt ist, will man auch sehen. */
  return chains.sort((a, b) =>
    (a.complete === b.complete ? 0 : a.complete ? 1 : -1) ||
    b.openGain - a.openGain ||
    a.name.localeCompare(b.name, 'en'));
}

/**
 * Mastery-XP je Item aus mehreren Quellen.
 *
 * Profil und Inventar fuehren dieselbe Liste, keins ist grundsaetzlich
 * aktueller: das oeffentliche Profil kann aelter sein als der letzte
 * Inventarabruf, der Inventarabruf kann ganz fehlen. Der hoehere Wert
 * gewinnt - Affinity faellt nie.
 */
export function mergeXP(...maps) {
  const out = new Map();
  for (const m of maps) {
    for (const [k, v] of m || []) {
      if (!(out.get(k) >= v)) out.set(k, v);
    }
  }
  return out;
}

/** XP-Karte aus einem Inventarabzug (XPInfo ist dort dasselbe Feld wie im Profil). */
export function inventoryXP(inventory) {
  return new Map((inventory?.XPInfo || []).map(e => [e.ItemType, e.XP]));
}
