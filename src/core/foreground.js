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
    api = {
      GetForegroundWindow: lib.func('uint64 __stdcall GetForegroundWindow()'),
      SetForegroundWindow: lib.func('bool __stdcall SetForegroundWindow(uint64 hWnd)'),
      SetCursorPos:        lib.func('bool __stdcall SetCursorPos(int X, int Y)'),
      GetCursorPos:        lib.func('bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)'),
      GetWindowThreadProcessId: lib.func(
        'uint32 __stdcall GetWindowThreadProcessId(uint64 hWnd, _Out_ uint32 *lpdwProcessId)')
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

