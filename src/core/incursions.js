/**
 * Steel Path Incursions - die sechs Missionen von heute und die von morgen.
 *
 * WARUM NICHT AUS DEM WELTZUSTAND:
 *   warframestat.us meldet zu den Incursions nur einen Zeitraum
 *   (`steelPath.incursions`: Kennung "spi:<Beginn>", Beginn 0:00 UTC, Ende
 *   23:59:59) - welche Knoten drankommen, steht nirgends darin.
 *
 * WOHER DER PLAN KOMMT:
 *   Die Knoten stehen wie bei den Arbitrationen lange im Voraus fest. Ein
 *   oeffentlicher Plan fuehrt sie als Textdatei, eine Zeile je Tag:
 *   "1790812800;SettlementNode20,SolNode404,..." - Beginn in Sekunden seit
 *   1970, dann sechs Knotenkennungen. Am 2026-10-01 reichte die Datei bis
 *   2028-09 und deckte sich im Beginn mit der Kennung aus dem Weltzustand
 *   (spi:1790812800000). Ob die Knoten selbst stimmen, laesst sich nur im
 *   Spiel pruefen.
 *
 * WAS DAVON AUF DIE PLATTE KOMMT:
 *   Nur die naechsten 60 Tage. Die Datei ist klein (rund 110 KB), aber mehr
 *   braucht niemand, und lange vorher (TTL eine Woche) kommt ohnehin ein
 *   frischer Stand.
 *
 * Missionstyp und Gegner kommen wie bei den Arbitrationen ueber die
 * Knotenkennung aus core/solnodes.js.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const URL = 'https://browse.wf/sp-incursions.txt';
const CACHE = () => dataFile('incursions.json');
const TAG = 24 * 60 * 60 * 1000;
const TTL_MS = 7 * TAG;
const KEEP_MS = 60 * TAG;

let plan = null;   // [{ start: ms, nodes: ['SolNode27', ...] }], aufsteigend

/**
 * Die Textdatei in Eintraege. Was nicht wie "Zahl;Kennung,Kennung,..."
 * aussieht, wird uebersprungen statt den ganzen Plan zu verwerfen.
 */
export function parseIncursionText(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(\d{9,11})\s*;\s*([A-Za-z]+\d+(?:\s*,\s*[A-Za-z]+\d+)*)\s*$/.exec(line);
    if (m) out.push({ start: Number(m[1]) * 1000, nodes: m[2].split(',').map(s => s.trim()) });
  }
  return out.sort((a, b) => a.start - b.start);
}

/* Ab dem laufenden Tag, und davon die naechsten 60 Tage. */
function beschneiden(entries, now = Date.now()) {
  return entries.filter(e => e.start + TAG > now && e.start < now + KEEP_MS);
}

async function readCache() {
  if (!existsSync(CACHE())) return null;
  try { return JSON.parse(await readFile(CACHE(), 'utf8')); } catch { return null; }
}

/**
 * Der Plan aus dem Cache oder frisch - dieselben Regeln wie beim
 * Arbitrations-Plan: aelter als eine Woche oder weniger als zwei Wochen
 * Vorlauf, dann neu. Scheitert der Abruf, gilt der alte Stand.
 */
export async function loadIncursionSchedule({ refresh = false, now = Date.now() } = {}) {
  if (!plan) {
    const cached = await readCache();
    if (Array.isArray(cached?.entries)) {
      plan = cached.entries;
      plan.fetchedAt = cached.fetchedAt || 0;
    }
  }

  const fetchedAt = plan?.fetchedAt ?? 0;
  const letzter = plan?.length ? plan[plan.length - 1].start : 0;
  const faellig = refresh || !plan?.length || now - fetchedAt > TTL_MS || letzter - now < 14 * TAG;
  if (!faellig) return plan;

  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'Argus/2.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entries = beschneiden(parseIncursionText(await res.text()), now);
    if (!entries.length) throw new Error('leerer Plan');

    await mkdir(path.dirname(CACHE()), { recursive: true });
    await writeFile(CACHE(), JSON.stringify({ fetchedAt: now, entries }));
    plan = entries;
    plan.fetchedAt = now;
  } catch (err) {
    console.warn('[Incursions] Plan nicht geladen:', err.message);
    if (plan) plan.stale = err.message;
  }
  return plan || [];
}

/**
 * Der laufende Tag und der naechste, jeweils mit aufgeloesten Knoten.
 *
 * Ein Satz gilt genau einen Tag ab seinem Eintrag. Ein Eintrag, der nicht
 * auf den laufenden Tag faellt, wird nicht als "heute" ausgegeben - lieber
 * keine Liste als die von gestern.
 */
export function incursionWindow(entries, { now = Date.now(), info = () => null } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const mit = e => ({
    activation: new Date(e.start).toISOString(),
    expiry: new Date(e.start + TAG).toISOString(),
    missions: e.nodes.map(id => {
      const n = info(id) || {};
      return { node: id, name: n.name || id, type: n.type || null, enemy: n.enemy || null };
    })
  });
  const heute = list.find(e => e.start <= now && now < e.start + TAG);
  const morgen = list.find(e => e.start > now && e.start <= now + TAG);
  return { today: heute ? mit(heute) : null, tomorrow: morgen ? mit(morgen) : null };
}
