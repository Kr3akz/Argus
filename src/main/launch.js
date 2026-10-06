/**
 * Wie dieser Lauf von Argus zustande kam, und wie es sich selbst neu startet.
 *
 * DREI ARTEN ZU STARTEN:
 *   normal  von Hand - Startmenue, Verknuepfung, nach einem Update.
 *   wait    als Wartender (--wait-for-warframe): kein Fenster, nur ein Symbol
 *           im Infobereich, bis Warframe startet. Siehe waiter.js.
 *   game    vom Wartenden, weil Warframe gerade startet
 *           (--opened-by-warframe). Das Fenster geht minimiert und ohne
 *           Fokus auf - siehe createWindow in main.js.
 *
 * Gewechselt wird immer ueber einen frischen Prozess (app.relaunch): Electron
 * startet den neuen erst, wenn der alte weg ist. Die Einzelinstanz-Sperre aus
 * boot.js geht dabei sauber von Hand zu Hand - nachgemessen ~0,6 s Luecke,
 * und die Umgebung (ARGUS_DATA_DIR) kommt mit.
 *
 * DER EINTRAG BEI WINDOWS:
 *   HKCU\Software\Microsoft\Windows\CurrentVersion\Run, ueber Electrons
 *   setLoginItemSettings - kein Administrator, nichts ausserhalb des eigenen
 *   Benutzerkontos, und unter Task-Manager -> Autostart sichtbar und dort
 *   abschaltbar. Name des Eintrags ist die AppUserModelId (siehe unten).
 *
 *   Den Pfad in Anfuehrungszeichen setzen WIR: Electron 33 haengt Pfad und
 *   Argumente unbesehen mit Leerzeichen aneinander (FormatCommandLineString
 *   in shell/browser/browser_win.cc). Bei "C:\Users\Max Muster\..." stuende
 *   sonst eine Befehlszeile da, die Windows nur mit Raten richtig aufteilt.
 *   Gelesen wird mit denselben Werten, damit der Vergleich in
 *   getLoginItemSettings Zeichen fuer Zeichen passt.
 */
import { app } from 'electron';

export const WAIT_FLAG = '--wait-for-warframe';
export const GAME_FLAG = '--opened-by-warframe';

/** 'wait' | 'game' | 'normal' */
export function launchMode(argv = process.argv) {
  if (argv.includes(WAIT_FLAG)) return 'wait';
  if (argv.includes(GAME_FLAG)) return 'game';
  return 'normal';
}

/**
 * Woran Windows die Anwendung wiedererkennt - Taskleiste, Gruppierung und
 * die Zustellung der Benachrichtigungen haengen daran, und seit "Start with
 * Warframe" auch der Name des Autostart-Eintrags. Deshalb steht das hier und
 * nicht mehr in main.js: der Wartende braucht dieselbe Kennung, um einen
 * verwaisten Eintrag wiederzufinden.
 * Behaelt bewusst den alten Namen - siehe appId in electron-builder.yml.
 *
 * NUR IM GEPACKTEN BUILD:
 *   Die Kennung verweist auf eine INSTALLIERTE Anwendung. Aus dem Quellordner
 *   heraus gibt es die nicht - Windows findet dann weder Namen noch Symbol
 *   dazu und laesst in der Taskleiste beides weg (Rechtsklick auf ein
 *   namenloses, leeres Feld). Der Pfad der laufenden .exe ist dort die
 *   ehrlichere Kennung: dann steht wenigstens Electron mit seinem Symbol da,
 *   statt gar nichts.
 */
export function applyAppUserModelId() {
  if (process.platform !== 'win32') return;
  app.setAppUserModelId(app.isPackaged ? 'com.kr3akz.cephalonargus' : process.execPath);
}

/**
 * Laesst sich "Start with Warframe" hier einrichten?
 *   installed    ja, mit Eintrag bei Windows
 *   source       aus dem Quellordner: Warten und Uebergeben funktionieren,
 *                aber Windows wird nichts eingetragen - ein Autostart auf
 *                electron.exe und einen Entwicklungsordner waere eine Falle,
 *                die noch Wochen spaeter zuschnappt.
 *   portable     nein. Die portable .exe entpackt sich bei jedem Start in
 *                einen neuen Temp-Ordner und raeumt ihn beim Beenden weg
 *                (templates/nsis/portable.nsi von electron-builder). Jeder
 *                Wechsel zwischen Warten und App hiesse: neu entpacken, und
 *                was beim Aufraeumen noch in Benutzung ist, bleibt liegen.
 *   unsupported  kein Windows.
 */
export function autostartAvailability() {
  if (process.platform !== 'win32') return 'unsupported';
  if (process.env.PORTABLE_EXECUTABLE_FILE) return 'portable';
  return app.isPackaged ? 'installed' : 'source';
}

/** Kann dieser Lauf an einen Wartenden uebergeben? */
export const canWait = () => ['installed', 'source'].includes(autostartAvailability());

/**
 * Startet Argus neu, sobald dieser Prozess endet - als Wartender, vom Spiel
 * geoeffnet oder normal. app.quit() muss der Aufrufer selbst rufen.
 */
export function relaunchAs(mode) {
  /* Aus dem Quellordner ist die .exe electron.exe, und welche App sie laden
     soll, steht im ersten Argument. */
  const args = app.isPackaged ? [] : [app.getAppPath()];
  if (mode === 'wait') args.push(WAIT_FLAG);
  if (mode === 'game') args.push(GAME_FLAG);
  app.relaunch({ execPath: process.execPath, args });
}

/** Pfad und Argumente des Autostart-Eintrags - siehe Kopf. */
export const loginItem = (exe = process.execPath) => ({ path: `"${exe}"`, args: [WAIT_FLAG] });

/** Eintrag anlegen oder entfernen. false, wenn es hier keinen gibt. */
export function setOpenAtLogin(on) {
  if (autostartAvailability() !== 'installed') return false;
  /* Mit openAtLogin:true gibt Electron den Eintrag auch unter Task-Manager ->
     Autostart wieder frei. Das ist richtig, aber nur, weil das hier nur auf
     ausdruecklichen Wunsch laeuft: ein Klick auf den Schalter, oder ein
     fehlender Eintrag bei eingeschaltetem Schalter (main.js). */
  app.setLoginItemSettings({ openAtLogin: !!on, ...loginItem() });
  return true;
}

/**
 * Was Windows tatsaechlich vorhat. null, wenn es keinen Eintrag geben kann.
 *   registered  unser Eintrag steht da, genau mit diesem Pfad
 *   blocked     er steht da, ist aber unter Task-Manager -> Autostart
 *               abgeschaltet - Windows startet ihn nicht
 */
export function loginItemState() {
  if (autostartAvailability() !== 'installed') return null;
  const s = app.getLoginItemSettings(loginItem());
  return {
    registered: !!s.openAtLogin,
    blocked: !!s.openAtLogin && !s.executableWillLaunchAtLogin
  };
}
