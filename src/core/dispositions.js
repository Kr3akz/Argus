/**
 * Dispositionen frisch halten - fuer die Riven-Werte.
 *
 * WARUM NICHT EINFACH AUS DEM KATALOG:
 *   Der Katalog-Cache (catalog.js) wird einmal geschrieben und danach nicht
 *   mehr erneuert. Fuer Namen und Bilder reicht das. Fuer Rivens nicht: DE
 *   verschiebt Dispositionen immer wieder, und jede Verschiebung aendert jede
 *   Zahl auf der Karte. Am 2026-09-29 gemessen: Galariak Prime stand im Cache
 *   vom 20.08. auf 0,8 und im aktuellen Export auf 0,9. Kaans Karte zeigt die
 *   Werte fuer 0,9: +14% Slide-Crit statt der +12,5%, die 0,8 ergaebe.
 *
 * WAS HIER PASSIERT:
 *   Nur ExportWeapons, daraus nur uniqueName -> [Name, Disposition], als
 *   kleine Datei neben dem Katalog. Hoechstens einmal am Tag frisch geholt.
 *   Faellt der Abruf aus, gilt der letzte Stand - und ohne den der Katalog.
 *   Der Name kommt mit, damit auch eine Waffe aufgeloest wird, die nach dem
 *   Katalog-Cache erschienen ist.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './paths.js';
import { fetchExport } from './catalog.js';

const FILE = 'dispositions.json';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/* Nach einem gescheiterten Abruf nicht bei jedem Oeffnen des Reiters wieder
   ins Netz: ohne Verbindung waere das jedes Mal eine Wartezeit vor der Liste. */
const RETRY_MS = 60 * 60 * 1000;

let memo = null;        // { fetchedAt, weapons: { uniqueName: [name, disposition] } }
let lastAttempt = 0;
let inflight = null;

/**
 * Der aktuelle Stand, bei Bedarf frisch geholt.
 *
 * @returns {Promise<{fetchedAt, weapons} | null>}  null nur, wenn es weder
 *          eine Datei noch einen gelungenen Abruf gibt.
 */
export async function loadDispositions({ dataDir = defaultDataDir(), force = false } = {}) {
  if (!memo) {
    const file = path.join(dataDir, FILE);
    if (existsSync(file)) {
      try { memo = JSON.parse(await readFile(file, 'utf8')); } catch { memo = null; }
    }
  }

  const fresh = memo && Date.now() - (memo.fetchedAt || 0) < MAX_AGE_MS;
  if (!force && (fresh || Date.now() - lastAttempt < RETRY_MS)) return memo;

  /* Mehrere Aufrufer zugleich teilen sich einen Abruf. */
  if (!inflight) {
    lastAttempt = Date.now();
    inflight = (async () => {
      try {
        const weapons = {};
        for (const w of await fetchExport('ExportWeapons')) {
          if (w.uniqueName && w.omegaAttenuation != null) weapons[w.uniqueName] = [w.name, w.omegaAttenuation];
        }
        const next = { fetchedAt: Date.now(), weapons };
        await mkdir(dataDir, { recursive: true });
        await writeFile(path.join(dataDir, FILE), JSON.stringify(next));
        memo = next;
      } catch (err) {
        console.warn('[Dispositions] Abruf fehlgeschlagen, es gilt der letzte Stand:', err.message);
      } finally {
        inflight = null;
      }
      return memo;
    })();
  }
  return inflight;
}
