/**
 * Import von Builds aus overframe.gg.
 *
 * ACHTUNG - undokumentierte Schnittstelle:
 *   /api/v1/builds/<id>/ ist keine offizielle API. Sie liefert die Mod-Slots, aber
 *   nur mit Overframe-internen Mod-IDs; ein oeffentliches Mapping auf Mod-Namen
 *   existiert nicht (alle /api/v1/mods/-Varianten antworten mit 404). Die Namen
 *   entstehen erst beim Rendern im Browser.
 *
 *   Deshalb: Namen werden einmalig aus der gerenderten Seite gelesen und als
 *   Mapping gespeichert. Bekannte IDs brauchen danach keinen Seitenaufruf mehr.
 *   Bricht Overframe die Struktur, faellt nur der Import aus - alles andere im
 *   Tool laeuft weiter.
 *
 * Nur lesende GET-Anfragen, kein Login, keine Zugangsdaten.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dataDir, dataFile } from './paths.js';

const MAP_FILE = () => dataFile('overframe-mods.json');
export const USER_AGENT = 'Argus/0.1 (persoenlicher Mastery-Planer)';

/** Build-ID aus einer Overframe-URL oder blanken Zahl. */
export function parseBuildId(input) {
  const s = String(input || '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/overframe\.gg\/build\/(\d+)/i);
  return m ? Number(m[1]) : null;
}

export async function loadModMap() {
  if (!existsSync(MAP_FILE())) return {};
  try { return JSON.parse(await readFile(MAP_FILE(), 'utf8')); } catch { return {}; }
}

export async function saveModMap(map) {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(MAP_FILE(), JSON.stringify(map, null, 2));
}

/** Rohdaten eines Builds. */
export async function fetchBuild(buildId) {
  const res = await fetch(`https://overframe.gg/api/v1/builds/${buildId}/`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  });
  if (res.status === 404) throw new Error('Build not found.');
  if (!res.ok) throw new Error(`Overframe answered with HTTP ${res.status}.`);
  return res.json();
}

/** Item-Name aus dem locTag ableiten: /Lotus/Language/Primes/EmberPrimeName -> EmberPrime */
export function itemNameFromLocTag(locTag) {
  if (!locTag) return null;
  return locTag.split('/').pop().replace(/Name$/, '');
}

/**
 * Baut aus Overframe-Rohdaten einen Build.
 *
 * @param raw          Antwort von fetchBuild()
 * @param modMap       { [overframeModId]: modName }
 * @param modIndex     { byName } aus loadMods()
 * @param catalog      Item-Katalog fuer die Zuordnung des Items
 */
export function toBuild(raw, modMap, modIndex, catalog) {
  const itemName = itemNameFromLocTag(raw.item_data?.locTag);
  const item = itemName ? findItem(itemName, catalog) : null;

  const slots = (raw.slots || []).map(s => {
    const name = modMap[s.mod];
    const mod = name ? modIndex.byName.get(String(name).toLowerCase()) : null;

    return {
      mod: mod ? mod.uniqueName : null,
      overframeId: s.mod,
      overframeName: name || null,
      rank: s.rank ?? 0,
      // polarity_match === 2 bedeutet: Slot-Polaritaet entspricht der Mod-Polaritaet.
      // Damit brauchen wir Overframes interne Polaritaets-IDs gar nicht zu deuten.
      polarity: s.polarity_match === 2 && mod ? mod.polarity : null,
      drainFromSource: s.drain
    };
  });

  return {
    name: raw.title || 'Overframe-Build',
    itemUniqueName: item ? item.uniqueName : null,
    itemName: item ? item.name : (itemName || 'Unbekannt'),
    itemRank: raw.item_rank ?? 30,
    orokin: true,
    slots,
    source: 'overframe',
    sourceUrl: raw.url || `https://overframe.gg/build/${raw.id}/`,
    sourceId: raw.id,
    author: raw.author?.username || raw.author?.name || null,
    formaOverride: typeof raw.formas === 'number' ? raw.formas : null,
    platinumCost: raw.platinum_cost ?? null,
    endoFromSource: raw.endo_cost ?? null,
    unresolved: slots.filter(s => !s.mod).length
  };
}

/** Overframe schreibt Item-Namen ohne Leerzeichen ("EmberPrime"). */
function findItem(name, catalog) {
  const flat = name.toLowerCase();
  for (const it of catalog.items) {
    if (!it.name) continue;
    if (it.name.toLowerCase().replace(/[\s-]/g, '') === flat) return it;
  }
  return null;
}

/**
 * Welche Mod-IDs eines Builds sind noch unbekannt?
 * Nur dafuer muss die Seite ueberhaupt geladen werden.
 */
export function unknownModIds(raw, modMap) {
  return [...new Set((raw.slots || []).map(s => s.mod))].filter(id => !modMap[id]);
}

/**
 * Ordnet die aus der Seite gelesenen Namen den Slot-IDs zu.
 * Beide Listen stehen in derselben Reihenfolge - der drain-Wert bestaetigt das.
 */
export function mergeNames(raw, names, modMap) {
  const slots = raw.slots || [];
  const map = { ...modMap };
  let added = 0;

  for (let i = 0; i < Math.min(slots.length, names.length); i++) {
    const id = slots[i].mod;
    const name = names[i];
    if (id && name && !map[id]) { map[id] = name; added++; }
  }
  return { map, added };
}
