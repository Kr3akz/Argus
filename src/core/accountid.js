/**
 * Liest die Account-ID aus dem laufenden Warframe-Prozess.
 *
 * WAS DIESES MODUL FRUEHER WAR (gamecreds.js):
 *   Es holte accountId UND den Session-nonce, damit inventory.js sich damit bei
 *   api.warframe.com als der Client ausgeben konnte. Genau das war der einzige
 *   Punkt, an dem Argus die Client-Kommunikation gegenueber DEs API nachahmte,
 *   und der einzige, den DE serverseitig sah - er hat eine IP-Drosselung
 *   ausgeloest, die den Spiel-Login blockierte.
 *
 *   Das Inventar kommt jetzt direkt aus dem Heap (inventory-scan.js). Der nonce
 *   wird nirgends mehr gebraucht und deshalb hier auch nicht mehr gelesen.
 *
 * WAS BLEIBT:
 *   Die Account-ID - und nur sie. Sie wird fuer das OEFFENTLICHE Profil
 *   gebraucht (getProfileViewingData.php, ohne Anmeldung, ohne Sitzung), und
 *   sie steht nicht im Inventardokument: nachgemessen enthaelt das nur
 *   GuildId.$oid und LastInventorySync.$oid als 24-Hex-Werte, nicht die eigene
 *   Kennung. Ohne diesen Scan muesste man sie wieder von Hand von warframe.com
 *   abschreiben.
 *
 * WAS HIER NICHT MEHR PASSIERT:
 *   Kein nonce, keine Plattformkennung, keine gemerkte Fundadresse. Die Kennung
 *   ist kein Geheimnis - sie steht ohnehin im Dateinamen des Profil-Caches -,
 *   trotzdem geht sie nicht an den Renderer.
 */
import { execFile } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { promisify } from 'node:util';

const run = promisify(execFile);

const PROCESS_NAME = 'Warframe.x64.exe';
const NEEDLE       = '?accountId=';

/* Fenster hinter dem Treffer. Die Kennung sind 24 Zeichen direkt dahinter;
   64 Byte sind reichlich und halten den Lesevorgang klein. */
const WINDOW = 64;

function fail(code, message, detail) {
  return { ok: false, code, message, detail };
}

/** Alle PIDs des Spielclients. Leere Liste, wenn er nicht laeuft. */
export async function findGameProcessIds() {
  try {
    const { stdout } = await run('tasklist',
      ['/FI', `IMAGENAME eq ${PROCESS_NAME}`, '/FO', 'CSV', '/NH']);
    const pids = [];
    for (const line of stdout.split(/\r?\n/)) {
      const m = /^"Warframe\.x64\.exe","(\d+)"/i.exec(line.trim());
      if (m) pids.push(Number(m[1]));
    }
    return pids;
  } catch {
    return [];   // tasklist nicht erreichbar - wie "laeuft nicht" behandeln
  }
}

/** Die 24 Hex-Zeichen hinter dem Muster. null, wenn dort nichts Brauchbares steht. */
function extract(procmem, handle, address) {
  const buf = procmem.readAt(handle, address, WINDOW);
  if (!buf) return null;
  const m = /^\?accountId=([0-9a-f]{24})/i.exec(buf.toString('latin1'));
  buf.fill(0);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Sucht die Account-ID im Spielprozess. BLOCKIERT einige Sekunden und gehoert
 * deshalb in einen Worker - siehe scanAccountId().
 */
export async function findAccountId() {
  const procmem = await import('./procmem.js').catch(() => null);
  if (!procmem) return fail('koffi_missing', 'The memory module could not be loaded.');
  if (!procmem.isSupported()) {
    return fail('unsupported', 'Reading the account ID needs Windows (64 bit).');
  }

  const pids = await findGameProcessIds();
  if (!pids.length) {
    return fail('no_process', 'Warframe is not running. Start the game and log in.');
  }

  let lastError = null;

  for (const pid of pids) {
    let handle = null;
    try {
      handle = procmem.openProcess(pid);
      const scan = procmem.findPattern(handle, NEEDLE, { limit: 32, maxSeconds: 100 });

      /* Die haeufigste Kennung gewinnt. Alle Treffer sollten dieselbe tragen -
         es sind die Anfrage-URLs des eigenen Clients -, aber Mehrheit statt
         Erstfund kostet nichts und schuetzt vor einem verirrten Fragment. */
      const tally = new Map();
      for (const address of scan.addresses) {
        const id = extract(procmem, handle, address);
        if (id) tally.set(id, (tally.get(id) || 0) + 1);
      }

      let best = null, bestCount = 0;
      for (const [id, count] of tally) {
        if (count > bestCount) { best = id; bestCount = count; }
      }

      if (best) {
        return {
          ok: true, accountId: best,
          stats: {
            pass: scan.pass,
            regions: scan.regions,
            megabytes: Math.round(scan.bytes / 1048576),
            candidates: scan.addresses.length,
            distinct: tally.size,
            seconds: Number(scan.seconds.toFixed(1))
          }
        };
      }

      lastError = scan.timedOut
        ? fail('timeout', 'Search cancelled — time limit reached.')
        : fail('not_found', 'No account ID found in memory. Are you logged in to the game?');
    } catch (e) {
      lastError = fail(e.code || 'scan_failed', e.message, e.detail);
    } finally {
      if (handle) procmem.closeHandle(handle);
    }
  }

  return lastError || fail('not_found', 'No account ID found in memory.');
}

/**
 * Wie findAccountId(), aber in einem Worker-Thread - der Scan laeuft mehrere
 * Sekunden am Stueck und wuerde das Fenster genauso lange einfrieren.
 */
export function scanAccountId({ timeoutMs = 120000 } = {}) {
  return runInWorker({ job: 'accountId' }, timeoutMs);
}

/**
 * Worker-Start fuer beide Speichersuchen. Liegt hier, weil scan-worker.js
 * ohnehin von diesem Modul aus gestartet wird; inventory-scan.js reicht seinen
 * Auftrag durch.
 */
export function runInWorker(workerData, timeoutMs = 120000) {
  return new Promise(resolve => {
    let worker;
    try {
      worker = new Worker(new URL('./scan-worker.js', import.meta.url), { workerData });
    } catch (e) {
      resolve(fail('scan_failed', e.message));
      return;
    }

    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };

    const timer = setTimeout(
      () => finish(fail('timeout', 'Searching the game memory took too long.')),
      timeoutMs);

    worker.on('message', finish);
    worker.on('error', e => finish(fail('scan_failed', e.message)));
    worker.on('exit', code => {
      if (!settled) finish(fail('scan_failed', `Worker exited (code ${code}).`));
    });
  });
}
