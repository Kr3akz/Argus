/**
 * Warframe Ressourcen- & Farm-Routen-Katalog
 * Detaillierte Offline-Datenbank mit den besten Drop-Nodes, Planeten und Loot-Setups.
 *
 * Die Texte hier sind Oberflaeche und stehen deshalb auf Englisch - wie im
 * Spiel selbst. Missionstypen und Knotennamen sind bewusst DIE des englischen
 * Clients: wer die Node sucht, sucht sie unter diesem Namen auf der Karte.
 *
 * KNOTENNAMEN SIND GEPRUEFT, NICHT ERINNERT. Jeder Eintrag unter `bestNodes`
 * steht so im Sternenkarten-Verzeichnis, samt Missionstyp. Frueher standen hier
 * "Camacol" (existiert nicht) und "Jupiter - Camenae" (Camenae liegt auf Sedna),
 * und Deimos-Knoten trugen die Marke "Dark Sector", obwohl Deimos keine hat.
 * Solche Fehler faellt niemand auf, ausser er fliegt hin. Neue Eintraege
 * deshalb gegen tools/check-farm-nodes.mjs laufen lassen.
 *
 * Der Bergbau steht bewusst NICHT hier, sondern in mining.js: Erze folgen der
 * Aderfarbe, nicht der Node.
 */

import { imageUrl } from './catalog.js';

/**
 * Die Filterleiste des Tabs. Reihenfolge = Reihenfolge im Spielerleben:
 * was auf der Sternenkarte faellt, bevor das, was Landschaften und Railjack
 * hergeben.
 */
export const RESOURCE_CATEGORIES = [
  { key: 'all',        label: 'All' },
  { key: 'Common',     label: 'Common' },
  { key: 'Uncommon',   label: 'Uncommon' },
  { key: 'Rare',       label: 'Rare' },
  { key: 'Research',   label: 'Dojo research' },
  { key: 'Special',    label: 'Special' },
  { key: 'Open world', label: 'Open world' },
  { key: 'Railjack',   label: 'Railjack' }
];

/**
 * ACHTUNG bei `uniqueName`: das Bild haengt allein daran, und DEs Pfade heissen
 * selten so wie das Item. Oxium liegt unter OxiumAlloy, Morphics unter Morphic
 * (Einzahl), Nano Spores unter Nanospores, Nitain Extract unter Alertium, eine
 * Mutagenprobe unter Research/BioFragment, ein Nistlepod unter
 * Eidolon/Resources/NistlebrushItem - geraten ergibt einen 404, und der faellt
 * nur auf, wenn man hinsieht. Alle Pfade hier stammen aus dem Katalog
 * (ExportResources), nicht aus dem Namen abgeleitet.
 */
export const RESOURCE_GUIDES = [
  /* ================= COMMON ================= */
  {
    name: 'Ferrite',
    uniqueName: '/Lotus/Types/Items/MiscItems/Ferrite',
    category: 'Common',
    description: 'Alloy pellets used in Grineer manufacturing. The single most-consumed resource in the game — almost every blueprint wants a few thousand.',
    planets: ['Mercury', 'Earth', 'Neptune', 'Void', 'Lua', 'Zariman'],
    bestNodes: [
      { planet: 'Neptune', node: 'Kelashin', type: 'Dark Sector (Survival)', desc: '+30% resource drop chance and Corpus that die fast. The best sustained ferrite tap on the star chart.' },
      { planet: 'Earth', node: 'Coba', type: 'Dark Sector (Defense)', desc: '+15% resource drop chance at low level — the node to use before you have a proper loot squad.' },
      { planet: 'Mercury', node: 'Apollodorus', type: 'Survival', desc: 'Very high enemy density at trivial levels. The classic starter farm and still fine at any rank.' }
    ],
    alsoFrom: ['Storage containers and lockers on every Grineer tileset', '3,000 for 30 platinum in the market if you are truly out'],
    recommendedFrames: ['Nekros (Desecrate)', 'Khora (Pilfering Strangledome)', 'Speed Nova', 'Smeeta Kavat'],
    tips: 'Usually drops in stacks of 50-100. If your ferrite is low, your problem is almost always missing containers, not missing kills — bring a container breaker.'
  },
  {
    name: 'Nano Spores',
    uniqueName: '/Lotus/Types/Items/MiscItems/Nanospores',
    category: 'Common',
    description: 'Fibrous technocyte tumour. The infested counterpart to ferrite and just as hungry a line item on big blueprints.',
    planets: ['Deimos', 'Saturn', 'Neptune', 'Eris'],
    bestNodes: [
      { planet: 'Eris', node: 'Akkad', type: 'Dark Sector (Defense)', desc: '+30% resource drop chance and packed infested waves. The traditional nano spore farm.' },
      { planet: 'Eris', node: 'Zabala', type: 'Dark Sector (Survival)', desc: 'Same +30% bonus, endless instead of wave-based.' },
      { planet: 'Saturn', node: 'Piscinas', type: 'Dark Sector (Survival)', desc: '+20% bonus and gentler levels than Eris.' }
    ],
    alsoFrom: ['Every infested container on the Cambion Drift', 'Infested Invasion missions'],
    recommendedFrames: ['Nekros', 'Khora', 'Speed Nova', 'Wisp'],
    tips: 'Drops in stacks of 150-200 — three or four Akkad rounds cover most builds outright.'
  },
  {
    name: 'Salvage',
    uniqueName: '/Lotus/Types/Items/MiscItems/Salvage',
    category: 'Common',
    description: 'High value metals collected from war salvage. Needed in bulk for weapons and warframe systems.',
    planets: ['Mars', 'Jupiter', 'Sedna'],
    bestNodes: [
      { planet: 'Sedna', node: 'Hydron', type: 'Defense', desc: 'The game’s default levelling node also happens to be a salvage node. Free resource while you rank weapons.' },
      { planet: 'Sedna', node: 'Amarna', type: 'Dark Sector (Survival)', desc: '+25% resource drop chance if you want salvage specifically rather than affinity.' },
      { planet: 'Mars', node: 'Wahiba', type: 'Dark Sector (Survival)', desc: '+20% bonus at much lower levels — also a morphics node.' }
    ],
    alsoFrom: ['Corpus and Grineer storage containers on Mars, Jupiter and Sedna'],
    recommendedFrames: ['Nekros', 'Khora', 'Smeeta Kavat'],
    tips: 'Usually 75-150 per drop. If you level weapons on Hydron anyway, you will never have to farm this deliberately.'
  },
  {
    name: 'Alloy Plate',
    uniqueName: '/Lotus/Types/Items/MiscItems/AlloyPlate',
    category: 'Common',
    description: 'Carbon steel plates used to reinforce Grineer armour. Shows up on nearly every weapon and warframe recipe.',
    planets: ['Venus', 'Jupiter', 'Sedna', 'Ceres', 'Phobos', 'Pluto'],
    bestNodes: [
      { planet: 'Ceres', node: 'Gabii', type: 'Dark Sector (Survival)', desc: '+35% resource drop chance — tied for the highest bonus on the star chart. Circuits and orokin cells come along for the ride.' },
      { planet: 'Pluto', node: 'Sechura', type: 'Dark Sector (Defense)', desc: 'Also +35%, wave-based, and a rubedo node at the same time.' },
      { planet: 'Sedna', node: 'Hydron', type: 'Defense', desc: 'Passive income while levelling gear.' }
    ],
    alsoFrom: ['Grineer storage containers across six planets'],
    recommendedFrames: ['Nekros', 'Khora', 'Speed Nova'],
    tips: 'Drops in stacks of 50-150. Ceres is the one planet where alloy plate, circuits and orokin cells all share a table — Gabii covers three shopping lists at once.'
  },

  /* ================= UNCOMMON ================= */
  {
    name: 'Rubedo',
    uniqueName: '/Lotus/Types/Items/MiscItems/Rubedo',
    category: 'Uncommon',
    description: 'A jagged crystalline ore that gives off radiant energy. The damage-scaling resource — most weapon blueprints and every prime part wants it.',
    planets: ['Phobos', 'Earth', 'Pluto', 'Europa', 'Sedna', 'Void'],
    bestNodes: [
      { planet: 'Pluto', node: 'Hieracon', type: 'Dark Sector (Excavation)', desc: '+35% resource drop chance plus Neo/Axi relics, endo and cryotic. The most productive single node in the game.' },
      { planet: 'Phobos', node: 'Zeugma', type: 'Dark Sector (Survival)', desc: '+25% bonus on a planet with an above-average rubedo chance.' },
      { planet: 'Europa', node: 'Cholistan', type: 'Dark Sector (Excavation)', desc: '+25% bonus. Europa also has the boosted rubedo rate, and cryotic stacks up alongside.' }
    ],
    alsoFrom: ['Storage containers on Phobos and Europa, which have the raised drop rate'],
    recommendedFrames: ['Frost or Gara (to keep excavators alive)', 'Nekros', 'Khora', 'Limbo'],
    tips: 'Only 15-25 per drop, and prime parts ask for thousands. Phobos and Europa have an explicitly higher rubedo chance than the other four planets — farm there, not on Earth.'
  },
  {
    name: 'Circuits',
    uniqueName: '/Lotus/Types/Items/MiscItems/Circuits',
    category: 'Uncommon',
    description: 'Various electronic components. Wanted by most weapons, archwings and companion parts.',
    planets: ['Venus', 'Ceres', 'Kuva Fortress'],
    bestNodes: [
      { planet: 'Ceres', node: 'Gabii', type: 'Dark Sector (Survival)', desc: '+35% resource drop chance on the planet with the boosted circuit rate. Nothing else comes close.' },
      { planet: 'Ceres', node: 'Seimeni', type: 'Dark Sector (Defense)', desc: 'Same +35% bonus in wave form, plus a very generous credit payout.' },
      { planet: 'Venus', node: 'Malva', type: 'Dark Sector (Survival)', desc: '+10% bonus at starter levels if Ceres is still locked.' }
    ],
    alsoFrom: ['Kuva Fortress missions', 'Grineer storage containers on Ceres'],
    recommendedFrames: ['Nekros', 'Khora', 'Smeeta Kavat'],
    tips: 'Circuits have an explicitly higher drop chance on Ceres. 35-50 per drop, so a 20-minute Gabii run usually settles the matter.'
  },
  {
    name: 'Plastids',
    uniqueName: '/Lotus/Types/Items/MiscItems/Plastids',
    category: 'Uncommon',
    description: 'A nanite-infested tissue mass, needed in bulk for warframe chassis, systems and a long tail of weapons.',
    planets: ['Saturn', 'Uranus', 'Phobos', 'Pluto', 'Eris'],
    bestNodes: [
      { planet: 'Uranus', node: 'Ophelia', type: 'Survival (Grineer sealab)', desc: 'The best plastid node in the game: Uranus has no common resource in its table, so plastids and polymer are almost the only things that can drop. Tellurium and Condition Overload come along too.' },
      { planet: 'Saturn', node: 'Piscinas', type: 'Dark Sector (Survival)', desc: '+20% resource drop chance, and orokin cells share the table.' },
      { planet: 'Uranus', node: 'Stephano', type: 'Defense', desc: 'Container-heavy tileset — roughly 100 plastids every three waves without any loot frame.' }
    ],
    alsoFrom: ['Isolation Vault bounties on Deimos', 'Helene (Saturn) passively while levelling gear'],
    recommendedFrames: ['Nekros (Desecrate)', 'Khora (Pilfering Strangledome)', 'Speed Nova', 'Slash weapons to open corpses'],
    tips: 'Saturn and Uranus have the raised drop chance. 15-25 per drop against blueprint costs in the hundreds, so this is a resource you farm on purpose, not incidentally.'
  },
  {
    name: 'Polymer Bundle',
    uniqueName: '/Lotus/Types/Items/MiscItems/PolymerBundle',
    category: 'Uncommon',
    description: 'A hard thermoplastic casing. Wanted by almost every blueprint and by squad energy restores.',
    planets: ['Mercury', 'Venus', 'Uranus'],
    bestNodes: [
      { planet: 'Uranus', node: 'Ophelia', type: 'Survival', desc: 'Uranus has the boosted polymer rate and a thin drop table — five figures of polymer in a 20 minute run with a loot squad is normal.' },
      { planet: 'Uranus', node: 'Assur', type: 'Dark Sector (Survival)', desc: '+25% resource drop chance on the same planet.' },
      { planet: 'Venus', node: 'Malva', type: 'Dark Sector (Survival)', desc: '+10% bonus at starter levels.' }
    ],
    alsoFrom: ['Corpus storage containers on Venus and Mercury'],
    recommendedFrames: ['Nekros', 'Khora', 'Hydroid (Pilfering Swarm)'],
    tips: 'Ideal to stock up on Squad Energy Restores — 40-75 per drop and Uranus has the raised chance.'
  },
  {
    name: 'Oxium',
    uniqueName: '/Lotus/Types/Items/MiscItems/OxiumAlloy',
    category: 'Uncommon',
    description: 'A lighter-than-air alloy of Orokin origin. Almost exclusively a drop from flying Corpus Oxium Ospreys.',
    planets: ['Jupiter', 'Venus', 'Neptune', 'Pluto'],
    bestNodes: [
      { planet: 'Jupiter', node: 'Io', type: 'Defense', desc: 'Oxium Ospreys spawn in numbers through waves 10-15. The reference oxium node.' },
      { planet: 'Jupiter', node: 'Cameria', type: 'Dark Sector (Survival)', desc: '+20% resource drop chance with a steady Corpus flow.' },
      { planet: 'Pluto', node: 'Hieracon', type: 'Dark Sector (Excavation)', desc: '+35% bonus and high-level Corpus spawns.' }
    ],
    alsoFrom: ['The third resource cache in Grineer Sealab Sabotage (Uranus)', 'Low-tier bounties', 'Corpus storage containers'],
    recommendedFrames: ['Ivara (Prowl pickpocket)', 'Khora (Strangledome)', 'Nekros'],
    tips: 'An osprey that self-destructs drops nothing — kill them before they reach you. Note that Terra Oxium Ospreys on the Orb Vallis do NOT drop oxium; they roll the Vallis region table instead.'
  },
  {
    name: 'Cryotic',
    uniqueName: '/Lotus/Types/Items/MiscItems/Cryotic',
    category: 'Uncommon',
    description: 'Sub-zero compound earned exclusively from Excavation. 100 cryotic per completed extractor, and nothing else in the game produces it.',
    planets: ['Venus', 'Earth', 'Phobos', 'Europa', 'Neptune', 'Pluto'],
    bestNodes: [
      { planet: 'Pluto', node: 'Hieracon', type: 'Dark Sector (Excavation)', desc: 'Neo and Axi relics, endo, rubedo and +35% resource drop chance while the cryotic ticks up. The all-round best excavation node.' },
      { planet: 'Earth', node: 'Tikal', type: 'Dark Sector (Excavation)', desc: '+15% bonus at levels so low the extractors survive without help.' },
      { planet: 'Europa', node: 'Cholistan', type: 'Dark Sector (Excavation)', desc: '+25% bonus, and Europa’s rubedo rate is boosted.' }
    ],
    alsoFrom: ['Any Excavation node on the six listed planets'],
    recommendedFrames: ['Frost (Snow Globe)', 'Gara', 'Limbo (Cataclysm)', 'Khora', 'Trinity (Energy Vampire for the power cells)'],
    tips: 'A resource booster doubles the yield to 200 per extractor. Power cells, not enemies, are the bottleneck — bring something that farms carriers.'
  },

  /* ================= RARE ================= */
  {
    name: 'Orokin Cell',
    uniqueName: '/Lotus/Types/Items/MiscItems/OrokinCell',
    category: 'Rare',
    description: 'Ancient energy cell from the Orokin era. Essential for almost every prime item, warframe and forge-built weapon.',
    planets: ['Saturn', 'Ceres', 'Deimos'],
    bestNodes: [
      { planet: 'Saturn', node: 'Tethys', type: 'Assassination (General Sargas Ruk)', desc: 'A 90-second boss kill with a flat 2.58% orokin cell drop on top of the region roll. Bring Xaku or Limbo to break every container on the way.' },
      { planet: 'Ceres', node: 'Gabii', type: 'Dark Sector (Survival)', desc: '+35% resource drop chance — the highest bonus available for a cell farm.' },
      { planet: 'Saturn', node: 'Helene', type: 'Defense', desc: 'The levelling node that quietly keeps your cell stock full. Slower per hour than Gabii, far better affinity.' }
    ],
    alsoFrom: ['Every boss in the game, including the Stalker, at 2.58%', 'Corrupted Vor in the Void: a guaranteed 50% orokin cell / 50% argon crystal roll', 'Distilling Extractors on Saturn, Ceres and Deimos'],
    recommendedFrames: ['Nekros (Desecrate)', 'Khora (Pilfering Strangledome)', 'Xaku or Limbo for container breaking', 'Smeeta Kavat'],
    tips: 'Container drops are NOT affected by resource drop chance boosters or the Steel Path bonus — only the quantity booster helps there. Enemy drops are affected by both.'
  },
  {
    name: 'Neural Sensors',
    uniqueName: '/Lotus/Types/Items/MiscItems/NeuralSensor',
    category: 'Rare',
    description: 'Implanted neural links for controlling augmentations. Wanted by every warframe neuroptics and a long list of weapons.',
    planets: ['Jupiter', 'Kuva Fortress'],
    bestNodes: [
      { planet: 'Europa', node: 'Naamah', type: 'Assassination (Raptor)', desc: 'The Raptor has a flat 50% neural sensor drop — by far the highest single chance in the game, and the fight is short.' },
      { planet: 'Jupiter', node: 'Cameria', type: 'Dark Sector (Survival)', desc: '+20% resource drop chance on the planet that actually carries sensors in its region table.' },
      { planet: 'Kuva Fortress', node: 'Taveuni', type: 'Survival', desc: 'The other sensor region. Higher levels, denser spawns.' }
    ],
    alsoFrom: ['Alad V on Jupiter (Themisto) — via the region resource roll, not a dedicated drop', 'Market: 10 platinum each, or a reusable blueprint for 100'],
    recommendedFrames: ['Volt or Titania for the Naamah boss rush', 'Nekros and Khora for the survival routes'],
    tips: 'Naamah is the answer if you need sensors now. Do not plan around Alad V — his table is a 97% region-resource roll, so sensors are only one of several possible outcomes.'
  },
  {
    name: 'Neurodes',
    uniqueName: '/Lotus/Types/Items/MiscItems/Neurode',
    category: 'Rare',
    description: 'Biotech sensor organs harvested from infested entities. Needed by most warframe components and organic weapons.',
    planets: ['Earth', 'Deimos', 'Eris', 'Lua'],
    bestNodes: [
      { planet: 'Earth', node: 'Tikal', type: 'Dark Sector (Excavation)', desc: '+15% resource drop chance, low levels, and cryotic stacks up alongside.' },
      { planet: 'Deimos', node: 'Terrorem', type: 'Survival', desc: 'Dense infested spawns and orokin cells in the same table. Not a Dark Sector — Deimos has none.' },
      { planet: 'Earth', node: 'Mariana', type: 'Extermination', desc: 'Short run with loot radar: smash every neurode mass and leave. Good when you need two, not two hundred.' }
    ],
    alsoFrom: ['Wild kubrow dens on the Plains of Eidolon and on Earth', 'Lua survival nodes', 'Market: 10 platinum each, or a reusable blueprint for 100'],
    recommendedFrames: ['Nekros', 'Khora', 'Xaku or Limbo for container breaking'],
    tips: 'Neurodes come from breakable objects as much as from enemies, so a wide container-clearing ability beats raw kill speed here.'
  },
  {
    name: 'Morphics',
    uniqueName: '/Lotus/Types/Items/MiscItems/Morphic',
    category: 'Rare',
    description: 'An amorphous solid, possibly Orokin technology. One of the four classic rares and a staple of early- and mid-game blueprints.',
    planets: ['Mercury', 'Mars', 'Phobos', 'Europa', 'Pluto'],
    bestNodes: [
      { planet: 'Mars', node: 'Wahiba', type: 'Dark Sector (Survival)', desc: '+20% resource drop chance on the planet with the explicitly raised morphics rate.' },
      { planet: 'Europa', node: 'Cholistan', type: 'Dark Sector (Excavation)', desc: '+25% bonus, and rubedo and cryotic come with it.' },
      { planet: 'Mercury', node: 'Apollodorus', type: 'Survival', desc: 'Trivial levels and huge enemy density — the early-game answer.' }
    ],
    alsoFrom: ['Assassination targets on the listed planets, via the region resource roll', 'Market: 10 platinum each'],
    recommendedFrames: ['Nekros', 'Khora', 'Smeeta Kavat'],
    tips: 'Drops one at a time, and Mars has the raised chance — so Mars is where a morphics run belongs, not Pluto.'
  },
  {
    name: 'Gallium',
    uniqueName: '/Lotus/Types/Items/MiscItems/Gallium',
    category: 'Rare',
    description: 'Soft metal used in microelectronics and energy weapons. Only two planets carry it, which makes it a common blocker.',
    planets: ['Mars', 'Uranus'],
    bestNodes: [
      { planet: 'Uranus', node: 'Ophelia', type: 'Survival', desc: 'Thin drop table on Uranus means every rare roll has a real chance of being gallium. Plastids, polymer and tellurium in the same run.' },
      { planet: 'Uranus', node: 'Assur', type: 'Dark Sector (Survival)', desc: '+25% resource drop chance on the same planet.' },
      { planet: 'Mars', node: 'Wahiba', type: 'Dark Sector (Survival)', desc: '+20% bonus and much lower levels than Uranus.' }
    ],
    alsoFrom: ['Assassination targets on Mars and Uranus', 'Market: 10 platinum each'],
    recommendedFrames: ['Nekros', 'Khora', 'Speed Nova'],
    tips: '2-4 per drop. Because only Mars and Uranus have it, a single Ophelia run generally covers a whole build queue.'
  },
  {
    name: 'Control Module',
    uniqueName: '/Lotus/Types/Items/MiscItems/ControlModule',
    category: 'Rare',
    description: 'Autonomy processor for robotics, a Corpus design. Wanted by archwings, sentinels and a lot of prime systems.',
    planets: ['Neptune', 'Europa', 'Void'],
    bestNodes: [
      { planet: 'Void', node: 'Mot', type: 'Survival', desc: 'The Void has the explicitly higher control module chance, and Mot has the highest enemy density in it. Argon crystals come along.' },
      { planet: 'Void', node: 'Ani', type: 'Survival', desc: 'Same table as Mot at gentler enemy levels.' },
      { planet: 'Neptune', node: 'Kelashin', type: 'Dark Sector (Survival)', desc: '+30% resource drop chance if you would rather not fight Void levels.' }
    ],
    alsoFrom: ['Europa missions', 'Corpus storage containers in the Void'],
    recommendedFrames: ['Nekros', 'Khora', 'Limbo or Xaku for containers'],
    tips: '1-4 per drop, and control modules have a higher chance in the Void than on either planet. Farming them in the Void also stocks argon — just remember argon decays.'
  },
  {
    name: 'Tellurium',
    uniqueName: '/Lotus/Types/Items/MiscItems/Tellurium',
    category: 'Rare',
    description: 'A rare metal foreign to the Origin System. Found only in archwing, Railjack and submersible missions — and nowhere in a resource deposit.',
    planets: ['Uranus', 'Veil Proxima', 'Kuva Fortress'],
    bestNodes: [
      { planet: 'Uranus', node: 'Ophelia', type: 'Survival (Grineer sealab)', desc: 'The undisputed best node. Sealab enemies carry the submersible tag, and plastids and polymer pile up in the same run.' },
      { planet: 'Veil Proxima', node: 'Lu-Yan', type: 'Survival (Empyrean)', desc: 'Doubles as Ambassador blueprint, Railjack intrinsics and Necramech affinity. Run it on a Void Storm for long sessions.' },
      { planet: 'Uranus', node: 'Assur', type: 'Dark Sector (Survival)', desc: '+25% resource drop chance on the same tileset.' }
    ],
    alsoFrom: ['Resource caches in Grineer Reactor Sabotage', 'The Kuva Fortress Assault mission (Koro)', 'Daily Tribute'],
    recommendedFrames: ['Nekros (Despoil)', 'Khora (Pilfering Strangledome)', 'Speed Nova', 'High-slash weapons to open corpses'],
    tips: 'There is no tellurium deposit to smash — every single one comes off an enemy. Staying in one room so Nekros and Khora work the same pile of bodies is the whole technique.'
  },
  {
    name: 'Argon Crystal',
    uniqueName: '/Lotus/Types/Items/MiscItems/ArgonCrystal',
    category: 'Rare',
    description: 'Volatile Void crystal. Decays roughly 24 hours after you pick it up — the only resource in the game that expires.',
    planets: ['Void', 'Deimos (Isolation Vaults)'],
    bestNodes: [
      { planet: 'Void', node: 'Hepit', type: 'Capture', desc: 'Fastest possible route: capture, then break every container and Argon Pegmatite deposit on the way out. Farms Lith relics at the same time.' },
      { planet: 'Void', node: 'Ukko', type: 'Capture', desc: 'Same idea one tier up, farming Meso and Neo relics alongside.' },
      { planet: 'Void', node: 'Mot', type: 'Survival', desc: 'Endless alternative. Corrupted Vor spawns on Aten, Mithra and Mot and drops a guaranteed argon crystal or orokin cell.' }
    ],
    alsoFrom: ['Storage containers in Isolation Vault bounties on Deimos', 'Assassination targets', 'Anniversary alerts'],
    recommendedFrames: ['Xaku (The Vast Untime) or Limbo (Cataclysm) to break every container in a room', 'Nekros', 'Smeeta Kavat'],
    tips: 'Argon Pegmatite deposits only ever contain argon, so resource drop chance boosters and the Steel Path bonus do nothing for them — only a quantity booster helps. Farm argon the day you plan to start the build, not before.'
  },

  /* ================= DOJO RESEARCH ================= */
  {
    name: 'Detonite Ampule',
    uniqueName: '/Lotus/Types/Items/Research/ChemFragment',
    category: 'Research',
    description: 'Grineer explosive trace. Feeds Chemical Lab research and the Detonite Injector recipe in the clan dojo.',
    planets: ['Mercury', 'Earth', 'Ceres', 'Saturn', 'Uranus', 'Sedna'],
    bestNodes: [
      { planet: 'Ceres', node: 'Gabii', type: 'Dark Sector (Survival)', desc: '+35% resource drop chance in Grineer territory — the fastest ampule route.' },
      { planet: 'Saturn', node: 'Piscinas', type: 'Dark Sector (Survival)', desc: '+20% bonus, and orokin cells and plastids share the table.' },
      { planet: 'Sedna', node: 'Hydron', type: 'Defense', desc: 'Levelling and ampules at once.' }
    ],
    alsoFrom: ['Grineer storage containers on all six planets'],
    recommendedFrames: ['Nekros', 'Khora', 'Speed Nova'],
    tips: 'Only drops in Grineer-controlled territory, one at a time. Ten ampules plus a Detonite Injector blueprint is far cheaper than farming injectors directly.'
  },
  {
    name: 'Detonite Injector',
    uniqueName: '/Lotus/Types/Items/Research/ChemComponent',
    category: 'Research',
    description: 'The built form of Detonite. Required by Chemical Lab weapons — most notably the Ignis Wraith and Hek family.',
    planets: ['Invasions (Grineer side)', 'Orb Vallis', 'Clan dojo'],
    bestNodes: [
      { planet: 'Any', node: 'Grineer Invasion missions', type: 'Invasion', desc: 'Three injectors per completed Grineer invasion — three runs of the same node and you are done. By far the cheapest source.' },
      { planet: 'Orb Vallis', node: 'Tier 4 bounties', type: 'Bounty', desc: 'Occasionally offered as a stage reward.' },
      { planet: 'Clan dojo', node: 'Chemical Lab', type: 'Foundry', desc: 'Build them from 10 Detonite Ampules each once the research is done.' }
    ],
    alsoFrom: ['Rare and reinforced Grineer storage containers'],
    recommendedFrames: ['Anything fast — the invasion node itself is the reward'],
    tips: 'Never farm these directly. Watch the invasion board: three per Grineer invasion completion, and invasions rotate constantly.'
  },
  {
    name: 'Fieldron Sample',
    uniqueName: '/Lotus/Types/Items/Research/EnergyFragment',
    category: 'Research',
    description: 'Corpus containment-field debris. Feeds Energy Lab research and the Fieldron recipe.',
    planets: ['Venus', 'Phobos', 'Jupiter', 'Europa', 'Neptune', 'Pluto'],
    bestNodes: [
      { planet: 'Pluto', node: 'Hieracon', type: 'Dark Sector (Excavation)', desc: '+35% resource drop chance in Corpus territory. Relics and cryotic on top.' },
      { planet: 'Neptune', node: 'Kelashin', type: 'Dark Sector (Survival)', desc: '+30% bonus with a steady Corpus stream.' },
      { planet: 'Jupiter', node: 'Cameria', type: 'Dark Sector (Survival)', desc: '+20% bonus and oxium ospreys in the same run.' }
    ],
    alsoFrom: ['Corpus storage containers on all six planets'],
    recommendedFrames: ['Nekros', 'Khora', 'Speed Nova'],
    tips: 'Corpus-only, one per drop. Mirrors Detonite Ampule exactly — same idea, other faction.'
  },
  {
    name: 'Fieldron',
    uniqueName: '/Lotus/Types/Items/Research/EnergyComponent',
    category: 'Research',
    description: 'The built form. Required by Energy Lab weapons such as the Prisma and Amprex families.',
    planets: ['Invasions (Corpus side)', 'Orb Vallis', 'Clan dojo'],
    bestNodes: [
      { planet: 'Any', node: 'Corpus Invasion missions', type: 'Invasion', desc: 'Three Fieldron per completed Corpus invasion. The only sane source.' },
      { planet: 'Orb Vallis', node: 'Tier 4 bounties', type: 'Bounty', desc: 'Occasional stage reward.' },
      { planet: 'Clan dojo', node: 'Energy Lab', type: 'Foundry', desc: 'Build from 10 Fieldron Samples each.' }
    ],
    alsoFrom: ['Rare and reinforced Corpus storage containers'],
    recommendedFrames: ['Anything fast'],
    tips: 'Same rule as the Detonite Injector: run invasions, do not farm the item.'
  },
  {
    name: 'Mutagen Sample',
    uniqueName: '/Lotus/Types/Items/Research/BioFragment',
    category: 'Research',
    description: 'Infested biomatter. Feeds Bio Lab research — and the infamous Hema, which wants 5,000 of them.',
    planets: ['Deimos', 'Eris'],
    bestNodes: [
      { planet: 'Eris', node: 'Zabala', type: 'Dark Sector (Survival)', desc: '+30% resource drop chance with relentless infested spawns. The best mutagen node in the game.' },
      { planet: 'Eris', node: 'Akkad', type: 'Dark Sector (Defense)', desc: 'Same +30% bonus in wave form — easier to bail out of.' },
      { planet: 'Deimos', node: 'Terrorem', type: 'Survival', desc: 'The other mutagen planet. Neurodes and orokin cells come along.' }
    ],
    alsoFrom: ['Infested containers on the Cambion Drift', 'Infested Invasion missions'],
    recommendedFrames: ['Nekros', 'Khora', 'Speed Nova', 'Wisp'],
    tips: 'Always run a full squad of four — infested spawn rates scale hard with squad size. For the Hema, plan a resource booster: it doubles every sample and halves the grind outright.'
  },
  {
    name: 'Mutagen Mass',
    uniqueName: '/Lotus/Types/Items/Research/BioComponent',
    category: 'Research',
    description: 'The built form. Required by Bio Lab weapons — the Mutalist and Pox family.',
    planets: ['Invasions (Infested side)', 'Orb Vallis', 'Clan dojo'],
    bestNodes: [
      { planet: 'Any', node: 'Infested Invasion missions', type: 'Invasion', desc: 'Sometimes offered as an invasion reward — rarer than the Grineer and Corpus equivalents.' },
      { planet: 'Orb Vallis', node: 'Tier 4 bounties', type: 'Bounty', desc: 'Occasional stage reward.' },
      { planet: 'Clan dojo', node: 'Bio Lab', type: 'Foundry', desc: 'Build from 10 Mutagen Samples each.' }
    ],
    alsoFrom: ['Rare infested storage containers'],
    recommendedFrames: ['Anything fast'],
    tips: 'Infested invasions are less frequent than the other two, so building from samples is more often the realistic route here.'
  },

  /* ================= SPECIAL ================= */
  {
    name: 'Nitain Extract',
    uniqueName: '/Lotus/Types/Items/MiscItems/Alertium',
    category: 'Special',
    description: 'Vials of rare deep-vent microorganisms. Gates a surprising number of warframe helmets, weapons and cosmetics.',
    planets: ['Nightwave', 'Resource caches', 'Cetus (Ghoul Purge)'],
    bestNodes: [
      { planet: 'Nightwave', node: 'Cred Offerings', type: 'Vendor', desc: '15 Nightwave Creds for 5 nitain. An evergreen offer in unlimited quantity — this is the only source worth planning around.' },
      { planet: 'Any', node: 'Reactor Sabotage / Exterminate caches', type: 'Resource cache', desc: '0.67-2% on rotation C, meaning you must find all three caches. Planet-dependent.' },
      { planet: 'Cetus', node: 'Ghoul Purge bounties', type: 'Bounty', desc: '3.6-4.7% per stage, but the Ghoul Purge only runs every few weeks.' }
    ],
    alsoFrom: ['Zealoid Prelate and the Wolf of Saturn Six, at 0.129%', 'Gift from the Lotus alerts, rarely'],
    recommendedFrames: ['Loot radar and a fast frame for cache hunting — Volt, Titania, Wukong'],
    tips: 'Buy it with Nightwave Creds. The drop sources exist but the numbers are so bad that hunting nitain deliberately is a waste of an evening.'
  },
  {
    name: 'Kuva',
    uniqueName: '/Lotus/Types/Items/MiscItems/Kuva',
    category: 'Special',
    description: 'The red fluid coveted by the Grineer Queens. Used to reroll Riven mods and to build a handful of rare blueprints.',
    planets: ['Kuva Siphon and Kuva Flood nodes', 'Kuva Fortress', 'Cambion Drift'],
    bestNodes: [
      { planet: 'Any', node: 'Kuva Flood', type: 'Siphon (high level)', desc: 'Roughly double a Siphon’s payout for the same five minutes of work. Always take the Flood if one is up.' },
      { planet: 'Any', node: 'Kuva Siphon', type: 'Siphon', desc: 'Marked with the kuva symbol on planets the Kuva Fortress is currently orbiting — the nodes move, so check the star chart.' },
      { planet: 'Cambion Drift', node: 'Requiem Obelisks', type: 'Free roam', desc: 'A steady secondary source while you are on the Drift anyway — Isolation Vault bounties pay kuva as well.' }
    ],
    alsoFrom: ['Kuva Lich and Sister missions', 'Granum Void', 'Requires The War Within and Mastery Rank 5'],
    recommendedFrames: ['Anything that survives — the siphon braids are destroyed with Operator void abilities, not weapons'],
    tips: 'You destroy the braids with the Operator, not with your warframe. A kuva booster and a Flood together is roughly four times a plain Siphon run.'
  },
  {
    name: 'Steel Essence',
    uniqueName: '/Lotus/Types/Items/MiscItems/SteelEssence',
    category: 'Special',
    description: 'Tokens of Teshin’s esteem. The Steel Path currency, spent on arcanes, Kuva and Riven slivers at Teshin.',
    planets: ['The Steel Path (all)'],
    bestNodes: [
      { planet: 'Any', node: 'Steel Path Incursions', type: 'Daily alerts', desc: 'Six per day at 5 essence each — 30 a day for maybe 20 minutes of work. The reliable baseline.' },
      { planet: 'Any', node: 'Acolyte hunting', type: 'Steel Path missions', desc: 'Every Acolyte gives a guaranteed 2, and this is affected by resource boosters and Loyal / Resourceful Retriever.' },
      { planet: 'Duviri', node: 'The Circuit (Steel Path)', type: 'Duviri', desc: '25 essence for clearing tier 9.' }
    ],
    alsoFrom: ['25 per fully cleared Steel Path planet — 475 for the whole star chart', '1 per relic opened in a Steel Path fissure', 'Eidolons on the Steel Path, 1 each'],
    recommendedFrames: ['Whatever clears Steel Path comfortably — the essence does not care'],
    tips: 'Acolyte drops scale with resource boosters, incursion rewards do not. If you own a booster, spend it on an Acolyte farm, not on the daily incursions.'
  },
  {
    name: 'Riven Sliver',
    uniqueName: '/Lotus/Types/Items/MiscItems/RivenFragment',
    category: 'Special',
    description: 'A fragment of a sundered Riven. Ten of them buy a Riven mod from Palladino in Iron Wake.',
    planets: ['Requiem fissures', 'Empyrean', 'Steel Path'],
    bestNodes: [
      { planet: 'Any', node: 'Requiem Relics in Void Fissures', type: 'Fissure', desc: 'The most consistent source — every Requiem relic is a chance at a sliver.' },
      { planet: 'Venus', node: 'Fossa', type: 'Assassination (Jackal)', desc: 'A Jackal at level 41 or above — so Sortie or Steel Path — drops one at 5%.' },
      { planet: 'Any', node: 'Eximus enemies above level 30', type: 'Any mission', desc: '2% per eximus — which makes any dense Steel Path run a passive sliver farm.' }
    ],
    alsoFrom: ['Empyrean missions', 'Teshin, for Steel Essence'],
    recommendedFrames: ['Anything that kills eximus units quickly at scale'],
    tips: 'Buying them from Teshin with Steel Essence is usually faster than farming the 2% eximus roll.'
  },
  {
    name: 'Aya',
    uniqueName: '/Lotus/Types/Items/MiscItems/SchismKey',
    category: 'Special',
    description: 'Raw Orokin memory plasma. Varzia’s foundry in Maroo’s Bazaar turns it into vaulted prime relics.',
    planets: ['Void', 'Bounties', 'Relic packs'],
    bestNodes: [
      { planet: 'Void', node: 'Ukko', type: 'Capture', desc: 'A one-minute Void mission. The fastest repeatable Aya source there is, and it drops relics and argon on the way out.' },
      { planet: 'Void', node: 'Hepit', type: 'Capture', desc: 'The lower-level equivalent if Ukko is too hot.' },
      { planet: 'Necralisk', node: 'Mother bounties', type: 'Bounty', desc: 'Bounties across all three landscapes carry Aya in their reward tables.' }
    ],
    alsoFrom: ['Relic packs, occasionally', 'All six faction syndicates want 2 and 3 Aya to reach ranks 4 and 5'],
    recommendedFrames: ['Anything fast — the Void capture nodes are over in a minute'],
    tips: 'Aya is the only route to vaulted prime relics that does not involve trading platinum. Regal Aya is the paid variant and buys whole prime warframes; the two are not interchangeable.'
  },

  /* ================= OPEN WORLD: PLAINS OF EIDOLON ================= */
  {
    name: 'Cetus Wisp',
    uniqueName: '/Lotus/Types/Gameplay/Eidolon/Resources/CetusWispItem',
    category: 'Open world',
    description: 'Stone lifeforms hovering at the water’s edge on the Plains. Wanted by Amps, Zaws, Gara’s chassis and Revenant’s systems.',
    planets: ['Plains of Eidolon (Cetus, Earth)'],
    bestNodes: [
      { planet: 'Plains of Eidolon', node: 'Gara Toht Lake', type: 'Free roam', desc: 'The big lake in the middle of the map. Wisps sit on the banks — you collect them by touching them, no weapon involved.' },
      { planet: 'Plains of Eidolon', node: 'The small landlocked pools', type: 'Free roam', desc: 'Circle the smaller ponds too; they spawn wisps at any time of day, not only at night.' },
      { planet: 'Cetus', node: 'The Quills', type: 'Vendor', desc: '2,000 standing each at Rank 5 - Architect. Faster than flying laps if your Quills rank is up.' }
    ],
    alsoFrom: ['Operational Supply during Operation: Plague Star, for 750 standing and 1,500 credits'],
    recommendedFrames: ['Titania (Razorwing) or Itzal archwing to cover the shorelines fast', 'Loot radar mods to spot them from the air'],
    tips: 'Most common at night but present around the clock. Fly the shoreline at low altitude — they are pickups, so speed matters more than damage.'
  },
  {
    name: 'Iradite',
    uniqueName: '/Lotus/Types/Gameplay/Eidolon/Resources/IraditeItem',
    category: 'Open world',
    description: 'A mineral from the low ground of the Plains. Needed for Zaws, Amps and most Ostron blueprints.',
    planets: ['Plains of Eidolon (Cetus, Earth)'],
    bestNodes: [
      { planet: 'Plains of Eidolon', node: 'Twin Horns / Seaside Ruin', type: 'Free roam', desc: 'Low-elevation deposits you destroy with any attack. Both areas sit close to the Cetus gate.' },
      { planet: 'Plains of Eidolon', node: "Hek's Stiletto / Er-Phryah's Vigil", type: 'Free roam', desc: 'Same deposits further out — and the amount per deposit scales with the level range of the area.' },
      { planet: 'Cetus', node: 'Bounties', type: 'Bounty', desc: 'A standard bounty reward, so it accumulates while you do other things.' }
    ],
    alsoFrom: ['Renthi Spring and The Seethe'],
    recommendedFrames: ['Any AoE weapon — the deposits are destructible objects, not enemies'],
    tips: 'Higher-level areas of the Plains give more per deposit. Farming iradite next to the gate is the slowest possible version of it.'
  },
  {
    name: 'Grokdrul',
    uniqueName: '/Lotus/Types/Gameplay/Eidolon/Resources/GrokdrulItem',
    category: 'Open world',
    description: 'Grineer manufacturing chemical, stored in drums around their Plains camps.',
    planets: ['Plains of Eidolon (Cetus, Earth)'],
    bestNodes: [
      { planet: 'Plains of Eidolon', node: 'Grineer camps', type: 'Free roam', desc: 'Every camp has drums. Shoot them — up to 5 grokdrul per drum on the highest-level missions.' },
      { planet: 'Cetus', node: 'High-tier bounties', type: 'Bounty', desc: 'The higher the bounty level, the more grokdrul per drum, and bounties also award it directly.' },
      { planet: 'Plains of Eidolon', node: 'Camp sweep loop', type: 'Free roam', desc: 'Fly camp to camp with a fast frame and clear only the drums — enemies are irrelevant.' }
    ],
    alsoFrom: ['Bounty reward tables at all tiers'],
    recommendedFrames: ['Titania or Volt for the camp loop', 'Any AoE weapon for the drums'],
    tips: 'Take the highest-level bounty you can survive before you start: the drum yield is tied to mission level, not to your gear.'
  },
  {
    name: 'Nistlepod',
    uniqueName: '/Lotus/Types/Gameplay/Eidolon/Resources/NistlebrushItem',
    category: 'Open world',
    description: 'Pods grown by the Nistlebrush fungus in the mountains of the Plains. A Zaw and Amp component.',
    planets: ['Plains of Eidolon (Cetus, Earth)'],
    bestNodes: [
      { planet: 'Plains of Eidolon', node: 'Mount Nang', type: 'Free roam', desc: 'High ground in the east. Each Nistlebrush drops 5 pods when smashed.' },
      { planet: 'Plains of Eidolon', node: 'Ostwan Range', type: 'Free roam', desc: 'The other mountainous region — same plants, same 5 per bush.' },
      { planet: 'Cetus', node: 'Bounties', type: 'Bounty', desc: 'A standard bounty reward.' }
    ],
    alsoFrom: ['Bounty reward tables'],
    recommendedFrames: ['Titania or an archwing — the plants are on high ground, so travel is the whole cost'],
    tips: 'Only spawns at elevation. If you are running around the flats wondering where they are, you are in the wrong half of the map.'
  },
  {
    name: 'Maprico',
    uniqueName: '/Lotus/Types/Gameplay/Eidolon/Resources/EidolonFruitItem',
    category: 'Open world',
    description: 'Thick-skinned fruit growing on squat trees all over the Plains. Used by Zaws and Ostron blueprints.',
    planets: ['Plains of Eidolon (Cetus, Earth)'],
    bestNodes: [
      { planet: 'Plains of Eidolon', node: 'Anywhere with trees', type: 'Free roam', desc: 'The squat trees are scattered across the whole map — shoot the fruit down and pick it up.' },
      { planet: 'Cetus', node: 'Bounties', type: 'Bounty', desc: 'Regular bounty reward, which is usually how people end up with a stack.' },
      { planet: 'Plains of Eidolon', node: 'Tree lines near the gate', type: 'Free roam', desc: 'Unlike the ores, maprico does not care about distance from Cetus.' }
    ],
    alsoFrom: ['Bounty reward tables'],
    recommendedFrames: ['Any frame with a fast travel option'],
    tips: 'The one Plains resource with no location trick at all — just shoot fruit while you fly between other objectives.'
  },
  {
    name: 'Breath of the Eidolon',
    uniqueName: '/Lotus/Types/Items/MiscItems/Eidolonium',
    category: 'Open world',
    description: 'Condensed Eidolon essence found in the night mist of the Plains. Needed for Amps and Quills blueprints.',
    planets: ['Plains of Eidolon (Cetus, Earth)'],
    bestNodes: [
      { planet: 'Plains of Eidolon', node: 'Anywhere, at night only', type: 'Free roam', desc: 'Appears as glowing wisps of mist during the Plains night cycle. Daytime hunting is wasted effort.' },
      { planet: 'Plains of Eidolon', node: 'Near the lakes during a Teralyst hunt', type: 'Free roam', desc: 'You are out there at night anyway — sweep the shoreline mist between Eidolon spawns.' },
      { planet: 'Cetus', node: 'The Quills', type: 'Vendor', desc: 'Purchasable with Quills standing, which sidesteps the night-cycle wait.' }
    ],
    alsoFrom: ['Bounty rewards during the night cycle'],
    recommendedFrames: ['Titania or an archwing for shoreline sweeps', 'Loot radar to spot the pickups'],
    tips: 'The Plains night lasts 50 minutes out of every 150. Plan Eidolon hunts and breath farming into the same window.'
  },
  {
    name: 'Eidolon Shards',
    uniqueName: '/Lotus/Types/Gameplay/Eidolon/Resources/SentientShards/SentientShardCommonItem',
    category: 'Open world',
    description: 'Shattered Sentient cores from the Eidolon Teralysts. Convert to 2,500 focus each, and gate the higher Quills ranks.',
    planets: ['Plains of Eidolon (night cycle)'],
    bestNodes: [
      { planet: 'Plains of Eidolon', node: 'Teralyst', type: 'Eidolon hunt', desc: 'The entry-level Eidolon. Spawns at Gara Toht Lake after nightfall and is soloable with a decent amp.' },
      { planet: 'Plains of Eidolon', node: 'Gantulyst', type: 'Eidolon hunt', desc: 'Second tier, summoned by charging shards at the shrines. Better shard yield.' },
      { planet: 'Plains of Eidolon', node: 'Hydrolyst', type: 'Eidolon hunt', desc: 'Third tier and the best per-night yield — but wants a coordinated squad and a Volt or Trinity.' }
    ],
    alsoFrom: ['Quills ranks 3, 4 and 5 cost 10, 20 and 30 shards respectively', 'Paracesis blueprint'],
    recommendedFrames: ['Volt (shield for amp damage)', 'Trinity or Harrow (energy)', 'Oberon', 'A Rank 5 amp and Madurai focus'],
    tips: 'On the Steel Path each Eidolon also guarantees a Steel Essence. Night lasts 50 minutes — a practised squad fits three full hunts into one.'
  },

  /* ================= OPEN WORLD: ORB VALLIS ================= */
  {
    name: 'Toroids (Vega / Calda / Sola)',
    uniqueName: '/Lotus/Types/Gameplay/Venus/Resources/ArachnoidMicroidItem',
    category: 'Open world',
    description: 'Raknoid power cores from the Orb Vallis. The Vox Solaris standing currency and a component of Garuda and several Amps.',
    planets: ['Orb Vallis (Fortuna, Venus)'],
    bestNodes: [
      { planet: 'Orb Vallis', node: 'Enrichment Labs → Calda Toroid', type: 'Free roam', desc: 'Best of the three: Scyto Raknoids drop Calda at 20%. Let the Corpus alert level climb to 4 and leave the beacons standing so reinforcements keep coming.' },
      { planet: 'Orb Vallis', node: 'Temple of Profit → Sola Toroid', type: 'Free roam', desc: 'Kyta Raknoids drop Sola at 20%. Same alert-level-4 technique.' },
      { planet: 'Orb Vallis', node: 'Spaceport → Vega Toroid', type: 'Free roam', desc: 'The slow one — Mite Raknoids only drop Vega at 1%. Exploiter Orb phase 1 spawns them in bulk, which is the shortcut.' }
    ],
    alsoFrom: ['Crisma Toroid from the Profit-Taker Orb (phase 4 heist)', 'Lazulite Toroid from the Exploiter Orb', 'Cave pickups across the Vallis'],
    recommendedFrames: ['Nekros (Desecrate)', 'Khora (Pilfering Strangledome)', 'Hydroid (Pilfering Swarm)', 'Atlas (Ore Gaze)', 'Ivara (Prowl)'],
    tips: 'A Profit-Taker phase 2 bounty that you complete but never turn in spawns Corpus dropships endlessly, and counts as alert level 4 by itself. That is the fastest Calda farm there is.'
  },
  {
    name: 'Tepa Nodule',
    uniqueName: '/Lotus/Types/Gameplay/Venus/Resources/VenusTreeItem',
    category: 'Open world',
    description: 'Iridescent nodules that glow in the Vallis cold. Wanted by Kitguns, Moas and Fortuna blueprints.',
    planets: ['Orb Vallis (Fortuna, Venus)'],
    bestNodes: [
      { planet: 'Orb Vallis', node: 'Cave systems', type: 'Free roam', desc: 'Grows in clusters inside caves. Deck 12 and the caves behind Fortuna are dense with them, 3-4 per cluster.' },
      { planet: 'Orb Vallis', node: 'Deck 12', type: 'Free roam', desc: 'No enemies inside, and the interior reloads if you walk deep and come back.' },
      { planet: 'Fortuna', node: 'Bounties', type: 'Bounty', desc: 'A standard bounty reward across tiers.' }
    ],
    alsoFrom: ['Resource containers on the Vallis surface'],
    recommendedFrames: ['Any frame — these are harvestable plants, not drops'],
    tips: 'A cave loop that farms tepa nodules is the same loop that mines ores. Do both in one trip.'
  },
  {
    name: 'Gorgaricus Spore',
    uniqueName: '/Lotus/Types/Gameplay/Venus/Resources/VenusCoconutItem',
    category: 'Open world',
    description: 'Reproductive spores from the giant Vallis fungi. Kitgun, Moa and Fortuna crafting material.',
    planets: ['Orb Vallis (Fortuna, Venus)'],
    bestNodes: [
      { planet: 'Orb Vallis', node: 'Giant mushroom caps', type: 'Free roam', desc: 'Purple sacs hanging under the caps. Shoot them so they fall, then pick the spores up off the ground.' },
      { planet: 'Orb Vallis', node: 'The mushroom forest north-west', type: 'Free roam', desc: 'Highest concentration of mature fungi on the map.' },
      { planet: 'Fortuna', node: 'Bounties', type: 'Bounty', desc: 'Regular bounty reward.' }
    ],
    alsoFrom: ['Resource containers across the Vallis'],
    recommendedFrames: ['Anything with vertical mobility to reach the caps'],
    tips: 'Only the PURPLE sacs are mature. The orange ones growing next to them give nothing — do not waste ammo on them.'
  },
  {
    name: 'Mytocardia Spore',
    uniqueName: '/Lotus/Types/Gameplay/Venus/Resources/FungusHeartItem',
    category: 'Open world',
    description: 'Fungal bodies in sacs at ground level across the Vallis. 1-3 spores per sac.',
    planets: ['Orb Vallis (Fortuna, Venus)'],
    bestNodes: [
      { planet: 'Orb Vallis', node: 'Mushroom forest west of the Coolant Reservoir', type: 'Free roam', desc: 'One of the three richest areas on the map for Mytocardia Sacs.' },
      { planet: 'Orb Vallis', node: 'The lake south of Transit Depot', type: 'Free roam', desc: 'Equally dense, and a short flight from the Fortuna entrance.' },
      { planet: 'Orb Vallis', node: 'Around the Spaceport', type: 'Free roam', desc: 'Third dense area — and it doubles as the Vega Toroid zone.' }
    ],
    alsoFrom: ['Bounty rewards at all tiers'],
    recommendedFrames: ['Titania or Volt for the travel between clusters'],
    tips: 'Bounty level does not change the yield per sac, so run whatever tier you like — only the number of sacs you visit matters.'
  },
  {
    name: 'Thermal Sludge',
    uniqueName: '/Lotus/Types/Gameplay/Venus/Resources/CoolantItem',
    category: 'Open world',
    description: 'A by-product of the Weeping Towers terraforming. Sits in special containers inside Corpus encampments.',
    planets: ['Orb Vallis (Fortuna, Venus)'],
    bestNodes: [
      { planet: 'Orb Vallis', node: 'Corpus encampments', type: 'Free roam', desc: 'Every Corpus base has the marked sludge containers. Break them and move on — enemies are optional.' },
      { planet: 'Orb Vallis', node: 'Enrichment Labs / Temple of Profit / Spaceport', type: 'Free roam', desc: 'The three large bases hold the most containers, and you are there for toroids anyway.' },
      { planet: 'Fortuna', node: 'Bounties', type: 'Bounty', desc: 'Standard bounty reward.' }
    ],
    alsoFrom: ['Bounty reward tables'],
    recommendedFrames: ['Any frame that can break containers at range'],
    tips: 'The perfect passenger resource: it comes from containers in exactly the bases you already farm toroids in.'
  },

  /* ================= OPEN WORLD: CAMBION DRIFT ================= */
  {
    name: 'Pustulite',
    uniqueName: '/Lotus/Types/Gameplay/InfestedMicroplanet/Resources/InfGorgaricusSeedItem',
    category: 'Open world',
    description: 'Half-formed infested spore-bearers from the Cambion Drift, harvested from Gravid Blastemas.',
    planets: ['Cambion Drift (Necralisk, Deimos)'],
    bestNodes: [
      { planet: 'Cambion Drift', node: 'Gravid Blastemas', type: 'Free roam', desc: 'The fleshy growths scattered across the Drift. Destroy them for pustulite — no enemy involved.' },
      { planet: 'Necralisk', node: 'Mother bounties', type: 'Bounty', desc: 'A common bounty reward across tiers.' },
      { planet: 'Cambion Drift', node: 'Requiem Obelisks', type: 'Free roam', desc: 'Feeding an obelisk is faster than sweeping the map for growths.' }
    ],
    alsoFrom: ['Isolation Vault bounty reward tables'],
    recommendedFrames: ['Any frame with AoE — the growths are destructible objects'],
    tips: 'Requiem Obelisks are the general Drift shortcut: they hand out the common and uncommon Deimos materials without any hunting.'
  },

  /* ================= ZARIMAN & ALBRECHT'S LABORATORIES ================= */
  {
    name: 'Voidplume Quill',
    uniqueName: '/Lotus/Types/Gameplay/Zariman/Resources/ZarimanDogTagBounty',
    category: 'Open world',
    description: 'Feathers fallen from Void Angels. The Holdfasts standing currency, and a component of Gyre, Styanax, Phenmor and the Incarnon weapons.',
    planets: ['Zariman Ten Zero'],
    bestNodes: [
      { planet: 'Zariman', node: 'Oro Works', type: 'Void Armageddon', desc: 'Ravenous Void Angels here are a guaranteed quill drop as an interactable pickup.' },
      { planet: 'Zariman', node: 'Quinn’s bounties', type: 'Bounty', desc: '1-5 quills per bounty depending on tier — 2-8 on the Steel Path.' },
      { planet: 'Zariman', node: 'Any node, via Zarium Accolades', type: 'Cache hunt', desc: 'Find a Zarium Accolade and deliver it to a Cephalon Melica cache for 1 quill. Most missions have two caches.' }
    ],
    alsoFrom: ['Archimedean Yonta sells one every 8 hours for Zariman resources', '15 quills are required to reach Rank 4 - Seraph with The Holdfasts'],
    recommendedFrames: ['Anything that clears Void Armageddon quickly', 'Loot radar for the accolade caches'],
    tips: 'Quills are worth 2,500 Holdfasts standing each. Steel Path bounties nearly double the per-run yield, so unlock it before grinding this.'
  },
  {
    name: 'Thrax Plasm',
    uniqueName: '/Lotus/Types/Gameplay/Zariman/Resources/VoidWraithItem',
    category: 'Open world',
    description: 'Residue from Thrax Void manifestations. Needed for Holdfasts blueprints, arcanes and Incarnon adapters.',
    planets: ['Zariman Ten Zero'],
    bestNodes: [
      { planet: 'Zariman', node: 'Tuvul Commons', type: 'Void Cascade', desc: 'Thrax Centurions and Legatus spawn continuously in Cascade — the densest Thrax source on the ship.' },
      { planet: 'Zariman', node: 'Everview Arc', type: 'Void Flood', desc: 'Alternative endless mode with a steady Thrax stream.' },
      { planet: 'Zariman', node: 'Halako Perimeter', type: 'Extermination', desc: 'Short run if you only need a handful.' }
    ],
    alsoFrom: ['Lua Thrax Plasm is a separate resource from the Lua Circulus / Yuvarium nodes — do not confuse the two'],
    recommendedFrames: ['Anything with strong single-target damage — Thrax units go immortal until you kill their spectral form'],
    tips: 'Thrax units drop to an invulnerable spirit at low health; you must finish that form for the plasm to count. Operator amps do it fastest.'
  },
  {
    name: 'Voidgel Orb',
    uniqueName: '/Lotus/Types/Gameplay/Zariman/Resources/ZarimanMiscItemA',
    category: 'Open world',
    description: 'Ambient Void energy distilled into a neutral state. A Zariman crafting staple.',
    planets: ['Zariman Ten Zero'],
    bestNodes: [
      { planet: 'Zariman', node: 'Tuvul Commons', type: 'Void Cascade', desc: 'Endless mode with the highest container and enemy throughput.' },
      { planet: 'Zariman', node: 'The Greenway', type: 'Mobile Defense', desc: 'Short, container-rich run.' },
      { planet: 'Zariman', node: 'Everview Arc', type: 'Void Flood', desc: 'Works equally well; pick whichever mode you enjoy.' }
    ],
    alsoFrom: ['Zariman bounty reward tables', 'Region resource drops across the tileset'],
    recommendedFrames: ['Nekros', 'Khora', 'Xaku for containers'],
    tips: 'Drops one at a time, so treat it as a passenger resource on Cascade runs rather than a target.'
  },
  {
    name: 'Entrati Lanthorn',
    uniqueName: '/Lotus/Types/Gameplay/EntratiLab/Resources/EntratiLanthornBundle',
    category: 'Open world',
    description: 'Ceremonial beacon used to map Void locations onto real space. Gates Incarnon adapters and Albrecht’s Laboratories blueprints.',
    planets: ['Zariman Ten Zero', 'Albrecht’s Laboratories (Sanctum Anatomica)'],
    bestNodes: [
      { planet: 'Deimos', node: 'Testudo', type: 'Netracells', desc: 'A guaranteed drop per Netracell run — and it keeps dropping after the five weekly runs are used up.' },
      { planet: 'Deimos', node: 'Effervo', type: 'Assassination (Albrecht’s Laboratories)', desc: 'Gruzzlings leave a pickup worth three lanthorns each.' },
      { planet: 'Deimos', node: 'Cambire', type: 'Alchemy', desc: '5% on rotation B. Munio (Mirror Defense) and Persto (Survival) carry the same chance.' }
    ],
    alsoFrom: ['Zariman bounties and mission rewards', 'Zariman region resource drops'],
    recommendedFrames: ['Whatever clears Netracells comfortably — the guaranteed drop is the point'],
    tips: 'Netracells past the weekly limit still drop lanthorns. If you only need lanthorns and not the vault rewards, keep running them.'
  },

  /* ================= RAILJACK ================= */
  {
    name: 'Titanium',
    uniqueName: '/Lotus/Types/Items/RailjackMiscItems/TitaniumRailjackItem',
    category: 'Railjack',
    description: 'Common Railjack resource found in space rock. The base material for every Railjack repair and upgrade.',
    planets: ['Any Empyrean mission'],
    bestNodes: [
      { planet: 'Earth Proxima', node: 'Any node', type: 'Empyrean', desc: 'Lowest-level Proxima, and titanium drops the same everywhere — shoot the space rock while the crew handles the fighters.' },
      { planet: 'Veil Proxima', node: 'Any node', type: 'Empyrean', desc: 'Higher level and denser, if your Railjack is built for it.' },
      { planet: 'Any Proxima', node: 'Asteroid fields', type: 'Empyrean', desc: 'Titanium sits inside the rocks, not on the enemies. Break them with the Railjack guns and fly through the drops.' }
    ],
    alsoFrom: ['Storage containers in Empyrean missions'],
    recommendedFrames: ['Not frame-dependent — this is a Railjack piloting job'],
    tips: 'The one Railjack resource that does not need a single kill. A slow lap around an asteroid field fills the hold.'
  },
  {
    name: 'Asterite',
    uniqueName: '/Lotus/Types/Items/RailjackMiscItems/AsteriteRailjackItem',
    category: 'Railjack',
    description: 'Uncommon Railjack crystals embedded in space rock. Needed for Railjack component upgrades.',
    planets: ['Any Empyrean mission'],
    bestNodes: [
      { planet: 'Veil Proxima', node: 'Any node', type: 'Empyrean', desc: 'Highest density of both wreckage and rock.' },
      { planet: 'Saturn Proxima', node: 'Any node', type: 'Empyrean', desc: 'Comfortable middle ground if the Veil is still too hot.' },
      { planet: 'Any Proxima', node: 'Asteroid mining', type: 'Empyrean', desc: 'Same as titanium — this comes out of the rocks.' }
    ],
    alsoFrom: ['Empyrean storage containers'],
    recommendedFrames: ['Not frame-dependent'],
    tips: 'Asterite is the usual bottleneck on Railjack component upgrades. Mine every rock you pass, even on a mission you took for something else.'
  },
  {
    name: 'Carbides',
    uniqueName: '/Lotus/Types/Items/RailjackMiscItems/CarbidesRailjackItem',
    category: 'Railjack',
    description: 'Grineer plating components. A Railjack resource that also drops on the normal star chart from Grineer Shipyard eximus units.',
    planets: ['Ceres', 'Sedna', 'Earth Proxima', 'Any Empyrean mission'],
    bestNodes: [
      { planet: 'Earth Proxima', node: 'Any node', type: 'Empyrean', desc: 'Drops from Grineer ground units, ships and crewship containers — and Earth Proxima is the gentlest one.' },
      { planet: 'Ceres', node: 'Gabii', type: 'Dark Sector (Survival)', desc: 'Grineer Shipyard tileset with a +35% resource drop bonus. Eximus units are the source, so density matters.' },
      { planet: 'Sedna', node: 'Hydron', type: 'Defense', desc: 'Shipyard tileset with a steady eximus supply while levelling.' }
    ],
    alsoFrom: ['Grineer storage containers in Empyrean missions'],
    recommendedFrames: ['Nekros or Khora on the star-chart route', 'Not frame-dependent in Empyrean'],
    tips: 'On the star chart it is strictly an eximus drop — regular kills give nothing. Steel Path is worth it here because it raises eximus density.'
  },
  {
    name: 'Cubic Diodes',
    uniqueName: '/Lotus/Types/Items/RailjackMiscItems/CubicsRailjackItem',
    category: 'Railjack',
    description: 'Corpus photon-network components. Drops from eximus units on the Corpus Ice Planet tileset and in Empyrean.',
    planets: ['Europa', 'Any Empyrean mission'],
    bestNodes: [
      { planet: 'Europa', node: 'Cholistan', type: 'Dark Sector (Excavation)', desc: '+25% resource drop chance on the Ice Planet tileset, and excavation keeps eximus units coming.' },
      { planet: 'Europa', node: 'Larzac', type: 'Dark Sector (Defense)', desc: 'Same bonus in wave form.' },
      { planet: 'Any Proxima', node: 'Corpus nodes', type: 'Empyrean', desc: 'Standard loot drop across Corpus Empyrean missions.' }
    ],
    alsoFrom: ['Empyrean storage containers'],
    recommendedFrames: ['Nekros or Khora on Europa', 'Not frame-dependent in Empyrean'],
    tips: 'Like carbides, this is an eximus-only drop on the star chart. Europa Dark Sectors give you the bonus and the tileset in one node.'
  }
];

/**
 * Bild dazu und fertig. Alles andere steht schon in den Daten.
 */
export function getAllResourceGuides() {
  return RESOURCE_GUIDES.map(r => ({
    ...r,
    image: imageUrl(r.uniqueName, 128)
  }));
}

/**
 * Sucht ueber alles, wonach man tatsaechlich fragt.
 *
 * Nicht nur ueber den Namen: "excavation" ist eine echte Frage ("was faellt
 * beim Ausgraben mit ab?"), "nekros" auch ("wofuer lohnt der ueberhaupt?"),
 * und "sealab" findet nur, wer die Nebenquellen mitliest. Deshalb Missionstyp,
 * empfohlene Frames und alsoFrom dazu - jedes Feld, das weggelassen wird, ist
 * eine Suche, die ins Leere laeuft, obwohl die Antwort in den Daten steht.
 */
export function searchResourceGuides(query) {
  const q = String(query || '').toLowerCase().trim();
  const all = getAllResourceGuides();
  if (!q) return all;
  return all.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.category.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.planets.some(p => p.toLowerCase().includes(q)) ||
    (r.alsoFrom || []).some(a => a.toLowerCase().includes(q)) ||
    (r.recommendedFrames || []).some(f => f.toLowerCase().includes(q)) ||
    r.bestNodes.some(n =>
      n.node.toLowerCase().includes(q) ||
      n.planet.toLowerCase().includes(q) ||
      String(n.type || '').toLowerCase().includes(q))
  );
}
