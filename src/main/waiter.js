/**
 * Der Wartende: Argus im Infobereich, bis Warframe startet.
 *
 * WANN ER LAEUFT:
 *   Nur mit "Start with Warframe" (Settings -> General). Windows startet ihn
 *   bei der Anmeldung, und die App startet ihn, wenn man sie schliesst.
 *
 * WAS ER TUT:
 *   Nichts, bis sich im Logordner des Spiels etwas regt (core/game-start.js).
 *   Startet Warframe, startet er die App - minimiert und ohne dem Spiel den
 *   Fokus zu nehmen - und geht selbst. Ein Klick auf das Symbol oder ein
 *   Start von Hand tut dasselbe, nur mit dem Fenster vorn.
 *
 * WARUM ER NICHT SELBST ZUR APP WIRD:
 *   Er sitzt ab der Anmeldung da, auch an Tagen, an denen gar nicht gespielt
 *   wird. Als eigener Prozess ohne Grafikbeschleunigung belegt er 92 MB (siehe
 *   boot.js); die App dagegen laedt den Katalog, achtzig Module und drei
 *   Fenster. Versteckt im Hintergrund waere das ein Vielfaches - fuer einen
 *   Prozess, der nur auf eine Zahl in der Prozessliste wartet. Deshalb gibt er
 *   an eine frische App ab, und die App beim Schliessen an einen frischen
 *   Wartenden.
 *
 * WAS ER NICHT TUT:
 *   Kein Netz, kein Tastenkuerzel, kein Fenster, kein Zugriff auf den
 *   Spielprozess - nur Namen aus der Prozessliste.
 */
import { app, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setDataDir, dataFile } from '../core/paths.js';
import { loadConfig } from '../core/config.js';
import { GameStartWatch } from '../core/game-start.js';
import { launchMode, relaunchAs, setOpenAtLogin } from './launch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Derselbe Datenordner wie die App - siehe main.js. */
if (app.isPackaged) setDataDir(path.join(app.getPath('userData'), 'data'));

/**
 * Ein paar Zeilen je Lauf, in einer eigenen Datei. argus.log gehoert der App
 * und beginnt bei jedem ihrer Starts neu - schriebe der Wartende hinein, waere
 * nach dem Schliessen genau das Protokoll der Sitzung weg, die man vielleicht
 * gerade nachlesen will.
 *
 * Synchron, weil die wichtigste Zeile die letzte ist: die Uebergabe, direkt
 * vor app.quit(). Bei einer Handvoll Zeilen je Lauf kostet das nichts.
 */
let logStarted = false;
function log(text) {
  console.log(text);
  try {
    const line = `${new Date().toISOString()} ${text}\n`;
    if (logStarted) {
      appendFileSync(dataFile('waiter.log'), line);
    } else {
      mkdirSync(dataFile('.'), { recursive: true });
      writeFileSync(dataFile('waiter.log'), line);
      logStarted = true;
    }
  } catch { /* dann eben nur die Konsole */ }
}

let tray = null;
let leaving = false;
const watch = new GameStartWatch();

/** Die App starten und selbst gehen. */
function handOver(mode, why) {
  if (leaving) return;
  leaving = true;
  watch.stop();
  log(`[Warten] ${why} - Argus startet`);
  relaunchAs(mode);
  app.quit();
}

watch.on('start', ({ pids, reason }) =>
  handOver('game', `Warframe gestartet (PID ${pids.join(', ')}, gesehen: ${reason})`));

watch.on('watch', ({ active, dir, error }) => log(active
  ? `[Warten] beobachte ${dir}`
  : `[Warten] ${dir} nicht beobachtbar (${error}) - Blick alle 30 s`));

/* Von Hand gestartet, waehrend er wartet (boot.js hat den zweiten Prozess
   schon wieder beendet): dann soll die App aufgehen, und zwar vorn. Ein
   zweiter Wartender will nichts - er ist schon wieder weg. */
app.on('second-instance', (_e, argv, _cwd, data) => {
  if ((data && data.mode) === 'wait' || launchMode(argv) === 'wait') return;
  handOver('normal', 'zweiter Start von Hand');
});

/**
 * Das App-Symbol in den Groessen, die der Infobereich je nach Skalierung
 * verlangt. Aus dem 512er-PNG verkleinert, weil Windows sonst selbst
 * herunterrechnet - mit dem schlechteren Filter.
 */
function trayIcon() {
  const full = nativeImage.createFromPath(path.join(__dirname, '../renderer/assets/app-icon.png'));
  if (full.isEmpty()) return full;
  const icon = nativeImage.createEmpty();
  for (const [scaleFactor, size] of [[1, 16], [1.25, 20], [1.5, 24], [2, 32]]) {
    icon.addRepresentation({
      scaleFactor,
      buffer: full.resize({ width: size, height: size, quality: 'best' }).toPNG()
    });
  }
  return icon;
}

app.whenReady().then(async () => {
  log(`[Warten] Argus ${app.getVersion()} wartet auf Warframe`);

  /* Eintrag bei Windows, aber der Schalter ist aus - etwa nach einer
     zurueckgespielten config.json. Dann haelt der Eintrag nichts mehr, was
     jemand will: weg damit, und ohne Symbol wieder gehen. Ist die Datei nur
     gerade nicht lesbar, wird trotzdem gewartet - wegen einer halb
     geschriebenen Datei soll niemandem der Autostart verloren gehen. */
  try {
    const cfg = await loadConfig();
    if (cfg.startWithWarframe !== true) {
      setOpenAtLogin(false);
      log('[Warten] "Start with Warframe" ist aus - Eintrag entfernt, Ende');
      app.quit();
      return;
    }
  } catch (err) {
    log(`[Warten] config.json nicht lesbar (${err.message}) - wartet trotzdem`);
  }
  /* Waehrend des Lesens schon von Hand gestartet - dann ist er schon unterwegs. */
  if (leaving) return;

  tray = new Tray(trayIcon());
  tray.setToolTip('Argus · opens when Warframe starts');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Argus', click: () => handOver('normal', 'Klick auf "Open Argus"') },
    { type: 'separator' },
    { label: 'Quit Argus', click: () => { log('[Warten] ueber das Symbol beendet'); app.quit(); } }
  ]));
  tray.on('click', () => handOver('normal', 'Klick auf das Symbol'));

  watch.start();
});

app.on('will-quit', () => {
  watch.stop();
  if (tray) tray.destroy();
});
