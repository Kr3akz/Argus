/**
 * Worker-Thread fuer die Speichersuche.
 *
 * Existiert nur, damit der mehrere Sekunden lange Scan nicht den Event-Loop des
 * Hauptprozesses blockiert - sonst steht das Fenster still, solange gesucht wird.
 *
 * Der Thread laeuft genau einen Durchgang und ist danach fertig. Das Ergebnis geht
 * per postMessage zurueck; dabei koennen Zugangsdaten enthalten sein, die den
 * Prozess aber nicht verlassen (kein Log, keine Datei, kein Renderer).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { findCredentials } from './gamecreds.js';

try {
  parentPort.postMessage(await findCredentials(workerData || {}));
} catch (e) {
  parentPort.postMessage({ ok: false, code: e.code || 'scan_failed', message: e.message });
}
