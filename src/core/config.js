/** Lokale Konfiguration. Bleibt auf deinem Rechner - wird nirgends hochgeladen. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dataDir, dataFile } from './paths.js';

/* Lazy: der Hauptprozess setzt das Datenverzeichnis erst beim Start. Ein
   const zur Ladezeit wuerde noch den Entwicklungspfad einfrieren. */
const FILE = () => dataFile('config.json');
/* Voreinstellung der globalen Tastenkuerzel. Wird getrennt zusammengefuehrt,
   siehe loadConfig: ein flaches Spread wuerde ein gespeichertes
   { overlay: ... } ohne interact-Eintrag uebernehmen und das zweite Kuerzel
   damit verlieren. */
export const DEFAULT_HOTKEYS = { overlay: 'Ctrl+R', interact: 'Ctrl+E', main: 'Ctrl+Alt+R' };

/* overlay*: Lage, Deckkraft und Klick-Durchlass des Overlays. Stehen hier,
   weil sie dieselbe Lebensdauer haben wie die uebrige lokale Einstellung -
   und weil ein Fenster, das nach dem Neustart woanders aufgeht, als Fehler
   wahrgenommen wird. */
/* updateCheck: fragt beim Start und danach stuendlich bei GitHub nach einer
   neueren Fassung. Standardmaessig AN, weil eine Anwendung, die den Speicher
   eines fremden Prozesses liest, nicht in einer halbjahrealten Fassung
   weiterlaufen sollte - abschaltbar bleibt es trotzdem, es ist die einzige
   Verbindung, die Argus ohne Knopfdruck von selbst aufbaut. */
/* overlayEnabled: der Hauptschalter fuer das Overlay-Fenster. Aus heisst wirklich
   aus - weder das Tastenkuerzel noch eine Reliktbelohnung holen es dann hervor.
   Wer auf einem Bildschirm spielt, will unter Umstaenden gar nichts ueber dem
   Spiel liegen haben, und "einfach nicht druecken" ist keine Einstellung. */
/* wfmAutoStatus steht auf AUS, und das ist keine Vorsicht aus Gewohnheit:
   der Schalter aendert etwas, das andere Leute sehen. Wer ihn nie bemerkt,
   soll auf warframe.market genau so dastehen wie vorher. */
const DEFAULTS = {
  accountId: '', platform: 'pc', notes: {},
  overlayBounds: null, overlayOpacity: 0.94, overlayClickThrough: false,
  overlayEnabled: true,
  updateCheck: true,
  wfmAutoStatus: false,
  hotkeys: { ...DEFAULT_HOTKEYS }
};

export async function loadConfig() {
  if (!existsSync(FILE())) return { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } };
  const parsed = JSON.parse(await readFile(FILE(), 'utf8'));
  return {
    ...DEFAULTS,
    ...parsed,
    hotkeys: { ...DEFAULT_HOTKEYS, ...(parsed.hotkeys || {}) }
  };
}

export async function saveConfig(cfg) {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(FILE(), JSON.stringify(cfg, null, 2));
}
