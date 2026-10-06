/**
 * Einstieg des Hauptprozesses (package.json "main").
 *
 * Entscheidet, ALS WAS Argus laeuft (siehe launch.js), bevor irgendetwas
 * Schweres geladen wird: als App (main.js) oder als Wartender (waiter.js).
 * Der Wartende laedt main.js nie - er soll tagelang im Infobereich sitzen
 * koennen, ohne Katalog, achtzig Module und drei Fenster mitzuschleppen.
 *
 * EINE INSTANZ:
 *   Bisher brauchte Argus keine Einzelinstanz-Sperre - wer es zweimal
 *   startete, hatte zwei. Mit einem Wartenden im Hintergrund genuegt dafuer
 *   aber ein Klick auf die Verknuepfung, ohne dass man es merkt. Zwei Argus
 *   teilen sich den Debugkanal des Spiels nach Zufall (core/dbwin.js) und
 *   schreiben in dieselben Dateien. Die zweite Instanz geht deshalb sofort
 *   wieder und sagt der ersten Bescheid ('second-instance'): ein Wartender
 *   startet dann die App, eine laufende App holt ihr Fenster nach vorn.
 *
 *   Die Sperre haengt an Electrons Profilordner (userData). Aus dem
 *   Quellordner teilte der sich bisher den Ordner mit der installierten App
 *   (%APPDATA%\Argus) - ein `npm start` haette dann die installierte nach
 *   vorn geholt, statt selbst zu starten. Aus dem Quellordner liegt das
 *   Profil deshalb jetzt beim Datenordner: eine Instanz je Datenordner, und
 *   eine Testinstanz mit ARGUS_DATA_DIR kommt niemandem in die Quere.
 */
import { app } from 'electron';
import path from 'node:path';
import { dataDir } from '../core/paths.js';
import { launchMode, applyAppUserModelId } from './launch.js';

const mode = launchMode();

applyAppUserModelId();

if (!app.isPackaged) app.setPath('userData', path.join(dataDir(), 'electron'));

if (mode === 'wait') {
  /* Gemessen am 2026-10-07, ein Electron-Prozess ohne Fenster mit Symbol im
     Infobereich: 145 MB privater Speicher, davon 66 MB im GPU-Prozess. Ohne
     Grafikbeschleunigung 104 MB, mit den beiden Schaltern dazu 92 MB.
     Gezeichnet wird hier nichts - und die App, an die uebergeben wird, ist
     ein neuer Prozess mit voller Beschleunigung. */
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

if (!app.requestSingleInstanceLock({ mode })) {
  app.quit();
} else if (mode === 'wait') {
  await import('./waiter.js');
} else {
  await import('./main.js');
}
