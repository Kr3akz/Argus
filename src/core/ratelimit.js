/**
 * Selbstauferlegte Drosselung fuer Anfragen an Digital Extremes.
 *
 * HINTERGRUND (teuer gelernt):
 *   Rund 12 Anfragen an api.warframe.com binnen weniger Minuten haben eine
 *   IP-weite Sperre ausgeloest - mit der Folge "too many logins" BEIM SPIEL-LOGIN.
 *   Die Drosselung gilt der IP, nicht dem Endpunkt. Ein Tool, das im Hintergrund
 *   pollt, sperrt seinen Nutzer also aus dem Spiel aus.
 *
 * REGELN:
 *   - Profil nur auf ausdrueckliche Nutzeraktion abrufen, niemals automatisch
 *   - Mindestens 10 Minuten zwischen zwei Abrufen
 *   - Nach einer Drosselung 3 h Sperre, kein Retry
 *   - Identifizierbarer User-Agent statt Browser-Tarnung
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dataDir, dataFile } from './paths.js';

export const MIN_INTERVAL_MS = 10 * 60 * 1000;       // 10 min zwischen Abrufen
export const COOLDOWN_MS     = 3 * 60 * 60 * 1000;   // 3 h Sperre nach Drosselung
export const USER_AGENT      = 'Cephalon-Argus/1.0 (personal mastery planner)';

/* Der Zaehler ist absichtlich EIN Topf fuer alle Endpunkte. DE drosselt pro IP,
   nicht pro Endpunkt - Profil- und Inventarabruf teilen sich also dasselbe
   Budget, sonst umgeht man die Sperre einfach ueber den zweiten Weg. */

/* Die Texte hier landen unveraendert in der Oberflaeche - deshalb echte Umlaute,
   anders als in den Kommentaren. */
export class RateLimitedError extends Error {
  constructor(msg) {
    super(msg || 'Digital Extremes is throttling requests. Further attempts can block '
              + 'your game login ("too many logins").');
    this.name = 'RateLimitedError';
    this.rateLimited = true;
  }
}

const STATE = () => dataFile('ratelimit.json');

async function read() {
  if (!existsSync(STATE())) return { lastRequest: 0, blockedUntil: 0, requestCount: 0 };
  return JSON.parse(await readFile(STATE(), 'utf8'));
}
async function write(s) {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(STATE(), JSON.stringify(s, null, 2));
}

/** Darf jetzt abgefragt werden? Liefert Begruendung und Wartezeit. */
export async function checkAllowed({ force = false } = {}) {
  const s = await read();
  const now = Date.now();

  if (s.blockedUntil > now) {
    return { allowed: false, reason: 'cooldown', waitMs: s.blockedUntil - now,
      message: 'Locked out after DE throttled us. Further requests would extend the IP '
             + 'block and can stop you logging in to the game.' };
  }
  const since = now - (s.lastRequest || 0);
  if (!force && since < MIN_INTERVAL_MS) {
    return { allowed: false, reason: 'too_soon', waitMs: MIN_INTERVAL_MS - since,
      message: 'The data is recent enough — this does not change that quickly.' };
  }
  return { allowed: true };
}

export async function recordRequest() {
  const s = await read();
  await write({ ...s, lastRequest: Date.now(), requestCount: (s.requestCount || 0) + 1 });
}

/** Nach einer Drosselung: harte Sperre setzen, statt es erneut zu versuchen. */
export async function recordThrottled() {
  const s = await read();
  await write({ ...s, blockedUntil: Date.now() + COOLDOWN_MS });
}

export function formatWait(ms) {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${Math.max(1, totalSec)}s`;
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
}
