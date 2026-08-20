/**
 * Rekursive Rezeptaufloesung fuer Farm-Ziele.
 *
 * Setzt man sich ein Item als Ziel, will man nicht "1x Chassis" lesen, sondern
 * die Rohstoffe - zusammengezaehlt: Polymer Bundle steckt bei Octavia in zwei
 * Komponenten und muss als eine Summe erscheinen.
 */

/** Namensindex ueber alle Exportdateien. */
export function buildNameIndex(catalog) {
  const names = new Map();
  for (const it of catalog.items) if (it.uniqueName) names.set(it.uniqueName, it.name);
  for (const r of catalog.recipes) {
    if (r.uniqueName && r.resultType && names.has(r.resultType)) {
      names.set(r.uniqueName, names.get(r.resultType));
    }
  }
  return names;
}

const shortName = u => u.split('/').pop().replace(/([a-z])([A-Z])/g, '$1 $2');

/**
 * Rohstoffe - hier endet die Aufloesung.
 *
 * Neural Sensor, Neurode, Morphic und Orokin Cell HABEN eigene Rezepte: das sind
 * die Ressourcen-Konvertierungen aus Nano Spores + Alloy Plate. Kein Spieler baut
 * die, man farmt sie. Ohne diesen Stopp meldet das Tool 1,2 Mio Nano Spores fuer
 * einen einzigen Warframe, der in Wahrheit gar keine braucht.
 *
 * Bewusst ohne Regex: Backslashes ueberleben die Heredoc-Kette hier nicht
 * zuverlaessig, und ein stillschweigend kaputter Regex ist genau der Bug gewesen.
 */
const RAW_PATHS = ['/Types/Items/MiscItems/', '/Types/Items/Gems/', '/Types/Items/Fish/'];

export function isRawMaterial(uniqueName) {
  return RAW_PATHS.some(p => uniqueName.includes(p));
}

/**
 * Loest ein Ziel in Komponentenbaum + aggregierte Rohstoffliste auf.
 * @returns {{tree, materials, totalCredits, totalBuildSeconds, buildSteps}}
 */
export function resolveGoal(uniqueName, catalog, { names = null, maxDepth = 6 } = {}) {
  const nameOf = names || buildNameIndex(catalog);
  const materials = new Map();
  let totalCredits = 0, buildSteps = 0, totalBuildSeconds = 0;

  function walk(type, count, depth) {
    const recipe = isRawMaterial(type) ? null : catalog.recipeFor.get(type);

    if (!recipe || depth > maxDepth) {
      const prev = materials.get(type);
      if (prev) prev.count += count;
      else materials.set(type, { name: nameOf.get(type) || shortName(type), count, uniqueName: type });
      return { type, name: nameOf.get(type) || shortName(type), count, children: [] };
    }

    totalCredits += (recipe.buildPrice || 0) * count;
    totalBuildSeconds += (recipe.buildTime || 0) * count;
    buildSteps += count;

    const children = (recipe.ingredients || []).map(ing =>
      walk(ing.ItemType, (ing.ItemCount || 1) * count, depth + 1));

    return { type, name: nameOf.get(type) || shortName(type), count,
             buildPrice: recipe.buildPrice || 0, buildTime: recipe.buildTime || 0, children };
  }

  const tree = walk(uniqueName, 1, 0);
  const components = (tree.children || []).map(c => ({
    uniqueName: c.type,
    name: c.name,
    count: c.count,
    isSubRecipe: Array.isArray(c.children) && c.children.length > 0,
    buildPrice: c.buildPrice || 0,
    buildTime: c.buildTime || 0,
    ingredients: (c.children || []).map(ch => ({
      uniqueName: ch.type,
      name: ch.name,
      count: ch.count
    }))
  }));

  return {
    tree,
    components,
    materials: [...materials.values()].sort((a, b) => b.count - a.count),
    totalCredits, totalBuildSeconds, buildSteps
  };
}

/** Materialbedarf mehrerer Ziele zusammenfassen - die gemeinsame Einkaufsliste. */
export function combineGoals(uniqueNames, catalog) {
  const names = buildNameIndex(catalog);
  const combined = new Map();
  let credits = 0, seconds = 0;
  const perGoal = [];

  for (const u of uniqueNames) {
    const r = resolveGoal(u, catalog, { names });
    perGoal.push({ uniqueName: u, name: r.tree.name, ...r });
    credits += r.totalCredits;
    seconds += r.totalBuildSeconds;
    for (const m of r.materials) {
      const prev = combined.get(m.uniqueName);
      if (prev) prev.count += m.count;
      else combined.set(m.uniqueName, { ...m });
    }
  }
  return { perGoal, materials: [...combined.values()].sort((a, b) => b.count - a.count),
           totalCredits: credits, totalBuildSeconds: seconds };
}

export function formatDuration(seconds) {
  const h = Math.round(seconds / 3600);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
