#!/usr/bin/env node
/**
 * Prueft "Start with Warframe" - ohne Spiel und ohne Eintrag bei Windows.
 *
 *   node src/cli/autostart-test.js
 *   npm run autostart-test:app     dasselbe unter Electron (koffi, launch.js)
 *
 * Vier Teile:
 *   1. Die Entscheidung (GameStartWatch.observe): wann eine Kennung ein Start
 *      ist und wann ein Spiel, das schon lief.
 *   2. Die Beobachtung mit Uhr und Ordner - ein Wegwerf-Ordner statt
 *      %LOCALAPPDATA%\Warframe und eine nachgestellte Prozessliste: wann
 *      nachgesehen wird, wie oft, und was ohne Ordner passiert.
 *   3. Die echte Prozessliste ueber Toolhelp, gegen den eigenen Prozess und
 *      gegen tasklist.
 *   4. Nur unter Electron: launch.js - Startarten, der Eintrag, wie er bei
 *      Windows stuende, und dass aus dem Quellordner keiner geschrieben wird.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GameStartWatch, processIdsByName, gameProcessIds, toolhelpEntrySize } from '../core/game-start.js';
import { findGameProcessIds } from '../core/accountid.js';

let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Wartet, bis cond() wahr ist - hoechstens ms. */
async function until(cond, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(10);
  }
  return cond();
}

/* ------------------------------ 1. Entscheidung ------------------------------ */

console.log('\n=== Wann ist es ein Start? ===\n');

/* Nur observe - ohne start(), also ohne Uhr und Ordner. */
const decide = (...blicke) => {
  const w = new GameStartWatch();
  return blicke.map(p => w.observe(p));
};

ok('kein Spiel, dann eines: Start',
  same(decide([], [100]), [null, [100]]));
ok('Spiel lief schon beim ersten Blick: kein Start',
  same(decide([100], [100]), [null, null]));
ok('... erst nach Ende und Neustart wieder einer',
  same(decide([100], [], [200]), [null, null, [200]]));
ok('... auch ohne Blick dazwischen, an der neuen Kennung',
  same(decide([100], [200]), [null, [200]]));
ok('zweiter Prozess neben dem bekannten: Start, nur mit dem neuen',
  same(decide([100], [100, 300]), [null, [300]]));
ok('derselbe Start loest nicht zweimal aus',
  same(decide([], [100], [100], [100]), [null, [100], null, null]));
ok('Liste nicht zu haben: nichts geschlossen, erster echter Blick legt fest',
  same(decide(null, [100], [], [5]), [null, null, null, [5]]));
ok('Aussetzer mitten drin vergisst nichts',
  same(decide([], null, [7]), [null, null, [7]]));
ok('und laesst ein laufendes Spiel nicht als neu erscheinen',
  same(decide([100], null, [100]), [null, null, null]));

/* ------------------------------ 2. Beobachtung ------------------------------ */

console.log('\n=== Ordner, Uhr und Prozessliste ===\n');

const base = mkdtempSync(path.join(tmpdir(), 'argus-autostart-'));
try {
  /* Ein Start ueber den Ordner */
  {
    const dir = path.join(base, 'a');
    mkdirSync(dir);
    let running = [];
    let scans = 0;
    const starts = [];
    const watches = [];
    const w = new GameStartWatch({
      dir, settleMs: 60, pollMs: 60000, busyGapMs: 400,
      scan: async () => { scans++; return running; }
    });
    w.on('start', e => starts.push({ ...e, at: Date.now() }));
    w.on('watch', e => watches.push(e));
    w.start();

    ok('erster Blick sofort', await until(() => scans === 1, 500), `${scans} Blicke`);
    ok('Ordner wird beobachtet', watches.length === 1 && watches[0].active, JSON.stringify(watches));

    writeFileSync(path.join(dir, 'Launcher.log'), 'x');
    ok('Ereignis im Ordner: ein Blick nach der Ruhezeit', await until(() => scans === 2, 1000), `${scans} Blicke`);
    ok('Launcher allein ist kein Start', starts.length === 0);

    running = [4242];
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) writeFileSync(path.join(dir, 'EE.log'), 'zeile ' + i);
    ok('Spiel schreibt EE.log: Start gemeldet', await until(() => starts.length === 1, 2000));
    ok('... mit der neuen Kennung', same(starts[0]?.pids, [4242]), JSON.stringify(starts[0]));
    ok('... ueber den Ordner, nicht ueber den Takt', starts[0]?.reason === 'folder', starts[0]?.reason);
    ok('... nach unter einer Sekunde', starts[0] && starts[0].at - t0 < 1000, `${starts[0] ? starts[0].at - t0 : '-'} ms`);
    ok('fuenf Schreibvorgaenge, ein Blick', scans === 3, `${scans} Blicke`);

    w.stop();
    const vorher = scans;
    writeFileSync(path.join(dir, 'EE.log'), 'nach dem Ende');
    await sleep(200);
    ok('nach stop(): kein Blick mehr', scans === vorher, `${scans - vorher} weitere`);
  }

  /* Ein Spiel laeuft schon - es schreibt dauernd, der Wartende soll trotzdem
     nicht dauernd nachsehen, und erst der Neustart zaehlt. */
  {
    const dir = path.join(base, 'b');
    mkdirSync(dir);
    let running = [9];
    let scans = 0;
    const starts = [];
    const w = new GameStartWatch({
      dir, settleMs: 30, pollMs: 60000, busyGapMs: 400,
      scan: async () => { scans++; return running; }
    });
    w.on('start', e => starts.push(e));
    w.start();
    await until(() => scans === 1, 500);

    const ende = Date.now() + 1000;
    let schreiben = 0;
    while (Date.now() < ende) {
      writeFileSync(path.join(dir, 'EE.log'), 'laeuft ' + schreiben++);
      await sleep(15);
    }
    ok('laufendes Spiel loest nicht aus', starts.length === 0);
    /* Eine Sekunde, 400 ms Abstand: der erste Blick plus hoechstens drei. */
    ok('Blicke gedrosselt, solange es laeuft', scans <= 4, `${scans} Blicke bei ${schreiben} Schreibvorgaengen`);

    running = [11];
    writeFileSync(path.join(dir, 'EE.log'), 'neu gestartet');
    ok('Neustart des Spiels: Start', await until(() => starts.length === 1, 1500), `${starts.length} Starts`);
    ok('... mit der Kennung des neuen', same(starts[0]?.pids, [11]));
    w.stop();
  }

  /* Ohne Ordner (Warframe nie gestartet): der Takt allein findet es, und
     sobald der Ordner da ist, wird er beobachtet. */
  {
    const dir = path.join(base, 'c');   // gibt es noch nicht
    let running = [];
    let scans = 0;
    const starts = [];
    const watches = [];
    const w = new GameStartWatch({
      dir, settleMs: 30, pollMs: 120, busyGapMs: 400,
      scan: async () => { scans++; return running; }
    });
    w.on('start', e => starts.push(e));
    w.on('watch', e => watches.push(e));
    w.start();

    ok('fehlender Ordner wird gemeldet', watches.length === 1 && !watches[0].active && watches[0].error === 'ENOENT',
       JSON.stringify(watches));
    await sleep(300);
    ok('... und nicht bei jedem Takt erneut', watches.length === 1, `${watches.length} Meldungen`);

    mkdirSync(dir);
    ok('Ordner angelegt: beim naechsten Takt beobachtet', await until(() => watches.length === 2 && watches[1].active, 1000),
       JSON.stringify(watches));

    running = [77];
    ok('Start ueber den Takt gefunden', await until(() => starts.length === 1, 1000));
    ok('... als Takt gemeldet', starts[0]?.reason === 'poll', starts[0]?.reason);
    w.stop();
  }

  /* Ein Blick, der wirft, haelt die Beobachtung nicht an. */
  {
    const dir = path.join(base, 'd');
    mkdirSync(dir);
    let scans = 0;
    const starts = [];
    const w = new GameStartWatch({
      dir, settleMs: 30, pollMs: 100, busyGapMs: 400,
      scan: async () => {
        scans++;
        if (scans === 2) throw new Error('Liste nicht zu haben');
        return scans >= 4 ? [5] : [];
      }
    });
    w.on('start', e => starts.push(e));
    w.start();
    ok('Fehler im Blick: weiter beobachtet, Start trotzdem erkannt',
       await until(() => starts.length === 1, 1500), `${scans} Blicke`);
    w.stop();
  }
} finally {
  rmSync(base, { recursive: true, force: true });
}

/* ------------------------------ 3. Prozessliste ------------------------------ */

if (process.platform === 'win32') {
  console.log('\n=== Prozessliste (Toolhelp) ===\n');

  const size = toolhelpEntrySize();
  ok('PROCESSENTRY32W hat 568 Byte', size === 568, String(size));

  const self = path.basename(process.execPath);
  const eigene = processIdsByName(self);
  ok(`eigener Prozess gefunden (${self})`, Array.isArray(eigene) && eigene.includes(process.pid),
     `${process.pid} in ${JSON.stringify(eigene)}`);
  /* Nicht auf Gleichheit der Listen: zwischen zwei Blicken koennen andere
     Prozesse desselben Namens kommen und gehen. */
  ok('Gross-/Kleinschreibung egal', (processIdsByName(self.toUpperCase()) || []).includes(process.pid));
  ok('unbekannter Name: leere Liste, nicht null', same(processIdsByName('gibt-es-nicht-argus.exe'), []));

  const viaToolhelp = (await gameProcessIds()).slice().sort((a, b) => a - b);
  const viaTasklist = (await findGameProcessIds()).slice().sort((a, b) => a - b);
  ok('Warframe: Toolhelp und tasklist einig', same(viaToolhelp, viaTasklist),
     `${JSON.stringify(viaToolhelp)} / ${JSON.stringify(viaTasklist)}` + (viaToolhelp.length ? '' : ' (Spiel laeuft nicht)'));

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) processIdsByName('Warframe.x64.exe');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  console.log(`  info   ein Blick in die Prozessliste: ${ms.toFixed(1)} ms`);
}

/* ------------------------------ 4. launch.js ------------------------------ */

if (process.versions.electron) {
  console.log('\n=== launch.js (Electron) ===\n');
  const launch = await import('../main/launch.js');

  ok('ohne Schalter: normal', launch.launchMode(['argus.exe']) === 'normal');
  ok('--wait-for-warframe: Wartender', launch.launchMode(['argus.exe', '--wait-for-warframe']) === 'wait');
  ok('--opened-by-warframe: vom Spiel', launch.launchMode(['argus.exe', '--opened-by-warframe']) === 'game');
  ok('Wartender schlaegt vom Spiel', launch.launchMode(['a', '--opened-by-warframe', '--wait-for-warframe']) === 'wait');

  const item = launch.loginItem('C:\\Users\\Max Muster\\AppData\\Local\\Programs\\Argus\\Argus.exe');
  ok('Eintrag: Pfad in Anfuehrungszeichen', item.path === '"C:\\Users\\Max Muster\\AppData\\Local\\Programs\\Argus\\Argus.exe"', item.path);
  ok('Eintrag: startet als Wartender', same(item.args, ['--wait-for-warframe']));

  ok('aus dem Quellordner: "source"', launch.autostartAvailability() === 'source', launch.autostartAvailability());
  ok('... Uebergabe an einen Wartenden moeglich', launch.canWait());
  /* Beides fasst die Registry nur im installierten Build an - hier prueft es,
     dass es das NICHT tut. Vorher sichergestellt, dass hier "source" gilt. */
  if (launch.autostartAvailability() === 'source') {
    ok('... kein Eintrag bei Windows lesbar', launch.loginItemState() === null);
    ok('... und keiner geschrieben', launch.setOpenAtLogin(true) === false);
  }
}

console.log(failures ? `\n${failures} FEHLER` : '\nAlles gruen.');
process.exit(failures ? 1 : 0);
