/**
 * Item-Klassifizierung.
 *
 * DEs productCategory ist fuer unsere Zwecke unzuverlaessig: unter "Pistols" liegen
 * auch Zaw-Teile, Kitgun-Teile, K-Drives, Amp-Teile und Pet-Praezepte. Wir
 * klassifizieren daher zusaetzlich ueber den uniqueName-Pfad.
 *
 * Laut wiki.warframe.com/w/Mastery_Rank zaehlen von modularen Waffen nur die
 * Kernkomponenten: Zaw-Strikes, Kitgun-Chambers, Amp-Prismen.
 */

const PATH_RULES = [
  // [Regex auf uniqueName, MR-Kategorie, zaehlt fuer Mastery?]
  [/\/Types\/Friendly\/Pets\//i,            'PetPrecept',    false], // Praezepte: keine eigene Mastery
  [/\/Types\/Vehicles\/Hoverboard\//i,      'KDrive',        true ],
  [/OperatorAmplifiers\/.*Barrel/i,         'AmpPart',       false], // Scaffold
  [/OperatorAmplifiers\/.*Brace/i,          'AmpPart',       false],
  [/OperatorAmplifiers\//i,                 'AmpPrism',      true ],
  [/\/Weapons\/Ostron\/Melee\/.*Tip/i,      'ZawStrike',     true ], // Strike = Klinge
  [/\/Weapons\/Ostron\/Melee\//i,           'ZawPart',       false], // Griff / Link
  [/\/SolarisUnited\/.*(Barrel|Chamber)/i,  'KitgunChamber', true ],
  [/\/SolarisUnited\//i,                    'KitgunPart',    false], // Griff / Ladung
  [/\/CrewShip\/RailJack\/DefaultHarness/i, 'Plexus',        true ]
];

/**
 * Liefert { category, countsForMastery, xpPerRank }.
 * category ist unsere bereinigte Kategorie, nicht DEs productCategory.
 */
export function classify(item) {
  const u = item.uniqueName || '';

  for (const [re, cat, counts] of PATH_RULES) {
    if (re.test(u)) {
      return {
        category: cat,
        countsForMastery: counts,
        xpPerRank: (cat === 'KDrive' || cat === 'Plexus') ? 200 : 100
      };
    }
  }

  const pc = item.productCategory;
  const BIG = ['Suits', 'SpaceSuits', 'MechSuits', 'Sentinels', 'KubrowPets'];
  const NORMAL = ['LongGuns', 'Pistols', 'Melee', 'SpaceGuns', 'SpaceMelee', 'SentinelWeapons'];

  if (BIG.includes(pc))    return { category: pc, countsForMastery: true, xpPerRank: 200 };
  if (NORMAL.includes(pc)) return { category: pc, countsForMastery: true, xpPerRank: 100 };

  return { category: pc || 'Unknown', countsForMastery: false, xpPerRank: 0 };
}

/** Menschenlesbare Gruppen fuer die UI. */
export const CATEGORY_LABELS = {
  Suits: 'Warframes',
  SpaceSuits: 'Archwings',
  MechSuits: 'Necramechs',
  Sentinels: 'Sentinels',
  KubrowPets: 'Tierbegleiter',
  KDrive: 'K-Drives',
  Plexus: 'Plexus',
  LongGuns: 'Primaerwaffen',
  Pistols: 'Sekundaerwaffen',
  Melee: 'Nahkampf',
  SpaceGuns: 'Archwing-Gewehre',
  SpaceMelee: 'Archwing-Nahkampf',
  SentinelWeapons: 'Sentinel-Waffen',
  AmpPrism: 'Amp-Prismen',
  ZawStrike: 'Zaw-Klingen',
  KitgunChamber: 'Kitgun-Kammern'
};
