/** Lokale Konfiguration. Bleibt auf deinem Rechner - wird nirgends hochgeladen. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FILE = path.join('data', 'config.json');
/* overlay*: Lage, Deckkraft und Klick-Durchlass des Overlays. Stehen hier,
   weil sie dieselbe Lebensdauer haben wie die uebrige lokale Einstellung -
   und weil ein Fenster, das nach dem Neustart woanders aufgeht, als Fehler
   wahrgenommen wird. */
const DEFAULTS = {
  accountId: '', platform: 'pc', notes: {},
  overlayBounds: null, overlayOpacity: 0.94, overlayClickThrough: false
};

export async function loadConfig() {
  if (!existsSync(FILE)) return { ...DEFAULTS };
  return { ...DEFAULTS, ...JSON.parse(await readFile(FILE, 'utf8')) };
}

export async function saveConfig(cfg) {
  await mkdir('data', { recursive: true });
  await writeFile(FILE, JSON.stringify(cfg, null, 2));
}
