/**
 * Update-Pruefung gegen die GitHub-Releases des Projekts.
 *
 * WARUM KEIN electron-updater:
 *   Die uebliche Bibliothek erwartet eine latest.yml neben den Dateien, eine
 *   publish-Angabe in electron-builder.yml und - fuer den stillen Neustart -
 *   ein signiertes Paket. Argus liefert unsigniert aus und laesst bewusst
 *   auch eine portable .exe mitlaufen, die electron-updater gar nicht
 *   bedienen kann. Der Weg hier braucht nichts weiter als die oeffentliche
 *   Releases-API und die SHA256SUMS.txt, die der Workflow ohnehin schon baut.
 *
 * WARUM DIE PRUEFSUMME NICHT OPTIONAL IST:
 *   Ohne Signatur ist sie das Einzige, was zwischen "die Datei, die aus
 *   meinem Quelltext gebaut wurde" und "irgendeine .exe" unterscheidet. Ein
 *   Download ohne passenden Hash wird deshalb geloescht statt ausgefuehrt -
 *   siehe verifyFile().
 *
 * KEIN ELECTRON HIER:
 *   Wie ueberall in src/core/ - damit die Logik auch aus einem CLI-Skript
 *   heraus laeuft. Der Hauptprozess reicht Version und Zielpfad herein.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

/* Feste Herkunft. Bewusst keine Konfiguration: eine Update-Quelle, die sich
   ueber eine Einstellungsdatei umbiegen laesst, ist genau die Luecke, die
   eine Pruefsumme wieder aufmacht. */
export const REPO = 'Kr3akz/Argus';
const API_LATEST  = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

/* Der Praefix, den jede herunterladbare Datei tragen MUSS. Die Antwort der
   API kommt zwar von GitHub, aber eine Adresse daraus wird trotzdem geprueft
   und nicht einfach geglaubt. */
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

const CHECKSUM_FILE = 'SHA256SUMS.txt';

/* GitHub verlangt einen User-Agent, sonst antwortet die API mit 403. */
const userAgent = version => `Argus/${version || '0'} (+https://github.com/${REPO})`;

/* ------------------------------ Versionen ------------------------------ */

/**
 * "1.2.3" oder "v1.2.3-beta.2" -> { nums: [1,2,3], pre: 'beta.2' }
 * Gibt null zurueck, wenn daraus keine Version zu lesen ist - dann gilt sie
 * nirgends als neuer.
 */
export function parseVersion(value) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(value || '').trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || '' };
}

/**
 * -1 / 0 / 1 wie bei sort(). Eine Vorabversion gilt als AELTER als dieselbe
 * Zahl ohne Zusatz (1.4.0-rc.1 < 1.4.0), so schreibt es semver vor.
 */
export function compareVersions(a, b) {
  const va = parseVersion(a), vb = parseVersion(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) {
    if (va.nums[i] !== vb.nums[i]) return va.nums[i] < vb.nums[i] ? -1 : 1;
  }
  if (va.pre === vb.pre) return 0;
  if (!va.pre) return 1;          // ohne Zusatz ist die fertige Fassung
  if (!vb.pre) return -1;
  return va.pre < vb.pre ? -1 : 1;
}

export const isNewer = (candidate, current) => compareVersions(candidate, current) > 0;

/* ------------------------------ Abfrage ------------------------------ */

/**
 * Das neueste veroeffentlichte Release. Entwuerfe und Vorabversionen laesst
 * GitHub bei /releases/latest von sich aus weg - genau deshalb diese Route
 * und nicht die Liste aller Releases.
 */
async function fetchLatestRelease(currentVersion) {
  const res = await fetch(API_LATEST, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': userAgent(currentVersion)
    },
    signal: AbortSignal.timeout(10000)
  });
  /* 404 heisst hier nicht "kaputt", sondern "es gibt noch kein Release". */
  if (res.status === 404) return null;
  if (res.status === 403) throw new Error('GitHub is rate limiting this connection - try again later');
  if (!res.ok) throw new Error(`GitHub responded with HTTP ${res.status}`);
  return res.json();
}

/** Nur Dateien, deren Adresse wirklich aus diesem Repository stammt. */
const usableAsset = a => a && typeof a.browser_download_url === 'string'
                      && a.browser_download_url.startsWith(DOWNLOAD_PREFIX);

/**
 * Ordnet die angehaengten Dateien den drei Rollen zu, die uns interessieren.
 * Die Namen kommen aus artifactName in electron-builder.yml
 * (Argus-1.2.3-Setup.exe / Argus-1.2.3-portable.exe).
 */
export function pickAssets(release) {
  const list = (release?.assets || []).filter(usableAsset);
  const byName = re => list.find(a => re.test(a.name)) || null;
  return {
    setup:     byName(/setup\.exe$/i),
    portable:  byName(/portable\.exe$/i),
    checksums: list.find(a => a.name === CHECKSUM_FILE) || null
  };
}

/**
 * Die eine Frage, die der Hauptprozess stellt.
 *
 * Wirft nicht: ein fehlgeschlagener Update-Check ist kein Grund, irgendwo
 * einen roten Kasten einzublenden. Das Ergebnis traegt ok:false und einen
 * Grund, den die Einstellungen anzeigen koennen - mehr braucht es nicht.
 */
export async function checkForUpdate(currentVersion, { portable = false } = {}) {
  let release;
  try {
    release = await fetchLatestRelease(currentVersion);
  } catch (err) {
    return { ok: false, error: err.message, checkedAt: Date.now(), current: currentVersion };
  }
  if (!release) return { ok: true, available: false, checkedAt: Date.now(), current: currentVersion };

  const latest = String(release.tag_name || release.name || '').replace(/^v/, '');
  const assets = pickAssets(release);
  const wanted = portable ? assets.portable : assets.setup;

  return {
    ok: true,
    checkedAt: Date.now(),
    current: currentVersion,
    available: isNewer(latest, currentVersion),
    version: latest,
    name: release.name || `v${latest}`,
    notes: cleanNotes(release.body),
    publishedAt: release.published_at || null,
    pageUrl: typeof release.html_url === 'string' && release.html_url.startsWith(`${RELEASES_URL}/`)
      ? release.html_url
      : RELEASES_URL,
    /* Nur das, was der Renderer sehen darf - keine ganzen API-Objekte. */
    asset: wanted ? { name: wanted.name, size: wanted.size, url: wanted.browser_download_url } : null,
    checksums: assets.checksums ? { name: assets.checksums.name, url: assets.checksums.browser_download_url } : null
  };
}

/**
 * Die von GitHub erzeugten Notizen tragen eine Ueberschrift und eine Zeile
 * mit dem Vergleichslink. Beides sagt im Fenster nichts, was die Liste
 * darunter nicht schon zeigt.
 */
function cleanNotes(body) {
  if (!body) return '';
  return String(body)
    .replace(/^#+\s*What.s Changed\s*$/gim, '')
    .replace(/^\*\*Full Changelog\*\*:.*$/gim, '')
    .trim()
    .slice(0, 4000);
}

/* ------------------------------ Download ------------------------------ */

/** Liest SHA256SUMS.txt und gibt Dateiname -> Hash zurueck. */
export async function fetchChecksums(url, currentVersion) {
  if (!url || !url.startsWith(DOWNLOAD_PREFIX)) return null;
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent(currentVersion) },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) return null;
  const map = new Map();
  for (const line of (await res.text()).split(/\r?\n/)) {
    /* Format wie bei sha256sum: "<64 hex>  <dateiname>" */
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line.trim());
    if (m) map.set(m[2], m[1].toLowerCase());
  }
  return map.size ? map : null;
}

/**
 * Laedt eine Datei und bildet dabei ihren SHA256.
 *
 * Der Hash entsteht WAEHREND des Schreibens, nicht danach: sonst wandert
 * eine grosse Datei zweimal durch die Platte, und zwischen Ablegen und
 * Nachlesen laege ein Zeitfenster, in dem sie sich noch aendern koennte.
 *
 * onProgress bekommt { received, total } - total kann 0 sein, wenn der
 * Server keine Laenge meldet; die Oberflaeche zeigt dann einen unbestimmten
 * Balken statt einer falschen Prozentzahl.
 */
export async function downloadAsset(asset, destDir, { onProgress, signal, currentVersion } = {}) {
  if (!asset || !asset.url || !asset.url.startsWith(DOWNLOAD_PREFIX)) {
    throw new Error('That download does not come from the Argus repository');
  }
  /* Der Name kommt aus der API - er darf nie in einen Pfad geraten, ohne
     dass die Verzeichnisanteile abgeschnitten sind. */
  const fileName = path.basename(String(asset.name || 'argus-update.exe'));
  if (!/^[\w.-]+\.exe$/i.test(fileName)) throw new Error('Unexpected file name in the release');

  await mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, fileName);

  const res = await fetch(asset.url, {
    headers: { 'User-Agent': userAgent(currentVersion) },
    redirect: 'follow',
    signal
  });
  if (!res.ok || !res.body) throw new Error(`Download failed with HTTP ${res.status}`);

  const total = Number(res.headers.get('content-length')) || Number(asset.size) || 0;
  const hash = createHash('sha256');
  const out = createWriteStream(dest);
  let received = 0;

  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
      if (onProgress) onProgress({ received, total });
    }
    await new Promise((resolve, reject) => out.end(err => err ? reject(err) : resolve()));
  } catch (err) {
    out.destroy();
    await rm(dest, { force: true });
    throw err;
  }

  return { path: dest, name: fileName, size: received, sha256: hash.digest('hex') };
}

/**
 * Vergleicht den beim Laden gebildeten Hash mit der Liste aus dem Release.
 *
 * Passt er nicht - oder fehlt die Liste ueberhaupt - wird die Datei
 * geloescht. Eine nicht nachweisbare .exe im Update-Ordner liegen zu lassen
 * hiesse, sie waere spaeter doch noch da, wenn jemand nachsieht.
 */
export async function verifyFile(downloaded, checksums) {
  const expected = checksums?.get(downloaded.name);
  if (!expected) {
    await rm(downloaded.path, { force: true });
    return { ok: false, error: `No checksum for ${downloaded.name} in ${CHECKSUM_FILE} - the download was discarded` };
  }
  if (expected !== downloaded.sha256) {
    await rm(downloaded.path, { force: true });
    return { ok: false, error: 'The downloaded file does not match its published checksum - it was discarded' };
  }
  return { ok: true, sha256: downloaded.sha256 };
}

/** Alte Installer wegraeumen, bevor ein neuer geladen wird. */
export async function clearDownloads(dir) {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** Liegt die Datei noch da, in voller Laenge? */
export async function stillThere(file, size) {
  if (!file) return false;
  try {
    const st = await stat(file);
    return st.isFile() && (!size || st.size === size);
  } catch { return false; }
}
