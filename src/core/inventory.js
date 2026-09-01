/**
 * Inventar-Abruf ueber die authentifizierte Warframe-API.
 *
 * DROSSELUNG HAT VORRANG:
 *   Derselbe Host hat schon einmal eine IP-Sperre ausgeloest, mit der Folge
 *   "too many logins" BEIM SPIEL-LOGIN. Deshalb laeuft jeder Abruf durch
 *   ratelimit.js - denselben Topf, den auch das Profil benutzt. DE drosselt pro
 *   IP, nicht pro Endpunkt; zwei getrennte Budgets waeren nur eine Umgehung der
 *   eigenen Bremse. Ohne refresh:true passiert hier nie ein Netzwerkzugriff.
 *
 * ZUGANGSDATEN:
 *   accountId und nonce stehen in der URL. Diese URL wird nirgends geloggt, nicht
 *   in Fehlermeldungen aufgenommen und nicht gespeichert. Fremder Text, der in
 *   eine Fehlermeldung wandert, laeuft vorher durch scrub().
 *
 * HOST UND ROUTE:
 *   Aus dem Request-Puffer des laufenden Clients abgelesen - dort steht
 *   durchgehend "Host: api.warframe.com" und das Muster
 *   /api/<name>.php?accountId=..&nonce=..&ct=STM (belegt fuer credits.php,
 *   drones.php, guildTech.php, updateSession.php, hostSession.php,
 *   updateChallengeProgress.php).
 *
 *   "inventory.php" selbst kommt im Speicher NICHT vor - der PC-Client ruft es
 *   nicht auf. Der Endpunktname stammt aus warframe-api-helper; dessen Autor
 *   vermerkt dort ausdruecklich "Could also use api.warframe.com", beide Hosts
 *   bedienen also denselben Endpunkt. Bleibt der Punkt, den wir nicht selbst
 *   gemessen haben - deshalb ist ENDPOINT eine eigene Konstante und 404 ein
 *   eigener Fehlerfall, der genau darauf zeigt.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './paths.js';
import { checkAllowed, recordRequest, recordThrottled, formatWait, USER_AGENT,
         RateLimitedError } from './ratelimit.js';
import { scanCredentials } from './gamecreds.js';

const HOST     = 'api.warframe.com';
const ENDPOINT = '/api/inventory.php';
const CACHE = 'inventory.json';            // echte API-Antwort

/** Entfernt alles, was nach Zugangsdaten aussieht, aus fremdem Text. */
function scrub(text) {
  return String(text)
    .replace(/[0-9a-f]{24}/gi, '<id>')
    .replace(/\d{12,}/g, '<zahl>')
    .replace(/(nonce=)[^&\s]*/gi, '$1<nonce>');
}

/** Baut die Abruf-URL. Das Ergebnis traegt Zugangsdaten - niemals ausgeben. */
function buildUrl({ accountId, nonce, ct }) {
  const q = new URLSearchParams({ accountId, nonce });
  if (ct) q.set('ct', ct);   // Plattform, im Puffer durchgehend als ct=STM
  return `https://${HOST}${ENDPOINT}?${q.toString()}`;
}

function staleError(msg) {
  return Object.assign(new Error(msg), { staleCredentials: true });
}

/**
 * Genau EIN HTTP-Abruf. Nur ueber loadInventory aufrufen - hier sitzt zwar die
 * Zaehlung, aber nicht die Vorab-Pruefung.
 */
async function requestInventory(creds) {
  await recordRequest();

  let res;
  try {
    res = await fetch(buildUrl(creds), {
      cache: 'no-cache',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    });
  } catch (e) {
    // Netzwerkfehler koennen die URL enthalten - Meldung nicht durchreichen.
    throw new Error('Network error while fetching the inventory (no connection?).');
  }

  if (res.status === 403 || res.status === 429) {
    await recordThrottled();
    throw new RateLimitedError();
  }
  if (res.status === 409) {
    const body = (await res.text()).trim();
    if (!body) { await recordThrottled(); throw new RateLimitedError(); }
    throw staleError('Request refused (409). The session data has probably expired.');
  }
  if (res.status === 404) {
    throw Object.assign(
      new Error(`Endpoint ${ENDPOINT} does not exist (404). The path is the only `
              + 'ungepruefte Annahme - Endpunktname korrigieren.'),
      { status: 404, wrongEndpoint: true });
  }
  if (res.status === 400 || res.status === 401) {
    throw staleError(`Zugangsdaten abgelehnt (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Inventar-Abruf fehlgeschlagen (HTTP ${res.status}).`),
      { status: res.status });
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* Kein JSON heisst in aller Regel: die Sitzung ist abgelaufen und wir haben eine
       Fehlerseite bekommen. Nur ein knapper, gesaeuberter Anfang in die Meldung. */
    throw staleError('The response was not JSON (' + text.length + ' characters): '
                   + scrub(text.slice(0, 120)));
  }

  /* Ein leeres Objekt ist keine gueltige Antwort - der Blob hat 185 Felder. */
  if (!json || typeof json !== 'object' || !Object.keys(json).length) {
    throw staleError('Antwort war leer.');
  }
  return json;
}

async function readFixture(file, source) {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    return { ...raw, source: raw.source || source };
  } catch {
    return null;   // Beschaedigte Datei wie "nicht vorhanden" behandeln
  }
}

/**
 * Der lokale Stand, sonst nichts.
 *
 * Frueher lag hier ein zweiter Weg: eine Fixture, die aus der Datendatei
 * eines anderen Programms gezogen wurde, als die IP-Drosselung den ersten
 * Live-Abruf 24 Stunden lang blockierte. Der Steigbuegel hat seinen Zweck
 * erfuellt und ist raus - das Inventar kommt aus genau einer Quelle, dem
 * eigenen API-Abruf. source bleibt trotzdem am Ergebnis: die Oberflaeche
 * zeigt damit an, wie alt der Stand ist.
 */
async function readCache(dataDir) {
  return await readFixture(path.join(dataDir, CACHE), 'api');
}

/**
 * Inventar laden. Standardmaessig NUR aus der lokalen Datei.
 *
 * Ein Netzwerkabruf passiert ausschliesslich mit refresh:true, also auf
 * ausdrueckliche Nutzeraktion, und auch dann nur, wenn ratelimit.js zustimmt.
 * force:true ueberspringt den Mindestabstand zwischen zwei Abrufen, NICHT die
 * Sperre nach einer echten Drosselung. Genutzt wird das nur von der
 * Ersteinrichtung, wo Profil und Inventar als Paar geholt werden - und dort
 * begrenzt, siehe SETUP_FORCE_LIMIT in main.js.
 */
export async function loadInventory({ dataDir = defaultDataDir(), refresh = false, force = false } = {}) {
  await mkdir(dataDir, { recursive: true });
  const cacheFile = path.join(dataDir, CACHE);
  const cached = await readCache(dataDir);

  if (!refresh) {
    if (cached) return { inventory: cached.inventory, fromCache: true,
                         fetchedAt: cached.fetchedAt, source: cached.source };
    throw new Error('No inventory data yet. Start Warframe, log in and press '
                  + '"Fetch inventory" once.');
  }

  const gate = await checkAllowed({ force });
  if (!gate.allowed) {
    if (cached) {
      return { inventory: cached.inventory, fromCache: true, fetchedAt: cached.fetchedAt,
               source: cached.source, skipped: gate.reason,
               message: `${gate.message} (next fetch in ${formatWait(gate.waitMs)})` };
    }
    throw new RateLimitedError(`${gate.message} Next attempt in ${formatWait(gate.waitMs)}.`);
  }

  const store = async inventory => {
    const fetchedAt = Date.now();
    await writeFile(cacheFile, JSON.stringify({ fetchedAt, inventory }));
    return { inventory, fromCache: false, fetchedAt, source: 'api' };
  };

  const creds = await scanCredentials();
  if (!creds.ok) throw Object.assign(new Error(creds.message), { code: creds.code });

  try {
    return await store(await requestInventory(creds));
  } catch (err) {
    if (!err.staleCredentials) throw err;

    /* GENAU EIN Neuversuch. Die gemerkte Adresse kann einen abgelaufenen nonce
       tragen, deshalb einmal frisch suchen - aber ohne Schleife, sonst dreht sich
       ein toter nonce endlos und jede Runde kostet eine Anfrage. */
    const fresh = await scanCredentials({ skipHint: true });
    if (!fresh.ok) throw Object.assign(new Error(fresh.message), { code: fresh.code });

    const second = await checkAllowed({ force: true });
    if (!second.allowed) throw new RateLimitedError(second.message);

    return await store(await requestInventory(fresh));
  }
}

/** Stand der lokalen Daten: wann geholt und woher. null, wenn nichts da ist. */
export async function inventoryAge({ dataDir = defaultDataDir() } = {}) {
  const cached = await readCache(dataDir);
  return cached ? { fetchedAt: cached.fetchedAt, source: cached.source } : null;
}
