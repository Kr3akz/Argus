#!/usr/bin/env node
/**
 * Prueft, wann sich der Item-Katalog erneuert - offline, gegen einen
 * nachgestellten Spiegel.
 *
 *   node src/cli/catalog-test.js
 *
 * Kein Netz, keine echten Daten: fetch wird ersetzt, geschrieben wird in
 * einen Wegwerf-Ordner unter dem Temp-Verzeichnis. Nachgestellt sind die
 * drei Dinge, die refreshCatalog fragt - der neueste Commit (GitHub), die
 * Pruefsummen-Datei und die sieben Export-Dateien (jsDelivr, fest auf einen
 * Commit oder vom Zweig).
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadCatalog, refreshCatalog, EXPORT_FILES, LOOKUP_FILES } from '../core/catalog.js';

let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};

/* ------------------------- der nachgestellte Spiegel ------------------------- */

const FILES = [...EXPORT_FILES, ...LOOKUP_FILES];

/** Ein Stand des Spiegels: Inhalt je Datei, daraus die Pruefsummen. */
function stand({ frames = ['Citrine'], weapons = 40, upgrades = 30, tag = 'a' } = {}) {
  const rows = (pfx, n, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({ uniqueName: `${pfx}/${i}`, name: `${pfx.split('/').pop()} ${i}`, ...extra }));
  const data = {
    ExportWeapons:     { ExportWeapons: rows('/Lotus/Weapons/W', weapons, { productCategory: 'LongGuns' }) },
    ExportWarframes:   { ExportWarframes: frames.map(n => ({ uniqueName: `/Lotus/Powersuits/${n}/${n}`, name: n, productCategory: 'Suits' })),
                         ExportAbilities: rows('/Lotus/Powersuits/A', 12) },
    ExportSentinels:   { ExportSentinels: rows('/Lotus/Types/Sentinels/S', 20, { productCategory: 'Sentinels' }) },
    ExportRecipes:     { ExportRecipes: rows('/Lotus/Types/Recipes/R', 30) },
    ExportResources:   { ExportResources: rows('/Lotus/Types/Items/Res', 25) },
    ExportUpgrades:    { ExportUpgrades: rows('/Lotus/Upgrades/Mods/M', upgrades) },
    ExportRelicArcane: { ExportRelicArcane: rows('/Lotus/Types/Game/Relic', 20) }
  };
  /* Die Pruefsumme haengt am Inhalt - wie bei DE. */
  const hashes = {};
  for (const f of FILES) hashes[`${f}_en.json`] = `00_${f}_${JSON.stringify(data[f]).length}_${tag}`;
  return { data, hashes };
}

const mirror = {
  head: null,            // neuester Commit, null = GitHub antwortet nicht
  commits: {},           // sha -> stand
  branch: null,          // was jsDelivr ohne festen Commit ausliefert
  broken: null,          // Dateiname, der mit HTTP 500 antwortet
  calls: []
};

const json = body => ({ ok: true, status: 200, json: async () => structuredClone(body), text: async () => JSON.stringify(body) });
const miss = (status = 404) => ({ ok: false, status, json: async () => ({}), text: async () => '' });

globalThis.fetch = async (url) => {
  url = String(url);
  mirror.calls.push(url);
  if (url.startsWith('https://api.github.com/')) {
    return mirror.head ? { ok: true, status: 200, text: async () => mirror.head + '\n' } : miss(503);
  }
  /* Fest auf einen Commit kommt es von GitHub, sonst vom Zweig ueber jsDelivr. */
  const m = url.match(/^https:\/\/raw\.githubusercontent\.com\/Aericio\/warframe-exports-data\/([0-9a-f]{40})\/(export_hash\.json|export\/(\w+)_en\.json)$/)
         || url.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/Aericio\/warframe-exports-data()\/(export_hash\.json|export\/(\w+)_en\.json)$/);
  if (!m) return miss();
  const st = m[1] ? mirror.commits[m[1]] : mirror.branch;
  if (!st) return miss();
  if (m[2] === 'export_hash.json') return json(st.hashes);
  if (m[3] === mirror.broken) return miss(500);
  return st.data[m[3]] ? json(st.data[m[3]]) : miss();
};

const sha = c => c.repeat(40);
const downloads = () => mirror.calls.filter(u => /\/export\/\w+_en\.json$/.test(u));
const reset = () => { mirror.calls = []; };

/* ------------------------------- Ablauf ------------------------------- */

const dir = mkdtempSync(path.join(tmpdir(), 'argus-catalog-test-'));
const file = path.join(dir, 'catalog.json');
const onDisk = () => JSON.parse(readFileSync(file, 'utf8'));

try {
  console.log('=== Erster Start ohne Katalog ===\n');
  mirror.commits[sha('a')] = stand();
  mirror.head = sha('a');
  let cat = await loadCatalog({ dataDir: dir });
  ok('Katalog geladen', cat.items.some(i => i.name === 'Citrine'));
  ok('fest auf den Commit geholt', downloads().every(u => u.includes(`/${sha('a')}/`)), downloads()[0]);
  ok('Commit, Pruefsummen und Zahlen stehen in der Datei',
     onDisk().sha === sha('a') && onDisk().hashes?.ExportWarframes && onDisk().counts?.ExportWeapons === 40);
  ok('Mod-Liste mitgeschrieben', existsSync(path.join(dir, 'mods.json')));

  console.log('\n=== Nichts Neues ===\n');
  reset();
  let res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('gleicher Commit: nichts geladen', !res.changed && downloads().length === 0, `${mirror.calls.length} Anfragen`);
  ok('nur eine Anfrage (der Commit)', mirror.calls.length === 1);

  /* Der Spiegel bekommt einen Commit, der nur Bilder betrifft. */
  mirror.commits[sha('b')] = mirror.commits[sha('a')];
  mirror.head = sha('b');
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('neuer Commit, gleiche Pruefsummen: nichts geladen', !res.changed && downloads().length === 0);
  ok('Commit im Speicher vermerkt', cat.stamp.sha === sha('b'));
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('danach reicht wieder eine Anfrage', mirror.calls.length === 1);

  console.log('\n=== Spiel-Update: Narin kommt dazu ===\n');
  mirror.commits[sha('c')] = stand({ frames: ['Citrine', 'Citrine Prime', 'Narin'], weapons: 43, upgrades: 33, tag: 'c' });
  mirror.head = sha('c');
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('neuer Stand eingesetzt', res.changed && !res.error, res.error);
  ok('Narin und Citrine Prime unter "neu"',
     ['Narin', 'Citrine Prime'].every(n => res.added.some(i => i.name === n)),
     res.added.map(i => i.name).join(', '));
  ok('Citrine nicht unter "neu"', !res.added.some(i => i.name === 'Citrine'));
  ok('alle sieben Dateien vom neuen Commit', downloads().length === 7 && downloads().every(u => u.includes(`/${sha('c')}/`)));
  ok('Datei auf der Platte erneuert', onDisk().sha === sha('c') && onDisk().items.some(i => i.name === 'Narin'));
  ok('keine Nebendatei liegen geblieben', !existsSync(file + '.tmp'));
  ok('Mod-Liste erneuert', res.mods?.mods.length === 33
     && JSON.parse(readFileSync(path.join(dir, 'mods.json'), 'utf8')).mods.length === 33);
  cat = res.catalog;
  const neuGeladen = await loadCatalog({ dataDir: dir });
  ok('naechster Start liest den neuen Stand samt Commit', neuGeladen.stamp.sha === sha('c') && neuGeladen.byUniqueName.has('/Lotus/Powersuits/Narin/Narin'));

  console.log('\n=== Kaputter Stand wird nicht uebernommen ===\n');
  mirror.commits[sha('d')] = stand({ frames: ['Citrine', 'Citrine Prime', 'Narin'], weapons: 12, upgrades: 33, tag: 'd' });
  mirror.head = sha('d');
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('abgeschnittene ExportWeapons verworfen', !res.changed && /ExportWeapons/.test(res.error || ''), res.error);
  ok('Platte unberuehrt', onDisk().sha === sha('c'));
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('derselbe kaputte Commit wird nicht noch einmal geladen', !res.changed && downloads().length === 0);

  /* Eine Datei antwortet nicht - das ist kein kaputter Stand, nur Pech. */
  mirror.commits[sha('e')] = stand({ frames: ['Citrine', 'Citrine Prime', 'Narin', 'Neu'], weapons: 44, upgrades: 33, tag: 'e' });
  mirror.head = sha('e');
  mirror.broken = 'ExportRecipes';
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('Abruf scheitert: alter Stand bleibt', !res.changed && /HTTP 500/.test(res.error || '') && onDisk().sha === sha('c'), res.error);
  mirror.broken = null;
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('naechster Versuch holt ihn', res.changed && res.added.some(i => i.name === 'Neu'));
  cat = res.catalog;

  console.log('\n=== GitHub antwortet nicht ===\n');
  mirror.head = null;
  mirror.branch = stand({ frames: ['Citrine', 'Citrine Prime', 'Narin', 'Neu', 'Zweig'], weapons: 44, upgrades: 33, tag: 'z' });
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('Katalog juenger als eine Woche: nichts geladen', !res.changed && downloads().length === 0);
  cat.stamp.fetchedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('aelter als eine Woche: vom Zweig geholt', res.changed && downloads().every(u => u.startsWith('https://cdn.jsdelivr.net/')));
  ok('ohne Commit keine Pruefsummen abgelegt', onDisk().sha === null && onDisk().hashes === null);
  cat = res.catalog;

  /* GitHub ist zurueck, der Spiegel unveraendert - der Stand vom Zweig ist
     trotzdem ungeprueft und wird einmal sauber nachgeholt. */
  mirror.commits[sha('f')] = mirror.branch;
  mirror.head = sha('f');
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('GitHub zurueck: einmal fest auf den Commit nachgeholt', res.changed && downloads().every(u => u.includes(`/${sha('f')}/`)));
  cat = res.catalog;
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('danach wieder Ruhe', !res.changed && downloads().length === 0);

  console.log('\n=== Katalog aus 1.24.0 (ohne Commit und Zahlen) ===\n');
  const alt = onDisk();
  writeFileSync(file, JSON.stringify({ version: alt.version, fetchedAt: Date.now() - 46 * 864e5,
                                       items: alt.items, recipes: alt.recipes, lookup: alt.lookup }));
  cat = await loadCatalog({ dataDir: dir });
  ok('alte Datei wird gelesen', cat.items.length === alt.items.length && cat.stamp.sha === null);
  reset();
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('und beim ersten Pruefen ersetzt', res.changed && onDisk().sha === sha('f'));

  /* Gegenprobe zur Gesamtzahl: die alte Datei kennt keine Zahlen je Datei. */
  writeFileSync(file, JSON.stringify({ version: alt.version, fetchedAt: Date.now() - 864e5,
                                       items: alt.items, recipes: alt.recipes, lookup: alt.lookup }));
  cat = await loadCatalog({ dataDir: dir });
  mirror.commits[sha('9')] = stand({ frames: ['Citrine'], weapons: 10, upgrades: 33, tag: '9' });
  mirror.head = sha('9');
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('ohne Zahlen je Datei greift die Gesamtzahl', !res.changed && /items/.test(res.error || ''), res.error);

  console.log('\n=== Kein Festfahren ===\n');
  /* DE duennt eine Datei wirklich aus: jeder neue Stand faellt durch. Nach
     einem Monat ohne Erfolg gilt nur noch "keine Datei leer". */
  mirror.head = sha('f');
  res = await refreshCatalog({ dataDir: dir, current: cat, force: true });
  ok('Ausgangslage: voller Katalog mit Zahlen je Datei', res.changed && res.catalog.stamp.counts?.ExportWeapons === 44, res.error);
  cat = res.catalog;
  mirror.commits[sha('8')] = stand({ frames: ['Citrine'], weapons: 10, upgrades: 33, tag: '8' });
  mirror.head = sha('8');
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('frischer Katalog: verworfen', !res.changed && /ExportWeapons/.test(res.error || ''), res.error);
  mirror.commits[sha('7')] = mirror.commits[sha('8')];
  mirror.head = sha('7');
  cat.stamp.fetchedAt = Date.now() - 31 * 864e5;
  res = await refreshCatalog({ dataDir: dir, current: cat });
  ok('nach einem Monat ohne Erfolg: uebernommen', res.changed && res.catalog.stamp.counts.ExportWeapons === 10, res.error);
  mirror.commits[sha('6')] = stand({ frames: ['Citrine'], weapons: 10, upgrades: 0, tag: '6' });
  mirror.head = sha('6');
  res = await refreshCatalog({ dataDir: dir, current: res.catalog });
  ok('eine leere Datei faellt immer durch', !res.changed && /ExportUpgrades ist leer/.test(res.error || ''), res.error);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FEHLER` : '\nAlles gruen.');
process.exit(failures ? 1 : 0);
