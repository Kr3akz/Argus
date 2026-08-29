/**
 * Anmeldung bei warframe.market.
 *
 * WAS HIER GESPEICHERT WIRD - UND WAS NICHT:
 *   Gespeichert wird das Token, die Geraetekennung und der oeffentliche Teil
 *   des Kontos (Anzeigename, Slug, Plattform). Das PASSWORT WIRD NIE
 *   GESPEICHERT. Es geht einmal durch signIn() an den Server und ist danach
 *   weg - kein Feld, keine Datei, kein Log. Wer sich neu anmelden muss, tippt
 *   es neu ein. Das ist der Preis dafuer, dass ein Blick in die Datendatei
 *   niemandem das Konto oeffnet.
 *
 * WARUM v1 UND NICHT v2:
 *   /v2/auth/signin ist fuer Fremdanwendungen zu. Es nimmt email, password,
 *   clientId und deviceId an, antwortet darauf aber mit
 *   "app.auth.appCheckMissing" - einem Nachweis, den nur die offiziellen
 *   Apps von warframe.market erzeugen koennen. Kein Feld und kein Kopf
 *   bringt einen daran vorbei.
 *
 *   /v1/auth/signin hat diese Huerde nicht: dieselben Zugangsdaten kommen
 *   dort bis zur echten Pruefung durch (eine erfundene Adresse ergibt
 *   "app.account.email_not_exist"). Nachgemessen am 22.08.2026.
 *
 *   Das dort ausgestellte Token gilt fuer beide API-Staende - v2 nimmt es
 *   als "Authorization: Bearer" oder als JWT-Cookie an, siehe die Messung
 *   in wfm-http.js. Die Anmeldung laeuft also ueber v1, die Orders weiter
 *   ueber v2.
 *
 * WO DAS TOKEN HERKOMMT:
 *   auth_type: 'header' laesst es im Antwortkopf zurueckkommen. Weil das
 *   ohne echte Zugangsdaten nicht bis zum Ende zu pruefen war, liest
 *   extractToken() zusaetzlich Cookie und Rumpf. Findet sich nirgends
 *   eines, meldet signIn() das mit dem gesehenen Antwortaufbau, statt still
 *   ein leeres Token abzulegen.
 *
 * DIE GERAETEKENNUNG:
 *   v1 verlangt sie nicht, sie bleibt trotzdem: einmal gewuerfelt und
 *   liegengelassen, damit dieser Rechner ueber Anmeldungen hinweg derselbe
 *   bleibt - und damit ein spaeterer Wechsel zurueck auf v2 sie schon hat.
 */
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dataDir, dataFile } from './paths.js';
import { request, setTokenProvider, WfmError } from './wfm-http.js';

const SESSION_FILE = () => dataFile('wfm-session.json');

let session = null;      // { token, deviceId, user, savedAt }
let loaded = false;

/* Die Leitung fragt hier nach dem Token, statt dass dieses Modul jeden
   Aufruf selbst zusammenbaut. */
setTokenProvider(() => session?.token || null);

async function readSession() {
  if (loaded) return session;
  loaded = true;
  if (!existsSync(SESSION_FILE())) return (session = null);
  try {
    const parsed = JSON.parse(await readFile(SESSION_FILE(), 'utf8'));
    session = parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    session = null;      // beschaedigte Datei heisst abgemeldet, nicht kaputt
  }
  return session;
}

async function writeSession(next) {
  session = next;
  await mkdir(dataDir(), { recursive: true });
  await writeFile(SESSION_FILE(), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

/** Einmal gewuerfelt, dann bleibend - siehe Kopfkommentar. */
async function deviceId() {
  const s = await readSession();
  if (s?.deviceId) return s.deviceId;
  const id = randomUUID();
  /* Auch ohne Anmeldung ablegen: sonst bekommt jeder Anmeldeversuch eine
     neue Kennung und das Konto sammelt Geraete-Leichen. */
  await writeSession({ ...(s || {}), token: s?.token || null, deviceId: id });
  return id;
}

/**
 * Token aus der Antwort holen. Drei bekannte Stellen, in dieser Reihenfolge:
 *   1. Authorization-Kopf ("JWT <token>" oder blank)
 *   2. Set-Cookie mit JWT=
 *   3. Rumpf, unter mehreren gebraeuchlichen Namen
 */
function extractToken({ json, res }) {
  const auth = res.headers.get('authorization');
  if (auth) return auth.replace(/^JWT\s+/i, '').trim();

  const cookie = res.headers.get('set-cookie');
  const m = cookie && cookie.match(/JWT=([^;]+)/i);
  if (m) return decodeURIComponent(m[1]);

  /* v2 antwortet unter data, v1 unter payload - beide durchsehen, damit ein
     Wechsel des Endpunkts hier nichts kaputtmacht. */
  for (const d of [json?.data, json?.payload, json]) {
    if (!d || typeof d !== 'object') continue;
    for (const key of ['token', 'accessToken', 'access_token', 'jwt']) {
      if (typeof d[key] === 'string' && d[key]) return d[key];
    }
  }
  return null;
}

/** Der oeffentliche Teil des Kontos - das, was die Oberflaeche zeigen darf. */
function publicUser(u) {
  if (!u || typeof u !== 'object') return null;
  return {
    id: u.id || null,
    ingameName: u.ingameName || u.ingame_name || null,
    slug: u.slug || null,
    avatar: u.avatar || null,
    reputation: u.reputation ?? 0,
    platform: u.platform || 'pc',
    crossplay: u.crossplay ?? null,
    locale: u.locale || null,
    /* Der eigene Anwesenheitszustand - "ingame", "online", "offline".
       warframe.market reiht Angebote offline stehender Verkaeufer nach
       hinten, deshalb ist das keine Zierde, sondern der Grund, warum
       niemand schreibt. */
    status: u.status || null
  };
}

/* ----------------------------- Zustand ----------------------------- */

/**
 * Wer ist angemeldet. Meldet NIE das Token nach draussen - der Renderer
 * bekommt nur, was er anzeigen soll.
 */
export async function authState() {
  const s = await readSession();
  if (!s?.token) return { signedIn: false, user: null };
  return { signedIn: true, user: s.user || null, savedAt: s.savedAt || null };
}

/**
 * Das rohe Token - AUSSCHLIESSLICH fuer die WebSocket-Anmeldung.
 *
 * Die Ausnahme zur Regel eine Funktion weiter oben, und sie braucht ihren
 * Grund: der Status auf warframe.market wird nicht per HTTP gesetzt, sondern
 * mit einer Nachricht auf einer offenen Verbindung (siehe wfm-socket.js).
 * setTokenProvider hilft dort nicht - das ist die Leitung fuer fetch.
 *
 * WAS SICH DADURCH NICHT AENDERT: Das Token bleibt im Hauptprozess. Es geht
 * an keinen Renderer, in keine IPC-Antwort und in keine Log-Zeile. Wer diese
 * Funktion aufruft, muss dasselbe zusagen koennen.
 */
export async function socketToken() {
  return (await readSession())?.token || null;
}

/**
 * Token gegen /v2/me pruefen.
 *
 * WIRFT NIE ETWAS WEG - und das ist eine bewusste Entscheidung:
 *   Eine 401 von /v2/me laesst sich nicht deuten. Sie kann heissen "Token
 *   abgelaufen", sie kann aber genauso heissen "v2 nimmt ein Token aus der
 *   v1-Anmeldung nicht an", waehrend die Auktionen ueber v1 problemlos
 *   weiterlaufen. Aus einer nicht unterscheidbaren Lage automatisch
 *   abzumelden hiess: eine gerade geglueckte Anmeldung wurde stillschweigend
 *   rueckgaengig gemacht, und der Tab stand wieder da wie vorher.
 *
 *   Stattdessen wird der Zustand gemeldet und die Oberflaeche sagt ihn an.
 *   Das Token verschwindet nur auf zwei Wegen: durch Abmelden oder durch
 *   eine neue Anmeldung, die es ueberschreibt. Beides entscheidet der Nutzer.
 */
export async function verifySession() {
  const s = await readSession();
  if (!s?.token) return { signedIn: false, user: null };
  try {
    const me = await request('v2/me', { auth: true });
    const user = publicUser(me?.user || me);
    await writeSession({ ...s, user, savedAt: Date.now() });
    return { signedIn: true, user };
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      return { signedIn: true, user: s.user || null, v2Rejected: true, error: err.message };
    }
    /* Netzfehler ist keine Abmeldung: das Token kann gueltig sein, nur die
       Leitung nicht. Sonst wirft ein WLAN-Aussetzer den Nutzer raus. */
    return { signedIn: true, user: s.user || null, offline: true, error: err.message };
  }
}

/* ---------------------------- Diagnose ---------------------------- */

/**
 * Welche Endpunkte nehmen das Token an - einer nach dem anderen.
 *
 * WARUM ES DAS GIBT:
 *   "Angemeldet" ist bei warframe.market keine einzelne Wahrheit. Das Token
 *   kommt von v1, die Orders liegen auf v2, die Auktionen wieder auf v1. Ob
 *   alle drei es annehmen, laesst sich von aussen nicht feststellen - jeder
 *   Pfad unter /v2/me antwortet ohne Anmeldung mit 401, auch ein erfundener.
 *   Die Anmeldung ist damit die einzige Gelegenheit, es herauszufinden.
 *
 *   Vorher hat die Oberflaeche bei einer 401 stillschweigend das Token
 *   weggeworfen und den Anmeldekasten wieder hingestellt. Von aussen sah das
 *   aus, als sei nichts passiert. Diese Liste ist die Antwort darauf.
 *
 * Kein Aufruf hier veraendert etwas - reine Leseanfragen.
 */
export async function diagnose() {
  const s = await readSession();
  if (!s?.token) return { signedIn: false, checks: [], account: null };

  const checks = [];
  const probe = async (key, label, path) => {
    try {
      const data = await request(path, { auth: true });
      checks.push({
        key, label, path, ok: true, status: 200,
        /* Der Umriss der Antwort reicht, um zu erkennen, ob der Endpunkt
           haelt was der Name verspricht - der Inhalt gehoert nicht ins Log. */
        shape: Array.isArray(data) ? `array(${data.length})`
             : data && typeof data === 'object' ? `{${Object.keys(data).slice(0, 6).join(', ')}}`
             : typeof data
      });
      return data;
    } catch (err) {
      checks.push({ key, label, path, ok: false, status: err.status || 0, error: err.message, code: err.code || null });
      return null;
    }
  };

  /* Zuerst das Konto - daraus kommt der Slug, an dem die Historie haengt,
     und die beiden Schalter, die ueber alles andere entscheiden. */
  const me = await probe('me', 'Account (v2)', 'v2/me');
  const u = me?.user || me || {};
  const slug = u.slug || '';

  /**
   * Der eigentliche Befund steckt meist hier und nicht in den Statuscodes:
   * ohne Ingame-Namen und ohne Verifizierung laesst warframe.market weder
   * Orders noch Auktionen zu. Das ist keine Stoerung der Sitzung, sondern
   * ein unfertiges Konto - und nur auf deren Webseite zu beheben.
   */
  const account = me ? {
    hasName: !!u.ingameName,
    hasProfile: !!slug,
    verified: !!u.verification,
    checkCode: u.checkCode || null,
    reputation: u.reputation ?? 0,
    ready: !!u.ingameName && !!u.verification
  } : null;

  await probe('orders', 'Orders (v2)', 'v2/orders/my');
  await probe('auctions', 'Contracts (v1)', 'v1/profile/auctions');

  if (slug) await probe('transactions', 'Trade history (v1)', `v1/profile/${encodeURIComponent(slug)}/statistics`);
  else checks.push({
    key: 'transactions', label: 'Trade history (v1)', path: 'v1/profile/<name>/statistics',
    ok: false, status: 0, error: 'no profile name set on warframe.market'
  });

  return { signedIn: true, user: s.user || null, account, checks };
}

/* ---------------------------- Anmeldung ---------------------------- */

export async function signIn(email, password) {
  if (!email || !password) throw new WfmError('e-mail and password are required', { status: 400 });

  const device = await deviceId();
  const { json, res } = await request('v1/auth/signin', {
    method: 'POST',
    raw: true,
    headers: {
      /* v1 will den Kopf sehen, auch leer - ohne ihn antwortet es gar nicht
         erst mit einer Pruefung der Zugangsdaten. */
      Authorization: 'JWT',
      platform: 'pc',
      language: 'en'
    },
    /* auth_type: 'header' laesst das Token im Antwortkopf zurueckkommen
       statt nur als Cookie - ein Cookie muesste dieser Prozess selbst
       verwalten, der Kopf ist einfach auszulesen. */
    body: { email: String(email).trim(), password: String(password), auth_type: 'header' }
  });

  const token = extractToken({ json, res });
  if (!token) {
    /* Kein erfundener Erfolg: lieber hier stehenbleiben mit der Auskunft,
       wo nachzusehen ist, als spaeter bei jedem Order-Aufruf eine 401. */
    throw new WfmError(
      'Signed in, but no token was found in the response - warframe.market changed its login format. '
      + `Fields seen: ${Object.keys(json?.data || json || {}).join(', ') || 'none'}`,
      { status: 500, body: json }
    );
  }

  const user = publicUser(json?.payload?.user || json?.data?.user || json?.user || json?.data);
  await writeSession({ token, deviceId: device, user, savedAt: Date.now() });

  /* Direkt gegenpruefen: so faellt ein Token, das v2 nicht annimmt, sofort
     auf - und nicht erst beim ersten Verkauf. Ohne Wegwerfen, siehe
     verifySession(): das Token ist Sekunden alt und fuer v1 gueltig. */
  const check = await verifySession();
  return { ...check, signedIn: true, user: check.user || user };
}

export async function signOut({ remote = true } = {}) {
  const s = await readSession();
  if (remote && s?.token) {
    /* Ein Fehlschlag darf das lokale Abmelden nicht verhindern - sonst
       klebt ein Token fest, das der Nutzer loswerden wollte. */
    try { await request('v2/auth/signout', { method: 'POST', auth: true }); } catch { /* egal */ }
  }
  /* Geraetekennung ueberlebt die Abmeldung: dasselbe Geraet soll beim
     naechsten Anmelden dasselbe bleiben. */
  const device = s?.deviceId || null;
  if (device) {
    await writeSession({ token: null, deviceId: device, user: null });
  } else {
    session = null;
    if (existsSync(SESSION_FILE())) await unlink(SESSION_FILE()).catch(() => {});
  }
  loaded = true;
  return { signedIn: false, user: null };
}

/** Nur fuer Tests: den Zwischenspeicher vergessen. */
export function _resetForTests() { session = null; loaded = false; }
