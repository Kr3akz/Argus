/**
 * Worker-Thread fuer die Speichersuchen.
 *
 * Existiert nur, damit die mehrere Sekunden langen Scans nicht den Event-Loop
 * des Hauptprozesses blockieren - sonst steht das Fenster still, solange
 * gesucht wird.
 *
 * ZWEI AUFTRAEGE, ueber workerData.job:
 *   'accountId'  Die Kennung fuer das oeffentliche Profil (accountid.js).
 *   'inventory'  Das Inventar aus dem Heap (inventory-scan.js). Es kommt als
 *                geparstes Objekt zurueck, rund 1 MB - einmal je Zonenwechsel,
 *                das traegt der strukturierte Klon.
 *
 * Der Thread laeuft genau einen Durchgang und ist danach fertig.
 */
import { parentPort, workerData } from 'node:worker_threads';

const job = workerData?.job || 'accountId';

try {
  if (job === 'inventory') {
    const { scanInventory } = await import('./inventory-scan.js');
    parentPort.postMessage(await scanInventory(workerData.options || {}));
  } else {
    const { findAccountId } = await import('./accountid.js');
    parentPort.postMessage(await findAccountId());
  }
} catch (e) {
  parentPort.postMessage({ ok: false, code: e.code || 'scan_failed', message: e.message });
}
