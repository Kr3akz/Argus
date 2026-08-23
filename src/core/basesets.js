/**
 * Bausaetze fuer NICHT-Prime-Items.
 *
 * WARUM NEBEN ducats.js UND NICHT DARIN:
 *   Prime-Sets entstehen aus der Marktliste - sie sind handelbar, haben Dukaten
 *   und einen Platinpreis. Basis-Teile sind nichts davon: sie stehen auf keinem
 *   Markt, kosten keine Dukaten und lassen sich nur ueber DEs Rezepte finden.
 *   Dieselbe Frage ("welche Teile fehlen mir noch?"), zwei voellig verschiedene
 *   Quellen - deshalb zwei Module mit einer gemeinsamen Ausgabeform.
 *
 * WAS EIN BAUSATZ IST:
 *   Ein Item, dessen Rezept aus BAUTEILEN besteht - Neuroptik, Chassis, Systeme.
 *   Eine Gorgon ist keiner: sie wird direkt aus Ferrit und Salvage gebaut, und
 *   ein "Set" aus Rohstoffen zu zeigen waere Unfug. Das trennt der Pfad sauber:
 *   Bauteile liegen unter /Lotus/Types/Recipes/, Rohstoffe unter
 *   /Lotus/Types/Items/MiscItems/.
 *
 * WAS "BESITZT" HEISST:
 *   Ein Teil zaehlt in ZWEI Formen - als gebautes Bauteil (liegt in MiscItems)
 *   und als noch ungebauter Bauplan dafuer (liegt in Recipes). Beides bedeutet
 *   "habe ich", nur in verschiedenen Stadien; wer nur eine Form zaehlte, wuerde
 *   die halbe Werkbank uebersehen.
 */
import { imageUrl } from './catalog.js';
import { classify } from './classify.js';

const isComponentPath = u => /\/Types\/Recipes\//.test(String(u || ''));

/* DE stellt Kategorie-Marker voran ("<ARCHWING> Agkuza"). Sie stoeren nicht nur
   in der Liste - solange sie am Set-Namen haengen, findet die Kuerzung der
   Teilenamen ihr Praefix nicht wieder ("Agkuza Blade" bliebe ungekuerzt). */
const stripTag = name => String(name || '').replace(/^<[^>]+>\s*/, '').trim();

/** Zaehlt Exemplare je uniqueName aus mehreren Inventarfeldern. */
function countBy(inventory, fields) {
  const counts = new Map();
  for (const field of fields) {
    for (const row of inventory?.[field] || []) {
      if (!row.ItemType) continue;
      counts.set(row.ItemType, (counts.get(row.ItemType) || 0) + (row.ItemCount || 1));
    }
  }
  return counts;
}

/**
 * Anzeigename eines Bauteils. Der Katalog kennt sie unter ihrem Klarnamen
 * ("Excalibur Neuroptics"); faellt der aus, bleibt der Pfad als Notnagel.
 */
function partName(uniqueName, catalog) {
  const item = catalog.byUniqueName?.get(uniqueName);
  if (item?.name) return stripTag(item.name);

  const recipe = catalog.recipeByUniqueName?.get(uniqueName);
  if (recipe?.resultType) {
    const result = catalog.byUniqueName?.get(recipe.resultType);
    if (result?.name) return stripTag(result.name);
  }
  return (uniqueName.split('/').pop() || uniqueName).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * Alle Bausaetze aus DEs Rezepten, mit dem eigenen Bestand verrechnet.
 *
 * @param catalog    aus loadCatalog()
 * @param inventory  Rohantwort der Inventar-API
 * @param onlyOwned  nur Saetze zeigen, von denen mindestens ein Teil daliegt
 * @param mastered   uniqueNames bereits besessener Endprodukte
 */
export function buildBaseSets(catalog, inventory, { onlyOwned = true, mastered = new Set() } = {}) {
  if (!catalog?.items?.length) return [];

  /* Gebaute Bauteile und ungebaute Bauplaene liegen in verschiedenen Feldern -
     beide zaehlen. PendingRecipes ist, was gerade in der Schmiede steht; auch
     das hat man bereits. */
  const built  = countBy(inventory, ['MiscItems']);
  const plans  = countBy(inventory, ['Recipes', 'PendingRecipes']);

  const out = [];

  for (const item of catalog.items) {
    const name = stripTag(item.name);
    if (!name || /\bPrime\b/i.test(name)) continue;

    const { category, countsForMastery } = classify(item);
    if (!countsForMastery) continue;

    const recipe = catalog.recipeFor?.get(item.uniqueName);
    if (!recipe) continue;

    const components = (recipe.ingredients || []).filter(ing => isComponentPath(ing.ItemType));
    if (!components.length) continue;          // aus Rohstoffen gebaut - kein Bausatz

    const parts = components.map(ing => {
      /* Der Bauplan ZU diesem Bauteil - er zaehlt genauso wie das fertige Teil. */
      const plan = catalog.recipeFor?.get(ing.ItemType)?.uniqueName || null;
      const count = (built.get(ing.ItemType) || 0) + (plan ? plans.get(plan) || 0 : 0);
      const full = partName(ing.ItemType, catalog);

      return {
        name: full,
        shortName: full.replace(name, '').replace(/^\s+/, '') || full,
        slug: null,
        gameRef: ing.ItemType,
        ducats: 0,
        image: imageUrl(ing.ItemType, 128),
        price: null,
        required: ing.ItemCount || 1,
        count
      };
    });

    /* Der Hauptbauplan ist selbst ein Teil des Bausatzes - ohne ihn nuetzen die
       drei Bauteile nichts. */
    parts.push({
      name: `${name} Blueprint`,
      shortName: 'Blueprint',
      slug: null,
      gameRef: recipe.uniqueName,
      ducats: 0,
      image: imageUrl(recipe.uniqueName, 128),
      price: null,
      required: 1,
      count: plans.get(recipe.uniqueName) || 0
    });

    const hasAny = parts.some(p => p.count > 0);
    const isMastered = mastered.has(item.uniqueName);
    /* Wer das Item schon besitzt, hat den Bausatz hinter sich - er soll ihn
       trotzdem finden koennen, aber er verstopft nicht die Liste dessen, was
       noch zusammenzusuchen ist. */
    if (onlyOwned && !hasAny && !isMastered) continue;

    const totalParts = parts.reduce((sum, p) => sum + p.required, 0);
    const ownedParts = parts.reduce((sum, p) => sum + Math.min(p.count, p.required), 0);

    out.push({
      kind: 'base',
      name,
      category,
      gameRef: item.uniqueName,
      image: imageUrl(item.uniqueName, 128),
      parts: parts.sort((a, b) => a.shortName.localeCompare(b.shortName, 'en')),
      setSlug: null,
      setPrice: null,
      totalParts,
      ownedParts,
      complete: parts.every(p => p.count >= p.required),
      fullSetsCount: Math.min(...parts.map(p => Math.floor(p.count / p.required))),
      isMastered,
      ownedDucats: 0,
      totalDucats: 0
    });
  }

  /* Fast vollstaendige Bausaetze zuerst - dort lohnt der naechste Handgriff am
     meisten. Bereits gebaute Items ganz nach hinten. */
  return out.sort((a, b) => {
    if (a.isMastered !== b.isMastered) return a.isMastered ? 1 : -1;
    const ra = a.totalParts ? a.ownedParts / a.totalParts : 0;
    const rb = b.totalParts ? b.ownedParts / b.totalParts : 0;
    return rb - ra || a.name.localeCompare(b.name, 'en');
  });
}
