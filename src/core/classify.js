/**
 * Item-Klassifizierung.
 *
 * DEs productCategory ist fuer unsere Zwecke unzuverlaessig: unter "Pistols" liegen
 * auch Zaw-Teile, Kitgun-Teile, K-Drives, Amp-Teile und Pet-Praezepte. Wir
 * klassifizieren daher zusaetzlich ueber den uniqueName-Pfad.
 *
 * Von Gegenstaenden aus Bauteilen zaehlt jeweils genau EIN Teil - das, unter
 * dem das Spiel die Affinity in XPInfo verbucht: Zaw-Strike, Kitgun-Chamber,
 * Amp-Prisma, K-Drive-Board, MOA- bzw. Hound-Modell. Nachgemessen an Kaans
 * Inventar (05.10.2026): bei jedem vergoldeten Bau traegt genau dieses Teil
 * in XPInfo dieselbe Affinity wie der Bau selbst, kein anderes taucht auf.
 */

const PATH_RULES = [
  // [Regex auf uniqueName, MR-Kategorie, zaehlt fuer Mastery?, MR-XP je Rang]

  /* Begleiter aus Bauteilen. Ihre Teile stehen im Export als "Pistols", sind
     aber keine Waffen; bis 1.24.1 fiel deshalb der ganze Pfad heraus - mit
     ihm Kaans Para Moa, die Multron und alle Predasiten und Vulpaphylas. */
  [/\/Pets\/MoaPets\/MoaPetParts\/MoaPetHead/i,               'KubrowPets',      true,  200],
  [/\/Pets\/ZanukaPets\/ZanukaPetParts\/ZanukaPetPartHead/i,  'KubrowPets',      true,  200],
  [/\/Pets\/(?:MoaPets|ZanukaPets)\/.*Weapon/i,               'SentinelWeapons', true,  100],
  [/\/Pets\/CreaturePets\/[^/]*PowerSuit$/i,                  'KubrowPets',      true,  200],
  [/\/Types\/Friendly\/Pets\//i,                              'PetPart',         false, 0  ], // Beine, Kerne, Gyros, Antigene

  /* Khoras Venari. Im Export "SpecialItems" wie ihre Peitsche, gibt aber
     Mastery wie ein Kavat - Kaans Gegenprobe (mastery.js) geht nur mit
     Venari und Venari Prime zu je 200 je Rang auf. */
  [/\/Powersuits\/Khora\/Kavat\//i,                           'KubrowPets',      true,  200],

  /* Beim K-Drive zaehlt nur das Board; Antrieb, Nase und Duesen nicht. */
  [/\/Types\/Vehicles\/Hoverboard\/.*Deck$/i,                 'KDrive',          true,  200],
  [/\/Types\/Vehicles\/Hoverboard\//i,                        'KDrivePart',      false, 0  ],

  /* Beim Amp zaehlt das Prisma - im Pfad "Barrel". Scaffold heisst dort
     "Chassis", Brace "Grip"; bis 1.24.1 war das genau vertauscht. */
  [/OperatorAmplifiers\/.*Barrel/i,                           'AmpPrism',        true,  100],
  [/OperatorAmplifiers\//i,                                   'AmpPart',         false, 0  ],

  [/\/Weapons\/Ostron\/Melee\/.*Tip/i,                        'ZawStrike',       true,  100], // Strike = Klinge
  [/\/Weapons\/Ostron\/Melee\//i,                             'ZawPart',         false, 0  ], // Griff / Link
  [/\/SolarisUnited\/.*(Barrel|Chamber)/i,                    'KitgunChamber',   true,  100],
  [/\/SolarisUnited\//i,                                      'KitgunPart',      false, 0  ], // Griff / Ladung
  [/\/CrewShip\/RailJack\/DefaultHarness/i,                   'Plexus',          true,  200],

  /* Gegenstaende, keine Ausruestung: unter /Types/Items/ stehen etwa die
     verwundeten Predasiten aus dem Fang, die der Export als "Pistols" fuehrt. */
  [/\/Lotus\/Types\/Items\//i,                                'Item',            false, 0  ]
];

/**
 * Liefert { category, countsForMastery, xpPerRank }.
 * category ist unsere bereinigte Kategorie, nicht DEs productCategory.
 */
export function classify(item) {
  const u = item.uniqueName || '';

  for (const [re, cat, counts, perRank] of PATH_RULES) {
    if (re.test(u)) return { category: cat, countsForMastery: counts, xpPerRank: perRank };
  }

  const pc = item.productCategory;
  const BIG = ['Suits', 'SpaceSuits', 'MechSuits', 'Sentinels', 'KubrowPets'];
  const NORMAL = ['LongGuns', 'Pistols', 'Melee', 'SpaceGuns', 'SpaceMelee', 'SentinelWeapons'];

  if (BIG.includes(pc))    return { category: pc, countsForMastery: true, xpPerRank: 200 };
  if (NORMAL.includes(pc)) return { category: pc, countsForMastery: true, xpPerRank: 100 };

  /* Der Sirocco des Drifters steht bei DE unter den Amps und gibt Mastery
     wie einer (100 je Rang, in Kaans Gegenprobe enthalten). */
  if (pc === 'OperatorAmps') return { category: 'AmpPrism', countsForMastery: true, xpPerRank: 100 };

  return { category: pc || 'Unknown', countsForMastery: false, xpPerRank: 0 };
}

/** Menschenlesbare Gruppen fuer die UI. */
export const CATEGORY_LABELS = {
  Suits: 'Warframes',
  SpaceSuits: 'Archwings',
  MechSuits: 'Necramechs',
  Sentinels: 'Sentinels',
  KubrowPets: 'Companion pets',
  KDrive: 'K-Drives',
  Plexus: 'Plexus',
  LongGuns: 'Primary weapons',
  Pistols: 'Secondary weapons',
  Melee: 'Melee',
  SpaceGuns: 'Archwing guns',
  SpaceMelee: 'Archwing melee',
  SentinelWeapons: 'Sentinel weapons',
  AmpPrism: 'Amps',
  ZawStrike: 'Zaw strikes',
  KitgunChamber: 'Kitgun chambers'
};
