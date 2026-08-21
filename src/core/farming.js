/**
 * Warframe Ressourcen- & Farm-Routen-Katalog
 * Detaillierte Offline-Datenbank mit den besten Drop-Nodes, Planeten und Loot-Setups.
 *
 * Die Texte hier sind Oberflaeche und stehen deshalb auf Englisch - wie im
 * Spiel selbst. Missionstypen und Knotennamen sind bewusst DIE des englischen
 * Clients: wer die Node sucht, sucht sie unter diesem Namen auf der Karte.
 */

import { imageUrl } from './catalog.js';

export const RESOURCE_GUIDES = [
  {
    name: 'Orokin Cell',
    uniqueName: '/Lotus/Types/Items/MiscItems/OrokinCell',
    category: 'Rare',
    description: 'Essential rare resource for almost every prime item, warframe and weapon.',
    planets: ['Saturn', 'Ceres', 'Deimos'],
    bestNodes: [
      { planet: 'Saturn', node: 'Helene', type: 'Defense (Grineer)', desc: 'Very popular for levelling and farming cells at the same time.' },
      { planet: 'Ceres', node: 'Seimeni', type: 'Dark Sector (Defense)', desc: '+35% resource drop rate plus fast credits.' },
      { planet: 'Deimos', node: 'Terrorem', type: 'Dark Sector (Survival)', desc: 'Mutagen samples and cells in one run.' }
    ],
    recommendedFrames: ['Nekros (Desecrate)', 'Khora (Pilfering Strangledome)', 'Smeeta Kavat'],
    tips: 'A resource booster doubles every cell you pick up, from 1x to 2x.'
  },
  {
    name: 'Argon Crystal',
    uniqueName: '/Lotus/Types/Items/MiscItems/ArgonCrystal',
    category: 'Special',
    description: 'Volatile crystal from the Void. It decays 24 hours after you pick it up.',
    planets: ['Void'],
    bestNodes: [
      { planet: 'Void', node: 'Mot', type: 'Survival', desc: 'High enemy density and a great many argon pegmatite deposits.' },
      { planet: 'Void', node: 'Teshub', type: 'Exterminate', desc: 'Fast run with loot radar, smashing every container on the way.' },
      { planet: 'Void', node: 'Ani', type: 'Survival', desc: 'Gentler enemies than Mot, still good drop chances.' }
    ],
    recommendedFrames: ['Limbo / Xaku (container breakers)', 'Nekros', 'Smeeta Kavat'],
    tips: 'Only farm argon once you can start the build in the foundry right away — it decays.'
  },
  {
    name: 'Tellurium',
    uniqueName: '/Lotus/Types/Items/MiscItems/Tellurium',
    category: 'Rare',
    description: 'Very rare resource from underwater and archwing missions.',
    planets: ['Uranus', 'Kuva Fortress'],
    bestNodes: [
      { planet: 'Uranus', node: 'Ophelia', type: 'Survival (Grineer sealab)', desc: 'The undisputed best node. Drops piles of polymer bundles alongside.' },
      { planet: 'Uranus', node: 'Assur', type: 'Dark Sector (Survival)', desc: '+25% resource drop rate bonus.' }
    ],
    recommendedFrames: ['Khora', 'Nekros', 'Hydroid (Pilfering Swarm)', 'Smeeta Kavat'],
    tips: 'Stay in one room so Nekros and Khora loot every body in the same place.'
  },
  {
    name: 'Plastids',
    uniqueName: '/Lotus/Types/Items/MiscItems/Plastids',
    category: 'Uncommon',
    description: 'Needed in bulk for warframe chassis, systems and weapons.',
    planets: ['Saturn', 'Uranus', 'Phobos', 'Pluto', 'Eris'],
    bestNodes: [
      { planet: 'Saturn', node: 'Helene', type: 'Defense', desc: 'Great mix of plastids, orokin cells and weapon XP.' },
      { planet: 'Uranus', node: 'Ophelia', type: 'Survival', desc: 'Drops together with tellurium and polymer bundles.' },
      { planet: 'Eris', node: 'Zabala', type: 'Dark Sector (Survival)', desc: 'High infested enemy density.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Speed Nova'],
    tips: 'Break the orange carbuncle containers you pass on the way.'
  },
  {
    name: 'Polymer Bundle',
    uniqueName: '/Lotus/Types/Items/MiscItems/PolymerBundle',
    category: 'Uncommon',
    description: 'Needed in large amounts for almost every blueprint, and for energy restore pads.',
    planets: ['Uranus', 'Mercury', 'Venus'],
    bestNodes: [
      { planet: 'Uranus', node: 'Ophelia', type: 'Survival', desc: 'Over 10,000 polymer in 20 minutes with a loot squad.' },
      { planet: 'Uranus', node: 'Assur', type: 'Dark Sector (Survival)', desc: 'Very high base drop rate.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Pilfering Hydroid'],
    tips: 'Ideal for stocking up on squad energy restores.'
  },
  {
    name: 'Neural Sensors',
    uniqueName: '/Lotus/Types/Items/MiscItems/NeuralSensor',
    category: 'Rare',
    description: 'Bio-mechanical sensors, needed for every warframe helmet and neuroptics.',
    planets: ['Jupiter', 'Kuva Fortress'],
    bestNodes: [
      { planet: 'Jupiter', node: 'Camenae', type: 'Dark Sector (Survival)', desc: 'Infested on Jupiter yield a lot of sensors.' },
      { planet: 'Jupiter', node: 'Themisto', type: 'Assassination (Alad V)', desc: 'Alad V drops 1-2 sensors nearly every run, and the run takes 90 seconds.' }
    ],
    recommendedFrames: ['Volt / Titania (for the Alad V boss rush)', 'Nekros (for survival)'],
    tips: 'Alad V goes down in seconds to a weapon that strips shields.'
  },
  {
    name: 'Neurodes',
    uniqueName: '/Lotus/Types/Items/MiscItems/Neurode',
    category: 'Rare',
    description: 'Essential brain implants for organic armour and weapons.',
    planets: ['Earth', 'Eris', 'Lua', 'Deimos'],
    bestNodes: [
      { planet: 'Earth', node: 'Tikal', type: 'Dark Sector (Excavation)', desc: 'Quick extractors and plenty of infested kills.' },
      { planet: 'Earth', node: 'Mariana', type: 'Exterminate', desc: 'Use loot radar and destroy every neurode mass.' },
      { planet: 'Deimos', node: 'Terrorem', type: 'Survival', desc: 'Good drop rate, alongside orokin cells.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Xaku (container breaker)'],
    tips: 'On Earth, wild kubrow dens often drop neurodes as well.'
  },
  {
    name: 'Oxium',
    uniqueName: '/Lotus/Types/Items/MiscItems/Oxium',
    category: 'Uncommon',
    description: 'Lightweight metal, dropped only by flying Corpus Oxium Ospreys.',
    planets: ['Jupiter', 'Venus', 'Pluto', 'Neptune'],
    bestNodes: [
      { planet: 'Jupiter', node: 'Io', type: 'Defense', desc: 'Oxium Ospreys spawn in bulk up to wave 10/15.' },
      { planet: 'Pluto', node: 'Hieracon', type: 'Dark Sector (Excavation)', desc: 'High level, lots of Corpus spawns.' }
    ],
    recommendedFrames: ['Ivara (Pilfering Pickpocket)', 'Khora (Strangledome)', 'Nekros'],
    tips: 'Important: kill the ospreys before they charge you and explode — a self-destruct drops no oxium.'
  },
  {
    name: 'Cryotic',
    uniqueName: '/Lotus/Types/Items/MiscItems/Cryotic',
    category: 'Special',
    description: 'Earned from excavation missions — 100 cryotic per completed extractor.',
    planets: ['All excavations'],
    bestNodes: [
      { planet: 'Earth', node: 'Tikal', type: 'Dark Sector (Excavation)', desc: 'Low enemy levels; extractors survive without help.' },
      { planet: 'Pluto', node: 'Hieracon', type: 'Excavation (Dark Sector)', desc: 'Yields Neo/Axi relics and endo at the same time.' }
    ],
    recommendedFrames: ['Frost (Snow Globe)', 'Gara', 'Limbo (Cataclysm)', 'Khora'],
    tips: 'A resource booster doubles the yield to 200 cryotic per extractor.'
  },
  {
    name: 'Mutagen Sample',
    uniqueName: '/Lotus/Types/Items/MiscItems/MutagenSample',
    category: 'Uncommon',
    description: 'Infested resource, above all for Hema research in the clan dojo.',
    planets: ['Deimos', 'Eris'],
    bestNodes: [
      { planet: 'Deimos', node: 'Camacol', type: 'Dark Sector (Survival)', desc: 'The best mutagen sample node in the game.' },
      { planet: 'Deimos', node: 'Terrorem', type: 'Survival', desc: 'Alternative node with high density.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Speed Nova', 'Wisp'],
    tips: 'Always farm in a full squad of four — enemy spawn rates scale with squad size.'
  },
  {
    name: 'Toroids (Vega / Calda / Sola)',
    uniqueName: '/Lotus/Types/Items/Gems/Solaris/ToroidCommon',
    category: 'Open world',
    description: 'Special resources from Orb Vallis (Fortuna) for Vox Solaris, Garuda and amp builds.',
    planets: ['Orb Vallis (Fortuna, Venus)'],
    bestNodes: [
      { planet: 'Orb Vallis', node: 'Spaceport', desc: 'Drops Vega toroids at alert level 4.' },
      { planet: 'Orb Vallis', node: 'Enrichment Labs', desc: 'Drops Calda toroids at alert level 4.' },
      { planet: 'Orb Vallis', node: 'Temple of Profit', desc: 'Drops Sola toroids at alert level 4.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Wisp', 'Smeeta Kavat'],
    tips: 'Let the Corpus control beacons climb to level 4 and leave them standing, so reinforcements keep spawning.'
  },
  {
    name: 'Entrati Lanthorn',
    uniqueName: '/Lotus/Types/Items/MiscItems/ZarimanLanthorn',
    category: 'Open world',
    description: 'Special lanthorn from the Zariman Ten Zero and Albrecht Entrati’s laboratories.',
    planets: ['Zariman', 'Albrecht’s Laboratories (Sanctum Anatomica)'],
    bestNodes: [
      { planet: 'Zariman', node: 'Halakhan bounty / Exterminate', desc: 'Container-breaker setup with loot radar.' },
      { planet: 'Sanctum Anatomica', node: 'Effervo (Assassination / Albrecht’s Laboratories)', desc: 'Drops regularly from necramechs and bosses.' }
    ],
    recommendedFrames: ['Xaku (The Lost)', 'Limbo', 'Smeeta Kavat'],
    tips: 'Run a distillation extractor on the Zariman from the Warframe companion app.'
  }
];

export function getAllResourceGuides() {
  return RESOURCE_GUIDES.map(r => ({
    ...r,
    image: imageUrl(r.uniqueName, 128)
  }));
}

export function searchResourceGuides(query) {
  const q = String(query || '').toLowerCase().trim();
  const all = getAllResourceGuides();
  if (!q) return all;
  return all.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.category.toLowerCase().includes(q) ||
    r.planets.some(p => p.toLowerCase().includes(q)) ||
    r.bestNodes.some(n => n.node.toLowerCase().includes(q) || n.planet.toLowerCase().includes(q))
  );
}
