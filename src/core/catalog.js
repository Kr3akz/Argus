/**
 * Item-Katalog aus DEs PublicExport.
 *
 * Wir ziehen den bereits entpackten Spiegel (github.com/Aericio/warframe-exports-data),
 * weil DEs Originaldateien LZMA-komprimiert sind und Node dafuer keinen eingebauten
 * Decoder hat. Inhaltlich identisch - es ist eine 1:1-Kopie von content.warframe.com.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './paths.js';

const CDN = 'https://cdn.jsdelivr.net/gh/Aericio/warframe-exports-data/export';
const IMG = 'https://cdn.jsdelivr.net/gh/Aericio/warframe-exports-data/image';

export const EXPORT_FILES = [
  'ExportWeapons', 'ExportWarframes', 'ExportSentinels',
  'ExportRecipes', 'ExportResources'
];

/**
 * Nur zum Nachschlagen von Namen und Bildern, NICHT Teil von items.
 *
 * Das Inventar enthaelt Mods, Relikte und Arcanes, die es in EXPORT_FILES nicht
 * gibt. Sie duerfen aber nicht in items landen: analyze.js rechnet daraus die
 * Mastery, und Mods geben keine. Deshalb ein getrennter Topf, der ausschliesslich
 * in byUniqueName einfliesst.
 *
 * ExportUpgrades bewusst UNGEFILTERT - mods.js beschraenkt sich auf
 * /Upgrades/Mods/ und verliert dabei Sentinel-Precepts ("Thumper"), Stances
 * ("Reaping Spiral") und Augment-Karten ("Teleport Rush"), die im Inventar alle
 * als Mods auftauchen.
 */
export const LOOKUP_FILES = ['ExportUpgrades', 'ExportRelicArcane'];

/* Hochzaehlen, wenn sich der Inhalt der Cache-Datei strukturell aendert -
   sonst liest eine alte data/catalog.json ohne die Nachschlage-Eintraege weiter. */
const CACHE_VERSION = 2;

/**
 * ACHTUNG: Die Export-Dateien haben MEHRERE Top-Level-Keys.
 * ExportWeapons enthaelt auch ExportRailjackWeapons, ExportWarframes auch
 * ExportAbilities. Wer nur den ersten Key nimmt, verliert ~97% der Items.
 */
function flattenExport(json) {
  const out = [];
  for (const key of Object.keys(json)) {
    if (Array.isArray(json[key])) out.push(...json[key]);
  }
  return out;
}

async function fetchExport(name) {
  const res = await fetch(`${CDN}/${name}_en.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return flattenExport(await res.json());
}

/** Laedt den Katalog, mit Cache auf Platte. maxAgeHours=0 erzwingt Refresh. */
export async function loadCatalog({ dataDir = defaultDataDir(), force = false } = {}) {
  await mkdir(dataDir, { recursive: true });
  const cacheFile = path.join(dataDir, 'catalog.json');

  if (existsSync(cacheFile) && !force) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
      if (cached.version === CACHE_VERSION && cached.items && cached.recipes) {
        return buildIndex(cached.items, cached.recipes, cached.lookup || []);
      }
    } catch {
      // Beschädigte Datei -> neu laden
    }
  }

  const items = [];
  let recipes = [];
  for (const f of EXPORT_FILES) {
    const rows = await fetchExport(f);
    if (f === 'ExportRecipes') recipes = rows;
    else items.push(...rows.filter(r => r.uniqueName));
  }

  const lookup = [];
  for (const f of LOOKUP_FILES) {
    lookup.push(...(await fetchExport(f)).filter(r => r.uniqueName && r.name));
  }

  await writeFile(cacheFile,
    JSON.stringify({ version: CACHE_VERSION, fetchedAt: Date.now(), items, recipes, lookup }));
  return buildIndex(items, recipes, lookup);
}

function buildIndex(items, recipes, lookup = []) {
  const byUniqueName = new Map();
  for (const it of items) if (it.uniqueName) byUniqueName.set(it.uniqueName, it);
  /* Nachschlage-Eintraege danach, damit ein echtes Item nie ueberschrieben wird. */
  for (const it of lookup) if (!byUniqueName.has(it.uniqueName)) byUniqueName.set(it.uniqueName, it);

  // Rezepte nach Ergebnis-Item indizieren -> "was brauche ich zum Bauen"
  const recipeFor = new Map();
  for (const r of recipes || []) if (r.resultType) recipeFor.set(r.resultType, r);

  /* Und nach dem Bauplan selbst - so wird aus einem Inventar-Eintrag
     ".../RhinoChassisBlueprint" das Ergebnis-Item, das ihm den Namen gibt. */
  const recipeByUniqueName = new Map();
  for (const r of recipes || []) if (r.uniqueName) recipeByUniqueName.set(r.uniqueName, r);

  return { items, byUniqueName, recipes: recipes || [], recipeFor, recipeByUniqueName, lookup };
}

/**
 * Anzeigetexte aus dem Export von ihren Auszeichnungen befreien.
 *
 * DE schreibt sie fuer die Spiel-Oberflaeche: <DT_FIRE_COLOR> faerbt "Hitze"
 * rot, |BASE| wird zur Laufzeit durch eine Zahl ersetzt, <LOWER_IS_BETTER>
 * dreht den Pfeil um. Ausserhalb des Spiels ist das nur Rauschen.
 *
 * Steht hier, weil es JEDEN Export-Text betrifft - Mods, Waffen, Faehigkeiten -
 * und nicht nur den einen Ort, an dem es zuerst gebraucht wurde.
 */
export function cleanGameText(str) {
  if (!str) return '';
  return String(str)
    .replace(/<[^>]*>/g, '')
    .replace(/\|[A-Z0-9_]+\|/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** uniqueName -> Bild-URL. /Lotus/Weapons/X/Y => Lotus.Weapons.X.Y.png */
export function imageUrl(uniqueName, size = 128) {
  const slug = uniqueName.replace(/^\//, '').replaceAll('/', '.');
  if (size === 0 || size >= 512) return `${IMG}/${slug}.png`;
  return `${IMG}/${size}x${size}/${slug}.png`;
}
