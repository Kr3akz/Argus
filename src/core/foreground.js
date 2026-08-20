/**
 * Gibt den Eingabefokus gezielt an das Fenster zurueck, das ihn vorher hatte.
 *
 * WARUM NICHT blur():
 *   Electrons blur() reicht den Fokus an das naechste Fenster der
 *   Z-Reihenfolge weiter. Nachgemessen landete er dabei auf der Taskleiste,
 *   nicht beim Spiel. Fuer den Zeigermodus ist aber genau das der Zweck: kurz
 *   ins Overlay, etwas einstellen, ohne Klick zurueck ins Spiel.
 *
 * UMFANG:
 *   Zwei Aufrufe auf Fensterebene, beide ohne Zugriff auf einen fremden
 *   Prozess und ohne jede Eingabesimulation. Gemerkt wird eine Fensterkennung,
 *   sonst nichts. SetForegroundWindow laesst Windows ohnehin nur zu, solange
 *   der eigene Prozess den Vordergrund haelt - also genau in dem Moment, in
 *   dem der Nutzer das Overlay gerade bedient hat.
 *
 * AUSFALL:
 *   Ohne koffi oder ausserhalb von Windows faellt nur der Rueckweg weg. Der
 *   Zeigermodus selbst funktioniert weiter, man klickt dann eben selbst ins
 *   Spiel zurueck. Deshalb wirft hier nichts.
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
    api = {
      GetForegroundWindow: lib.func('uint64 __stdcall GetForegroundWindow()'),
      SetForegroundWindow: lib.func('bool __stdcall SetForegroundWindow(uint64 hWnd)')
    };
  } catch {
    unavailable = true;
  }
  return api;
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
