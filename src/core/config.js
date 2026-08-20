/** Lokale Konfiguration. Bleibt auf deinem Rechner - wird nirgends hochgeladen. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FILE = path.join('data', 'config.json');
/* Voreinstellung der globalen Tastenkuerzel. Wird getrennt zusammengefuehrt,
   siehe loadConfig: ein flaches Spread wuerde ein gespeichertes
   { overlay: ... } ohne interact-Eintrag uebernehmen und das zweite Kuerzel
   damit verlieren. */
export const DEFAULT_HOTKEYS = { overlay: 'Ctrl+R', interact: 'Ctrl+E' };

/* overlay*: Lage, Deckkraft und Klick-Durchlass des Overlays. Stehen hier,
   weil sie dieselbe Lebensdauer haben wie die uebrige lokale Einstellung -
   und weil ein Fenster, das nach dem Neustart woanders aufgeht, als Fehler
   wahrgenommen wird. */
const DEFAULTS = {
  accountId: '', platform: 'pc', notes: {},
  overlayBounds: null, overlayOpacity: 0.94, overlayClickThrough: false,
  hotkeys: { ...DEFAULT_HOTKEYS }
};

export async function loadConfig() {
  if (!existsSync(FILE)) return { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } };
  const parsed = JSON.parse(await readFile(FILE, 'utf8'));
  return {
    ...DEFAULTS,
    ...parsed,
    hotkeys: { ...DEFAULT_HOTKEYS, ...(parsed.hotkeys || {}) }
  };
}

export async function saveConfig(cfg) {
  await mkdir('data', { recursive: true });
  await writeFile(FILE, JSON.stringify(cfg, null, 2));
}
