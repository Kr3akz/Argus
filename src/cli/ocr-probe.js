/**
 * Messung, bevor gebaut wird: wie gut liest Windows-OCR den echten
 * Belohnungsbildschirm?
 *
 * Wartet auf die naechste Riss-Mission, nimmt beim Aufgehen des
 * Auswahlbildschirms den Bildschirm auf, erkennt den Text und legt Bild plus
 * JSON unter data/ocr/ ab.
 *
 * Der Trick an der Messung: aus dem Log ist EIN der vier Namen sicher bekannt -
 * der eigene Fund. Damit laesst sich die Erkennung nicht nur ansehen, sondern
 * pruefen.
 *
 *   node src/cli/ocr-probe.js
 */
import { LogWatcher, DEFAULT_LOG_PATH } from '../core/logwatch.js';
import { loadCatalog } from '../core/catalog.js';
import { execFile } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { dataFile, resourceFile } from '../core/paths.js';

const run = promisify(execFile);
const OUT_DIR = dataFile('ocr');

console.log('Katalog laden …');
const catalog = await loadCatalog();

await mkdir(OUT_DIR, { recursive: true });

const watcher = new LogWatcher(DEFAULT_LOG_PATH());

watcher.on('relic-reward', async ev => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const png  = path.resolve(OUT_DIR, `reward-${stamp}.png`);
  const json = path.resolve(OUT_DIR, `reward-${stamp}.json`);

  /* Aus dem Log kennen wir den eigenen Fund - die Pruefgroesse der Messung. */
  let expected = null;
  if (ev.uniqueName) {
    const clean = ev.uniqueName.replace('/StoreItems', '');
    expected = catalog.byUniqueName.get(clean)?.name || clean.split('/').pop();
  }

  console.log(`\n[${new Date().toLocaleTimeString('de-DE')}] Auswahlbildschirm offen`);
  console.log(`   Dein Fund laut Log: ${expected || '(nicht im Log)'}`);
  console.log('   Nehme auf …');

  try {
    await run('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', resourceFile('tools', 'ocr-capture.ps1'),
      '-Png', png, '-Json', json
    ], { windowsHide: true });

    /* PowerShell schreibt UTF-8 gern mit BOM - JSON.parse bricht daran ab. */
    const res = JSON.parse((await readFile(json, 'utf8')).replace(/^\uFEFF/, ''));
    if (!res.ok) { console.log('   OCR fehlgeschlagen:', res.error); return; }

    console.log(`   Sprache: ${res.language}, ${res.lines.length} Zeilen erkannt`);
    console.log('   Bild:', png);

    /* Nur die Zeilen zeigen, die ueberhaupt nach Itemnamen aussehen -
       der Rest des Bildschirms ist Rauschen fuer diese Frage. */
    const interesting = res.lines
      .map(l => l.text.trim())
      .filter(t => t.length > 3 && /[A-Za-z]{3}/.test(t));

    console.log('\n   --- erkannte Zeilen ---');
    interesting.forEach(t => console.log('   ' + t));

    if (expected) {
      const hay = res.text.toLowerCase();
      const words = expected.toLowerCase().split(/\s+/);
      const found = words.filter(w => hay.includes(w));
      console.log(`\n   Pruefung "${expected}": ${found.length}/${words.length} Wörter wörtlich gefunden` +
                  (found.length ? ` (${found.join(', ')})` : ''));
    }
  } catch (err) {
    console.log('   Aufnahme fehlgeschlagen:', err.message);
  }
});

await watcher.start();
console.log('Bereit. Spiel eine Riss-Mission und öffne ein Relikt.');
console.log('Beobachte:', DEFAULT_LOG_PATH());
console.log('(Strg+C beendet)\n');
