/**
 * Baro Ki'Teer Dukaten- & Prime-Junk-Helper
 * Berechnet Dukaten-Werte (15 / 45 / 65 / 100) für Prime-Teile & Relikte.
 */

import { imageUrl } from './catalog.js';

export const DUCAT_VALUES = {
  COMMON: 15,
  UNCOMMON: 45,
  UNCOMMON_SPECIAL: 65,
  RARE: 100
};

export function getDucatsReferenceList() {
  return [
    {
      rarity: 'Common (Bronze)',
      ducats: 15,
      badgeClass: 'common',
      description: 'Häufigste Relikt-Belohnungen. Perfekt als „Prime Junk“ zum bedenkenlosen Eintauschen bei Baro Ki’Teer.',
      examples: 'Fang Prime Klinge, Braton Prime Gehäuse, Paris Prime Sehne, Orthos Prime Griff'
    },
    {
      rarity: 'Uncommon (Silber)',
      ducats: 45,
      badgeClass: 'uncommon',
      description: 'Mittlere Relikt-Stufe. Hoher Dukaten-Ertrag pro Relikt (45 Dukaten).',
      examples: 'Warframe-Chassis & Neuroptiken (die meisten Prime Frames), Formas (0 Dukaten!)'
    },
    {
      rarity: 'Rare (Gold)',
      ducats: 100,
      badgeClass: 'rare',
      description: 'Seltene Gold-Drops (100 Dukaten). Vor dem Eintauschen prüfen, ob das Set auf warframe.market viel Platin wert ist!',
      examples: 'Gauss Prime Systeme, Glaive Prime Klinge, Sevagoth Prime Blaupause'
    }
  ];
}

/**
 * Filtert aus dem Katalog alle bekannten Prime-Items heraus und berechnet deren Dukaten-Stufe.
 */
export function buildDucatsCatalog(catalog) {
  const list = [];

  for (const item of catalog.items) {
    if (!/\bPrime\b/i.test(item.name || '')) continue;
    if (item.productCategory === 'Suits' || item.productCategory === 'LongGuns' ||
        item.productCategory === 'Pistols' || item.productCategory === 'Melee') {
      
      const recipe = catalog.recipeFor.get(item.uniqueName);
      if (recipe && recipe.ingredients) {
        for (const ing of recipe.ingredients) {
          const compName = catalog.items.find(x => x.uniqueName === ing.ItemType)?.name ||
                           ing.ItemType.split('/').pop().replace(/([a-z])([A-Z])/g, '$1 $2');
          
          let ducats = 15;
          let rarity = 'Common';
          if (/Systems|Chassis|Neuroptics|Receiver|Barrel/i.test(compName)) {
            ducats = 45;
            rarity = 'Uncommon';
          }
          if (/Blueprint|Hilt|Blade/i.test(compName) && /Prime/i.test(compName)) {
            ducats = 100;
            rarity = 'Rare';
          }

          list.push({
            uniqueName: ing.ItemType,
            name: compName,
            parentItem: item.name,
            ducats,
            rarity,
            image: imageUrl(ing.ItemType, 128)
          });
        }
      }
    }
  }

  // Deduplizieren
  const seen = new Set();
  return list.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  }).sort((a, b) => b.ducats - a.ducats || a.name.localeCompare(b.name));
}
