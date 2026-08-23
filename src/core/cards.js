/**
 * Kartenbilder fuer Mods und Arcanes.
 *
 * WARUM NICHT DEs EXPORT:
 *   Der Bilderspiegel, aus dem das Inventar sonst lebt, liefert zu einer Mod
 *   nur das ILLUSTRATIONSBILD - den Ausschnitt, der auf der Karte oben sitzt.
 *   Rahmen, Name, Wirkung, Polaritaet und Rangpunkte fehlen. Genau die machen
 *   aber aus einem Bild eine Mod, die man auf einen Blick wiedererkennt.
 *
 *   Das Warframe-Wiki hat die FERTIG GERENDERTE Karte, so wie sie im Spiel
 *   aussieht, und fuer Arcanes das echte Arcane-Gefaess statt eines nackten
 *   Symbols. Von dort kommen die Bilder.
 *
 * WARUM KEIN EIGENER BILD-CACHE:
 *   Die Bilder liegen hinter Cloudflare und kommen mit
 *   "cache-control: public, max-age=31536000, immutable". Chromium legt sie
 *   damit von selbst dauerhaft ab - ein zweiter Cache daneben waere ein
 *   zweiter Ort, an dem etwas veralten kann.
 *
 * ZUGEORDNET WIRD UEBER DEN PFAD, nicht ueber den Namen: "Serration" gibt es
 * dreimal (Beginner, Intermediate, normal), und der Beginner-Eintrag traegt
 * das Bild von "Flawed Serration". Ueber den Namen zu gehen hiesse, mit einer
 * gewissen Wahrscheinlichkeit die falsche Karte zu zeigen.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './paths.js';

const URL_ITEMS = 'https://api.warframestat.us/items/?only=uniqueName,name,category,wikiaThumbnail';
const WIKI = 'https://wiki.warframe.com';
const CACHE = dir => path.join(dir, 'card-images.json');
const USER_AGENT = 'Argus/0.1 (persoenlicher Mastery-Planer)';

/* Bilder wechseln nur, wenn DE eine Karte neu zeichnet. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = 1;

let index = null;

/**
 * Laedt die Zuordnung Pfad -> Wiki-Dateiname.
 *
 * Die Antwort deckt den ganzen Itembestand ab (7 MB); gespeichert werden nur
 * Mods und Arcanes und von denen nur der Dateiname - rund 250 KB statt 7 MB.
 */
export async function loadCardImages({ dataDir = defaultDataDir(), refresh = false } = {}) {
  if (index && !refresh) return index;

  let cached = null;
  if (existsSync(CACHE(dataDir))) {
    try { cached = JSON.parse(await readFile(CACHE(dataDir), 'utf8')); } catch { cached = null; }
  }
  if (cached?.version !== CACHE_VERSION) cached = null;

  const fresh = cached && (Date.now() - cached.fetchedAt < TTL_MS);
  if (cached && fresh && !refresh) {
    index = build(cached);
    return index;
  }

  try {
    const res = await fetch(URL_ITEMS, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const files = {};
    const byName = {};
    for (const it of await res.json()) {
      if (it.category !== 'Mods' && it.category !== 'Arcanes') continue;
      const file = fileNameOf(it.wikiaThumbnail);
      if (!file) continue;
      files[it.uniqueName] = file;
      /* Nur als Notnagel fuer Pfade, die der Katalog anders schreibt als die
         Item-API - der erste Treffer gewinnt. */
      if (it.name && !byName[it.name.toLowerCase()]) byName[it.name.toLowerCase()] = file;
    }
    if (!Object.keys(files).length) throw new Error('keine Kartenbilder');

    const payload = { version: CACHE_VERSION, fetchedAt: Date.now(), files, byName };
    await mkdir(dataDir, { recursive: true });
    await writeFile(CACHE(dataDir), JSON.stringify(payload));
    index = build(payload);
  } catch (err) {
    if (!cached) throw err;
    index = build(cached);
    index.stale = err.message;
  }
  return index;
}

function build({ files, byName, fetchedAt }) {
  return {
    files: new Map(Object.entries(files || {})),
    byName: new Map(Object.entries(byName || {})),
    fetchedAt,
    stale: null
  };
}

/**
 * "https://wiki.warframe.com/images/SerrationMod.png?0b8ff" -> "SerrationMod.png?0b8ff"
 *
 * Die Ziffernfolge hinter dem Fragezeichen ist die Fassung des Bildes. Sie
 * bleibt dran: ohne sie liefert ein Zwischenspeicher nach einer Neuzeichnung
 * weiter die alte Karte.
 */
function fileNameOf(url) {
  const m = /\/images\/([^/?]+)(\?[^/]*)?$/.exec(String(url || ''));
  return m ? m[1] + (m[2] || '') : null;
}

/**
 * Bild-URL in der gewuenschten Breite.
 *
 * MediaWiki legt Verkleinerungen unter /images/thumb/<Datei>/<Breite>px-<Datei>
 * ab und erzeugt sie beim ersten Abruf. Die volle Karte waere 250 KB, in 160 px
 * sind es 100 - bei sechshundert Mods in einer Liste ist das der Unterschied
 * zwischen fluessig und zaeh.
 */
const CARD_OVERRIDES = new Map([
  ['/Lotus/Upgrades/CosmeticEnhancers/Antiques/HeatStatusProcOnUltimateKill', 'Zid-AnUskos.png'],
  ['/Lotus/Upgrades/CosmeticEnhancers/Antiques/StatusChanceOnUltimateHit', 'Zid-AnAsheir.png'],
  ['/Lotus/Upgrades/CosmeticEnhancers/Antiques/UltimateInvisibilty', 'Zid-AnSek-Eel.png'],
  ['/Lotus/Upgrades/CosmeticEnhancers/Antiques/VoidSlingsOverguardStrip', 'Zid-AnOsbok.png'],
  ['zid-an uskos', 'Zid-AnUskos.png'],
  ['zid-an asheir', 'Zid-AnAsheir.png'],
  ['zid-an sek-eel', 'Zid-AnSek-Eel.png'],
  ['zid-an osbok', 'Zid-AnOsbok.png'],
  ['zid-an haras', 'Zid-AnHaras.png']
]);

export function cardUrl(idx, { uniqueName, name } = {}, width = 160) {
  const file = idx?.files.get(uniqueName)
    || (name ? idx?.byName.get(String(name).toLowerCase()) : null)
    || (uniqueName ? CARD_OVERRIDES.get(uniqueName) : null)
    || (name ? CARD_OVERRIDES.get(String(name).toLowerCase()) : null);
  if (!file) return null;

  const [base, version] = file.split('?');
  const enc = encodeURIComponent(decodePlain(base));
  return `${WIKI}/images/thumb/${enc}/${width}px-${enc}${version ? '?' + version : ''}`;
}

/**
 * Ein Teil der Dateinamen kommt bereits prozentkodiert an - aus dem Apostroph
 * in "Amar's Anguish" wird "Amar%27sAnguishMod.png". Wer den so weiterreicht
 * und noch einmal kodiert, landet bei %2527 und damit bei einer Adresse, die
 * es nicht gibt. Deshalb erst zurueck in den Klartext, dann sauber kodieren.
 */
function decodePlain(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}
