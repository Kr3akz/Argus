/**
 * Holt die temporaeren API-Zugangsdaten aus dem laufenden Warframe-Prozess.
 *
 * PRINZIP (nach github.com/Sainan/warframe-api-helper): Der Client haelt seine
 * API-URLs im Klartext im Heap. Ein Fund von "?accountId=" liefert dahinter die
 * 24-stellige AccountId und den nonce der laufenden Sitzung. Beides verfaellt,
 * sobald das Spiel beendet wird.
 *
 * ZUGANGSDATEN: accountId und nonce sind Credentials. Sie werden nirgends
 * geloggt, nirgends in eine Datei geschrieben und nicht an den Renderer
 * durchgereicht - sie bleiben im Hauptprozess und im Arbeitsspeicher.
 * Auf Platte landet hoechstens die Fundadresse (siehe HINT_FILE), das ist
 * eine Zahl ohne Aussagekraft.
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);

const PROCESS_NAME = 'Warframe.x64.exe';
const NEEDLE       = '?accountId=';

/* Fenster hinter dem Treffer, in dem accountId und nonce erwartet werden.
   Die vollstaendige URL ist deutlich kuerzer, 512 Byte sind reichlich Reserve. */
const WINDOW = 512;

/* Nur die zuletzt erfolgreiche Adresse, kein Inhalt. Nach einem Spielneustart
   verschiebt ASLR alles - dann geht der Schnellpfad ins Leere und der Vollscan
   uebernimmt. Kostet im Fehlfall einen einzigen 512-Byte-Lesezugriff. */
const HINT_FILE = () => path.join('data', 'scan-hint.json');

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

/**
 * Liest ein Fenster ab der Fundadresse und zieht die Zugangsdaten heraus.
 * null, wenn dort kein brauchbares Paar steht (der Heap ist voller alter Fragmente).
 *
 * Was im Speicher steht, ist ein roher HTTP-Request:
 *   ?accountId=<24 Hex>&nonce=<Ziffern>&ct=STM&droneId=...  HTTP/1.1  Host: api.warframe.com
 * Das ct traegt die Plattform (STM = Steam) und wird mitgenommen, weil der
 * API-Aufruf sie erwarten kann. Es ist kein Geheimnis, aber es reist mit.
 */
function extract(procmem, handle, address) {
  const buf = procmem.readAt(handle, address, WINDOW);
  if (!buf) return null;

  const text = buf.toString('latin1');
  buf.fill(0);

  const acc = /^\?accountId=([0-9a-f]{24})/i.exec(text);
  if (!acc) return null;
  const non = /[?&]nonce=(\d{1,20})/.exec(text);
  if (!non) return null;
  if (BigInt(non[1]) <= 0n) return null;

  const ct = /[?&]ct=([A-Za-z0-9]{1,8})/.exec(text);
  return { accountId: acc[1], nonce: non[1], ct: ct ? ct[1] : null };
}

async function readHint() {
  try {
    const raw = JSON.parse(await readFile(HINT_FILE(), 'utf8'));
    return raw.address ? BigInt(raw.address) : null;
  } catch {
    return null;
  }
}

async function writeHint(address) {
  try {
    await mkdir('data', { recursive: true });
    await writeFile(HINT_FILE(),
      JSON.stringify({ address: '0x' + address.toString(16), savedAt: Date.now() }, null, 2));
  } catch {
    // Der Hinweis ist reine Beschleunigung - wenn er nicht schreibbar ist, egal.
  }
}

/**
 * Sucht die Zugangsdaten im Spielprozess. BLOCKIERT mehrere Sekunden und
 * gehoert deshalb in einen Worker - siehe scanCredentials().
 *
 * skipHint erzwingt den Vollscan. Das braucht der Aufrufer, wenn die API die
 * gemerkten Daten ablehnt: dann steht an der alten Adresse ein abgelaufener
 * nonce und nur eine frische Suche hilft.
 */
export async function findCredentials({ skipHint = false } = {}) {
  const procmem = await import('./procmem.js').catch(() => null);
  if (!procmem) return fail('koffi_missing', 'Speichermodul nicht ladbar.');
  if (!procmem.isSupported()) {
    return fail('unsupported', 'Der Inventar-Abruf braucht Windows (64 Bit).');
  }

  const pids = await findGameProcessIds();
  if (!pids.length) {
    return fail('no_process', 'Warframe läuft nicht. Starte das Spiel und logge dich ein.');
  }

  const hint = skipHint ? null : await readHint();
  let lastError = null;

  for (const pid of pids) {
    let handle = null;
    try {
      handle = procmem.openProcess(pid);

      // Schnellpfad: dieselbe Adresse wie beim letzten Mal
      if (hint !== null) {
        const quick = extract(procmem, handle, hint);
        if (quick) return { ok: true, ...quick, stats: { fromHint: true, seconds: 0 } };
      }

      /* Zeitbudget nach Messung: der erste Durchgang braucht rund 1 s (warm) bis
         etwa 10 s (kalt, Seiten kommen aus der Auslagerungsdatei). Nur der
         Notfall-Durchgang ueber die grossen Regionen laeuft in die Naehe des
         Limits - gemessen 27,6 s warm. */
      const scan = procmem.findPattern(handle, NEEDLE, { limit: 32, maxSeconds: 100 });

      /* Im Heap liegen auch abgelaufene URLs aus frueheren Anfragen. Der hoechste
         nonce ist der zuletzt vergebene und damit der aktuell gueltige. */
      let best = null, bestAddress = null;
      for (const address of scan.addresses) {
        const found = extract(procmem, handle, address);
        if (!found) continue;
        if (!best || BigInt(found.nonce) > BigInt(best.nonce)) {
          best = found;
          bestAddress = address;
        }
      }

      if (best) {
        await writeHint(bestAddress);
        return {
          ok: true, ...best,
          stats: {
            fromHint: false,
            pass: scan.pass,
            regions: scan.regions,
            megabytes: Math.round(scan.bytes / 1048576),
            candidates: scan.addresses.length,
            seconds: Number(scan.seconds.toFixed(1))
          }
        };
      }

      lastError = scan.timedOut
        ? fail('timeout', 'Suche abgebrochen - Zeitlimit erreicht.')
        : fail('not_found', 'Keine Zugangsdaten im Speicher gefunden. Bist du im Spiel eingeloggt?');
    } catch (e) {
      lastError = fail(e.code || 'scan_failed', e.message, e.detail);
    } finally {
      if (handle) procmem.closeHandle(handle);
    }
  }

  return lastError || fail('not_found', 'Keine Zugangsdaten im Speicher gefunden.');
}

/**
 * Wie findCredentials(), aber in einem Worker-Thread.
 *
 * Der Scan laeuft mehrere Sekunden am Stueck. Im Hauptprozess wuerde das Fenster
 * genau so lange einfrieren - koffis Async-Aufrufe helfen nicht, weil die Suche
 * selbst in JavaScript stattfindet und den Event-Loop haelt.
 */
export function scanCredentials({ timeoutMs = 120000, skipHint = false } = {}) {
  return new Promise(resolve => {
    let worker;
    try {
      worker = new Worker(new URL('./scan-worker.js', import.meta.url),
        { workerData: { skipHint } });
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
      () => finish(fail('timeout', 'Suche im Spielspeicher hat zu lange gedauert.')),
      timeoutMs);

    worker.on('message', finish);
    worker.on('error', e => finish(fail('scan_failed', e.message)));
    worker.on('exit', code => {
      if (!settled) finish(fail('scan_failed', `Worker beendet (Code ${code}).`));
    });
  });
}
