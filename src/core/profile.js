/**
 * Profil-Abruf von Digital Extremes.
 *
 * SICHERHEIT:
 *   Unauthentifizierter, oeffentlicher HTTP-GET. Keine Zugangsdaten, keine Cookies,
 *   keine Tokens, kein Kontakt zum Spielprozess, kein Speicherzugriff, keine
 *   Netzwerk-Interception. Das Tool KANN sich technisch nicht einloggen.
 *
 * WARNUNG - IP-DROSSELUNG:
 *   DE drosselt pro IP, nicht pro Endpunkt. Zu viele Anfragen fuehren zu
 *   "too many logins" BEIM SPIEL-LOGIN - der Nutzer sperrt sich also selbst aus.
 *   Deshalb: Abruf ausschliesslich auf ausdrueckliche Nutzeraktion, mindestens
 *   5 min Abstand, nach Drosselung 1 h Pause ohne Retry. Siehe ratelimit.js.
 *
 * HOST:
 *   content.warframe.com/dynamic/ ist tot (404). Aktuell: api.warframe.com/cdn/
 *   Seit Update 38.0.8 nur per Account-ID, nicht mehr per Spielername.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { checkAllowed, recordRequest, recordThrottled, formatWait, USER_AGENT,
         RateLimitedError } from './ratelimit.js';

const PLATFORM_SUFFIX = { pc: '', psn: '-ps4', xbox: '-xb1', switch: '-swi', mobile: '-mob' };

/* Wohnt jetzt in ratelimit.js, damit Profil- und Inventarabruf dieselbe
   Drosselungs-Semantik teilen. Re-Export, damit bestehende Importe halten. */
export { RateLimitedError };

export function isValidAccountId(id) {
  return typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id.trim());
}

/** Roher Abruf. Nur ueber fetchProfile aufrufen - sonst fehlt die Drosselung. */
async function fetchProfileRaw(accountId, platform = 'pc') {
  const id = String(accountId || '').trim();
  if (!isValidAccountId(id)) throw new Error('Ungueltige Account-ID (erwartet: 24 Hex-Zeichen)');

  const suffix = PLATFORM_SUFFIX[platform] ?? '';
  const url = `https://api${suffix}.warframe.com/cdn/getProfileViewingData.php`
            + `?playerId=${encodeURIComponent(id)}`;

  await recordRequest();
  const res = await fetch(url, { cache: 'no-cache', headers: { 'User-Agent': USER_AGENT } });

  if (res.status === 409) {
    const body = (await res.text()).trim();
    // Leerer Body = Drosselung. Text = Account existiert wirklich nicht.
    if (!body) { await recordThrottled(); throw new RateLimitedError(); }
    throw Object.assign(new Error('Account nicht gefunden - ID und Plattform pruefen.'), { status: 409 });
  }
  if (res.status === 403 || res.status === 429) {
    await recordThrottled();
    throw new RateLimitedError();
  }
  if (!res.ok) throw Object.assign(new Error(`Abruf fehlgeschlagen (HTTP ${res.status}).`), { status: res.status });

  const json = await res.json();
  if (!json?.Results?.length) throw new Error('Account nicht gefunden.');
  return json.Results[0];
}

/**
 * Profil laden. Standardmaessig NUR aus dem Cache.
 * Ein echter Netzwerkabruf passiert ausschliesslich mit refresh:true - also wenn
 * der Nutzer bewusst auf "Aktualisieren" klickt.
 */
export async function loadProfile(accountId, platform = 'pc', { dataDir = 'data', refresh = false, force = false } = {}) {
  await mkdir(dataDir, { recursive: true });
  const cacheFile = path.join(dataDir, `profile-${accountId}.json`);
  const cached = existsSync(cacheFile) ? JSON.parse(await readFile(cacheFile, 'utf8')) : null;

  if (!refresh) {
    if (cached) return { profile: cached.profile, fromCache: true, fetchedAt: cached.fetchedAt };
    throw new Error('Noch keine Daten vorhanden. Einmal "Aktualisieren" ausloesen.');
  }

  const gate = await checkAllowed({ force });
  if (!gate.allowed) {
    if (cached) {
      return { profile: cached.profile, fromCache: true, fetchedAt: cached.fetchedAt,
               skipped: gate.reason, message: `${gate.message} (nächster Abruf in ${formatWait(gate.waitMs)})` };
    }
    throw new RateLimitedError(`${gate.message} Nächster Versuch in ${formatWait(gate.waitMs)}.`);
  }

  try {
    const profile = await fetchProfileRaw(accountId, platform);
    const fetchedAt = Date.now();
    await writeFile(cacheFile, JSON.stringify({ fetchedAt, profile }));
    return { profile, fromCache: false, fetchedAt };
  } catch (err) {
    if (err.rateLimited && cached) {
      return { profile: cached.profile, fromCache: true, fetchedAt: cached.fetchedAt,
               rateLimited: true, message: err.message };
    }
    throw err;
  }
}

/** Besitz + Affinity als Map: uniqueName -> XP */
export function ownedXPMap(profile) {
  return new Map((profile?.LoadOutInventory?.XPInfo || []).map(e => [e.ItemType, e.XP]));
}

/** Sternenkarte: Junctions und normale Nodes getrennt. */
export function starChart(profile) {
  const missions = profile?.Missions || [];
  const junctions = missions.filter(m => /junction/i.test(m.Tag));
  return { junctions: junctions.length, nodes: missions.length - junctions.length, missions };
}

/** Railjack- + Drifter-Intrinsics (LPS_* sind die Rang-Felder). */
export function intrinsics(profile) {
  const s = profile?.PlayerSkills || {};
  return Object.keys(s).filter(k => k.startsWith('LPS_')).reduce((a, k) => a + (s[k] || 0), 0);
}

export function displayName(profile) {
  return profile?.PlatformNames?.length ? profile.DisplayName.slice(0, -1) : profile?.DisplayName;
}
