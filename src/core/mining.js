/**
 * Erze und Edelsteine der drei Landschaften - der Bergbau-Teil des Farm-Guides.
 *
 * WARUM EIN EIGENES MODUL: Bergbau folgt anderen Regeln als der Rest des Farmens.
 * Es gibt keine Node, keinen Droptable und keinen Nekros - es gibt eine Ader in
 * einem Felsen, deren FARBE verraet, was drin steckt. Diese Farbe ist die einzige
 * Information, die man im Spiel VOR dem Schneiden hat, und deshalb das
 * Ordnungsmerkmal dieser Datei.
 *
 * Die Regel dahinter (Wiki "Mining", Abschnitt "Finding Veins"):
 *   rot   -> Erz  (Plains of Eidolon, Orb Vallis)
 *   gelb  -> Erz  (Cambion Drift)
 *   blau  -> Edelstein (ueberall)
 * Welches Erz genau, entscheidet sich erst beim Schneiden - und haengt an der
 * Entfernung zum Tor: je weiter weg, desto haeufiger uncommon und rare.
 *
 * Die Texte stehen auf Englisch wie der Rest der Oberflaeche, die Kommentare
 * auf Deutsch. Namen sind die des englischen Clients - wer "Adramalium" sucht,
 * sucht es unter diesem Namen.
 */

import { imageUrl } from './catalog.js';

/**
 * Die drei Adernfarben als benannte Werte.
 *
 * Der Hex-Wert ist die Farbe der leuchtenden Ader im Fels, nicht die des Items.
 * Er traegt in der Oberflaeche das Aderbild - deshalb steht er hier bei den
 * Daten und nicht im Stylesheet: die Zuordnung Ader->Farbe ist Spielwissen,
 * keine Gestaltung.
 */
export const VEIN_COLORS = {
  red:    { key: 'red',    label: 'Red vein',    hex: '#e2503c', glow: '#ff8a5c', yields: 'Ore' },
  yellow: { key: 'yellow', label: 'Yellow vein', hex: '#e8b13a', glow: '#ffd479', yields: 'Ore' },
  blue:   { key: 'blue',   label: 'Blue vein',   hex: '#3d9ee8', glow: '#7fd0ff', yields: 'Gem' }
};

/** Was ein Schnitt hoechstens hergibt - haengt an der Aderfarbe, nicht am Erz. */
export const VEIN_YIELD = {
  red:    { multiplier: '2x', max: 10, min: '3 near the gate, up to 6 far out' },
  yellow: { multiplier: '2x', max: 10, min: '3-6, does not scale with distance on the Drift' },
  blue:   { multiplier: '1x', max: 6,  min: '2 near the gate, up to 4 far out' }
};

/**
 * Die vier Schneidwerkzeuge.
 *
 * ACHTUNG bei "Chance for Special Gems": das ist der EINZIGE harte Riegel.
 * Jeder Cutter schneidet jede Erz- und Edelsteinstufe - nur Sentirum, Nyth,
 * Zodian, Thyst, Xenorhast und Embolos brauchen zwingend den Advanced Nosam
 * Cutter oder den Sunpoint Plasma Drill. Wer das verwechselt, kauft sich
 * unnoetig durch drei Cutter-Stufen.
 */
export const CUTTERS = [
  {
    name: 'Nosam Cutter',
    from: 'Old Man Suumbaat (Cetus)', cost: '500 Ostron standing', rank: 'Rank 0 - Neutral',
    special: '0%', bonus: '3%', detection: '30 m, 5 deposits, no minimap radar',
    note: 'Fastest but least stable laser. Cannot produce special-tier gems.'
  },
  {
    name: 'Focused Nosam Cutter',
    from: 'Old Man Suumbaat (Cetus)', cost: '750 Ostron standing', rank: 'Rank 2 - Visitor',
    special: '0%', bonus: '4%', detection: '45 m, 10 deposits, no minimap radar',
    note: 'Still no special gems — only worth it as a stepping stone.'
  },
  {
    name: 'Advanced Nosam Cutter',
    from: 'Old Man Suumbaat (Cetus)', cost: '1,000 Ostron standing', rank: 'Rank 4 - Surah',
    special: '15%', bonus: '10%', detection: '60 m, 10 deposits, 50 m minimap radar',
    note: 'The first cutter that can pull special gems. Slow but stable laser.'
  },
  {
    name: 'Sunpoint Plasma Drill',
    from: 'Smokefinger (Fortuna)', cost: '2,500 Solaris United standing', rank: 'Rank 0 - Neutral',
    special: '20%', bonus: '15%', detection: '60 m, 10 deposits, 50 m minimap radar',
    note: 'Best in the game and the only upgradable one — range widget 9 → 14 m, silencer widget keeps Ivara invisible. Both 30,000 standing at Rank 5 - Old Mate.'
  }
];

/**
 * Die drei Landschaften.
 *
 * `bestSpots` sind nicht "irgendwo da" sondern die Stellen, an denen das Wiki
 * seit Jahren die hoechste Aderdichte meldet - eine Handvoll Felsen auf engem
 * Raum schlaegt jede Wanderung ueber die Karte.
 */
export const MINING_WORLDS = [
  {
    key: 'eidolon',
    name: 'Plains of Eidolon',
    hub: 'Cetus (Earth)',
    vendor: 'Old Man Suumbaat',
    syndicate: 'Ostron',
    oreVein: 'red',
    gemVein: 'blue',
    tool: 'Nosam Cutter family (buy from Suumbaat)',
    bestSpots: [
      { name: "Er-Phryah's Vigil", desc: 'West and slightly north of the Cetus gate, around Grineer Base #2. The bay with the towering Sentient bones plus the nearby cave holds 15+ veins in roughly 100 m² — the densest single spot on the Plains.' },
      { name: 'Twin Horns', desc: 'Cave system close to the gate, so reloading the instance is quick. Watch the Akkalak turrets at the far end — they knock you out of the cut.' }
    ],
    tips: 'Gems turn into Ostron standing at Suumbaat. Ores do not — those exist purely for Zaws, Amps and foundry recipes.'
  },
  {
    key: 'solaris',
    name: 'Orb Vallis',
    hub: 'Fortuna (Venus)',
    vendor: 'Smokefinger',
    syndicate: 'Solaris United',
    oreVein: 'red',
    gemVein: 'blue',
    tool: 'Sunpoint Plasma Drill (buy from Smokefinger)',
    bestSpots: [
      { name: 'Deck 12', desc: 'Densely packed veins and no enemies inside. Walk deep in, come back out, and the veins in the first cave have respawned. The best mining location in the game.' },
      { name: 'Central Maintenance → coolant lake', desc: 'The stretch of road behind the Fortuna entrance plus its small cave system. Close to the gate, but expect Condor dropship patrols.' }
    ],
    tips: 'Rarity scales with distance from the gate: Hesperon shows up far more often at the lake and the mushroom forest north-west by the Temple of Profit than anywhere near Fortuna.'
  },
  {
    key: 'deimos',
    name: 'Cambion Drift',
    hub: 'Necralisk (Deimos)',
    vendor: 'Otak',
    syndicate: 'Entrati (via Otak Tokens)',
    oreVein: 'yellow',
    gemVein: 'blue',
    tool: 'Any cutter — nothing Drift-specific to buy',
    bestSpots: [
      { name: 'Requiem Obelisks', desc: 'Faster than mining for everything except the rare and special tiers. Feed an obelisk and it hands you common and uncommon ores and gems without a single cut.' },
      { name: 'The cave systems', desc: 'Same rule as the other landscapes — tightly packed rock means tightly packed veins.' }
    ],
    tips: 'The Drift is the exception twice over: its ore veins are YELLOW, not red, and minimum yield does not scale with distance from the Necralisk.'
  }
];

/**
 * ACHTUNG bei `uniqueName`: DEs Pfade heissen nichts wie das Item. Ferros liegt
 * unter Eidolon/UncommonOreAItem, Venerol unter Solaris/SolarisUncommonOreItem
 * (ohne das "A", anders als bei allen anderen), Xenorhast unter
 * Deimos/DeimosEidolonGemAItem. Alle Pfade hier stammen aus dem Katalog
 * (ExportResources), nicht aus dem Namen abgeleitet - geraten gibt einen 404,
 * und der faellt nur auf, wenn man hinsieht.
 */
export const MINING_RESOURCES = [
  /* ---------------- Plains of Eidolon: Erze (rote Adern) ---------------- */
  {
    name: 'Pyrol', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonOreAItem',
    refined: 'Pyrotic Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonOreAAlloyAItem',
    world: 'Plains of Eidolon', kind: 'ore', rarity: 'Common', vein: 'red', tool: 'Any cutter',
    usedFor: 'Zaw components, Amp parts and Ostron foundry blueprints.',
    note: 'Together with Coprun the bread-and-butter ore of the Plains — every red vein near the gate is one of these two.'
  },
  {
    name: 'Coprun', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonOreBItem',
    refined: 'Coprite Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonOreBAlloyBItem',
    world: 'Plains of Eidolon', kind: 'ore', rarity: 'Common', vein: 'red', tool: 'Any cutter',
    usedFor: 'Zaw and Amp components, plus a long list of Cetus blueprints.',
    note: 'Has a 2x multiplier and a maximum of 10 per vein — the single highest-volume mining drop in the Plains.'
  },
  {
    name: 'Ferros', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/UncommonOreAItem',
    refined: 'Fersteel Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/UncommonOreAAlloyAItem',
    world: 'Plains of Eidolon', kind: 'ore', rarity: 'Uncommon', vein: 'red', tool: 'Any cutter',
    usedFor: 'Zaw strikes, Amp prisms and Gara / Revenant parts.',
    note: 'Shows up noticeably more often the further you get from the Cetus gate.'
  },
  {
    name: 'Auron', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/RareOreAItem',
    refined: 'Auroxium Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/RareOreAAlloyAItem',
    world: 'Plains of Eidolon', kind: 'ore', rarity: 'Rare', vein: 'red', tool: 'Any cutter',
    usedFor: 'High-tier Zaw and Amp parts.',
    note: 'The rarest Plains ore. Mine the far corners of the map — rarity is a function of distance to the gate, not of your cutter.'
  },

  /* ---------------- Plains of Eidolon: Edelsteine (blaue Adern) ---------------- */
  {
    name: 'Azurite', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonGemAItem',
    refined: 'Tear Azurite', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonGemACutAItem',
    world: 'Plains of Eidolon', kind: 'gem', rarity: 'Common', vein: 'blue', tool: 'Any cutter',
    standing: 50, standingWith: 'Ostron',
    usedFor: 'Zaw grips, Amp braces, Ostron blueprints.',
    note: 'Cheapest way to top up Ostron standing while you are out there anyway.'
  },
  {
    name: 'Devar', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonGemBItem',
    refined: 'Esher Devar', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonGemBCutAItem',
    world: 'Plains of Eidolon', kind: 'gem', rarity: 'Common', vein: 'blue', tool: 'Any cutter',
    standing: 50, standingWith: 'Ostron',
    usedFor: 'Zaw and Amp components.',
    note: 'The second common gem — which of the two you get is pure RNG per vein.'
  },
  {
    name: 'Veridos', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/UncommonGemAItem',
    refined: 'Marquise Veridos', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/UncommonGemACutAItem',
    world: 'Plains of Eidolon', kind: 'gem', rarity: 'Uncommon', vein: 'blue', tool: 'Any cutter',
    standing: 75, standingWith: 'Ostron',
    usedFor: 'Zaw strikes and mid-tier Amp parts.',
    note: 'Refined gems are tradeable under "Crafting Components" — raw ones are not.'
  },
  {
    name: 'Crimzian', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/RareGemAItem',
    refined: 'Star Crimzian', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/RareGemACutAItem',
    world: 'Plains of Eidolon', kind: 'gem', rarity: 'Rare', vein: 'blue', tool: 'Any cutter',
    standing: 100, standingWith: 'Ostron',
    usedFor: 'Top-tier Zaw strikes and Amp prisms.',
    note: 'Far side of the map plus a resource drop chance booster is the whole trick.'
  },
  {
    name: 'Sentirum', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/EidolonGemAItem',
    refined: 'Radian Sentirum', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/EidolonGemACutAItem',
    world: 'Plains of Eidolon', kind: 'gem', rarity: 'Special', vein: 'blue',
    tool: 'Advanced Nosam Cutter or Sunpoint Plasma Drill',
    standing: 400, standingWith: 'Ostron',
    usedFor: 'Endgame Zaw and Amp parts, and a steady standing source.',
    note: 'Special tier: 15% chance with the Advanced Nosam Cutter, 20% with the Sunpoint Plasma Drill. No other cutter can produce it at all.'
  },
  {
    name: 'Nyth', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/EidolonGemBItem',
    refined: 'Heart Nyth', refinedUniqueName: '/Lotus/Types/Items/Gems/Eidolon/EidolonGemBCutAItem',
    world: 'Plains of Eidolon', kind: 'gem', rarity: 'Special', vein: 'blue',
    tool: 'Advanced Nosam Cutter or Sunpoint Plasma Drill',
    standing: 400, standingWith: 'Ostron',
    usedFor: 'Endgame Zaw and Amp parts.',
    note: 'Has no yield multiplier at all — a Nyth vein gives exactly one, however clean your cut was.'
  },

  /* ---------------- Orb Vallis: Erze (rote Adern) ---------------- */
  {
    name: 'Travoride', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisCommonOreAItem',
    refined: 'Travocyte Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisCommonOreAAlloyItem',
    world: 'Orb Vallis', kind: 'ore', rarity: 'Common', vein: 'red', tool: 'Any cutter',
    usedFor: 'Kitgun parts, Moa components, Fortuna blueprints.',
    note: 'One of the two commons — Deck 12 hands you these by the hundred.'
  },
  {
    name: 'Axidite', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisCommonOreBItem',
    refined: 'Axidrol Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisCommonOreBAlloyItem',
    world: 'Orb Vallis', kind: 'ore', rarity: 'Common', vein: 'red', tool: 'Any cutter',
    usedFor: 'Kitgun and Moa components, plus Vox Solaris blueprints.',
    note: 'The other common Vallis ore. Refined at Smokefinger into Axidrol Alloy.'
  },
  {
    name: 'Venerol', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisUncommonOreItem',
    refined: 'Venerdo Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisUncommonOreAAlloyItem',
    world: 'Orb Vallis', kind: 'ore', rarity: 'Uncommon', vein: 'red', tool: 'Any cutter',
    usedFor: 'Kitgun chambers and Moa models.',
    note: 'Head away from the Fortuna elevator before you start cutting — proximity to the gate is what keeps you on commons.'
  },
  {
    name: 'Hesperon', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisRareOreAItem',
    refined: 'Hespazym Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisRareOreAAlloyItem',
    world: 'Orb Vallis', kind: 'ore', rarity: 'Rare', vein: 'red', tool: 'Any cutter',
    usedFor: 'High-tier Kitgun parts and Amp components.',
    note: 'The lake and the mushroom forest north-west by the Temple of Profit — one of the furthest points from the gate — is where it actually shows up.'
  },

  /* ---------------- Orb Vallis: Edelsteine (blaue Adern) ---------------- */
  {
    name: 'Phasmin', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisCommonGemAItem',
    refined: 'Smooth Phasmin', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisCommonGemACutItem',
    world: 'Orb Vallis', kind: 'gem', rarity: 'Common', vein: 'blue', tool: 'Any cutter',
    standing: 50, standingWith: 'Solaris United',
    usedFor: 'Kitgun grips, Moa parts, Fortuna blueprints.',
    note: 'Turn raw gems in to Smokefinger for Solaris United standing.'
  },
  {
    name: 'Noctrul', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisCommonGemBItem',
    refined: 'Heart Noctrul', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisCommonGemBCutItem',
    world: 'Orb Vallis', kind: 'gem', rarity: 'Common', vein: 'blue', tool: 'Any cutter',
    standing: 50, standingWith: 'Solaris United',
    usedFor: 'Kitgun and Moa components.',
    note: 'Second common gem of the Vallis.'
  },
  {
    name: 'Goblite', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisUncommonGemAItem',
    refined: 'Goblite Tears', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisUncommonGemACutItem',
    world: 'Orb Vallis', kind: 'gem', rarity: 'Uncommon', vein: 'blue', tool: 'Any cutter',
    standing: 200, standingWith: 'Solaris United',
    usedFor: 'Kitgun chambers and Amp braces.',
    note: 'Worth 200 standing raw — four times what a Plains uncommon gives.'
  },
  {
    name: 'Amarast', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisRareGemAItem',
    refined: 'Star Amarast', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisRareGemACutItem',
    world: 'Orb Vallis', kind: 'gem', rarity: 'Rare', vein: 'blue', tool: 'Any cutter',
    standing: 500, standingWith: 'Solaris United',
    usedFor: 'High-tier Kitgun and Amp parts.',
    note: '500 standing per raw gem makes Vallis mining the fastest open-world standing farm in the game.'
  },
  {
    name: 'Zodian', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisEidolonGemAItem',
    refined: 'Radiant Zodian', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisEidolonGemACutItem',
    world: 'Orb Vallis', kind: 'gem', rarity: 'Special', vein: 'blue',
    tool: 'Advanced Nosam Cutter or Sunpoint Plasma Drill',
    standing: 1000, standingWith: 'Solaris United',
    usedFor: 'Endgame Kitgun and Amp components.',
    note: '1,000 standing each. Deck 12 with the Sunpoint Plasma Drill (20% special chance) is the whole strategy.'
  },
  {
    name: 'Thyst', uniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisEidolonGemBItem',
    refined: 'Marquise Thyst', refinedUniqueName: '/Lotus/Types/Items/Gems/Solaris/SolarisEidolonGemBCutItem',
    world: 'Orb Vallis', kind: 'gem', rarity: 'Special', vein: 'blue',
    tool: 'Advanced Nosam Cutter or Sunpoint Plasma Drill',
    standing: 1000, standingWith: 'Solaris United',
    usedFor: 'Endgame Kitgun and Amp components.',
    note: 'Same tier as Zodian — both only exist with the Advanced cutter or the drill.'
  },

  /* ---------------- Cambion Drift: Erze (GELBE Adern) ---------------- */
  {
    name: 'Adramalium', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreAItem',
    refined: 'Adramal Alloy', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreAAlloyItem',
    world: 'Cambion Drift', kind: 'ore', rarity: 'Common', vein: 'yellow', tool: 'Any cutter',
    usedFor: 'Necramech parts, Entrati blueprints, Xaku components.',
    note: 'Requiem Obelisks hand out commons faster than cutting ever will.'
  },
  {
    name: 'Bapholite', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreBItem',
    refined: 'Tempered Bapholite', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreBAlloyItem',
    world: 'Cambion Drift', kind: 'ore', rarity: 'Common', vein: 'yellow', tool: 'Any cutter',
    usedFor: 'Necramech and Entrati foundry recipes.',
    note: 'Second common Drift ore. Yellow vein — not red like the other two landscapes.'
  },
  {
    name: 'Namalon', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosUncommonOreAItem',
    refined: 'Devolved Namalon', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosUncommonOreAAlloyItem',
    world: 'Cambion Drift', kind: 'ore', rarity: 'Uncommon', vein: 'yellow', tool: 'Any cutter',
    usedFor: 'Necramech weapons and Entrati arcanes.',
    note: 'Trade ores to Otak for Otak Tokens — the Drift is the only landscape where ores buy standing at all.'
  },
  {
    name: 'Thaumica', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosRareOreAItem',
    refined: 'Thaumic Distillate', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosRareOreAAlloyItem',
    world: 'Cambion Drift', kind: 'ore', rarity: 'Rare', vein: 'yellow', tool: 'Any cutter',
    usedFor: 'Necramech components and high-tier Entrati blueprints.',
    note: 'The rare Drift ore. Distance to the Necralisk does not help here the way it does elsewhere — only volume does.'
  },

  /* ---------------- Cambion Drift: Edelsteine (blaue Adern) ---------------- */
  {
    name: 'Tiametrite', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonGemAItem',
    refined: 'Faceted Tiametrite', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonGemACutItem',
    world: 'Cambion Drift', kind: 'gem', rarity: 'Common', vein: 'blue', tool: 'Any cutter',
    standingWith: 'Otak (Otak Tokens → Entrati standing)',
    usedFor: 'Necramech parts and Entrati blueprints.',
    note: 'Drift gems buy Otak Tokens, which Grandmother turns into Entrati standing.'
  },
  {
    name: 'Dagonic', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonGemBItem',
    refined: 'Purged Dagonic', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonGemBCutItem',
    world: 'Cambion Drift', kind: 'gem', rarity: 'Common', vein: 'blue', tool: 'Any cutter',
    standingWith: 'Otak (Otak Tokens → Entrati standing)',
    usedFor: 'Entrati foundry recipes and Necramech components.',
    note: 'Second common Drift gem.'
  },
  {
    name: 'Heciphron', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosUncommonGemAItem',
    refined: 'Purified Heciphron', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosUncommonGemACutItem',
    world: 'Cambion Drift', kind: 'gem', rarity: 'Uncommon', vein: 'blue', tool: 'Any cutter',
    standingWith: 'Otak (Otak Tokens → Entrati standing)',
    usedFor: 'Necramech weapons and Entrati arcanes.',
    note: 'Refined at Otak. Obelisks cover the uncommon tier too.'
  },
  {
    name: 'Necrathene', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosRareGemAItem',
    refined: 'Stellated Necrathene', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosRareGemACutItem',
    world: 'Cambion Drift', kind: 'gem', rarity: 'Rare', vein: 'blue', tool: 'Any cutter',
    standingWith: 'Otak (Otak Tokens → Entrati standing)',
    usedFor: 'Necramech parts and endgame Entrati blueprints.',
    note: 'Rare tier — this is where actual cutting beats the obelisk shortcut.'
  },
  {
    name: 'Xenorhast', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosEidolonGemAItem',
    refined: 'Trapezium Xenorhast', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosEidolonGemACutItem',
    world: 'Cambion Drift', kind: 'gem', rarity: 'Special', vein: 'blue',
    tool: 'Advanced Nosam Cutter or Sunpoint Plasma Drill',
    standingWith: 'Otak (Otak Tokens → Entrati standing)',
    usedFor: 'Endgame Necramech and Entrati crafting.',
    note: 'Special tier — no chance at all without the Advanced cutter or the drill.'
  },
  {
    name: 'Embolos', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosEidolonGemBItem',
    refined: 'Cabochon Embolos', refinedUniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosEidolonGemBCutItem',
    world: 'Cambion Drift', kind: 'gem', rarity: 'Special', vein: 'blue',
    tool: 'Advanced Nosam Cutter or Sunpoint Plasma Drill',
    standingWith: 'Otak (Otak Tokens → Entrati standing)',
    usedFor: 'Endgame Necramech and Entrati crafting.',
    note: 'The other special Drift gem. Sunpoint Plasma Drill gives the best odds at 20%.'
  }
];

/** Allgemeines Bergbau-Wissen, das an keinem einzelnen Erz haengt. */
export const MINING_FACTS = [
  'Red and yellow spots on a rock mean ore, blue spots mean gems. That is the only information you get before you cut.',
  'A vein is a gem vein 30% of the time by default. Resource drop chance boosters, a Resource Drop Chance Blessing and The Steel Path push that towards gems — capped at 90% gem / 10% ore. They never add more veins, they only change what the existing ones are.',
  'Rarity rises with distance from the hub gate. Mining the rocks right outside Cetus or Fortuna is why you only ever see commons.',
  'Red and yellow veins pay 2x with a maximum of 10; blue veins pay 1x with a maximum of 6. Hitting the small bonus bracket always adds a gem on top, even on an ore vein.',
  'Only the Advanced Nosam Cutter (15%) and the Sunpoint Plasma Drill (20%) can produce special-tier gems. Every cutter handles every ore tier.',
  'Firing a cutter counts as an alarming action and breaks Ivara’s Prowl. The Sunpoint silencer widget (30,000 Solaris United standing, Rank 5) fixes that.',
  'Resource Boosters, Loyal Retriever and Resourceful Retriever multiply the amount mined. Titania in Razorwing can reach veins on ceilings and cliff faces.',
  'Invisible drilling spots usually sit on a rock face out of your line of sight — reposition, or mine a few other nodes and come back.'
];

/** Bild und Aderfarbe dazu - dieselbe Aufbereitung wie im Ressourcen-Guide. */
function decorate(r) {
  return {
    ...r,
    image: imageUrl(r.uniqueName, 128),
    refinedImage: r.refinedUniqueName ? imageUrl(r.refinedUniqueName, 128) : null,
    veinColor: VEIN_COLORS[r.vein] || VEIN_COLORS.blue,
    veinYield: VEIN_YIELD[r.vein] || VEIN_YIELD.blue
  };
}

export function getAllMiningResources() {
  return MINING_RESOURCES.map(decorate);
}

/**
 * Sucht ueber Rohname, Schliffname, Landschaft, Stufe und Aderfarbe.
 *
 * Die Aderfarbe ist bewusst durchsuchbar: "red" oder "blue" ist die Frage, die
 * man vor dem Felsen tatsaechlich hat.
 */
export function searchMiningResources(query) {
  const q = String(query || '').toLowerCase().trim();
  const all = getAllMiningResources();
  if (!q) return all;
  return all.filter(r =>
    r.name.toLowerCase().includes(q) ||
    String(r.refined || '').toLowerCase().includes(q) ||
    r.world.toLowerCase().includes(q) ||
    r.rarity.toLowerCase().includes(q) ||
    r.kind.includes(q) ||
    r.vein.includes(q)
  );
}

/** Alles, was der Bergbau-Abschnitt braucht, in einem Rutsch. */
export function getMiningGuide(query) {
  return {
    resources: searchMiningResources(query),
    worlds: MINING_WORLDS,
    cutters: CUTTERS,
    facts: MINING_FACTS,
    veinColors: VEIN_COLORS
  };
}
