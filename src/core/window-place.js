/**
 * Wo das Hauptfenster beim Start aufgeht - aus der gemerkten Lage und den
 * Bildschirmen, die gerade angeschlossen sind.
 *
 * Eigenes Modul ohne Electron, damit sich die Entscheidung mit erfundenen
 * Bildschirmen pruefen laesst (src/cli/window-test.js). Gemerkt und
 * geschrieben wird in main.js.
 *
 * DIE REGEL: die gemerkte Lage gilt, solange die Titelleiste auf einem
 * angeschlossenen Bildschirm liegt. Das Fenster hat keinen Rahmen - gezogen
 * wird es nur an seiner eigenen Kopfzeile. Ein Fenster, das nur noch mit dem
 * Fuss ins Bild ragt, liesse sich nicht mehr greifen; dann lieber der
 * Standardplatz. Typischer Fall: der zweite Monitor ist abgesteckt, und die
 * Lage zeigt ins Leere links neben dem Hauptbildschirm.
 *
 * Groesser als die Arbeitsflaeche des Bildschirms, auf dem die Kopfzeile
 * liegt, wird das Fenster nicht - etwa nach dem Wechsel auf einen kleineren
 * Monitor oder eine groessere Skalierung.
 */

/* Hoehe der Titelleiste (.titlebar in style.css). */
export const TITLEBAR_HEIGHT = 46;
/* So viel der Kopfzeile muss sichtbar bleiben, damit man sie sicher trifft:
   die halbe Hoehe und ein gutes Stueck Breite. */
const MIN_GRAB_WIDTH = 160;
const MIN_GRAB_HEIGHT = TITLEBAR_HEIGHT / 2;

const finite = (...v) => v.every(Number.isFinite);

/**
 * Prueft, was aus window.json kam. null, wenn es keine Lage ist - eine
 * kaputte Datei faellt auf den Standardplatz zurueck, statt den Start zu
 * verhindern.
 */
export function parseWindowState(raw) {
  const s = raw && typeof raw === 'object' ? raw : null;
  if (!s || !finite(s.x, s.y, s.width, s.height) || s.width <= 0 || s.height <= 0) return null;
  return {
    x: Math.round(s.x), y: Math.round(s.y),
    width: Math.round(s.width), height: Math.round(s.height),
    maximized: s.maximized === true
  };
}

/**
 * Die Lage, in der das Fenster aufgehen soll, oder null fuer den
 * Standardplatz.
 *
 * @param saved      aus parseWindowState
 * @param workAreas  die Arbeitsflaechen aller Bildschirme ({x, y, width,
 *                   height} in Electrons Punkten, wie screen sie liefert)
 */
export function placeWindow(saved, workAreas) {
  if (!saved || !Array.isArray(workAreas)) return null;
  for (const a of workAreas) {
    if (!a || !finite(a.x, a.y, a.width, a.height)) continue;
    const grabW = Math.min(saved.x + saved.width, a.x + a.width) - Math.max(saved.x, a.x);
    const grabH = Math.min(saved.y + TITLEBAR_HEIGHT, a.y + a.height) - Math.max(saved.y, a.y);
    if (grabW >= Math.min(MIN_GRAB_WIDTH, saved.width) && grabH >= MIN_GRAB_HEIGHT) {
      return {
        x: saved.x, y: saved.y,
        width: Math.min(saved.width, a.width),
        height: Math.min(saved.height, a.height)
      };
    }
  }
  return null;
}
