/**
 * Baro Ki'Teer Dukaten- & Prime-Junk-Helper
 * Berechnet Dukaten-Werte (15 / 25 / 45 / 65 / 100) für Prime-Teile & Relikte,
 * erkennt Prime-Teile aus dem Spiel-Inventar und berechnet Platin-Effizienz.
 */

import { imageUrl } from './catalog.js';
import { findMarketItem } from './market.js';

export const DUCAT_VALUES = {
  COMMON: 15,
  COMMON_SPECIAL: 25,
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
      description: 'The most common relic rewards (15 / 25 ducats). Perfect "prime junk" to trade in at Baro Ki\u2019Teer without a second thought.',
      examples: 'Fang Prime Blade, Braton Prime Receiver, Paris Prime String, Orthos Prime Handle'
    },
    {
      rarity: 'Uncommon (Silber)',
      ducats: 45,
      badgeClass: 'uncommon',
      description: 'Mid-tier relic rewards (45 / 65 ducats). A high ducat yield per relic.',
      examples: 'Warframe chassis & neuroptics (most prime frames), weapon barrels'
    },
    {
      rarity: 'Rare (Gold)',
      ducats: 100,
      badgeClass: 'rare',
      description: 'Rare gold drops (100 ducats). Before trading one in, check whether it is worth a lot of platinum on warframe.market.',
      examples: 'Gauss Prime Systeme, Glaive Prime Klinge, Sevagoth Prime Blaupause'
    }
  ];
}

/** Ermittelt den übergeordneten Prime-Namen (z. B. "Gauss Prime" aus "Gauss Prime Systems Blueprint"). */
export function getParentPrimeName(name) {
  const m = (name || '').match(/^(.*? Prime)/i);
  return m ? m[1] : '';
}

/** Gibt die Rarity-Stufe anhand des Dukatenwerts zurück. */
export function getRarity(ducats) {
  if (ducats >= 100) return 'Rare';
  if (ducats >= 45) return 'Uncommon';
  return 'Common';
}

/**
 * Bewertet das Verhältnis von Dukaten zu Platinpreis.
 * Gibt Empfehlungen:
 * - 'ducats': Prime Junk (hoher Dukatenertrag pro Platin, >= 10.0 Dukaten/Platin)
 * - 'plat': Platin-Verkauf (hoher Marktpreis >= 15p oder Verhältnis < 7.0 Dukaten/Platin)
 * - 'balanced': Ausgeglichen
 */
export function getTradeAdvice(ducats, price) {
  if (!price || typeof price.min !== 'number' || price.min <= 0) {
    return { advice: 'unknown', ratio: null, label: 'Price unknown' };
  }
  const ratio = +(ducats / price.min).toFixed(1);
  if (price.min >= 15 || ratio < 7.0) {
    return {
      advice: 'plat',
      ratio,
      label: 'Sell for platinum',
      reason: `${price.min}p minimum price on warframe.market`
    };
  }
  if (ratio >= 10.0) {
    return {
      advice: 'ducats',
      ratio,
      label: 'Prime Junk',
      reason: `${ratio} ducats per platinum (high melt value)`
    };
  }
  return {
    advice: 'balanced',
    ratio,
    label: 'Balanced',
    reason: `${ratio} ducats per platinum`
  };
}

/**
 * Filtert aus dem Inventar alle handelbaren Prime-Teile heraus und reichert sie mit
 * Stückzahlen, Dukatenwerten und Marktpreisen an.
 */
export function buildInventoryDucats(inventory, catalog, market, priceCache = {}) {
  const inv = inventory || {};
  const invMap = new Map();

  for (const row of [...(inv.MiscItems || []), ...(inv.Recipes || [])]) {
    const uniqueName = row.ItemType;
    if (!uniqueName) continue;

    const catItem = catalog?.byUniqueName?.get(uniqueName);
    const m = market ? findMarketItem(market, { uniqueName, name: catItem?.name }) : null;

    if (m && m.ducats != null && !m.tags?.includes('set')) {
      const slug = m.slug;
      const count = row.ItemCount || 1;
      const existing = invMap.get(slug);

      if (existing) {
        existing.count += count;
      } else {
        const name = m.i18n?.en?.name || catItem?.name || uniqueName.split('/').pop();
        const ducats = m.ducats;
        const price = priceCache[slug]?.price || null;
        const tradeAdvice = getTradeAdvice(ducats, price);

        invMap.set(slug, {
          uniqueName,
          slug,
          name,
          parentItem: getParentPrimeName(name),
          ducats,
          rarity: getRarity(ducats),
          count,
          image: imageUrl(uniqueName, 128) || (m.i18n?.en?.thumb ? `https://warframe.market/static/assets/${m.i18n.en.thumb}` : null),
          price,
          tradeAdvice
        });
      }
    }
  }

  const items = [...invMap.values()].sort((a, b) => (
    b.ducats - a.ducats ||
    b.count - a.count ||
    a.name.localeCompare(b.name, 'en')
  ));

  let totalDucats = 0;
  let totalItems = 0;
  let duplicateDucats = 0;
  let duplicateItems = 0;
  let totalPlatMin = 0;
  let totalPlatMedian = 0;
  let pricedCount = 0;

  for (const item of items) {
    totalDucats += item.ducats * item.count;
    totalItems += item.count;

    const dups = Math.max(0, item.count - 1);
    duplicateItems += dups;
    duplicateDucats += item.ducats * dups;

    if (item.price?.min != null) {
      totalPlatMin += item.price.min * item.count;
      totalPlatMedian += (item.price.median || item.price.min) * item.count;
      pricedCount += item.count;
    }
  }

  return {
    items,
    summary: {
      totalDucats,
      totalItems,
      uniqueParts: items.length,
      duplicateDucats,
      duplicateItems,
      totalPlatMin,
      totalPlatMedian,
      pricedRatio: totalItems > 0 ? (pricedCount / totalItems) : 0
    }
  };
}

/**
 * Liefert den Gesamtkatalog aller bekannten Prime-Items mit Dukatenwert aus dem Markt-Index.
 */
/**
 * Prime-Sets mit Besitzstand.
 *
 * Beantwortet die Frage, die eine flache Teileliste offen laesst: von welchem
 * Set habe ich schon was, und was fehlt noch. Ein einzelnes "Lex Prime Barrel"
 * sagt nichts darueber, ob es das letzte fehlende Teil ist oder das dritte
 * Duplikat.
 *
 * QUELLE DER TEILELISTE ist die Marktliste, nicht das Inventar: nur sie kennt
 * auch die Teile, die man NICHT hat - und genau die sind hier die Aussage.
 * Der Katalog waere die naheliegendere Quelle, kennt die Zusammensetzung eines
 * Sets aber nur ueber Rezepte, die fuer vaulted Teile fehlen.
 *
 * Das Set-Item selbst (Tag "set") ist kein Bestandteil, sondern traegt nur den
 * Gesamtpreis - sonst zaehlte man ein fuenftes Teil, das es nicht gibt.
 */
export function buildPrimeSets(market, priceCache = {}, ownedItems = [], { onlyOwned = true, catalog = null, mastered = new Set() } = {}) {
  if (!market?.list?.length) return [];

  const owned = new Map();
  for (const it of ownedItems) if (it.slug) owned.set(it.slug, it.count || 0);

  const sets = new Map();

  for (const m of market.list) {
    const name = m.i18n?.en?.name || '';
    if (!/\bPrime\b/i.test(name)) continue;

    const parent = getParentPrimeName(name);
    if (!parent) continue;

    let set = sets.get(parent);
    if (!set) {
      set = { name: parent, parts: [], setSlug: null, setPrice: null, gameRef: null, image: null };
      sets.set(parent, set);
    }

    if (m.tags?.includes('set')) {
      set.setSlug = m.slug;
      set.setPrice = priceCache[m.slug]?.price || null;
      if (m.gameRef) {
        set.gameRef = m.gameRef;
        set.image = imageUrl(m.gameRef, 128);
      }
      continue;
    }
    if (m.ducats == null) continue;

    const count = owned.get(m.slug) || 0;
    set.parts.push({
      name,
      /* Der Set-Name steht schon ueber der Karte - in der Teilezeile bleibt
         nur das, was die Teile unterscheidet. */
      shortName: name.replace(parent, '').replace(/^\s+/, '') || name,
      slug: m.slug,
      ducats: m.ducats,
      gameRef: m.gameRef || null,
      /* Bild aus DEs Export, nicht das Thumbnail von warframe.market */
      image: m.gameRef ? imageUrl(m.gameRef, 128) : null,
      price: priceCache[m.slug]?.price || null,
      count
    });
  }

  const out = [];
  for (const set of sets.values()) {
    if (!set.parts.length) continue;

    if (!set.image && catalog) {
      const catItem = catalog.byName?.get(set.name.toLowerCase()) ||
        catalog.items?.find(it => it.name?.toLowerCase() === set.name.toLowerCase());
      if (catItem?.uniqueName) {
        set.gameRef = catItem.uniqueName;
        set.image = imageUrl(catItem.uniqueName, 128);
      }
    }

    let recipe = null;
    if (catalog) {
      if (set.gameRef && catalog.recipeFor?.get(set.gameRef)) {
        recipe = catalog.recipeFor.get(set.gameRef);
      } else {
        const catItem = catalog.byName?.get(set.name.toLowerCase()) ||
          catalog.items?.find(it => it.name?.toLowerCase() === set.name.toLowerCase());
        if (catItem?.uniqueName) {
          if (!set.gameRef) set.gameRef = catItem.uniqueName;
          recipe = catalog.recipeFor?.get(catItem.uniqueName);
        }
      }
    }

    for (const p of set.parts) {
      let required = 1;
      if (recipe) {
        if (p.gameRef === recipe.uniqueName || p.slug.endsWith('_blueprint') || p.name.toLowerCase().endsWith('blueprint')) {
          required = 1;
        } else {
          let found = (recipe.ingredients || []).find(ing => ing.ItemType === p.gameRef);
          if (!found && catalog?.recipeFor) {
            found = (recipe.ingredients || []).find(ing => {
              const subRec = catalog.recipeFor.get(ing.ItemType);
              return subRec && (subRec.uniqueName === p.gameRef || subRec.resultType === p.gameRef);
            });
          }
          if (!found && catalog?.recipeByUniqueName) {
            const pRec = catalog.recipeByUniqueName.get(p.gameRef);
            if (pRec) {
              found = (recipe.ingredients || []).find(ing => ing.ItemType === pRec.resultType || ing.ItemType === pRec.uniqueName);
            }
          }
          if (found) {
            required = found.ItemCount || 1;
          }
        }
      }
      p.required = required;
    }

    const hasAny = set.parts.some(p => p.count > 0);
    if (onlyOwned && !hasAny) continue;

    set.parts.sort((a, b) => b.ducats - a.ducats || a.name.localeCompare(b.name, 'en'));

    const totalParts = set.parts.reduce((sum, p) => sum + (p.required || 1), 0);
    const ownedParts = set.parts.reduce((sum, p) => sum + Math.min(p.count, p.required || 1), 0);
    const complete = set.parts.every(p => p.count >= (p.required || 1));
    const fullSetsCount = set.parts.length
      ? Math.min(...set.parts.map(p => Math.floor(p.count / (p.required || 1))))
      : 0;
    const isMastered = !!(mastered.has(set.gameRef) || mastered.has(set.name.toLowerCase()));

    out.push({
      ...set,
      totalParts,
      ownedParts,
      complete,
      fullSetsCount,
      isMastered,
      /* Nur was man wirklich hat - der Wert der fehlenden Teile waere eine
         Zahl ueber Besitz, den es nicht gibt. */
      ownedDucats: set.parts.reduce((sum, p) => sum + (p.count > 0 ? (p.ducats || 0) * p.count : 0), 0),
      totalDucats: set.parts.reduce((sum, p) => sum + (p.ducats || 0) * (p.required || 1), 0)
    });
  }

  /* Fast vollstaendige Sets zuerst: dort lohnt der naechste Riss am meisten. */
  return out.sort((a, b) => {
    const ra = a.totalParts ? a.ownedParts / a.totalParts : 0;
    const rb = b.totalParts ? b.ownedParts / b.totalParts : 0;
    return rb - ra || b.ownedParts - a.ownedParts || a.name.localeCompare(b.name, 'en');
  });
}

export function buildDucatsCatalog(catalog, market, priceCache = {}) {
  if (!market || !market.list) return [];

  const list = [];
  const seenSlugs = new Set();

  for (const m of market.list) {
    if (m.ducats == null || m.tags?.includes('set')) continue;
    if (seenSlugs.has(m.slug)) continue;
    seenSlugs.add(m.slug);

    const name = m.i18n?.en?.name || m.slug;
    const ducats = m.ducats;
    const uniqueName = m.gameRef || '';
    const price = priceCache[m.slug]?.price || null;
    const tradeAdvice = getTradeAdvice(ducats, price);

    list.push({
      uniqueName,
      slug: m.slug,
      name,
      parentItem: getParentPrimeName(name),
      ducats,
      rarity: getRarity(ducats),
      image: uniqueName ? imageUrl(uniqueName, 128) : (m.i18n?.en?.thumb ? `https://warframe.market/static/assets/${m.i18n.en.thumb}` : null),
      price,
      tradeAdvice
    });
  }

  return list.sort((a, b) => b.ducats - a.ducats || a.name.localeCompare(b.name, 'en'));
}
