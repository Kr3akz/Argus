/**
 * Warframe Ressourcen- & Farm-Routen-Katalog
 * Detaillierte Offline-Datenbank mit den besten Drop-Nodes, Planeten und Loot-Setups.
 */

import { imageUrl } from './catalog.js';

export const RESOURCE_GUIDES = [
  {
    name: 'Orokin Cell',
    uniqueName: '/Lotus/Types/Items/MiscItems/OrokinCell',
    category: 'Selten',
    description: 'Essentielle seltene Ressource für fast alle Prime-Items, Warframes und Waffen.',
    planets: ['Saturn', 'Ceres', 'Deimos'],
    bestNodes: [
      { planet: 'Saturn', node: 'Helene', type: 'Verteidigung (Grineer)', desc: 'Sehr populär zum gleichzeitigen Leveln & Zellen farmen.' },
      { planet: 'Ceres', node: 'Seimeni', type: 'Dunkler Sektor (Verteidigung)', desc: '+35% Ressourcen-Drop-Rate + schnelle Credits.' },
      { planet: 'Deimos', node: 'Terrorem', type: 'Dunkler Sektor (Überleben)', desc: 'Gleichzeitig Mutagen-Samples & Zellen.' }
    ],
    recommendedFrames: ['Nekros (Entweihen)', 'Khora (Plündernder Würgekuppel)', 'Smeeta Kavat'],
    tips: 'Ressourcen-Verdoppler-Booster verdoppelt jede aufgehobene Zelle von 1x auf 2x.'
  },
  {
    name: 'Argon Crystal',
    uniqueName: '/Lotus/Types/Items/MiscItems/ArgonCrystal',
    category: 'Spezial',
    description: 'Flüchtiger Kristall aus dem Void. Zerfällt nach 24 Stunden im Inventar!',
    planets: ['Void'],
    bestNodes: [
      { planet: 'Void', node: 'Mot', type: 'Überleben', desc: 'Hohe Gegnerdichte, extrem viele Argon-Pegmatit-Ablagerungen.' },
      { planet: 'Void', node: 'Teshub', type: 'Auslöschung', desc: 'Schnelles Durchlaufen mit Loot-Radar zum Zerstören aller Behälter.' },
      { planet: 'Void', node: 'Ani', type: 'Überleben', desc: 'Entspanntere Gegner als auf Mot, gute Dropchancen.' }
    ],
    recommendedFrames: ['Limbo / Xaku (Kistenzerstörer)', 'Nekros', 'Smeeta Kavat'],
    tips: 'Achtung: Erst farmen, wenn du das Item direkt in der Schmiede starten kannst!'
  },
  {
    name: 'Tellurium',
    uniqueName: '/Lotus/Types/Items/MiscItems/Tellurium',
    category: 'Selten',
    description: 'Sehr seltene Ressource aus Unterwasser- und Archwing-Missionen.',
    planets: ['Uranus', 'Kuva-Festung'],
    bestNodes: [
      { planet: 'Uranus', node: 'Ophelia', type: 'Überleben (Grineer-Unterwasserlabor)', desc: 'Die unangefochten beste Farm-Node! Droppt zeitgleich Unmengen Polymer-Bündel.' },
      { planet: 'Uranus', node: 'Assur', type: 'Dunkler Sektor (Überleben)', desc: '+25% Ressourcen-Drop-Rate Bonus.' }
    ],
    recommendedFrames: ['Khora', 'Nekros', 'Hydroid (Plündernder Schwarm)', 'Smeeta Kavat'],
    tips: 'Bleibt im selben Raum stehen, damit Nekros und Khora alle Leichen am selben Ort plündern.'
  },
  {
    name: 'Plastids',
    uniqueName: '/Lotus/Types/Items/MiscItems/Plastids',
    category: 'Ungewöhnlich',
    description: 'Wird in großen Mengen für Warframe-Chassis, -Systeme und Waffen gebraucht.',
    planets: ['Saturn', 'Uranus', 'Phobos', 'Pluto', 'Eris'],
    bestNodes: [
      { planet: 'Saturn', node: 'Helene', type: 'Verteidigung', desc: 'Super Kombination aus Plastids, Orokin-Zellen und Waffen-EP.' },
      { planet: 'Uranus', node: 'Ophelia', type: 'Überleben', desc: 'Droppt zusammen mit Tellurium und Polymer-Bündeln.' },
      { planet: 'Eris', node: 'Zabala', type: 'Dunkler Sektor (Überleben)', desc: 'Hohe Infested-Gegnerdichte.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Speed-Nova'],
    tips: 'Schlage die orangefarbenen Karbunkel-Behälter auf dem Weg auf.'
  },
  {
    name: 'Polymer Bundle',
    uniqueName: '/Lotus/Types/Items/MiscItems/PolymerBundle',
    category: 'Ungewöhnlich',
    description: 'Wird für fast alle Blaupausen sowie Energie-Restore-Pads in rauen Mengen benötigt.',
    planets: ['Uranus', 'Merkur', 'Venus'],
    bestNodes: [
      { planet: 'Uranus', node: 'Ophelia', type: 'Überleben', desc: 'Droppt bis zu 10.000+ Polymer in 20 Minuten mit Loot-Squad.' },
      { planet: 'Uranus', node: 'Assur', type: 'Dunkler Sektor (Überleben)', desc: 'Sehr hohe Grund-Droprate.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Pilfering Hydroid'],
    tips: 'Ideal zum Vorrat-Farmen für Squad-Energie-Wiederhersteller.'
  },
  {
    name: 'Neural Sensors',
    uniqueName: '/Lotus/Types/Items/MiscItems/NeuralSensor',
    category: 'Selten',
    description: 'Bio-mechanische Sensoren, benötigt für alle Warframe-Helme/Neuroptiken.',
    planets: ['Jupiter', 'Kuva-Festung'],
    bestNodes: [
      { planet: 'Jupiter', node: 'Camenae', type: 'Dunkler Sektor (Überleben)', desc: 'Infested auf Jupiter bringen sehr viele Sensoren.' },
      { planet: 'Jupiter', node: 'Themisto', type: 'Attentat (Alad V)', desc: 'Alad V droppt fast in jedem Run 1-2 Sensoren, dauert nur 90 Sekunden.' }
    ],
    recommendedFrames: ['Volt / Titania (für Alad V Boss-Rush)', 'Nekros (für Überleben)'],
    tips: 'Alad V lässt sich mit Schildbrecher-Waffen in Sekunden besiegen.'
  },
  {
    name: 'Neurodes',
    uniqueName: '/Lotus/Types/Items/MiscItems/Neurode',
    category: 'Selten',
    description: 'Essentielle Gehirn-Implantate für organische Rüstungen und Waffen.',
    planets: ['Erde', 'Eris', 'Lua', 'Deimos'],
    bestNodes: [
      { planet: 'Erde', node: 'Tikal', type: 'Dunkler Sektor (Ausgrabung)', desc: 'Schnelle Extraktoren + viele Infested-Kills.' },
      { planet: 'Erde', node: 'Mariana', type: 'Auslöschung', desc: 'Loot-Radar nutzen und alle Neuroden-Massen zerstören.' },
      { planet: 'Deimos', node: 'Terrorem', type: 'Überleben', desc: 'Gute Droprate im Verbund mit Orokin-Zellen.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Xaku (Kistenknacker)'],
    tips: 'Auf der Erde droppen wilde Kubrow-Baue ebenfalls oft Neuroden.'
  },
  {
    name: 'Oxium',
    uniqueName: '/Lotus/Types/Items/MiscItems/Oxium',
    category: 'Ungewöhnlich',
    description: 'Leichteres Metall, das nur von fliegenden Corpus-Oxium-Falken (Ospreys) fallengelassen wird.',
    planets: ['Jupiter', 'Venus', 'Pluto', 'Neptun'],
    bestNodes: [
      { planet: 'Jupiter', node: 'Io', type: 'Verteidigung', desc: 'Bis Welle 10/15 spawnen massenhaft Oxium-Ospreys.' },
      { planet: 'Pluto', node: 'Hieracon', type: 'Dunkler Sektor (Ausgrabung)', desc: 'Hohes Level, viele Corpus-Spawns.' }
    ],
    recommendedFrames: ['Ivara (Taschendiebstahl)', 'Khora (Strangledome)', 'Nekros'],
    tips: 'WICHTIG: Töte die Ospreys, bevor sie in dich hineinrasen und explodieren – bei Selbstzerstörung droppt kein Oxium!'
  },
  {
    name: 'Cryotic',
    uniqueName: '/Lotus/Types/Items/MiscItems/Cryotic',
    category: 'Spezial',
    description: 'Gewonnen durch Ausgrabungs-Missionen (100 Cryotic pro vollendetem Extraktor).',
    planets: ['Alle Ausgrabungen'],
    bestNodes: [
      { planet: 'Erde', node: 'Tikal', type: 'Dunkler Sektor (Ausgrabung)', desc: 'Niedrige Gegnerlevel, Extraktoren überleben problemlos.' },
      { planet: 'Pluto', node: 'Hieracon', type: 'Ausgrabung (Dunkler Sektor)', desc: 'Liefert zeitgleich Neo/Axi-Relikte und Endo.' }
    ],
    recommendedFrames: ['Frost (Schneekugel)', 'Gara', 'Limbo (Katastrophe)', 'Khora'],
    tips: 'Ressourcen-Verdoppler-Booster verdoppelt den Ertrag auf 200 Cryotic pro Extraktor!'
  },
  {
    name: 'Mutagen Sample',
    uniqueName: '/Lotus/Types/Items/MiscItems/MutagenSample',
    category: 'Ungewöhnlich',
    description: 'Infested-Ressource, besonders wichtig für die Hema-Waffenforschung im Clan-Dojo.',
    planets: ['Deimos', 'Eris'],
    bestNodes: [
      { planet: 'Deimos', node: 'Camacol', type: 'Dunkler Sektor (Überleben)', desc: 'Die beste Farm-Node für Mutagen-Samples im gesamten Spiel.' },
      { planet: 'Deimos', node: 'Terrorem', type: 'Überleben', desc: 'Alternativer Knoten mit hoher Dichte.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Speed-Nova', 'Wisp'],
    tips: 'Immer in einer 4er-Loot-Gruppe farmen, um maximale Gegner-Spawnraten zu erzielen.'
  },
  {
    name: 'Toroids (Vega / Calda / Sola)',
    uniqueName: '/Lotus/Types/Items/Gems/Solaris/ToroidCommon',
    category: 'Open World',
    description: 'Spezialressourcen aus Orb Vallis (Fortuna) für Vox Solaris, Garuda & Amp-Bauten.',
    planets: ['Orb Vallis (Fortuna, Venus)'],
    bestNodes: [
      { planet: 'Orb Vallis', node: 'Raumhafen (Spaceport)', desc: 'Droppt Vega-Toroide bei Alarmstufe 4.' },
      { planet: 'Orb Vallis', node: 'Bereicherungslabor (Enrichment Labs)', desc: 'Droppt Calda-Toroide bei Alarmstufe 4.' },
      { planet: 'Orb Vallis', node: 'Tempel des Profits (Temple of Profit)', desc: 'Droppt Sola-Toroide bei Alarmstufe 4.' }
    ],
    recommendedFrames: ['Nekros', 'Khora', 'Wisp', 'Smeeta Kavat'],
    tips: 'Lass die Kontrollbaken der Corpus auf Stufe 4 anwachsen und zerstöre sie nicht, damit kontinuierlich Verstärkung spawnt.'
  },
  {
    name: 'Entrati Lanthorn',
    uniqueName: '/Lotus/Types/Items/MiscItems/ZarimanLanthorn',
    category: 'Open World',
    description: 'Spezial-Laterne von der Zariman Ten Zero & Albrecht Entratis Laboratorien.',
    planets: ['Zariman', 'Albrechts Laboratorien (Sanctum Anatomica)'],
    bestNodes: [
      { planet: 'Zariman', node: 'Halbierungs-Bounty / Auslöschung', desc: 'Kistenzerstörer-Setup mit Loot-Radar.' },
      { planet: 'Sanctum Anatomica', node: 'Effervo (Attentat / Albrechts Labore)', desc: 'Droppt regelmäßig von Necramechs und Bossen.' }
    ],
    recommendedFrames: ['Xaku (Weite Weite)', 'Limbo', 'Smeeta Kavat'],
    tips: 'Nutze einen Destillations-Extraktor auf der Zariman in der Warframe Companion App!'
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
