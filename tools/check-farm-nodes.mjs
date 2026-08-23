/**
 * Prueft den Farm- und Bergbau-Guide gegen die echten Spieldaten.
 *
 * WARUM ES DAS GIBT: Ein Farm-Guide besteht aus zwei Sorten Text, die beide
 * falsch sein koennen, ohne dass es auffaellt.
 *
 *   1. Knotennamen. "Camacol" klingt wie eine Deimos-Node und ist keine.
 *      "Camenae" liegt auf Sedna, nicht auf Jupiter. Wer das liest, fliegt hin
 *      und findet nichts - und merkt nicht, dass der Guide luegt, sondern denkt,
 *      er selbst sucht falsch.
 *   2. uniqueName-Pfade. Daran haengt allein das Bild. Ein falscher Pfad gibt
 *      einen 404, das Bild verschwindet still, und niemand sieht den Grund.
 *
 * Beides laesst sich maschinell pruefen: die Sternenkarte kommt von
 * warframestat.us, die Item-Pfade aus DEs eigenem Export (data/catalog.json,
 * derselbe Cache, den die App benutzt).
 *
 *   node tools/check-farm-nodes.mjs
 *
 * Exit-Code 1, wenn etwas nicht stimmt - damit es sich in einen Hook oder CI
 * haengen laesst.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESOURCE_GUIDES } from '../src/core/farming.js';
import { MINING_RESOURCES } from '../src/core/mining.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOL_NODES = 'https://api.warframestat.us/solNodes';

/**
 * Knoten, die es gibt, aber nicht als Sternenkarten-Eintrag: Landschaften,
 * Dojo-Raeume, Haendler, Invasionen. Sie stehen absichtlich in den Daten -
 * "Grineer Invasion missions" ist die richtige Antwort auf die Frage nach dem
 * Detonite Injector, auch wenn kein Knoten so heisst.
 */
const NON_NODE_PLANETS = new Set([
  'Any', 'Cetus', 'Fortuna', 'Necralisk', 'Nightwave', 'Clan dojo',
  'Plains of Eidolon', 'Orb Vallis', 'Cambion Drift', 'Zariman',
  'Earth Proxima', 'Saturn Proxima', 'Veil Proxima', 'Any Proxima',
  'Duviri', 'Deimos / Cetus / Orb Vallis'
]);

/** Ein Name, wie ihn beide Seiten schreiben - Gross/klein und Bindestrich egal. */
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function loadStarChart() {
  const res = await fetch(SOL_NODES);
  if (!res.ok) throw new Error(`solNodes: HTTP ${res.status}`);
  const json = await res.json();

  /* Die API liefert "Ophelia (Uranus)" als Anzeigenamen - Planet und Knoten
     stecken beide im selben String und muessen auseinandergenommen werden. */
  const byPlanet = new Map();
  for (const entry of Object.values(json)) {
    const m = /^(.*?)\s*\((.*)\)$/.exec(entry.value || '');
    if (!m) continue;
    const planet = m[2];
    if (!byPlanet.has(planet)) byPlanet.set(planet, new Map());
    byPlanet.get(planet).set(norm(m[1]), entry.type || '');
  }
  return byPlanet;
}

async function loadCatalogPaths() {
  const file = path.join(root, 'data', 'catalog.json');
  if (!existsSync(file)) return null;
  const cached = JSON.parse(await readFile(file, 'utf8'));
  const rows = [...(cached.items || []), ...(cached.lookup || [])];
  return new Set(rows.map(r => r.uniqueName).filter(Boolean));
}

const problems = [];
const warnings = [];

/* ------------------------------ Knoten ------------------------------ */

function checkNodes(starChart) {
  for (const res of RESOURCE_GUIDES) {
    for (const node of res.bestNodes || []) {
      if (NON_NODE_PLANETS.has(node.planet)) continue;

      const nodes = starChart.get(node.planet);
      if (!nodes) {
        problems.push(`${res.name}: planet "${node.planet}" is not on the star chart`);
        continue;
      }
      const type = nodes.get(norm(node.node));
      if (type === undefined) {
        problems.push(`${res.name}: "${node.node}" is not a node on ${node.planet}`);
        continue;
      }

      /* Der Missionstyp im Guide steht ausgeschmueckt da ("Dark Sector
         (Survival)", "Survival (Grineer sealab)"). Verglichen wird deshalb
         nur, ob die Kernbegriffe der Sternenkarte darin vorkommen. */
      const claimed = norm(node.type);
      const actual = norm(type);
      if (actual && claimed && !claimed.includes(actual) && !actual.includes(claimed)) {
        warnings.push(`${res.name}: ${node.planet} / ${node.node} is "${type}", guide says "${node.type}"`);
      }
    }
  }
}

/* ------------------------------ Bilder ------------------------------ */

function checkPaths(known) {
  const seen = new Map();

  const check = (label, uniqueName) => {
    if (!uniqueName) return problems.push(`${label}: no uniqueName`);
    if (!known.has(uniqueName)) problems.push(`${label}: "${uniqueName}" is not in the catalog`);
    if (seen.has(uniqueName)) warnings.push(`${label}: shares its uniqueName with ${seen.get(uniqueName)}`);
    else seen.set(uniqueName, label);
  };

  for (const r of RESOURCE_GUIDES) check(r.name, r.uniqueName);
  for (const m of MINING_RESOURCES) {
    check(m.name, m.uniqueName);
    check(`${m.name} (refined: ${m.refined})`, m.refinedUniqueName);
  }
}

/* ------------------------------ Bergbau ------------------------------ */

/**
 * Die Aderfarbe ist keine Geschmacksfrage, sondern eine Regel des Spiels:
 * Erz ist rot, auf dem Cambion Drift gelb; Edelstein ist immer blau. Ein
 * Tippfehler hier fuehrt jemanden vor den falschen Felsen.
 */
function checkVeins() {
  for (const m of MINING_RESOURCES) {
    const expected = m.kind === 'gem'
      ? 'blue'
      : (m.world === 'Cambion Drift' ? 'yellow' : 'red');
    if (m.vein !== expected) {
      problems.push(`${m.name}: ${m.kind} on ${m.world} must have a ${expected} vein, has "${m.vein}"`);
    }
    if (m.rarity === 'Special' && !/Advanced|Sunpoint/.test(m.tool || '')) {
      problems.push(`${m.name}: special-tier gems need the Advanced Nosam Cutter or Sunpoint Plasma Drill`);
    }
  }
}

/* ------------------------------ Lauf ------------------------------ */

const starChart = await loadStarChart();
checkNodes(starChart);
checkVeins();

const known = await loadCatalogPaths();
if (known) checkPaths(known);
else warnings.push('data/catalog.json is missing — skipped the uniqueName check. Start the app once to build it.');

console.log(`Checked ${RESOURCE_GUIDES.length} resources and ${MINING_RESOURCES.length} mining entries.`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const p of problems) console.log(`  FAIL  ${p}`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(warnings.length ? `\nNo problems, ${warnings.length} warning(s).` : '\nAll clear.');
