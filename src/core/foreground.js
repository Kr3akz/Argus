/**
 * Gibt den Eingabefokus gezielt an das Fenster zurueck, das ihn vorher hatte,
 * holt das Overlay nach vorn und positioniert den Mauszeiger im Fenster.
 *
 * WARUM NICHT blur():
 *   Electrons blur() reicht den Fokus an das naechste Fenster der
 *   Z-Reihenfolge weiter. Nachgemessen landete er dabei auf der Taskleiste,
 *   nicht beim Spiel. Fuer den Zeigermodus ist aber genau das der Zweck: kurz
 *   ins Overlay, etwas einstellen, ohne Klick zurueck ins Spiel.
 *
 * ZEIGERPOSITION:
 *   Warframe haelt den Hardware-Zeiger im Spiel gefangen und blendet ihn aus.
 *   Liegt die Maus nach dem Fokuswechsel ausserhalb der schmalen 380px-Spalte
 *   des Overlays (also ueber dem Spielfenster), bleibt der Zeiger unsichtbar.
 *   moveCursorIntoWindow holt ihn bei Eintritt gezielt in die obere Haelfte
 *   des Overlays, sodass Windows ihn sofort einblendet.
 *
 * UMFANG:
 *   Aufrufe auf Fensterebene ueber user32.dll, ohne Zugriff auf einen fremden
 *   Prozess und ohne jede Tastatureingabesimulation.
 *
 * AUSFALL:
 *   Ohne koffi oder ausserhalb von Windows faellt nur der native Rueck- und
 *   Vordergrundweg weg. Der Zeigermodus selbst funktioniert ueber Electrons
 *   eigene Methoden weiter. Deshalb wirft hier nichts.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let api = null;
let unavailable = false;

function user32() {
  if (api || unavailable) return api;
  try {
    const koffi = require('koffi');
    const lib = koffi.load('user32.dll');
    const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
    const RECT  = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    api = {
      GetForegroundWindow: lib.func('uint64 __stdcall GetForegroundWindow()'),
      SetForegroundWindow: lib.func('bool __stdcall SetForegroundWindow(uint64 hWnd)'),
      SetCursorPos:        lib.func('bool __stdcall SetCursorPos(int X, int Y)'),
      GetCursorPos:        lib.func('bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)'),
      GetWindowThreadProcessId: lib.func(
        'uint32 __stdcall GetWindowThreadProcessId(uint64 hWnd, _Out_ uint32 *lpdwProcessId)'),
      /* Ab hier: nur zum FINDEN des Spielfensters, siehe gameWindowRect. */
      GetTopWindow:    lib.func('uint64 __stdcall GetTopWindow(uint64 hWnd)'),
      GetWindow:       lib.func('uint64 __stdcall GetWindow(uint64 hWnd, uint32 uCmd)'),
      IsWindowVisible: lib.func('bool __stdcall IsWindowVisible(uint64 hWnd)'),
      IsIconic:        lib.func('bool __stdcall IsIconic(uint64 hWnd)'),
      GetWindowRect:   lib.func('bool __stdcall GetWindowRect(uint64 hWnd, _Out_ RECT *lpRect)'),
      GetClientRect:   lib.func('bool __stdcall GetClientRect(uint64 hWnd, _Out_ RECT *lpRect)'),
      ClientToScreen:  lib.func('bool __stdcall ClientToScreen(uint64 hWnd, _Inout_ POINT *lpPoint)')
    };
  } catch {
    unavailable = true;
  }
  return api;
}

/**
 * Prozesskennung hinter dem aktuellen Vordergrundfenster, oder null.
 *
 * Absichtlich die PID und nicht der Fenstertitel: Titel sind uebersetzt,
 * werden vom Spiel geaendert und sagen nichts darueber, WER sie geschrieben
 * hat. Die PID ist eindeutig, und wer sie mit der des Spiels vergleicht,
 * braucht keinen Zugriff auf den fremden Prozess - GetWindowThreadProcessId
 * arbeitet auf Fensterebene, genau wie alles andere in dieser Datei.
 */
export function foregroundPid() {
  if (process.platform !== 'win32') return null;
  const lib = user32();
  if (!lib) return null;
  try {
    const handle = lib.GetForegroundWindow();
    if (!handle) return null;
    const out = [0];
    lib.GetWindowThreadProcessId(handle, out);
    return out[0] || null;
  } catch {
    return null;
  }
}

/** Kennung des aktuellen Vordergrundfensters, oder null. */
export function captureForeground() {
  if (process.platform !== 'win32') return null;
  const lib = user32();
  if (!lib) return null;
  try {
    const handle = lib.GetForegroundWindow();
    return handle ? handle : null;
  } catch {
    return null;
  }
}

/** true, wenn der Fokus zurueckgereicht werden konnte. */
export function restoreForeground(handle) {
  if (!handle || process.platform !== 'win32') return false;
  const lib = user32();
  if (!lib) return false;
  try {
    return !!lib.SetForegroundWindow(handle);
  } catch {
    return false;
  }
}

/**
 * Bringt ein BrowserWindow gezielt in den Windows-Vordergrund.
 */
export function bringToForeground(win) {
  if (!win || win.isDestroyed()) return false;
  win.focus();
  if (process.platform !== 'win32') return true;
  const lib = user32();
  if (!lib) return false;
  try {
    const buf = win.getNativeWindowHandle();
    const handle = buf.readBigUInt64LE ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0);
    if (handle) return !!lib.SetForegroundWindow(handle);
  } catch {
    return false;
  }
  return false;
}

/**
 * Holt den Mauszeiger an eine Bildschirmkoordinate.
 */
export function moveCursor(x, y) {
  if (process.platform !== 'win32') return false;
  const lib = user32();
  if (!lib || !lib.SetCursorPos) return false;
  try {
    return !!lib.SetCursorPos(Math.round(x), Math.round(y));
  } catch {
    return false;
  }
}

/**
 * Positioniert den Mauszeiger innerhalb des Fensterbereichs, falls er noch ausserhalb steht.
 */
export function moveCursorIntoWindow(win) {
  if (!win || win.isDestroyed()) return false;
  const bounds = win.getBounds();
  const lib = user32();
  if (lib && lib.GetCursorPos) {
    try {
      const pt = {};
      if (lib.GetCursorPos(pt)) {
        if (pt.x >= bounds.x && pt.x <= bounds.x + bounds.width &&
            pt.y >= bounds.y && pt.y <= bounds.y + bounds.height) {
          return true;
        }
      }
    } catch {}
  }
  const targetX = bounds.x + bounds.width / 2;
  const targetY = bounds.y + Math.min(80, bounds.height / 2);
  return moveCursor(targetX, targetY);
}


/* GetWindow(hWnd, GW_HWNDNEXT): das naechste Fenster in der Z-Reihenfolge. */
const GW_HWNDNEXT = 2;

/* Kleiner als das kann ein Spielfenster nicht sein. Der Filter haelt die
   unsichtbaren Hilfsfenster draussen, die jeder Prozess nebenher fuehrt -
   Nachrichtenfenster, IME-Fenster, Tooltips. */
const MIN_GAME_W = 320;
const MIN_GAME_H = 240;

/**
 * Der ZEICHENBEREICH eines Fensters in echten Bildschirmpixeln.
 *
 * Bewusst der Client- und nicht der Fensterbereich: im Fenstermodus gehoeren
 * Titelleiste und Rahmen zum Fensterbereich, aber das Spiel zeichnet nur in
 * den Client. Wer den Ausschnitt am Fensterbereich ausrichtet, sitzt um die
 * Titelleistenhoehe zu weit oben - im randlosen Vollbild faellt das nicht auf,
 * im Fenstermodus um 30 Pixel.
 */
function clientRect(lib, hwnd) {
  const rc = {};
  if (!lib.GetClientRect(hwnd, rc)) return null;
  const w = rc.right - rc.left;
  const h = rc.bottom - rc.top;
  if (w <= 0 || h <= 0) return null;

  /* Der Client kennt seinen eigenen Nullpunkt, nicht den des Bildschirms.
     ClientToScreen rechnet ihn um. Misslingt das, taugt der Fensterbereich
     als Naeherung - er ist im randlosen Vollbild ohnehin derselbe. */
  const origin = { x: 0, y: 0 };
  if (lib.ClientToScreen(hwnd, origin)) return { x: origin.x, y: origin.y, w, h };

  const wr = {};
  if (!lib.GetWindowRect(hwnd, wr)) return null;
  return { x: wr.left, y: wr.top, w: wr.right - wr.left, h: wr.bottom - wr.top };
}

/**
 * Der Zeichenbereich des Spielfensters, oder null.
 *
 * WOZU: Alle Ausschnitte der Texterkennung waren bisher Anteile des HAUPT-
 * BILDSCHIRMS. Gemeint war aber immer das Spielfenster - im randlosen Vollbild
 * auf dem Hauptmonitor ist das dasselbe, sonst nicht. Laeuft Warframe im
 * Fenster oder auf dem zweiten Monitor, greift jeder Streifen ins Leere, und
 * es bleibt nur der teure Vollbildblick, der die Reihe dann irgendwo findet.
 *
 * WARUM UEBER DIE Z-REIHENFOLGE UND NICHT UEBER EnumWindows: EnumWindows
 * braucht einen Rueckruf ueber die FFI-Grenze. GetTopWindow plus GW_HWNDNEXT
 * laeuft dieselbe Liste ab, ohne dass eine JavaScript-Funktion in fremdem
 * Code aufgerufen wird.
 *
 * WARUM DAS GROESSTE FENSTER GEWINNT: Der Spielprozess fuehrt mehrere
 * sichtbare Fenster - der Launcher hinterlaesst eines, und Overlays von
 * Treibern haengen sich an. Das Fenster, in dem gespielt wird, ist von diesen
 * immer das groesste.
 *
 * `pids` kommt von aussen, weil das Ermitteln der Spiel-PIDs einen
 * Unterprozess kostet (tasklist) und der Aufrufer das Ergebnis ohnehin
 * zwischenspeichert.
 */
export function gameWindowRect(pids) {
  if (process.platform !== 'win32') return null;
  const lib = user32();
  if (!lib || !lib.GetTopWindow || !pids?.length) return null;

  const wanted = new Set(pids.map(Number));
  try {
    let hwnd = lib.GetTopWindow(0);
    let best = null;
    /* Schranke gegen eine Z-Reihenfolge, die sich unter dem Durchlauf
       aendert: ein paar tausend Fenster hat kein Rechner, eine Endlosschleife
       im Hauptprozess waere dagegen fatal. */
    let guard = 0;

    while (hwnd && guard++ < 5000) {
      const next = lib.GetWindow(hwnd, GW_HWNDNEXT);
      if (lib.IsWindowVisible(hwnd) && !lib.IsIconic(hwnd)) {
        const out = [0];
        lib.GetWindowThreadProcessId(hwnd, out);
        if (wanted.has(Number(out[0]))) {
          const rc = clientRect(lib, hwnd);
          if (rc && rc.w >= MIN_GAME_W && rc.h >= MIN_GAME_H &&
              (!best || rc.w * rc.h > best.w * best.h)) best = rc;
        }
      }
      hwnd = next;
    }
    return best;
  } catch {
    return null;
  }
}
