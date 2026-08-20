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
      description: 'Häufigste Relikt-Belohnungen (15 / 25 Dukaten). Perfekt als „Prime Junk“ zum bedenkenlosen Eintauschen bei Baro Ki’Teer.',
      examples: 'Fang Prime Klinge, Braton Prime Gehäuse, Paris Prime Sehne, Orthos Prime Griff'
    },
    {
      rarity: 'Uncommon (Silber)',
      ducats: 45,
      badgeClass: 'uncommon',
      description: 'Mittlere Relikt-Stufe (45 / 65 Dukaten). Hoher Dukaten-Ertrag pro Relikt.',
      examples: 'Warframe-Chassis & Neuroptiken (die meisten Prime Frames), Waffen-Läufe'
    },
    {
      rarity: 'Rare (Gold)',
      ducats: 100,
      badgeClass: 'rare',
      description: 'Seltene Gold-Drops (100 Dukaten). Vor dem Eintauschen prüfen, ob das Teil auf warframe.market viel Platin wert ist!',
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
    return { advice: 'unknown', ratio: null, label: 'Preis unbekannt' };
  }
  const ratio = +(ducats / price.min).toFixed(1);
  if (price.min >= 15 || ratio < 7.0) {
    return {
      advice: 'plat',
      ratio,
      label: 'Platin-Verkauf',
      reason: `${price.min}p Mindestpreis auf warframe.market`
    };
  }
  if (ratio >= 10.0) {
    return {
      advice: 'ducats',
      ratio,
      label: 'Prime Junk',
      reason: `${ratio} Dukaten pro Platin (hoher Schmelzwert)`
    };
  }
  return {
    advice: 'balanced',
    ratio,
    label: 'Ausgeglichen',
    reason: `${ratio} Dukaten pro Platin`
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
    a.name.localeCompare(b.name, 'de')
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

  return list.sort((a, b) => b.ducats - a.ducats || a.name.localeCompare(b.name, 'de'));
}
