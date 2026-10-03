/**
 * Was Argus darueber gelernt hat, wie DEs Kennungen im Weltzustand heissen.
 *
 * DEs Rohform nennt einen Kopfgeld-Auftrag ".../Eidolon/Jobs/CaptureBountyCapTwo",
 * gemeint ist "Spy Catcher". Den Namen kennt nur warframestat.us - und zwar
 * genau dann nicht, wenn es hinterherhaengt und man ihn braucht. Deshalb
 * merkt sich Argus jedes Paar, das beide Quellen einmal gemeinsam gefuehrt
 * haben (siehe mergeDeWorldState in core/worldstate-de.js). Die Toepfe sind
 * fest - Kopfgelder, Sortie-Bedingungen, Nightwave-Akte kehren wieder -, und
 * nach ein paar Tagen ist fast alles einmal vorbeigekommen.
 *
 * Eine Datei, die fehlt oder kaputt ist, kostet nur Namen: dann stehen fuer
 * eine Weile Notnamen da, bis die Paare neu gelernt sind.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { dataFile } from './paths.js';

const DATEI = () => dataFile('world-names.json');

let buch = null;

/** Das Gelernte, { art: { kennung: wert } }. Einmal von der Platte, danach aus dem Speicher. */
export async function loadWorldNames() {
  if (buch) return buch;
  try {
    const gelesen = JSON.parse(await readFile(DATEI(), 'utf8'));
    buch = gelesen && typeof gelesen === 'object' && !Array.isArray(gelesen) ? gelesen : {};
  } catch {
    buch = {};
  }
  return buch;
}

/**
 * Neue Paare uebernehmen und, wenn sich etwas geaendert hat, speichern.
 * @param learned  [[art, kennung, wert], ...]
 * @returns Zahl der neuen oder geaenderten Eintraege
 */
export async function rememberWorldNames(learned) {
  if (!learned?.length) return 0;
  const b = await loadWorldNames();
  let neu = 0;
  for (const [art, key, value] of learned) {
    const fach = b[art] || (b[art] = {});
    if (JSON.stringify(fach[key]) === JSON.stringify(value)) continue;
    fach[key] = value;
    neu++;
  }
  if (neu) {
    await mkdir(path.dirname(DATEI()), { recursive: true });
    await writeFile(DATEI(), JSON.stringify(b));
  }
  return neu;
}
