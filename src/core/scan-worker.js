/**
 * Worker-Thread fuer die Speichersuchen.
 *
 * Existiert nur, damit die mehrere Sekunden langen Scans nicht den Event-Loop
 * des Hauptprozesses blockieren - sonst steht das Fenster still, solange
 * gesucht wird.
 *
 * DREI AUFTRAEGE, ueber workerData.job:
 *   'accountId'  Die Kennung fuer das oeffentliche Profil (accountid.js).
 *   'inventory'  Das Inventar aus dem Heap (inventory-scan.js). Es kommt als
 *                geparstes Objekt zurueck, rund 1 MB - einmal je Zonenwechsel,
 *                das traegt der strukturierte Klon.
 *   'whisper'    Der Text einer Fluesternachricht (whispers.js), einmal je
 *                neuer Unterhaltung.
 *   'riven'      Die Riven-Staende zu einer Waffe (riven-scan.js), fuer das
 *                Overlay auf dem Umwandeln-Bildschirm.
 *
 * Der Thread laeuft genau einen Durchgang und ist danach fertig.
 */
import { parentPort, workerData } from 'node:worker_threads';

const job = workerData?.job || 'accountId';

try {
  if (job === 'whisper') {
    const { readWhisper } = await import('./whispers.js');
    parentPort.postMessage(await readWhisper(workerData.options?.sender));
  } else if (job === 'riven') {
    const { findRivenFingerprints } = await import('./riven-scan.js');
    parentPort.postMessage(await findRivenFingerprints(workerData.options?.compat));
  } else if (job === 'inventory') {
    const { scanInventory } = await import('./inventory-scan.js');
    parentPort.postMessage(await scanInventory(workerData.options || {}));
  } else {
    const { findAccountId } = await import('./accountid.js');
    parentPort.postMessage(await findAccountId());
  }
} catch (e) {
  parentPort.postMessage({ ok: false, code: e.code || 'scan_failed', message: e.message });
}
