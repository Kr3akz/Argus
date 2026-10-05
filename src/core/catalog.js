/**
 * Item-Katalog aus DEs PublicExport.
 *
 * Wir ziehen den bereits entpackten Spiegel (github.com/Aericio/warframe-exports-data),
 * weil DEs Originaldateien LZMA-komprimiert sind und Node dafuer keinen eingebauten
 * Decoder hat. Inhaltlich identisch - es ist eine 1:1-Kopie von content.warframe.com.
 *
 * AKTUELL HALTEN (siehe refreshCatalog):
 *   Bis 1.24.0 wurde data/catalog.json einmal geschrieben und nie wieder
 *   angefasst. Am 05.10.2026 stand Kaans Katalog auf dem 20.08. - Narin und
 *   Citrine Prime fehlten, obwohl der Spiegel sie seit Tagen hatte.
 */
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './paths.js';
import { storeMods } from './mods.js';

const REPO = 'Aericio/warframe-exports-data';
const CDN_ROOT = `https://cdn.jsdelivr.net/gh/${REPO}`;
const CDN = `${CDN_ROOT}/export`;
const IMG = `${CDN_ROOT}/image`;

/* Der neueste Commit des Spiegels, als blosse 40 Zeichen (Accept-Kopf unten). */
const HEAD_URL = `https://api.github.com/repos/${REPO}/commits/HEAD`;

/* Fest auf einen Commit: direkt bei GitHub. jsDelivr kann das auch
   (gh/...@<sha>/...), lieferte am 05.10.2026 fuer genau diesen Spiegel aber
   ExportResources nach 54 s mit 503 und ExportUpgrades mit 404 - im ersten
   Lauf der echten App scheiterte so der ganze Abruf. GitHub gab denselben
   Commit in unter 0,6 s heraus, gzip-gepackt rund 600 KB fuer alle sieben. */
const PINNED = sha => `https://raw.githubusercontent.com/${REPO}/${sha}`;
const USER_AGENT = 'Argus (persoenlicher Mastery-Planer)';
const PROBE_TIMEOUT_MS = 5000;

/* Nur der Rueckfall, wenn GitHub nicht antwortet - sonst entscheiden Commit
   und Pruefsummen (siehe refreshCatalog). */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/* Ein neuer Stand muss je Datei mindestens so viele Eintraege haben -
   gemessen am alten. DE entfernt mit einem Update eine Handvoll Items, nie
   ein Zehntel; weniger heisst, die Datei kam abgeschnitten oder leer an. */
const MIN_SHARE = 0.9;

/* ...aber nur, solange der alte Stand juenger als ein Monat ist. Wer so lange
   jeden neuen verwirft, irrt sich vermutlich selbst - etwa weil DE eine Datei
   wirklich ausgeduennt oder Eintraege in eine andere verschoben hat. Ohne
   diesen Ausweg bliebe Argus dann fuer immer auf dem alten Katalog stehen.
   Danach zaehlt nur noch, dass keine Datei leer ist. */
const STRICT_FOR_MS = 30 * 24 * 60 * 60 * 1000;

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

/* Exportiert fuer dispositions.js: das braucht eine einzelne Datei frisch,
   nicht den ganzen Katalog. `base` zeigt beim Erneuern auf einen festen
   Commit statt auf den Zweig. */
export async function fetchExport(name, base = CDN) {
  const res = await fetch(`${base}/${name}_en.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return flattenExport(await res.json());
}

/** Laedt den Katalog, mit Cache auf Platte. force erzwingt den Abruf. */
export async function loadCatalog({ dataDir = defaultDataDir(), force = false } = {}) {
  await mkdir(dataDir, { recursive: true });
  const cacheFile = path.join(dataDir, 'catalog.json');

  if (existsSync(cacheFile) && !force) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
      if (cached.version === CACHE_VERSION && cached.items && cached.recipes) {
        return buildIndex(cached.items, cached.recipes, cached.lookup || [], stampOf(cached));
      }
    } catch {
      // Beschädigte Datei -> neu laden
    }
  }

  const sha = await latestCommit();
  const hashes = sha ? await exportHashes(PINNED(sha)) : null;
  const res = await fetchCatalog(dataDir, null, sha, hashes);
  if (!res.catalog) throw new Error(`Item-Katalog: ${res.error}`);
  return res.catalog;
}

/* ------------------------------------------------------------------ */
/*  Aktuell halten                                                    */
/* ------------------------------------------------------------------ */

/**
 * Welcher Commit des Spiegels der neueste ist - oder null.
 *
 * WARUM UEBERHAUPT GITHUB, WO DOCH DER ERSTE ABRUF UEBER jsDelivr KOMMT:
 *   jsDelivr haelt jede Datei eines Zweigs bis zu zwoelf Stunden vor
 *   (s-maxage=43200, gemessen am 05.10.2026), und zwar JEDE FUER SICH. Kurz
 *   nach einem Update kann die Pruefsummen-Datei also schon neu sein, waehrend
 *   ExportWarframes noch den alten Stand ausliefert. Argus haette dann die
 *   neue Pruefsumme mit dem alten Inhalt abgelegt - und bis zum naechsten
 *   Update geglaubt, es sei aktuell. Auf einen Commit festgenagelt (PINNED)
 *   gibt es dieses Durcheinander nicht: alle Dateien stammen aus demselben
 *   Stand, und den aendert niemand mehr.
 *
 *   Die Antwort ist der Commit selbst, 40 Zeichen. Ohne Anmeldung erlaubt
 *   GitHub 60 Anfragen je Stunde und Adresse; Argus stellt eine beim Start
 *   und dann alle sechs Stunden.
 */
async function latestCommit() {
  try {
    const res = await fetch(HEAD_URL, {
      headers: { Accept: 'application/vnd.github.sha', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const sha = (await res.text()).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/**
 * DEs Pruefsummen der Dateien, die Argus liest - oder null.
 *
 * Der Spiegel legt neben export/ eine export_hash.json ab (847 Byte), in der
 * fuer jede Export-Datei DEs eigene Kennung steht, z. B.
 * "ExportWarframes_en.json": "00_67ldvOzz0UQvIZjyuFkxuw". Der Spiegel bekommt
 * auch Commits, die keine dieser Dateien betreffen - neue Bilder etwa. Nur
 * wenn sich eine UNSERER Kennungen aendert, lohnt der grosse Abruf.
 *
 * Fehlt auch nur eine, gibt es keinen Vergleich: dann entscheidet der Commit.
 */
async function exportHashes(base) {
  try {
    const res = await fetch(`${base}/export_hash.json`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const all = await res.json();
    const out = {};
    for (const f of [...EXPORT_FILES, ...LOOKUP_FILES]) {
      const h = all?.[`${f}_en.json`];
      if (typeof h !== 'string' || !h) return null;
      out[f] = h;
    }
    return out;
  } catch {
    return null;
  }
}

function sameHashes(a, b) {
  return !!a && !!b && [...EXPORT_FILES, ...LOOKUP_FILES].every(f => a[f] === b[f]);
}

/* Was ueber die Herkunft eines Katalogs bekannt ist. In Dateien von vor
   1.24.1 steht nur fetchedAt - dann gilt der Rest als unbekannt. */
function stampOf(c) {
  return {
    fetchedAt: c?.fetchedAt || 0,
    sha: c?.sha || null,
    hashes: c?.hashes || null,
    counts: c?.counts || null
  };
}

/** Alle sieben Dateien von `base`, mit der Zahl der Eintraege je Datei. */
async function download(base) {
  const items = [];
  let recipes = [];
  const lookup = [];
  let upgrades = [];
  const counts = {};

  for (const f of EXPORT_FILES) {
    const rows = await fetchExport(f, base);
    counts[f] = rows.length;
    if (f === 'ExportRecipes') recipes = rows;
    else items.push(...rows.filter(r => r.uniqueName));
  }
  for (const f of LOOKUP_FILES) {
    const rows = (await fetchExport(f, base)).filter(r => r.uniqueName && r.name);
    counts[f] = rows.length;
    if (f === 'ExportUpgrades') upgrades = rows;
    lookup.push(...rows);
  }
  return { items, recipes, lookup, upgrades, counts };
}

/**
 * Was gegen einen neuen Stand spricht - oder null.
 *
 * Lieber noch ein paar Stunden der alte Katalog als ein halber: fehlte nach
 * einem Abruf ExportWeapons, verschwaende jede Waffe aus der Mastery-Liste,
 * aus den Zielen und aus den Namen im Inventar.
 *
 * Aeltere Dateien kennen ihre Zahlen je Datei nicht; dann wird wenigstens
 * die Gesamtzahl verglichen.
 */
function implausible(next, prev) {
  const strict = !!prev && Date.now() - (prev.stamp?.fetchedAt || 0) < STRICT_FOR_MS;
  for (const f of [...EXPORT_FILES, ...LOOKUP_FILES]) {
    if (!next.counts[f]) return `${f} ist leer`;
    const before = strict ? prev.stamp?.counts?.[f] : 0;
    if (before && next.counts[f] < before * MIN_SHARE) {
      return `${f}: ${next.counts[f]} statt ${before} Eintraege`;
    }
  }
  if (strict && !prev.stamp?.counts) {
    for (const key of ['items', 'recipes']) {
      const before = prev[key]?.length || 0;
      if (next[key].length < before * MIN_SHARE) return `${key}: ${next[key].length} statt ${before}`;
    }
  }
  return null;
}

/* Erst eine Nebendatei, dann umbenennen: ein Absturz mitten im Schreiben
   hinterliesse sonst einen halben Katalog - und mit dem startete Argus. */
async function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, text);
  try {
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

/**
 * Holt den Katalog von einem festen Commit (oder, ohne sha, vom Zweig) und
 * legt ihn ab. Wirft nicht: scheitert etwas, steht der Grund in `error`, und
 * der bisherige Katalog bleibt, wie er ist.
 *
 * `hashes` nur zusammen mit `sha`: nur mit festem Commit gehoeren Pruefsummen
 * und Inhalt sicher zusammen. Ohne ihn bleiben sie leer - dann holt der
 * naechste Lauf, bei dem GitHub antwortet, den Katalog noch einmal sauber.
 */
async function fetchCatalog(dataDir, prev, sha, hashes) {
  const base = sha ? PINNED(sha) : CDN_ROOT;
  if (!sha) hashes = null;

  let next;
  try {
    next = await download(`${base}/export`);
  } catch (err) {
    return { changed: false, error: err.message };
  }
  const problem = implausible(next, prev);
  if (problem) return { changed: false, error: problem, sha };

  const payload = {
    version: CACHE_VERSION, fetchedAt: Date.now(),
    sha: sha || null, hashes, counts: next.counts,
    items: next.items, recipes: next.recipes, lookup: next.lookup
  };
  let error = null;
  try {
    await mkdir(dataDir, { recursive: true });
    await writeAtomic(path.join(dataDir, 'catalog.json'), JSON.stringify(payload));
  } catch (err) {
    /* Im Speicher gilt der neue Stand trotzdem - nur der naechste Start
       muss ihn dann noch einmal holen. */
    error = `nicht gespeichert: ${err.message}`;
  }

  /* Die Mod-Liste ist ein Ausschnitt aus derselben ExportUpgrades. Sie wurde
     bisher getrennt geholt und ebenfalls nie erneuert - Augment-Karten eines
     neuen Warframes fehlten dort genauso. */
  const mods = await storeMods(next.upgrades, { dataDir }).catch(() => null);

  const catalog = buildIndex(payload.items, payload.recipes, payload.lookup, stampOf(payload));
  const added = prev ? catalog.items.filter(i => !prev.byUniqueName.has(i.uniqueName)) : [];
  return { changed: true, catalog, mods, added, error };
}

let inflight = null;
let rejectedSha = null;

/**
 * Prueft, ob es einen neueren Katalog gibt, und holt ihn dann.
 *
 * WANN NEU GELADEN WIRD:
 *   1. Neuester Commit des Spiegels (40 Byte). Derselbe wie beim letzten
 *      Abruf: fertig.
 *   2. Sonst DEs Pruefsummen aus diesem Commit (847 Byte). Haben sich die
 *      sieben Dateien nicht veraendert, die Argus liest: fertig.
 *   3. Sonst die sieben Dateien aus genau diesem Commit, und nur, wenn sie
 *      plausibel sind (siehe implausible), ersetzen sie den alten Stand.
 *   Antwortet GitHub nicht, gilt der alte Katalog noch eine Woche; danach
 *   wird er ohne Pruefsumme vom Zweig geholt.
 *
 * Wie oft das passiert, entscheidet der Aufrufer (main.js: beim Start und
 * alle sechs Stunden). Laufen zwei Aufrufe zugleich, teilen sie sich einen.
 *
 * @param current  der Katalog, der gerade benutzt wird (oder null - dann
 *                 wird der auf der Platte gelesen)
 * @returns {Promise<{ changed: boolean, catalog?, mods?, added?: object[], error?: string }>}
 *          added sind die Items, die es vorher nicht gab.
 */
export function refreshCatalog({ dataDir = defaultDataDir(), current = null, force = false } = {}) {
  if (!inflight) {
    inflight = refreshOnce(dataDir, current, force).finally(() => { inflight = null; });
  }
  return inflight;
}

async function refreshOnce(dataDir, current, force) {
  if (!current) current = await loadCatalog({ dataDir }).catch(() => null);
  const stamp = current?.stamp || stampOf(null);

  const sha = await latestCommit();
  if (!sha) {
    if (!force && current && Date.now() - stamp.fetchedAt < TTL_MS) return { changed: false };
    return fetchCatalog(dataDir, current, null, null);
  }

  if (!force && current && sha === stamp.sha) return { changed: false };

  const hashes = await exportHashes(PINNED(sha));
  if (!force && current && hashes && sameHashes(hashes, stamp.hashes)) {
    /* Neuer Commit, aber nicht fuer uns. Nur im Speicher vermerkt - die
       Datei deshalb neu zu schreiben hiesse 9 MB fuer 40 Zeichen. */
    current.stamp = { ...stamp, sha };
    return { changed: false };
  }

  /* Einen Stand, der schon einmal unplausibel war, nicht alle sechs Stunden
     erneut herunterladen - erst der naechste Commit bekommt eine Chance. */
  if (!force && sha === rejectedSha) return { changed: false };

  const res = await fetchCatalog(dataDir, current, sha, hashes);
  if (!res.changed && res.sha) rejectedSha = res.sha;
  return res;
}

/* Ergaenzungen fuer kuerzlich erschienene Items (z. B. Update 41 / The Old Peace),
   die in frueheren Export-Spiegeln noch fehlen. */
export const CATALOG_SUPPLEMENTS = [
  {
    uniqueName: '/Lotus/Upgrades/CosmeticEnhancers/Antiques/HeatStatusProcOnUltimateKill',
    name: 'Zid-An Uskos',
    rarity: 'RARE',
    levelStats: [
      { stats: ['On Operator and Tauron Strike Kill:\r\n+0.4% Primary Heat Damage (Rest of Mission, Max +250%)'] },
      { stats: ['On Operator and Tauron Strike Kill:\r\n+0.8% Primary Heat Damage (Rest of Mission, Max +250%)'] },
      { stats: ['On Operator and Tauron Strike Kill:\r\n+1.2% Primary Heat Damage (Rest of Mission, Max +250%)'] },
      { stats: ['On Operator and Tauron Strike Kill:\r\n+1.6% Primary Heat Damage (Rest of Mission, Max +250%)\r\n+1 Arcane Revive'] },
      { stats: ['On Operator and Tauron Strike Kill:\r\n+2.0% Primary Heat Damage (Rest of Mission, Max +250%)\r\n+1 Arcane Revive'] },
      { stats: ['On Operator and Tauron Strike Kill:\r\n+2.4% Primary Heat Damage (Rest of Mission, Max +250%)\r\n+1 Arcane Revive'] }
    ]
  },
  {
    uniqueName: '/Lotus/Upgrades/CosmeticEnhancers/Antiques/StatusChanceOnUltimateHit',
    name: 'Zid-An Asheir',
    rarity: 'RARE',
    levelStats: [
      { stats: ['On Tauron Strike Hit:\r\n+1% Status Chance for 30s per enemy hit (Max +300%)\r\n+3% Tauron Strike Initial Charge'] },
      { stats: ['On Tauron Strike Hit:\r\n+2% Status Chance for 30s per enemy hit (Max +300%)\r\n+6% Tauron Strike Initial Charge'] },
      { stats: ['On Tauron Strike Hit:\r\n+3% Status Chance for 30s per enemy hit (Max +300%)\r\n+9% Tauron Strike Initial Charge'] },
      { stats: ['On Tauron Strike Hit:\r\n+4% Status Chance for 30s per enemy hit (Max +300%)\r\n+12% Tauron Strike Initial Charge\r\n+1 Arcane Revive'] },
      { stats: ['On Tauron Strike Hit:\r\n+5% Status Chance for 30s per enemy hit (Max +300%)\r\n+15% Tauron Strike Initial Charge\r\n+1 Arcane Revive'] },
      { stats: ['On Tauron Strike Hit:\r\n+6% Status Chance for 30s per enemy hit (Max +300%)\r\n+18% Tauron Strike Initial Charge\r\n+1 Arcane Revive'] }
    ]
  },
  {
    uniqueName: '/Lotus/Upgrades/CosmeticEnhancers/Antiques/UltimateInvisibilty',
    name: 'Zid-An Sek-Eel',
    rarity: 'RARE',
    levelStats: [
      { stats: ['On Tauron Strike Cast:\r\nInvisibility for 5s\r\n+1.5% Tauron Strike Charge Rate'] },
      { stats: ['On Tauron Strike Cast:\r\nInvisibility for 10s\r\n+3% Tauron Strike Charge Rate'] },
      { stats: ['On Tauron Strike Cast:\r\nInvisibility for 15s\r\n+4.5% Tauron Strike Charge Rate'] },
      { stats: ['On Tauron Strike Cast:\r\nInvisibility for 20s\r\n+6% Tauron Strike Charge Rate\r\n+1 Arcane Revive'] },
      { stats: ['On Tauron Strike Cast:\r\nInvisibility for 25s\r\n+7.5% Tauron Strike Charge Rate\r\n+1 Arcane Revive'] },
      { stats: ['On Tauron Strike Cast:\r\nInvisibility for 30s\r\n+9% Tauron Strike Charge Rate\r\n+1 Arcane Revive'] }
    ]
  },
  {
    uniqueName: '/Lotus/Upgrades/CosmeticEnhancers/Antiques/VoidSlingsOverguardStrip',
    name: 'Zid-An Osbok',
    rarity: 'RARE',
    levelStats: [
      { stats: ['Void Slings strip 5% enemy Overguard\r\nOn Overguard stripped:\r\n+0.5x Amp Critical Damage for 15s'] },
      { stats: ['Void Slings strip 10% enemy Overguard\r\nOn Overguard stripped:\r\n+1.0x Amp Critical Damage for 15s'] },
      { stats: ['Void Slings strip 15% enemy Overguard\r\nOn Overguard stripped:\r\n+1.5x Amp Critical Damage for 15s'] },
      { stats: ['Void Slings strip 20% enemy Overguard\r\nOn Overguard stripped:\r\n+2.0x Amp Critical Damage for 15s\r\n+1 Arcane Revive'] },
      { stats: ['Void Slings strip 25% enemy Overguard\r\nOn Overguard stripped:\r\n+2.5x Amp Critical Damage for 15s\r\n+1 Arcane Revive'] },
      { stats: ['Void Slings strip 30% enemy Overguard\r\nOn Overguard stripped:\r\n+3.0x Amp Critical Damage for 15s\r\n+1 Arcane Revive'] }
    ]
  }
];

function buildIndex(items, recipes, lookup = [], stamp = stampOf(null)) {
  const byUniqueName = new Map();
  for (const it of items) if (it.uniqueName) byUniqueName.set(it.uniqueName, it);
  /* Nachschlage-Eintraege danach, damit ein echtes Item nie ueberschrieben wird. */
  for (const it of lookup) if (!byUniqueName.has(it.uniqueName)) byUniqueName.set(it.uniqueName, it);
  for (const it of CATALOG_SUPPLEMENTS) {
    if (!byUniqueName.has(it.uniqueName)) {
      byUniqueName.set(it.uniqueName, it);
      lookup.push(it);
    }
  }

  // Rezepte nach Ergebnis-Item indizieren -> "was brauche ich zum Bauen"
  const recipeFor = new Map();
  for (const r of recipes || []) if (r.resultType) recipeFor.set(r.resultType, r);

  /* Und nach dem Bauplan selbst - so wird aus einem Inventar-Eintrag
     ".../RhinoChassisBlueprint" das Ergebnis-Item, das ihm den Namen gibt. */
  const recipeByUniqueName = new Map();
  for (const r of recipes || []) if (r.uniqueName) recipeByUniqueName.set(r.uniqueName, r);

  return { items, byUniqueName, recipes: recipes || [], recipeFor, recipeByUniqueName, lookup, stamp };
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
