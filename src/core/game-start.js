/**
 * Merkt, dass Warframe gerade startet - fuer "Start with Warframe".
 *
 * WER DAS BRAUCHT:
 *   Nur der Wartende (src/main/waiter.js): ein schlanker Argus-Prozess ohne
 *   Fenster, der ab der Windows-Anmeldung im Infobereich sitzt und die App
 *   startet, sobald das Spiel aufgeht. Er sitzt unter Umstaenden tagelang da,
 *   auch an Tagen, an denen gar nicht gespielt wird - deshalb zaehlt hier,
 *   was er im Leerlauf verbraucht.
 *
 * WIE DER START AUFFAELLT - zwei Stufen, die teure nur bei Anlass:
 *   1. Der Ordner %LOCALAPPDATA%\Warframe wird beobachtet (fs.watch, unter
 *      Windows ReadDirectoryChangesW). Beim Start schreibt dort zuerst der
 *      Launcher Launcher.log, dann sein Vorlauf Preprocess.log, dann das Spiel
 *      EE.log - nachgesehen am 2026-10-07: 00:57:49, 00:57:59, 00:58:06.
 *      Solange niemand spielt, aendert sich dort nichts, und hier passiert
 *      gar nichts.
 *   2. Erst dann ein Blick in die Prozessliste: laeuft Warframe.x64.exe unter
 *      einer Kennung, die vorher nicht da war?
 *   Dazu alle 30 Sekunden derselbe Blick ohne Anlass. Er faengt ab, dass der
 *   Ordner (noch) fehlt - Warframe nie gestartet - oder die Beobachtung
 *   abreisst.
 *
 * WARUM Toolhelp UND NICHT tasklist WIE IM REST VON ARGUS:
 *   Gemessen am 2026-10-07 bei 340 Prozessen: tasklist 150 ms je Aufruf - ein
 *   eigener Prozess, der dieselbe Liste holt -, CreateToolhelp32Snapshot
 *   11 ms, davon 9 im Kern. Gelesen werden nur die Namen; kein Prozess wird
 *   geoeffnet, auch das Spiel nicht. tasklist bleibt der Rueckfall, wenn koffi
 *   fehlt.
 *
 * WARUM KENNUNGEN UND NICHT "laeuft / laeuft nicht":
 *   Wer Argus mitten im Spiel schliesst, bekommt den Wartenden, waehrend das
 *   Spiel noch laeuft. Der soll Argus dann NICHT sofort wieder aufmachen -
 *   gerade erst hat es jemand zugemacht -, sondern beim naechsten Start. Was
 *   beim ersten Blick schon lief, gilt deshalb als bekannt; ausgeloest wird
 *   nur durch eine neue Kennung.
 *
 *   Der Launcher laesst fuer seinen Vorlauf kurz eine eigene Warframe.x64.exe
 *   laufen ("Finished Preprocess (3.9 seconds)" in Launcher.log), etwa zehn
 *   Sekunden vor dem Spiel. Wird DIE gesehen, geht Argus eben etwas frueher
 *   auf - noch bevor das Spielfenster steht. Das ist kein Fehler, sondern der
 *   guenstigere Zeitpunkt.
 */
import { watch as fsWatch } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import { findGameProcessIds } from './accountid.js';

const require = createRequire(import.meta.url);

const GAME_EXE = 'Warframe.x64.exe';

/* Derselbe Ordner, in dem logwatch.js EE.log liest. */
export const gameLogDir = () => path.join(process.env.LOCALAPPDATA || '', 'Warframe');

/* ---------------------------- Prozessliste ---------------------------- */

const TH32CS_SNAPPROCESS = 0x2;

let kernel = null;
let kernelFailed = false;

/** kernel32 ueber koffi - beim ersten Aufruf gebunden, danach gecacht. */
function toolhelp() {
  if (kernel || kernelFailed) return kernel;
  if (process.platform !== 'win32') { kernelFailed = true; return null; }
  try {
    const koffi = require('koffi');
    const lib = koffi.load('kernel32.dll');
    /* PROCESSENTRY32W unter x64, 568 Byte. Vor th32DefaultHeapID (ULONG_PTR)
       ruecken vier Fuellbytes ein - koffi leitet sie aus der Ausrichtung
       selbst ab. Eigener Name, weil koffi Strukturnamen prozessweit vergibt. */
    const ENTRY = koffi.struct('ARGUS_PROCESSENTRY32W', {
      dwSize:              'uint32',
      cntUsage:            'uint32',
      th32ProcessID:       'uint32',
      th32DefaultHeapID:   'uintptr_t',
      th32ModuleID:        'uint32',
      cntThreads:          'uint32',
      th32ParentProcessID: 'uint32',
      pcPriClassBase:      'int32',
      dwFlags:             'uint32',
      szExeFile:           koffi.array('char16_t', 260, 'String')
    });
    /* HANDLE als intptr_t: INVALID_HANDLE_VALUE ist -1 und kommt so als Zahl
       an, statt als Zeigerobjekt, das sich nicht vergleichen laesst. */
    kernel = {
      size:     koffi.sizeof(ENTRY),
      snapshot: lib.func('intptr_t __stdcall CreateToolhelp32Snapshot(uint32 dwFlags, uint32 th32ProcessID)'),
      first:    lib.func('bool __stdcall Process32FirstW(intptr_t hSnapshot, _Inout_ ARGUS_PROCESSENTRY32W *lppe)'),
      next:     lib.func('bool __stdcall Process32NextW(intptr_t hSnapshot, _Inout_ ARGUS_PROCESSENTRY32W *lppe)'),
      close:    lib.func('bool __stdcall CloseHandle(intptr_t hObject)')
    };
  } catch {
    kernelFailed = true;
  }
  return kernel;
}

/** Groesse des Eintrags, wie koffi sie ausgelegt hat - nur fuer den Test. */
export const toolhelpEntrySize = () => toolhelp()?.size ?? null;

/**
 * Kennungen aller Prozesse mit diesem Dateinamen, ohne Ruecksicht auf
 * Gross-/Kleinschreibung. null, wenn die Liste nicht zu haben war - das ist
 * etwas anderes als "laeuft nicht".
 */
export function processIdsByName(exeName) {
  const k = toolhelp();
  if (!k) return null;
  const h = k.snapshot(TH32CS_SNAPPROCESS, 0);
  if (!h || h === -1 || h === -1n) return null;

  const wanted = String(exeName).toLowerCase();
  const pids = [];
  try {
    /* Ein Objekt fuer alle Eintraege: koffi schreibt es bei jedem Aufruf
       hinein und wieder heraus, dwSize bleibt dabei stehen. */
    const entry = { dwSize: k.size };
    for (let ok = k.first(h, entry); ok; ok = k.next(h, entry)) {
      if (String(entry.szExeFile).toLowerCase() === wanted) pids.push(entry.th32ProcessID);
    }
  } finally {
    k.close(h);
  }
  return pids;
}

/** Kennungen der laufenden Warframe.x64.exe; tasklist, wenn koffi fehlt. */
export async function gameProcessIds() {
  return processIdsByName(GAME_EXE) ?? findGameProcessIds();
}

/* ---------------------------- Beobachtung ---------------------------- */

/* Ruhe nach einem Ordnerereignis, bevor nachgesehen wird. Ein Start schreibt
   mehrere Dateien in wenigen Sekunden; ein Blick fuer alle reicht. */
const SETTLE_MS = 1500;
/* Der Blick ohne Anlass. */
const POLL_MS = 30000;
/* Laeuft ein bekanntes Spiel, schreibt es laufend ins Log - jedes Ereignis
   waere dann ein Anlass. Dann genuegt ein Blick in diesem Abstand, um seinen
   Nachfolger zu erkennen. */
const BUSY_GAP_MS = 30000;

/**
 * Meldet 'start' mit { pids, reason }, sobald ein Warframe laeuft, das beim
 * ersten Blick noch nicht lief. Ausserdem 'watch' mit { active, dir, error },
 * wenn sich die Ordnerbeobachtung an- oder abschaltet - fuer das Protokoll.
 *
 * scan und watch sind nur fuer den Test austauschbar.
 */
export class GameStartWatch extends EventEmitter {
  #dir;
  #scan;
  #watchFn;
  #settleMs;
  #pollMs;
  #busyGapMs;

  #known = new Set();
  #primed = false;
  /* Lief beim letzten Blick ein (bekanntes) Spiel? */
  #busy = false;
  #lastScan = 0;
  #scanning = false;
  #stopped = true;
  #settleTimer = null;
  #pollTimer = null;
  #watcher = null;
  #watchActive = null;

  constructor({ dir = gameLogDir(), scan = gameProcessIds, watch = fsWatch,
                settleMs = SETTLE_MS, pollMs = POLL_MS, busyGapMs = BUSY_GAP_MS } = {}) {
    super();
    this.#dir = dir;
    this.#scan = scan;
    this.#watchFn = watch;
    this.#settleMs = settleMs;
    this.#pollMs = pollMs;
    this.#busyGapMs = busyGapMs;
  }

  start() {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#pollTimer = setInterval(() => this.#check('poll'), this.#pollMs);
    this.#ensureWatch();
    this.#check('first look');
  }

  stop() {
    this.#stopped = true;
    clearInterval(this.#pollTimer);
    this.#pollTimer = null;
    clearTimeout(this.#settleTimer);
    this.#settleTimer = null;
    this.#closeWatcher();
  }

  /**
   * Die Entscheidung allein, ohne Uhr und Ordner - pids aus einem Blick,
   * null fuer "nicht zu haben". Liefert die neuen Kennungen, wenn das ein
   * Start war, sonst null.
   */
  observe(pids) {
    if (!pids) return null;
    if (!pids.length) {
      /* Kein Spiel: alles Bekannte ist vorbei, das naechste ist neu. */
      this.#known.clear();
      this.#busy = false;
      this.#primed = true;
      return null;
    }
    const fresh = pids.filter(p => !this.#known.has(p));
    for (const p of pids) this.#known.add(p);
    this.#busy = true;
    /* Der erste Blick legt nur fest, was schon lief. */
    if (!this.#primed) { this.#primed = true; return null; }
    return fresh.length ? fresh : null;
  }

  async #check(reason) {
    if (this.#stopped) return;
    if (this.#scanning) {
      /* Der laufende Blick begann womoeglich, bevor das Spiel da war - ein
         Ordnerereignis von jetzt verdient einen eigenen. */
      if (reason === 'folder') this.#onFolderChange();
      return;
    }
    this.#scanning = true;
    clearTimeout(this.#settleTimer);
    this.#settleTimer = null;

    let pids = null;
    try { pids = await this.#scan(); } catch { pids = null; }
    this.#scanning = false;
    if (this.#stopped) return;
    this.#lastScan = Date.now();

    /* Fehlte der Ordner beim letzten Mal, gibt es ihn vielleicht inzwischen. */
    if (reason === 'poll') this.#ensureWatch();

    const fresh = this.observe(pids);
    if (fresh) this.emit('start', { pids: fresh, reason });
  }

  #onFolderChange() {
    if (this.#stopped || this.#settleTimer) return;
    const gap = this.#busy ? this.#busyGapMs : 0;
    const wait = Math.max(this.#settleMs, this.#lastScan + gap - Date.now());
    this.#settleTimer = setTimeout(() => {
      this.#settleTimer = null;
      this.#check('folder');
    }, wait);
  }

  #ensureWatch() {
    if (this.#watcher || this.#stopped) return;
    try {
      const w = this.#watchFn(this.#dir, () => this.#onFolderChange());
      /* Ordner geloescht oder Beobachtung abgerissen: zu, der Blick ohne
         Anlass versucht es beim naechsten Mal neu. */
      w.on('error', err => {
        this.#closeWatcher();
        this.#report(false, err);
      });
      this.#watcher = w;
      this.#report(true);
    } catch (err) {
      this.#report(false, err);
    }
  }

  #closeWatcher() {
    const w = this.#watcher;
    this.#watcher = null;
    if (w) { try { w.close(); } catch { /* schon zu */ } }
  }

  /* Nur Wechsel melden - ein fehlender Ordner wuerde sonst alle 30 s eine
     Zeile ins Protokoll schreiben. */
  #report(active, err = null) {
    if (this.#watchActive === active) return;
    this.#watchActive = active;
    this.emit('watch', { active, dir: this.#dir, error: err ? (err.code || err.message) : null });
  }
}
