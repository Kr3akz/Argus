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
 *
 * BAUZEIT IST EINE UHRZEIT, KEINE SUMME.
 *   Hier stand einmal `totalBuildSeconds += buildTime * count` ueber den
 *   ganzen Baum. Das beantwortet die Frage "wie lange laufen alle Baue
 *   zusammengerechnet", die niemand stellt. Gefragt ist: wann habe ich es.
 *
 *   Die Schmiede baut BELIEBIG VIELES GLEICHZEITIG - es gibt keine Slots und
 *   keine Warteschlange. Man legt alle drei Komponenten am selben Abend ein
 *   und geht schlafen. Sie laufen also nebeneinander, und erst wenn die
 *   LANGSAMSTE fertig ist, kann der Warframe darauf starten.
 *
 *   Nachgemessen an DEs ExportRecipes, Octavia:
 *     Summe            72h (Rahmen) + 3 x 12h + 10s = 108h -> "4d 12h"
 *     Kritischer Pfad  max(12h, 12h, 12h) + 72h     =  84h -> "3d 12h"
 *   Bei Mesa, Ivara und Excalibur waren es dieselben 24-25 h zu viel. Ein
 *   ganzer Tag, und zwar zuverlaessig bei JEDEM Warframe.
 *
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
      return { type, name: nameOf.get(type) || shortName(type), count, children: [], waitSeconds: 0 };
    }

    /* Ein Rezept liefert `num` Stueck. Wer zwanzig Kaltfusionskerne braucht
       und pro Bau zwanzig bekommt, baut EINMAL - nicht zwanzigmal, und zahlt
       auch nur einmal. 70 der 1866 Rezepte liefern mehr als eins (10, 20, 3,
       100, 50, 5, 6); ohne diese Zeile vervielfacht sich bei ihnen alles:
       Credits, Bauschritte und der ganze Materialbedarf darunter. */
    const perBuild = recipe.num > 0 ? recipe.num : 1;
    const builds   = Math.ceil(count / perBuild);

    totalCredits += (recipe.buildPrice || 0) * builds;
    buildSteps += builds;

    const children = (recipe.ingredients || []).map(ing =>
      walk(ing.ItemType, (ing.ItemCount || 1) * builds, depth + 1));

    /* Der kritische Pfad: erst wenn die langsamste Zutat aus der Schmiede
       kommt, kann dieses Rezept starten. Mehrere Exemplare DESSELBEN Rezepts
       verlaengern nichts - auch die laufen nebeneinander. */
    const waitSeconds = (recipe.buildTime || 0) +
      Math.max(0, ...children.map(c => c.waitSeconds || 0));

    return { type, name: nameOf.get(type) || shortName(type), count,
             buildPrice: recipe.buildPrice || 0, buildTime: recipe.buildTime || 0,
             waitSeconds, children };
  }

  const tree = walk(uniqueName, 1, 0);
  totalBuildSeconds = tree.waitSeconds || 0;
  const components = (tree.children || []).map(c => ({
    uniqueName: c.type,
    name: c.name,
    count: c.count,
    isSubRecipe: Array.isArray(c.children) && c.children.length > 0,
    buildPrice: c.buildPrice || 0,
    buildTime: c.buildTime || 0,
    waitSeconds: c.waitSeconds || 0,
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
    /* Auch mehrere Ziele stehen gleichzeitig in der Schmiede. Die
       Einkaufsliste ist nach der LAENGSTEN Wartezeit fertig, nicht nach der
       Summe aller - Credits dagegen zahlt man fuer jedes Ziel einzeln. */
    seconds = Math.max(seconds, r.totalBuildSeconds);
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
