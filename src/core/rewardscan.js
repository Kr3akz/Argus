/**
 * Liest die Belohnungsnamen vom Auswahlbildschirm.
 *
 * WARUM UEBERHAUPT VOM BILDSCHIRM:
 *   Warframes EE.log protokolliert nur den EIGENEN Fund. Die drei Funde der
 *   Mitspieler kommen ueber das Netz an, aber nie mit Item. Wer alle vier
 *   Namen will, muss sie dort lesen, wo sie stehen.
 *
 * WARUM DAS TROTZ TEXTERKENNUNG ZUVERLAESSIG IST:
 *   Nicht der erkannte Text zaehlt, sondern der Abgleich gegen die Menge der
 *   moeglichen Belohnungen - rund 600 Namen aus DEs Droptabellen. Aus einem
 *   verlesenen "kris Grip" wird so wieder "Paris Prime Grip". Erkannt werden
 *   muss nur genug, um im Kandidatenfeld eindeutig zu sein.
 *
 * NACHGEMESSEN (2560x1440, deutsche Windows-Erkennung, englischer Client):
 *   Alle vier Namen fehlerfrei gelesen, Aufnahme und Erkennung in 1,3 s -
 *   von 15 Sekunden Bedenkzeit.
 *
 * WAS AUFGENOMMEN WIRD:
 *   Ein Bild des Hauptbildschirms, das nach der Erkennung geloescht wird.
 *   Es verlaesst den Rechner nicht.
 */
import { execFile } from 'node:child_process';
import { readFile, unlink, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { dataFile, resourceFile } from './paths.js';

const run = promisify(execFile);

const SCRIPT  = () => resourceFile('tools', 'ocr-capture.ps1');
const TMP_DIR = () => dataFile('ocr');

/* Ab hier gilt ein unscharfer Treffer als derselbe Name. 0.72 laesst rund ein
   Viertel der Zeichen daneben liegen - genug fuer verlesene Buchstaben, zu
   wenig, um zwei verschiedene Prime-Teile zu verwechseln. */
const FUZZY_MIN = 0.72;

/* Die vier Namen stehen auf einer Hoehe. Alles, was weiter entfernt liegt,
   gehoert zu etwas anderem auf dem Bildschirm. */
const ROW_TOLERANCE_PX = 60;

const normalise = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Levenshtein-Abstand, iterativ mit einer Zeile Speicher. */
function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

const similarity = (a, b) => {
  const max = Math.max(a.length, b.length);
  return max ? 1 - distance(a, b) / max : 0;
};

/**
 * Erkannte Zeile -> bekannter Belohnungsname.
 * index ist eine Map normalisiert -> Anzeigename.
 */
export function matchReward(text, index) {
  const key = normalise(text);
  if (!key || key.length < 4) return null;

  const exact = index.get(key);
  if (exact) return { name: exact, score: 1 };

  let best = null;
  for (const [candidate, display] of index) {
    /* Grober Vorfilter: Namen mit stark abweichender Laenge koennen den
       Schwellwert ohnehin nicht erreichen, und der Abstand kostet Zeit. */
    if (Math.abs(candidate.length - key.length) > key.length * 0.35) continue;
    const score = similarity(key, candidate);
    if (score >= FUZZY_MIN && (!best || score > best.score)) best = { name: display, score };
  }
  return best;
}

/** Aus einer Liste von Belohnungsnamen den Suchindex bauen. */
export function buildRewardIndex(names) {
  const index = new Map();
  for (const name of names) {
    const key = normalise(name);
    if (key) index.set(key, name);
  }
  return index;
}

/**
 * Wertet ein OCR-Ergebnis aus: welche Zeilen sind Belohnungen, und in welcher
 * Reihenfolge stehen sie auf dem Bildschirm?
 *
 * Getrennt vom Aufnehmen, damit sich die Zuordnung an einer gespeicherten
 * Aufnahme pruefen laesst, ohne das Spiel zu starten.
 */
export function extractRewards(ocr, index) {
  const hits = [];
  for (const line of ocr.lines || []) {
    const hit = matchReward(line.text, index);
    if (!hit) continue;

    /* Der ganze Rahmen der Zeile, nicht nur das erste Wort: darunter soll
       spaeter ein Preisschild sitzen, und das gehoert unter die Mitte des
       Namens - nicht unter dessen linken Rand. */
    const words = line.words || [];
    if (!words.length) continue;
    const x = Math.min(...words.map(w => w.x));
    const y = Math.min(...words.map(w => w.y));
    const right = Math.max(...words.map(w => w.x + w.w));
    const bottom = Math.max(...words.map(w => w.y + w.h));

    hits.push({ ...hit, x, y, w: right - x, h: bottom - y });
  }

  /* Nach Zeilen gruppieren und die groesste Gruppe nehmen: ein Prime-Name kann
     auch anderswo auf dem Bildschirm stehen - im Arsenal, im Chat -, aber die
     Belohnungen stehen zu viert nebeneinander auf einer Hoehe. */
  let best = [];
  for (const hit of hits) {
    const row = hits.filter(h => Math.abs(h.y - hit.y) <= ROW_TOLERANCE_PX);
    if (row.length > best.length) best = row;
  }

  const rewards = best
    .sort((a, b) => a.x - b.x)
    .slice(0, 4)
    .map((h, i) => ({
      position: i + 1, name: h.name, score: h.score,
      /* Bildschirmkoordinaten in echten Pixeln, wie aufgenommen. Die
         Umrechnung in Fensterkoordinaten passiert dort, wo die
         Bildschirmskalierung bekannt ist - im Hauptprozess. */
      box: { x: h.x, y: h.y, w: h.w, h: h.h }
    }));

  /* Die Nummer stimmt nur, wenn alle vier gelesen wurden.
     Sie entsteht aus der Reihenfolge der TREFFER von links nach rechts - fehlt
     die erste Karte, wird aus der zweiten eine Eins, und die Nummer zeigt auf
     die falsche Karte. Wer sie anzeigt, muss das wissen. */
  return { rewards, complete: best.length >= 4,
           language: ocr.language, lines: (ocr.lines || []).length, region: ocr.region || null };
}

/**
 * Nimmt den Bildschirm auf und gibt die gefundenen Belohnungen zurueck,
 * sortiert wie sie auf dem Bildschirm stehen: von links nach rechts.
 */
export async function scanRewardScreen(index, { keepImage = false } = {}) {
  const stamp = Date.now();
  const png  = path.join(TMP_DIR(), `scan-${stamp}.png`);
  const json = path.join(TMP_DIR(), `scan-${stamp}.json`);

  await mkdir(TMP_DIR(), { recursive: true });

  try {
    /* ARGUS_SCAN_IMAGE wertet ein vorhandenes Bild aus, statt den Bildschirm
       aufzunehmen - fuer Tests ohne laufendes Spiel. */
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass',
                  '-File', SCRIPT(), '-Png', png, '-Json', json];
    if (process.env.ARGUS_SCAN_IMAGE) args.push('-Source', process.env.ARGUS_SCAN_IMAGE);

    await run('powershell', args, { windowsHide: true, timeout: 12000 });

    /* PowerShell schreibt UTF-8 gern mit BOM - JSON.parse bricht daran ab. */
    const res = JSON.parse((await readFile(json, 'utf8')).replace(/^\uFEFF/, ''));
    if (!res.ok) return { ok: false, error: res.error || 'OCR fehlgeschlagen' };

    return { ok: true, ...extractRewards(res, index) };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    /* Das Bild hat seinen Zweck erfuellt. Bildschirmfotos sammeln sich sonst
       zu Gigabyte an - und niemand hat darum gebeten, sie aufzubewahren. */
    if (!keepImage) {
      await unlink(png).catch(() => {});
      await unlink(json).catch(() => {});
    }
  }
}
