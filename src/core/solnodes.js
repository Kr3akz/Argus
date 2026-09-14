/**
 * Missionsknoten: von Warframes interner Kennung zum lesbaren Namen.
 *
 * WOZU DAS GEBRAUCHT WIRD:
 *   EE.log nennt die Mission, auf die eine Gruppe zielt, ausschliesslich ueber
 *   ihre Kennung:
 *
 *     Net [Info]: Set squad mission: {"name":"SolNode75","difficulty":0}
 *
 *   Die Rissliste aus dem Weltzustand nennt denselben Ort dagegen beim Namen
 *   ("Cervantes (Earth)"). Beide reden von derselben Mission, und ohne diese
 *   Tabelle kommen sie nicht zusammen. Mit ihr steht fest, in welchen Riss
 *   jemand gerade geht - und damit, welche Relikt-Aera er ueberhaupt einlegen
 *   kann (siehe fissureForNode).
 *
 * WARUM NICHT UEBER DEN MISSIONSTITEL AUS DEM LOG:
 *   Die Zeile daneben traegt ihn zwar ("Cached mission name=Exterminate:
 *   Techrot (Höllvania)"), aber in der SPRACHE DES SPIELS. Ein Abgleich
 *   darueber haette bei jeder anderen Spracheinstellung ins Leere gegriffen.
 *   Die Kennung ist ueberall dieselbe.
 *
 * DIE PRAEFIXE SIND NICHT ALLE "SolNode":
 *   Nachgemessen an den 30 offenen Rissen vom 14.09.2026 - SolNode75
 *   (Cervantes), SettlementNode1 (Roche) und CrewBattleNode515 (Railjack,
 *   Luckless Expanse). Wer nur auf SolNode prueft, uebersieht ein Drittel.
 *
 * QUELLE:
 *   warframestat.us, derselbe Host, aus dem auch der Weltzustand kommt - keine
 *   zusaetzliche Abhaengigkeit. 452 Eintraege, 36 KB. Die Tabelle aendert sich
 *   nur, wenn DE Knoten hinzufuegt; eine Woche Frist ist reichlich, und ein
 *   alter Stand ist hier deutlich besser als keiner.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const URL = 'https://api.warframestat.us/solNodes';
const CACHE = () => dataFile('sol-nodes.json');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

let nodes = null;   // Map: Kennung -> "Cervantes (Earth)"

function index(raw) {
  const map = new Map();
  for (const [id, entry] of Object.entries(raw || {})) {
    const name = entry?.value;
    /* Knoten ohne eigenen Namen tragen ihre Kennung als Wert ("SolNode0").
       Die koennen nichts aufloesen und stehen nur im Weg. */
    if (name && name !== id) map.set(id, name);
  }
  return map;
}

async function readCache() {
  const file = CACHE();
  if (!existsSync(file)) return null;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

/**
 * Die Tabelle, aus dem Cache oder frisch.
 *
 * Scheitert der Abruf, gilt der alte Stand - auch ein abgelaufener. Ein
 * Knotenname veraltet in Monaten, nicht in Stunden, und ohne Tabelle faellt der
 * Aera-Filter im Overlay ersatzlos aus.
 */
export async function loadSolNodes({ refresh = false } = {}) {
  if (nodes && !refresh) return nodes;

  const cached = await readCache();
  if (cached?.nodes && !refresh && Date.now() - (cached.fetchedAt || 0) < TTL_MS) {
    nodes = index(cached.nodes);
    return nodes;
  }

  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'Argus/2.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const map = index(raw);
    if (!map.size) throw new Error('leere Knotenliste');

    await mkdir(path.dirname(CACHE()), { recursive: true });
    await writeFile(CACHE(), JSON.stringify({ fetchedAt: Date.now(), nodes: raw }));
    nodes = map;
  } catch (err) {
    if (cached?.nodes) {
      nodes = index(cached.nodes);
      nodes.stale = err.message;
    } else {
      throw err;
    }
  }
  return nodes;
}

/** Lesbarer Name zu einer Knotenkennung, oder null. Ohne geladene Tabelle null. */
export function nodeName(id) {
  return (id && nodes?.get(id)) || null;
}

/**
 * Der Riss, der auf diesem Knoten laeuft.
 *
 * Verglichen wird ueber den NAMEN, weil das die einzige Angabe ist, die beide
 * Seiten fuehren: die Rissliste kennt keine Kennungen, das Log keine Namen.
 * Nachgemessen trafen damit alle 30 offenen Risse.
 *
 * null heisst "kein Riss auf diesem Knoten" - eine ganz normale Mission also,
 * und dann gibt es auch nichts zu filtern.
 */
export function fissureForNode(id, fissures) {
  const name = nodeName(id);
  if (!name || !Array.isArray(fissures)) return null;
  return fissures.find(f => f.node === name) || null;
}
