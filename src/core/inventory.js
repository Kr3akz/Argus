/**
 * Inventar aus dem laufenden Spielprozess - ohne einen Aufruf bei Digital Extremes.
 *
 * WAS HIER FRUEHER STAND:
 *   Ein authentifizierter Abruf von api.warframe.com/api/inventory.php, mit
 *   accountId und dem Session-nonce aus dem Prozessspeicher in der URL. Das war
 *   der einzige Punkt, an dem Argus die Client-Kommunikation gegenueber DEs
 *   eigener API nachahmte - untersagt vom EULA-Wortlaut, fuer DE serverseitig
 *   sichtbar, und Ausloeser einer IP-Drosselung, die den SPIEL-Login blockiert
 *   hat. Dazu kam der ganze Apparat dagegen: Mindestabstaende, Sperrfristen,
 *   ein gemeinsames Budget mit dem Profil, und die Disziplin, eine URL mit
 *   Zugangsdaten nirgends zu protokollieren.
 *
 * WAS STATTDESSEN PASSIERT:
 *   Der Client haelt sein Inventar ohnehin im Klartext im Heap. inventory-scan.js
 *   liest es dort. Damit entfaellt der Aufruf, der nonce, die Drosselung und die
 *   Geheimhaltung - es gibt nichts mehr zu verbergen.
 *
 * WAS DAS KOSTET:
 *   Der Blob liegt nur nach einem Zonenwechsel im Speicher - Dojo oder Relais
 *   und zurueck aufs Schiff, oder ein frischer Login. Ohne das findet der Scan
 *   nichts und der Zwischenspeicher bleibt stehen. Dieselbe Einschraenkung
 *   dokumentiert AlecaFrame fuer sich.
 *
 * ALLES ODER NICHTS:
 *   Im Heap liegen neben der vollstaendigen Kopie auch angeschnittene Reste.
 *   inventory-scan.js prueft deshalb auf Vollstaendigkeit und meldet 'incomplete'
 *   statt ein halbes Inventar zu liefern. Hier wird daraus ein Fehler, und der
 *   Zwischenspeicher bleibt unangetastet - ein Bestand, in dem stillschweigend
 *   die Haelfte der Mods fehlt, waere schlimmer als ein alter Stand.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './paths.js';
import { scanInventoryInWorker } from './inventory-scan.js';

const CACHE = 'inventory.json';

async function readFixture(file, source) {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    return { ...raw, source: raw.source || source };
  } catch {
    return null;   // Beschaedigte Datei wie "nicht vorhanden" behandeln
  }
}

/**
 * Der lokale Stand, sonst nichts.
 *
 * source bleibt am Ergebnis, damit die Oberflaeche zeigen kann, wie alt der
 * Stand ist. Bestehende Dateien tragen 'api' - sie stammen aus dem alten
 * Abruf und sind inhaltlich gleichwertig; neue tragen 'memory'.
 */
async function readCache(dataDir) {
  return await readFixture(path.join(dataDir, CACHE), 'api');
}

/**
 * Inventar laden. Standardmaessig NUR aus der lokalen Datei.
 *
 * Ein Speicherscan passiert ausschliesslich mit refresh:true - auf ausdrueckliche
 * Nutzeraktion oder wenn der Log-Beobachter eine Rueckkehr aufs Schiff meldet.
 *
 * force wird nur noch entgegengenommen, damit die Aufrufer unveraendert bleiben.
 * Es steuerte den Mindestabstand zwischen zwei API-Abrufen; ohne API gibt es
 * nichts mehr zu drosseln, denn der Scan belastet niemanden ausser der eigenen
 * CPU.
 */
export async function loadInventory({ dataDir = defaultDataDir(), refresh = false,
                                      force = false } = {}) {   // eslint-disable-line no-unused-vars
  await mkdir(dataDir, { recursive: true });
  const cacheFile = path.join(dataDir, CACHE);
  const cached = await readCache(dataDir);

  if (!refresh) {
    if (cached) return { inventory: cached.inventory, fromCache: true,
                         fetchedAt: cached.fetchedAt, source: cached.source };
    throw new Error('No inventory data yet. Start Warframe, log in, travel to a relay '
                  + 'and back to your ship, then press "Fetch inventory" once.');
  }

  const res = await scanInventoryInWorker();

  if (!res.ok) {
    /* Kein Fund und ein alter Stand vorhanden: den behalten und den Grund
       mitgeben, statt die Oberflaeche leerzuraeumen. Dasselbe Muster, das
       frueher die Drosselung benutzt hat. */
    if (cached) {
      return { inventory: cached.inventory, fromCache: true, fetchedAt: cached.fetchedAt,
               source: cached.source, skipped: res.code, message: res.message };
    }
    throw Object.assign(new Error(res.message), { code: res.code, stats: res.stats });
  }

  const fetchedAt = Date.now();
  await writeFile(cacheFile, JSON.stringify({ fetchedAt, inventory: res.inventory,
                                              source: 'memory' }));
  return { inventory: res.inventory, fromCache: false, fetchedAt,
           source: 'memory', stats: res.stats };
}

/** Stand der lokalen Daten: wann geholt und woher. null, wenn nichts da ist. */
export async function inventoryAge({ dataDir = defaultDataDir() } = {}) {
  const cached = await readCache(dataDir);
  return cached ? { fetchedAt: cached.fetchedAt, source: cached.source } : null;
}
