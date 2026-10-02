/**
 * Beispieldaten fuer die Handy-App - fuer src/cli/mobile-test.js und die
 * Vorschau (src/cli/mobile-dev.js), damit beide ohne Netz, ohne Spiel und
 * ohne echtes Konto laufen.
 *
 * Die Formen sind die der echten Quellen: der rohe Weltzustand wie von
 * api.warframestat.us, die Antworten der Kanaele wie aus main.js. Alle
 * Zeiten haengen an `now`, damit die Countdowns immer laufen statt am Tag
 * des Abschreibens stehenzubleiben.
 *
 * Erfunden ist der Inhalt, nicht die Form: Namen und Knoten gibt es im Spiel,
 * die Kombination an einem bestimmten Tag nicht unbedingt.
 */

const M = 60000, H = 3600000, D = 86400000;
const iso = t => new Date(t).toISOString();
const IMG = 'https://cdn.jsdelivr.net/gh/Aericio/warframe-exports-data/image/128x128/';
const bild = path => IMG + path.replace(/^\//, '').replaceAll('/', '.') + '.png';

export function rawWorldState(now = Date.now()) {
  const tagesStart = Math.floor(now / D) * D;
  const montag = tagesStart - ((new Date(tagesStart).getUTCDay() + 6) % 7) * D;
  const fissure = (id, node, missionType, enemy, tier, tierNum, inMin, extra = {}) =>
    ({ id, node, missionType, enemy, tier, tierNum, isHard: false, isStorm: false, activation: iso(now - 20 * M), expiry: iso(now + inMin * M), ...extra });

  return {
    timestamp: iso(now - 2 * M),
    fissures: [
      fissure('f1', 'Tuvul Commons (Zariman)', 'Void Cascade', 'Crossfire', 'Omnia', 6, 47),
      fissure('f2', 'Hepit (Void)', 'Capture', 'Corrupted', 'Lith', 1, 12),
      fissure('f3', 'Ukko (Void)', 'Capture', 'Corrupted', 'Meso', 2, 63),
      fissure('f4', 'Belenus (Void)', 'Defense', 'Corrupted', 'Neo', 3, 88),
      fissure('f5', 'Apollo (Lua)', 'Disruption', 'Corpus', 'Axi', 4, 31),
      fissure('f6', 'Everview Arc (Zariman)', 'Void Flood', 'Crossfire', 'Requiem', 5, 52),
      fissure('f7', 'Mot (Void)', 'Survival', 'Corrupted', 'Axi', 4, 95, { isHard: true }),
      fissure('f8', 'Teshub (Void)', 'Exterminate', 'Corrupted', 'Lith', 1, 22, { isHard: true }),
      fissure('f9', 'Tuvul Commons (Zariman)', 'Void Cascade', 'Crossfire', 'Omnia', 6, 71, { isHard: true }),
      fissure('f10', 'Ogal Cluster (Earth Proxima)', 'Skirmish', 'Grineer', 'Neo', 3, 40, { isStorm: true })
    ],
    sortie: {
      id: 'sortie1', activation: iso(now - 5 * H), expiry: iso(now + 19 * H),
      boss: 'Kela De Thaym', faction: 'Grineer',
      variants: [
        { node: 'Sedna/Kappa', missionType: 'Exterminate', modifier: 'Enemy Elemental Enhancement: Cold' },
        { node: 'Sedna/Hydron', missionType: 'Defense', modifier: 'Eximus Stronghold' },
        { node: 'Sedna/Merrow', missionType: 'Assassination', modifier: 'Augmented Enemy Armor' }
      ]
    },
    archonHunt: {
      id: 'archon1', activation: iso(montag), expiry: iso(montag + 7 * D), boss: 'Archon Amar', faction: 'Narmer',
      missions: [{ node: 'Tethys (Saturn)', type: 'Extermination' }, { node: 'Titan (Saturn)', type: 'Mobile Defense' },
                 { node: 'Iapetus (Saturn)', type: 'Assassination' }]
    },
    voidTrader: {
      id: 'baro', character: "Baro Ki'Teer", location: 'Strata Relay (Earth)',
      activation: iso(now - 20 * H), expiry: iso(now + 28 * H),
      inventory: [
        { uniqueName: '/Lotus/StoreItems/Upgrades/Mods/Rifle/Expert/PrimedRifleDamageAmountMod', item: 'Primed Serration', ducats: 400, credits: 200000 },
        { uniqueName: '/Lotus/StoreItems/Weapons/Tenno/Pistol/PrismaTwinGremlins', item: 'Prisma Twin Gremlins', ducats: 500, credits: 150000 },
        { uniqueName: '/Lotus/StoreItems/Upgrades/Skins/Scarves/PrimeSyandanaC', item: 'Prime Bisalt Syandana', ducats: 600, credits: 400000 }
      ]
    },
    nightwave: {
      season: 14, phase: 0, activation: iso(now - 40 * D), expiry: iso(now + 60 * D),
      activeChallenges: [
        { id: 'n1', isDaily: true, title: 'Mender', desc: 'Use 15 Health Restores', reputation: 1000, expiry: iso(tagesStart + D) },
        { id: 'n2', title: 'Fissure Closer', desc: 'Complete 5 Void Fissure missions', reputation: 4500, expiry: iso(montag + 7 * D) },
        { id: 'n3', isElite: true, title: 'Elite Survivor', desc: 'Survive for over 60 minutes in Steel Path Survival', reputation: 7000, expiry: iso(montag + 7 * D) }
      ]
    },
    invasions: [
      { id: 'i1', node: 'Mantle (Earth)', desc: 'Grineer Offensive', completion: 63,
        attacker: { faction: 'Grineer', reward: { countedItems: [{ type: 'Detonite Injector', count: 3 }] } },
        defender: { faction: 'Corpus', reward: { countedItems: [{ type: 'Fieldron', count: 2 }] } } },
      { id: 'i2', node: 'Kiliken (Venus)', desc: 'Infested Outbreak', completion: 28, vsInfestation: true,
        attacker: { faction: 'Infested' }, defender: { faction: 'Corpus', reward: { countedItems: [{ type: 'Orokin Reactor Blueprint', count: 1 }] } } }
    ],
    syndicateMissions: [
      { syndicate: 'Ostrons', syndicateKey: 'Ostrons', expiry: iso(now + 72 * M), nodes: [],
        jobs: [{ id: 'j1', type: 'Find the Hidden Artifact', enemyLevels: [5, 15], standingStages: [430, 430, 430], minMR: 0,
                 uniqueName: '/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierATableARewards' },
               { id: 'j2', type: 'Capture the Grineer Commander', enemyLevels: [30, 50], standingStages: [940, 940, 940, 940], minMR: 5,
                 uniqueName: '/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierDTableCRewards' }] },
      { syndicate: 'Solaris United', syndicateKey: 'Solaris United', expiry: iso(now + 72 * M), nodes: [],
        jobs: [{ id: 'j3', type: 'Rescue the Kidnapped Worker', enemyLevels: [10, 30], standingStages: [590, 590, 590], minMR: 0,
                 uniqueName: '/Lotus/Types/Game/MissionDecks/VenusJobMissionRewards/VenusTierBTableBRewards' }] },
      { syndicate: 'Steel Meridian', syndicateKey: 'Steel Meridian', expiry: iso(tagesStart + D), nodes: ['Arval (Mars)', 'E Gate (Venus)'], jobs: [] }
    ],
    steelPath: {
      currentReward: { name: 'Kitgun Riven Mod', cost: 75 },
      activation: iso(montag), expiry: iso(montag + 7 * D - 1000),
      rotation: [{ name: 'Umbra Forma Blueprint', cost: 150 }, { name: '50,000 Kuva', cost: 55 },
                 { name: 'Kitgun Riven Mod', cost: 75 }, { name: '3x Forma', cost: 75 }],
      evergreens: [{ name: 'Veiled Riven Cipher', cost: 20 }],
      incursions: { id: 'inc', activation: iso(tagesStart), expiry: iso(tagesStart + D) }
    },
    vaultTrader: {
      character: 'Varzia', location: 'Maroo’s Bazaar (Mars)', activation: iso(now - 3 * D), expiry: iso(now + 11 * D),
      inventory: [
        { uniqueName: '/Lotus/StoreItems/Powersuits/Ninja/AshPrime', item: 'Ash Prime', ducats: 3 },
        { uniqueName: '/Lotus/StoreItems/Weapons/Tenno/LongGuns/PrimeVectis/PrimeVectisRifle', item: 'Vectis Prime', ducats: 1 }
      ]
    },
    dailyDeals: [{ item: 'Ignis Wraith', uniqueName: '/Lotus/StoreItems/Weapons/Tenno/LongGuns/Flamethrower/FlamethrowerWraith',
                   originalPrice: 200, salePrice: 130, discount: 35, total: 100, sold: 41, activation: iso(now - 5 * H), expiry: iso(now + 19 * H) }],
    duviriCycle: { choices: [{ category: 'normal', choices: ['Ash', 'Frost', 'Nyx'] },
                             { category: 'hard', choices: ['Torid', 'DualToxocyst', 'DualIchor', 'Miter', 'Atomos'] }] },
    alerts: [{ id: 'a1', activation: iso(now - H), expiry: iso(now + 2 * D),
               mission: { description: 'Tenno United Alert', node: 'Ganymede (Jupiter)', type: 'Disruption',
                          reward: { countedItems: [{ type: 'Conquera Kuaka Floof', count: 1 }], credits: 10000 } } }],
    events: [],
    arbitration: null,
    kuva: []
  };
}

/** Wie dashboard:get - der Teil, den slimDashboard liest. */
export function dashboard(now = Date.now()) {
  const row = (name, path, count, have, building = 0) =>
    ({ name, uniqueName: path, image: bild(path), count, have, building, enough: have >= count });
  return {
    player: {
      name: 'Kr3akz', mr: 27, mrName: 'Master', progress: 0.42, clan: 'Lotus Garden', openGain: 48000,
      loadout: { name: 'Wisp Prime', image: bild('/Lotus/Powersuits/Wisp/WispPrime') }
    },
    meta: { fetchedAt: now - 12 * M },
    goals: [
      { uniqueName: '/Lotus/Powersuits/Dagath/Dagath', name: 'Dagath', image: bild('/Lotus/Powersuits/Dagath/Dagath'),
        status: 'missing', owned: false, kind: 'farm', rank: 0, maxLvl: 30, buildTime: '3d 12h', credits: 25000,
        components: [row('Dagath Neuroptics Blueprint', '/Lotus/Types/Recipes/WarframeRecipes/DagathHelmetBlueprint', 1, 1),
                     row('Dagath Chassis Blueprint', '/Lotus/Types/Recipes/WarframeRecipes/DagathChassisBlueprint', 1, 0),
                     row('Dagath Systems Blueprint', '/Lotus/Types/Recipes/WarframeRecipes/DagathSystemsBlueprint', 1, 0)],
        materials: [row('Orokin Cell', '/Lotus/Types/Items/MiscItems/OrokinCell', 6, 31),
                    row('Neural Sensors', '/Lotus/Types/Items/MiscItems/NeuralSensor', 3, 2)],
        note: 'Rotation C on the Hollvania bounty, level 100' },
      { uniqueName: '/Lotus/Weapons/Tenno/Melee/Glaive/PrimeGlaive', name: 'Glaive Prime', image: bild('/Lotus/Weapons/Tenno/Melee/Glaive/PrimeGlaive'),
        status: 'partial', owned: true, kind: 'level', rank: 17, maxLvl: 30, buildTime: '', credits: 0, components: [], materials: [], note: '' },
      { uniqueName: '/Lotus/Upgrades/Mods/Rifle/Expert/PrimedRifleDamageAmountMod', name: 'Primed Serration', isUpgrade: true, upgradeKind: 'mod',
        image: bild('/Lotus/Upgrades/Mods/Rifle/Expert/PrimedRifleDamageAmountMod'), status: 'missing', owned: false, kind: 'farm', rank: 0, maxLvl: 10,
        dropSources: { groups: [{ label: 'Vendor', entries: [{ place: "Baro Ki'Teer", detail: 'when he is in stock', chanceText: null }] }] },
        components: [], materials: [], note: '' },
      { uniqueName: '/Lotus/Powersuits/Excalibur/Excalibur', name: 'Excalibur', done: true, status: 'done', owned: true, kind: 'level', rank: 30, maxLvl: 30,
        image: bild('/Lotus/Powersuits/Excalibur/Excalibur'), components: [], materials: [] }
    ],
    shopping: {
      materials: [row('Orokin Cell', '/Lotus/Types/Items/MiscItems/OrokinCell', 6, 31),
                  row('Neural Sensors', '/Lotus/Types/Items/MiscItems/NeuralSensor', 3, 2, 1),
                  row('Argon Crystal', '/Lotus/Types/Items/MiscItems/ArgonCrystal', 2, 0)],
      credits: 25000, buildTime: '3d 12h'
    },
    quickWins: [
      { name: 'Akbolto', image: bild('/Lotus/Weapons/Tenno/Akimbo/AkimboBolto'), label: 'Secondary', gain: 3000, status: 'partial' },
      { name: 'Kubrow Raksa', image: bild('/Lotus/Types/Game/KubrowPet/RaksaKubrowPetPowerSuit'), label: 'Companion', gain: 6000, status: 'partial' }
    ]
  };
}

/** Wie foundry:get. */
export function foundry(now = Date.now()) {
  const item = (name, path, buildH, restMin, count = 1) => ({
    name, uniqueName: path, image: bild(path), count, buildSeconds: buildH * 3600,
    completionAt: now + restMin * M, ready: restMin <= 0, remainingMs: Math.max(0, restMin * M)
  });
  return {
    ok: true,
    data: {
      fetchedAt: now - 9 * M,
      nextAt: now + 38 * M,
      items: [
        item('Forma', '/Lotus/Types/Items/MiscItems/Forma', 23, -60),
        item('Orokin Catalyst', '/Lotus/Types/Items/MiscItems/OrokinCatalyst', 24, 38),
        item('Wisp Prime', '/Lotus/Powersuits/Wisp/WispPrime', 72, 61 * 60),
        item('Gallium', '/Lotus/Types/Items/MiscItems/Gallium', 1, 4, 5)
      ],
      helminth: { ability: 'Roar', readyAt: now + 5 * H, busy: true }
    }
  };
}

/** Wie inventory:get (Ausschnitt) und ducats:get (Ausschnitt). */
export function inventory(now = Date.now()) {
  const relic = (name, tier, quality, count, plat, vaulted) => ({
    name, tier, quality, count, owned: count > 0, vaulted,
    image: bild(`/Lotus/Types/Game/Projections/T${['', 'Lith', 'Meso', 'Neo', 'Axi', 'Requiem'].indexOf(tier)}VoidProjection`),
    value: { expPlat: plat, expDucats: 30, bestPlat: plat * 4 }
  });
  const preis = (min, median) => ({ min, median, offers: 5, online: true });
  return {
    inventory: {
      ok: true,
      data: {
        fetchedAt: now - 9 * M, syncedAt: now - 11 * M,
        currencies: { platinum: 1430, ducats: 3120, credits: 18450000, endo: 92300, traces: 812 },
        sections: {
          relics: [relic('Axi A15', 'Axi', 'Radiant', 3, 21.4, false), relic('Lith V11', 'Lith', 'Intact', 12, 4.2, true),
                   relic('Meso N17', 'Meso', 'Intact', 7, 6.8, false), relic('Neo S13', 'Neo', 'Exceptional', 2, 11.1, false),
                   relic('Requiem IV', 'Requiem', 'Intact', 4, 3.5, false), relic('Axi B6', 'Axi', 'Intact', 0, 15, false)],
          sets: [
            { kind: 'prime', name: 'Wisp Prime', image: bild('/Lotus/Powersuits/Wisp/WispPrime'), ownedParts: 3, totalParts: 4,
              complete: false, fullSetsCount: 0, setPrice: preis(95, 105), ownedDucats: 245,
              parts: [{ shortName: 'Blueprint', count: 1, required: 1, ducats: 45, price: preis(12, 14) },
                      { shortName: 'Neuroptics Blueprint', count: 1, required: 1, ducats: 100, price: preis(25, 28) },
                      { shortName: 'Chassis Blueprint', count: 1, required: 1, ducats: 100, price: preis(20, 22) },
                      { shortName: 'Systems Blueprint', count: 0, required: 1, ducats: 100, price: preis(38, 40) }] },
            { kind: 'prime', name: 'Glaive Prime', image: bild('/Lotus/Weapons/Tenno/Melee/Glaive/PrimeGlaive'), ownedParts: 3, totalParts: 3,
              complete: true, fullSetsCount: 1, setPrice: preis(30, 32), ownedDucats: 145, vaultSoon: { stage: 'soon', days: 21 },
              parts: [{ shortName: 'Blueprint', count: 1, required: 1, ducats: 15, price: preis(4, 5) },
                      { shortName: 'Blade', count: 1, required: 1, ducats: 45, price: preis(9, 10) },
                      { shortName: 'Disc', count: 1, required: 1, ducats: 85, price: preis(15, 16) }] }
          ],
          mods: [{ name: 'Primed Continuity', count: 1, maxRank: 10, image: bild('/Lotus/Upgrades/Mods/Warframe/Expert/AvatarAbilityDurationModExpert'), price: preis(67, 70) },
                 { name: 'Blind Rage', count: 2, maxRank: 0, image: bild('/Lotus/Upgrades/Mods/Warframe/Corrupted/CorruptedPowerStrengthPowerDurationWarframe'), price: preis(12, 14) },
                 { name: 'Vitality', count: 4, maxRank: 0, price: preis(1, 1) }],
          arcanes: [{ name: 'Arcane Energize', count: 2, maxRank: 5, image: null, price: preis(100, 110) }]
        }
      }
    },
    ducats: {
      inventory: {
        items: [
          { name: 'Wisp Prime Neuroptics Blueprint', count: 1, ducats: 100, image: null, price: preis(25, 28), tradeAdvice: { advice: 'sell', label: 'Sell for platinum' } },
          { name: 'Braton Prime Barrel', count: 4, ducats: 45, image: null, price: preis(2, 3), tradeAdvice: { advice: 'melt', label: 'Melt into ducats' } },
          { name: 'Paris Prime Grip', count: 2, ducats: 15, image: null, price: null, tradeAdvice: { advice: 'unknown', label: 'Price unknown' } }
        ],
        summary: { totalDucats: 310, totalItems: 7, uniqueParts: 3, totalPlatMin: 33, totalPlatMedian: 40 }
      },
      pricesFetchedAt: now - 2 * H
    }
  };
}

/** Wie drops:search (Ausschnitt). */
export function drops(q = '') {
  const alle = [
    { item: 'Serration', kind: 'mission', place: 'Apollodorus', region: 'Mercury', mode: 'Survival', rotation: 'C', chance: 11.06, rarity: 'Uncommon' },
    { item: 'Serration', kind: 'enemy', place: 'Corrupted Heavy Gunner', chance: 0.3, rarity: 'Uncommon' },
    { item: 'Axi A15 Relic', kind: 'mission', place: 'Mot', region: 'Void', mode: 'Survival', rotation: 'C', chance: 10.0, rarity: 'Uncommon' },
    { item: 'Wisp Prime Systems Blueprint', kind: 'relic', place: 'Axi A15', refinement: 'Intact', chance: 2, rarity: 'Rare', vaulted: false }
  ];
  const rows = alle.filter(r => r.item.toLowerCase().includes(String(q).toLowerCase()));
  return { rows, total: rows.length, fetchedAt: Date.now() - D };
}

/** Kleiner Ausschnitt aus DEs Droptabellen, in deren Form (drops.warframestat.us/data/all.json). */
export function deDropTables() {
  return {
    missionRewards: {
      Mercury: { Apollodorus: { gameMode: 'Survival', rewards: {
        A: [{ itemName: 'Lith V11 Relic', rarity: 'Uncommon', chance: 14.29 }],
        C: [{ itemName: 'Serration', rarity: 'Uncommon', chance: 11.06 }, { itemName: 'Axi A15 Relic', rarity: 'Rare', chance: 2.0 }]
      } } }
    },
    relics: [{ tier: 'Axi', relicName: 'A15', state: 'Intact', rewards: [
      { itemName: 'Wisp Prime Systems Blueprint', rarity: 'Rare', chance: 2 },
      { itemName: 'Forma Blueprint', rarity: 'Common', chance: 25.33 }] }],
    modLocations: [{ modName: 'Serration', enemies: [
      { enemyName: 'Corrupted Heavy Gunner', enemyModDropChance: 3, rarity: 'Uncommon', chance: 10 }] }]
  };
}
