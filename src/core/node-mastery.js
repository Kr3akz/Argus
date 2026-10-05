/**
 * Mastery je Knoten der Sternenkarte.
 *
 * WARUM EINE EIGENE TABELLE:
 *   Bis 1.24.1 zaehlte jeder abgeschlossene Knoten pauschal 100 MR-XP. Das
 *   trifft auf keinen zu: DE vergibt je Knoten einen festen Wert zwischen 3
 *   und 279, und rund die Haelfte aller Knoten gibt gar nichts. In DEs
 *   oeffentlichem Export (ExportRegions) fehlt dieses Feld. Eine erweiterte
 *   Fassung desselben Exports, aus den Spieldateien gezogen, fuehrt es als
 *   `masteryExp` - daraus stammt die Tabelle.
 *
 * GEGENPROBE (05.10.2026, Kaans Konto, MR 30):
 *   Das Spiel nannte 128.762 MR-XP bis MR 31, also 2.268.738 insgesamt. Mit
 *   dieser Tabelle kommt Argus auf genau diese Zahl (Rechnung in mastery.js,
 *   starChartXP). Die Knoten tragen 23.238 bei - und die Endziffern 38 kann
 *   nur diese Tabelle liefern, weil Items, Junctions und Intrinsics allesamt
 *   in Hundertern zaehlen.
 *
 * JUNCTIONS:
 *   stehen mit masteryExp 0 in der Tabelle, geben im Spiel aber 1.000 (siehe
 *   mastery.js). Hier wird nur vermerkt, welche Knoten Junctions sind.
 *
 * WAS AUF DIE PLATTE KOMMT:
 *   Nur Knoten mit Mastery und die Liste der Junctions, ein paar KB statt der
 *   470 KB der Quelle. Neue Knoten kommen nur mit grossen Updates; eine Woche
 *   Frist reicht, und ein alter Stand ist deutlich besser als keiner.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const URL = 'https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/senpai/ExportRegions.json';
const CACHE = () => dataFile('node-mastery.json');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/* Unter diesen Zahlen ist die Datei abgeschnitten oder umgebaut. Am
   05.10.2026 standen darin 354 Knoten, 169 davon mit Mastery, 13 Junctions. */
const MIN_NODES = 100;
const MIN_JUNCTIONS = 10;

/* main.js fragt bei jedem Neuaufbau des Dashboards nach (jeder Klick auf ein
   Ziel). Ohne Tabelle und ohne Netz darf das nicht jedes Mal acht Sekunden
   auf einen Abruf warten - also erst nach dieser Pause ein neuer Versuch. */
const RETRY_MS = 10 * 60 * 1000;

let table = null;   // { nodes: Map(Kennung -> XP), junctions: Set(Kennung), fetchedAt, stale? }
let failedAt = 0;

/**
 * Die Quelldatei in die Form, die auf die Platte kommt.
 *
 * Wirft, wenn sie nicht nach einer Knotentabelle aussieht - dann soll der
 * alte Stand bleiben, statt dass jeder Knoten still auf 0 faellt.
 */
export function parseRegions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('keine Knotentabelle');
  const nodes = {};
  const junctions = [];
  let gelesen = 0;
  for (const [tag, node] of Object.entries(raw)) {
    if (!node || typeof node !== 'object') continue;
    if (node.missionType === 'MT_JUNCTION') { junctions.push(tag); continue; }
    if (typeof node.masteryExp !== 'number') continue;
    gelesen++;
    if (node.masteryExp > 0) nodes[tag] = node.masteryExp;
  }
  if (gelesen < MIN_NODES || junctions.length < MIN_JUNCTIONS) {
    throw new Error(`unvollstaendig: ${gelesen} Knoten, ${junctions.length} Junctions`);
  }
  return { nodes, junctions };
}

function build(saved, fetchedAt) {
  return {
    nodes: new Map(Object.entries(saved.nodes || {})),
    junctions: new Set(saved.junctions || []),
    fetchedAt
  };
}

async function readCache() {
  if (!existsSync(CACHE())) return null;
  try { return JSON.parse(await readFile(CACHE(), 'utf8')); } catch { return null; }
}

/**
 * Die Tabelle, aus dem Cache oder frisch - oder null, wenn es keine gibt.
 *
 * null heisst nicht "kein Knoten gibt Mastery", sondern "unbekannt": die
 * Rechnung zaehlt die Knoten dann mit 0 und weist die Summe als Untergrenze
 * aus. Scheitert der Abruf, gilt der alte Stand, auch ein abgelaufener.
 */
export async function loadNodeMastery({ refresh = false } = {}) {
  if (table && !refresh) return table;
  if (!refresh && Date.now() - failedAt < RETRY_MS) return null;

  const cached = await readCache();
  if (cached?.nodes && !refresh && Date.now() - (cached.fetchedAt || 0) < TTL_MS) {
    table = build(cached, cached.fetchedAt);
    return table;
  }

  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'Argus/2.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const saved = parseRegions(await res.json());
    const fetchedAt = Date.now();

    await mkdir(path.dirname(CACHE()), { recursive: true });
    await writeFile(CACHE(), JSON.stringify({ fetchedAt, ...saved }));
    table = build(saved, fetchedAt);
  } catch (err) {
    if (!cached?.nodes) {
      console.warn('[Knoten-Mastery] keine Tabelle:', err.message);
      failedAt = Date.now();
      return null;
    }
    table = build(cached, cached.fetchedAt);
    table.stale = err.message;
  }
  return table;
}
