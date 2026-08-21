/**
 * Wo Daten und mitgelieferte Hilfsdateien liegen.
 *
 * WARUM ES DIESE DATEI GIBT:
 *   Frueher setzte main.js per process.chdir() das Arbeitsverzeichnis auf die
 *   Projektwurzel, und jede Fundstelle schrieb schlicht 'data/irgendwas.json'.
 *   Das haelt genau so lange, wie die App aus dem Quellordner startet. In einem
 *   gepackten Build liegt derselbe Pfad in resources/app.asar - einem
 *   Archiv, das nur gelesen werden kann. Der erste Schreibversuch (und sei es
 *   nur ratelimit.json) scheitert, die App kommt nicht hoch.
 *
 * DIE TRENNUNG:
 *   dataDir()      beschreibbar, ueberlebt ein Update - Konfiguration, Ziele,
 *                  Caches, Profil und Inventar.
 *   resourceDir()  nur lesbar, wird mitgeliefert - derzeit tools/ mit dem
 *                  PowerShell-Skript fuer die Texterkennung.
 *
 * WARUM KEIN import { app } from 'electron':
 *   src/core/ kennt weder Electron noch DOM - daran haengt, dass die Logik in
 *   src/cli/ ohne Oberflaeche laeuft. Der Hauptprozess ruft deshalb beim Start
 *   setDataDir() auf und reicht den Pfad herein, statt dass core sich Electron
 *   holt.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/* Bewusst nicht cwd-relativ: ein CLI-Skript aus src/cli/ soll dieselben Daten
   finden wie die App, egal aus welchem Verzeichnis es gestartet wurde. */
const PROJECT_ROOT = path.resolve(here, '..', '..');

let dataOverride = null;
let resourceOverride = null;

/**
 * Vom Hauptprozess beim Start aufgerufen, bevor irgendetwas geladen wird.
 * Im gepackten Build zeigt das auf app.getPath('userData'), in der Entwicklung
 * wird gar nicht erst ueberschrieben - dann bleibt es der Projektordner.
 */
export function setDataDir(dir) {
  dataOverride = dir ? path.resolve(dir) : null;
}

export function setResourceDir(dir) {
  resourceOverride = dir ? path.resolve(dir) : null;
}

/**
 * Verzeichnis fuer alles, was die App schreibt.
 *
 * ARGUS_DATA_DIR ist der Notausgang: damit laesst sich ein Test oder ein
 * zweites Konto gegen einen eigenen Ordner fahren, ohne die echten Daten
 * anzufassen.
 */
export function dataDir() {
  return dataOverride
      || (process.env.ARGUS_DATA_DIR && path.resolve(process.env.ARGUS_DATA_DIR))
      || path.join(PROJECT_ROOT, 'data');
}

/** Einzelne Datei unterhalb von dataDir(). */
export function dataFile(...parts) {
  return path.join(dataDir(), ...parts);
}

/** Mitgelieferte, nur lesbare Dateien (tools/). */
export function resourceDir() {
  return resourceOverride || PROJECT_ROOT;
}

export function resourceFile(...parts) {
  return path.join(resourceDir(), ...parts);
}
