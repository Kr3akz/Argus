/**
 * Faehrt einen der Pruefdurchlaeufe UNTER ELECTRON statt unter Node.
 *
 * WARUM ES DAS GIBT:
 *   Die Pruefdurchlaeufe laufen mit `node`, Argus laeuft mit Electron - und
 *   das sind zwei verschiedene Node-Versionen mit zwei verschiedenen
 *   V8-Staenden. Nachgemessen: Electron 33 bringt Node 20 mit, hier liegt
 *   Node 24.
 *
 *   Das ist folgenlos, solange nur JavaScript geprueft wird. Sobald aber
 *   native Aufrufe im Spiel sind, kann etwas unter Node tadellos laufen und
 *   Electron beim Start abschiessen. Genau das ist passiert: der Zugriff auf
 *   den gemeinsamen Speicher des Debugkanals lief unter Node einwandfrei und
 *   beendete Argus unter Electron mit `FATAL ERROR: Error::New
 *   napi_get_last_error_info`, bevor das Fenster aufging. Alle Testlaeufe
 *   waren gruen.
 *
 *   Was koffi anfasst, gehoert deshalb zusaetzlich hierdurch.
 *
 *   npx electron src/cli/app-test.cjs dbwin-test
 */
const { app } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const name = process.argv[2];
if (!name) {
  console.error('Welcher Durchlauf? z.B.  npx electron src/cli/app-test.cjs dbwin-test');
  app.exit(2);
  return;
}

const datei = path.join(__dirname, name.endsWith('.js') ? name : name + '.js');

console.log(`=== ${name} unter Electron ${process.versions.electron}`
          + ` (Node ${process.versions.node}) ===\n`);

/* Der Durchlauf beendet sich selbst ueber process.exit. Electron braucht
   trotzdem app.whenReady, sonst faehrt es Teile seiner Laufzeit gar nicht erst
   hoch - und genau die fehlten dann beim Pruefen. */
app.whenReady().then(async () => {
  try {
    await import(pathToFileURL(datei).href);
  } catch (err) {
    console.error('Durchlauf gescheitert:', err && err.stack ? err.stack : err);
    app.exit(1);
  }
});
