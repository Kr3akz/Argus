/**
 * Baut die Handy-App fuer GitHub Pages.
 *
 *   node tools/build-mobile.mjs [ziel]      (Standard: dist/pages)
 *
 * Heraus kommt eine statische Seite:
 *
 *   ziel/index.html        leitet auf app/ weiter
 *   ziel/app/              src/mobile, wie es ist
 *   ziel/app/core/         die Module aus src/core, die die App unterwegs
 *                          selbst ausfuehrt - nur die, die sie wirklich laedt
 *   ziel/app/assets/icons/ die Bilder aus dem Renderer, die sie zeigt
 *   ziel/app/precache.json was der Service Worker beim Installieren laedt
 *
 * Dieselbe Anordnung liefert Argus am PC im Heimnetz aus (core/phone-server.js:
 * /core/ und /assets/ zeigen dort in die Quellordner). Deshalb laeuft dieselbe
 * App an beiden Orten, ohne dass es zwei Fassungen gibt.
 *
 * Kein npm install noetig: nur Node und das Repository. Der Workflow
 * .github/workflows/pages.yml ruft das hier nach den Tests auf.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE = path.join(ROOT, 'src', 'mobile');
const CORE = path.join(ROOT, 'src', 'core');
const ASSETS = path.join(ROOT, 'src', 'renderer', 'assets');
const ZIEL = path.resolve(ROOT, process.argv[2] || path.join('dist', 'pages'));
const APP = path.join(ZIEL, 'app');

/* Der Zielordner wird geleert - aber nur, wenn er im Projekt liegt. Ein
   vertippter Pfad soll keinen fremden Ordner leerraeumen. */
if (!ZIEL.startsWith(ROOT + path.sep)) {
  console.error(`Zielordner muss im Projekt liegen: ${ZIEL}`);
  process.exit(1);
}
rmSync(ZIEL, { recursive: true, force: true });
mkdirSync(APP, { recursive: true });

function alleDateien(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? alleDateien(p) : [p];
  });
}

function kopieren(von, nach) {
  mkdirSync(path.dirname(nach), { recursive: true });
  copyFileSync(von, nach);
}

/* 1. Die App selbst. */
for (const datei of alleDateien(MOBILE)) kopieren(datei, path.join(APP, path.relative(MOBILE, datei)));

/* 2. Die Module aus src/core, die die App laedt - den statischen Importen
      nach, ausgehend von allem, was in src/mobile auf ../core/ zeigt. */
const IMPORT = /(?:^|\n)\s*(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const offen = [];
for (const datei of alleDateien(MOBILE).filter(f => f.endsWith('.js'))) {
  for (const m of readFileSync(datei, 'utf8').matchAll(IMPORT)) {
    const spec = m[1] || m[2];
    if (!spec?.startsWith('.')) continue;
    const ziel = path.resolve(path.dirname(datei), spec);
    const imCore = path.relative(path.join(MOBILE, 'core'), ziel);
    if (!imCore.startsWith('..')) offen.push(path.join(CORE, imCore));
  }
}
const coreDateien = new Set();
while (offen.length) {
  const datei = offen.pop();
  if (coreDateien.has(datei)) continue;
  if (!existsSync(datei)) { console.error(`Fehlt: ${path.relative(ROOT, datei)}`); process.exit(1); }
  coreDateien.add(datei);
  for (const m of readFileSync(datei, 'utf8').matchAll(IMPORT)) {
    const spec = m[1] || m[2];
    if (spec?.startsWith('.')) offen.push(path.resolve(path.dirname(datei), spec));
  }
}
for (const datei of coreDateien) kopieren(datei, path.join(APP, 'core', path.relative(CORE, datei)));

/* 3. Die Bilder: Weltzustand, Waehrungen, das Logo. */
for (const sub of ['icons/worldstate', 'icons/currency']) {
  for (const datei of alleDateien(path.join(ASSETS, sub))) {
    kopieren(datei, path.join(APP, 'assets', path.relative(ASSETS, datei)));
  }
}
kopieren(path.join(ASSETS, 'icons', 'logo.png'), path.join(APP, 'assets', 'icons', 'logo.png'));

/* 4. Was der Service Worker vorlaedt, und seine Fassung. Die Fassung ist ein
      Hash ueber alle Dateien - aendert sich irgendeine, ist sw.js eine andere
      Datei, und die Handys holen sich den neuen Stand. */
const dateien = alleDateien(APP)
  .map(f => path.relative(APP, f).split(path.sep).join('/'))
  .filter(f => f !== 'sw.js' && f !== 'precache.json')
  .sort();
const summe = createHash('sha256');
for (const f of dateien) summe.update(f).update(readFileSync(path.join(APP, f)));
const fassung = summe.digest('hex').slice(0, 12);

writeFileSync(path.join(APP, 'precache.json'), JSON.stringify(['./', ...dateien], null, 1));
const swPfad = path.join(APP, 'sw.js');
const sw = readFileSync(swPfad, 'utf8');
if (!sw.includes("const VERSION = 'dev';")) { console.error("sw.js: Markierung const VERSION = 'dev'; nicht gefunden"); process.exit(1); }
writeFileSync(swPfad, sw.replace("const VERSION = 'dev';", `const VERSION = '${fassung}';`));

/* 5. Die Wurzel der Seite: ein Wegweiser zur App. Jekyll aus - GitHub Pages
      soll die Dateien ausliefern, wie sie sind. */
writeFileSync(path.join(ZIEL, '.nojekyll'), '');
writeFileSync(path.join(ZIEL, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=app/">
<title>Argus</title></head>
<body style="background:#0a0d12;color:#f2f5f9;font-family:system-ui,sans-serif;padding:40px">
<p><a href="app/" style="color:#79c0ff">Open Argus</a></p></body></html>
`);

const groesse = alleDateien(ZIEL).reduce((s, f) => s + statSync(f).size, 0);
console.log(`Handy-App gebaut: ${path.relative(ROOT, ZIEL)} - ${dateien.length} Dateien, ${coreDateien.size} aus src/core, ` +
            `${(groesse / 1024).toFixed(0)} KB, Fassung ${fassung}`);
