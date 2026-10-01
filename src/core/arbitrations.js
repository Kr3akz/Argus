/**
 * Arbitrationen - die laufende und die naechsten.
 *
 * WARUM NICHT AUS DEM WELTZUSTAND:
 *   warframestat.us fuehrt das Feld `arbitration` noch, aber es ist tot.
 *   Nachgesehen am 2026-10-01: Knoten "SolNode000", Gegner "Tenno", Typ
 *   "Unknown", Beginn 1970, `expired: true`. Die Oberflaeche zeigte deshalb
 *   seit Monaten keine einzige Arbitration, und niemandem fiel es auf - eine
 *   leere Liste sieht aus wie "gerade keine".
 *
 * WOHER DER PLAN KOMMT:
 *   Arbitrationen wechseln stuendlich zur vollen Stunde, und welcher Knoten
 *   drankommt, steht lange im Voraus fest. Ein oeffentlicher Plan fuehrt das
 *   als Textdatei, eine Zeile je Stunde: "1790859600,SolNode302" - Beginn in
 *   Sekunden seit 1970, dann die Knotenkennung. Die Datei reicht Jahre in die
 *   Zukunft (am 2026-10-01: bis 2029-10) und ist knapp 1 MB gross.
 *
 * WAS DAVON AUF DIE PLATTE KOMMT:
 *   Nur die naechsten 60 Tage, rund 1 400 Zeilen. Der Rest wird erst
 *   gebraucht, wenn diese verbraucht sind - und lange vorher (TTL eine Woche)
 *   holt Argus ohnehin einen frischen Stand.
 *
 * WAS NICHT DARIN STEHT:
 *   Missionstyp und Gegner. Die kommen ueber die Knotenkennung aus derselben
 *   Tabelle, die schon die Risse aufloest (core/solnodes.js).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const URL = 'https://browse.wf/arbys.txt';
const CACHE = () => dataFile('arbitrations.json');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP_MS = 60 * 24 * 60 * 60 * 1000;
const STUNDE = 60 * 60 * 1000;

let plan = null;   // [{ start: ms, node: 'SolNode302' }], aufsteigend

/**
 * Die Textdatei in Eintraege. Was nicht wie "Zahl,Kennung" aussieht, wird
 * uebersprungen statt den ganzen Plan zu verwerfen.
 */
export function parseArbitrationText(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(\d{9,11})\s*,\s*([A-Za-z]+\d+)\s*$/.exec(line);
    if (m) out.push({ start: Number(m[1]) * 1000, node: m[2] });
  }
  return out.sort((a, b) => a.start - b.start);
}

/* Nur was ab der laufenden Stunde noch kommt, und davon die naechsten 60 Tage. */
function beschneiden(entries, now = Date.now()) {
  const ab = now - STUNDE;
  return entries.filter(e => e.start >= ab && e.start < now + KEEP_MS);
}

async function readCache() {
  if (!existsSync(CACHE())) return null;
  try { return JSON.parse(await readFile(CACHE(), 'utf8')); } catch { return null; }
}

/**
 * Der Plan aus dem Cache oder frisch.
 *
 * Frisch geholt wird, wenn der Cache aelter als eine Woche ist ODER weniger
 * als zwei Wochen Vorlauf hat. Scheitert der Abruf, gilt der alte Stand - ein
 * Plan veraltet nicht, er wird nur kuerzer.
 */
export async function loadArbitrationSchedule({ refresh = false, now = Date.now() } = {}) {
  if (!plan) {
    const cached = await readCache();
    if (Array.isArray(cached?.entries)) {
      plan = cached.entries;
      plan.fetchedAt = cached.fetchedAt || 0;
    }
  }

  const fetchedAt = plan?.fetchedAt ?? 0;
  const letzter = plan?.length ? plan[plan.length - 1].start : 0;
  const faellig = refresh || !plan?.length || now - fetchedAt > TTL_MS || letzter - now < 14 * 24 * STUNDE;
  if (!faellig) return plan;

  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'Argus/2.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entries = beschneiden(parseArbitrationText(await res.text()), now);
    if (!entries.length) throw new Error('leerer Plan');

    await mkdir(path.dirname(CACHE()), { recursive: true });
    await writeFile(CACHE(), JSON.stringify({ fetchedAt: now, entries }));
    plan = entries;
    plan.fetchedAt = now;
  } catch (err) {
    console.warn('[Arbitration] Plan nicht geladen:', err.message);
    if (plan) plan.stale = err.message;
  }
  return plan || [];
}

/**
 * Die laufende Arbitration und die naechsten `hours` Stunden.
 *
 * Eine Arbitration laeuft genau eine Stunde, von ihrem Eintrag bis zum
 * naechsten. Fehlt ein Eintrag (Luecke im Plan), endet die laufende trotzdem
 * nach einer Stunde - laenger als das wurde nie eine gefuehrt.
 */
export function arbitrationWindow(entries, { now = Date.now(), hours = 24, info = () => null } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const mit = (e, i) => {
    const naechster = list[i + 1];
    const ende = naechster && naechster.start - e.start <= STUNDE ? naechster.start : e.start + STUNDE;
    const n = info(e.node) || {};
    return {
      node: e.node,
      name: n.name || e.node,
      type: n.type || null,
      enemy: n.enemy || null,
      activation: new Date(e.start).toISOString(),
      expiry: new Date(ende).toISOString()
    };
  };

  let current = null;
  const upcoming = [];
  list.forEach((e, i) => {
    const eintrag = () => mit(e, i);
    if (e.start <= now && now < e.start + STUNDE && (!list[i + 1] || list[i + 1].start > now)) {
      current = eintrag();
    } else if (e.start > now && e.start <= now + hours * STUNDE) {
      upcoming.push(eintrag());
    }
  });
  return { current, upcoming };
}
