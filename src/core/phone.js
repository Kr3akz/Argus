/**
 * Das gekoppelte Handy: Schluessel, Geraete, Kopplung - und der Weg, eine
 * Meldung an alle Geraete zu schicken.
 *
 * DIE TEILE, UND WO SIE LEBEN:
 *   - Die Handy-App ist eine Web-App auf GitHub Pages (MOBILE_APP_URL). Nur
 *     dort, unter https, darf ein Handy Push-Meldungen annehmen und die App
 *     auf den Home-Bildschirm legen.
 *   - Zuhause im WLAN liefert Argus dieselbe App selbst aus (phone-server.js),
 *     dann mit den eigenen Daten: Foundry, Ziele, Inventar, Preise.
 *   - Dieser PC unterschreibt seine Meldungen mit einem eigenen
 *     Schluesselpaar (VAPID, siehe webpush.js).
 *
 * WARUM DAS KOPPELN UEBER EINEN QR-CODE LAEUFT UND NICHT UEBER DAS WLAN:
 *   Die App unter https darf den PC unter http://192.168.x.x nicht abfragen -
 *   das ist "mixed content", und Safari macht dafuer keine Ausnahme, auch
 *   nicht fuer das eigene Heimnetz. Alles, was die App vom PC wissen muss,
 *   steht deshalb im Code selbst: Name, Adresse im WLAN, der oeffentliche
 *   Schluessel und eine Kennung. Zurueck zum PC geht nur eines, das Push-Abo -
 *   und das ueber eine Weiterleitung, nicht ueber eine Abfrage (siehe
 *   phone-server.js, /pair/push).
 *
 * DIE KENNUNG IST DAS GERAET:
 *   Wer sie hat, darf lesen, was Argus dem Handy zeigt. Auf der Platte liegt
 *   deshalb nur ihr Hash - eine kopierte phone.json oeffnet niemandem den
 *   PC. Ein noch nie benutzter Code verfaellt nach einer Viertelstunde; wer
 *   ein Geraet in der Liste nicht kennt, entfernt es, und seine Kennung gilt
 *   ab sofort nicht mehr.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import { dataDir, dataFile } from './paths.js';
import { generateVapidKeys, sendPush, b64url, fromB64url } from './webpush.js';

/* Die Handy-App. Steht hier und nirgends sonst - der QR-Code, die
   Rueckkehr nach dem Koppeln und die Doku zeigen alle auf diese Adresse. */
export const MOBILE_APP_URL = 'https://kr3akz.github.io/Argus/app/';

/* Fester Port statt eines freien: die Adresse steht im gekoppelten Handy,
   und sie soll nach einem Neustart des PCs noch stimmen. 47120 ist bei der
   IANA keinem Dienst zugeordnet. */
export const DEFAULT_PORT = 47120;

/* So lange gilt ein Code, den noch kein Handy benutzt hat. Lang genug, um
   die App auf den Home-Bildschirm zu legen; kurz genug, dass ein
   abfotografierter Bildschirm von gestern nichts mehr oeffnet. */
const PAIRING_TTL_MS = 15 * 60 * 1000;

/* Die Meldungsarten, die aufs Handy duerfen. Jede einzeln abschaltbar - am
   PC und in der App selbst. */
export const PHONE_TYPES = ['fissure', 'cycle', 'foundry', 'whisper'];

const FILE = () => dataFile('phone.json');

const leer = () => ({
  version: 1,
  /* Der Zugang im WLAN ist AUS, bis ihn jemand einschaltet: ein Programm,
     das von sich aus einen Port oeffnet, hat sich das nicht verdient. Push
     haengt nicht daran - Meldungen gehen ueber den Push-Dienst hinaus. */
  enabled: false,
  port: DEFAULT_PORT,
  /* Welche Adresse dieses PCs im QR-Code steht, wenn er mehrere hat. null
     heisst: die wahrscheinlichste nehmen (siehe lanAddresses). */
  address: null,
  vapid: null,
  devices: []
});

let state = null;
let schreibt = Promise.resolve();

function normalize(raw) {
  const s = { ...leer(), ...(raw && typeof raw === 'object' ? raw : {}) };
  s.enabled = s.enabled === true;
  s.port = Number.isInteger(s.port) && s.port > 1023 && s.port < 65536 ? s.port : DEFAULT_PORT;
  s.address = typeof s.address === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(s.address) ? s.address : null;
  if (!s.vapid?.publicKey || !s.vapid?.privateKey) s.vapid = null;
  s.devices = (Array.isArray(s.devices) ? s.devices : [])
    .filter(d => d && typeof d.id === 'string' && typeof d.tokenHash === 'string')
    .map(d => ({
      id: d.id,
      name: String(d.name || 'Phone').slice(0, 40),
      tokenHash: d.tokenHash,
      createdAt: d.createdAt || Date.now(),
      pairedAt: d.pairedAt || null,
      expiresAt: d.pairedAt ? null : (d.expiresAt || 0),
      lastSeenAt: d.lastSeenAt || null,
      push: validSubscription(d.push) ? d.push : null,
      pushError: d.pushError || null,
      lastPushAt: d.lastPushAt || null,
      types: normalizeTypes(d.types)
    }));
  return s;
}

function normalizeTypes(t) {
  const out = {};
  for (const k of PHONE_TYPES) out[k] = t?.[k] !== false;
  return out;
}

export async function loadPhone() {
  if (state) return state;
  try {
    state = normalize(existsSync(FILE()) ? JSON.parse(await readFile(FILE(), 'utf8')) : null);
  } catch {
    /* Eine kaputte Datei kostet die Kopplungen, nicht den Start. */
    state = normalize(null);
  }
  return state;
}

/* Hintereinander statt gleichzeitig: zwei Schreibvorgaenge, die sich
   ueberholen, liessen sonst den aelteren Stand gewinnen. */
async function save() {
  const s = state;
  schreibt = schreibt.then(async () => {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(FILE(), JSON.stringify(s, null, 2));
  }).catch(err => console.error('[Handy] phone.json nicht geschrieben:', err.message));
  return schreibt;
}

/** Nur fuer die Tests: den gemerkten Stand vergessen. */
export function _resetForTest() { state = null; }

/** Das Schluesselpaar dieses PCs - beim ersten Bedarf erzeugt, dann fest. */
export async function ensureVapid() {
  const s = await loadPhone();
  if (!s.vapid) {
    s.vapid = generateVapidKeys();
    await save();
  }
  return s.vapid;
}

export async function setEnabled(on) {
  const s = await loadPhone();
  s.enabled = on === true;
  await save();
  return s.enabled;
}

export async function setAddress(address) {
  const s = await loadPhone();
  s.address = typeof address === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(address) ? address : null;
  await save();
  return s.address;
}

/**
 * Die Adresse, unter der das Handy diesen PC erreicht - die gewaehlte, wenn
 * es sie noch gibt, sonst die wahrscheinlichste. null ohne Netz.
 */
export async function currentBaseUrl(ifaces) {
  const s = await loadPhone();
  const kandidaten = lanAddresses(ifaces);
  const adresse = (s.address && kandidaten.some(k => k.address === s.address))
    ? s.address
    : kandidaten[0]?.address;
  return adresse ? `http://${adresse}:${s.port}` : null;
}

/* ------------------------------ Kennungen ------------------------------ */

const hashToken = token => createHash('sha256').update(String(token)).digest('base64url');

function sameHash(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Welches Geraet gehoert zu dieser Kennung? null, wenn keines - oder wenn
 * es ein nie benutzter Code von vor ueber einer Viertelstunde ist.
 *
 * Der erste erfolgreiche Aufruf macht aus dem Code ein gekoppeltes Geraet.
 * lastSeenAt wird nur alle paar Minuten geschrieben: jeder Reiterwechsel
 * auf dem Handy ist ein Aufruf, und jeder wuerde sonst die Datei anfassen.
 */
export async function authenticate(token, { now = Date.now() } = {}) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const s = await loadPhone();
  const h = hashToken(token);
  const d = s.devices.find(x => sameHash(x.tokenHash, h));
  if (!d) return null;
  if (!d.pairedAt) {
    if (d.expiresAt && now > d.expiresAt) return null;
    d.pairedAt = now;
    d.expiresAt = null;
    d.lastSeenAt = now;
    await save();
    return d;
  }
  if (!d.lastSeenAt || now - d.lastSeenAt > 5 * 60 * 1000) {
    d.lastSeenAt = now;
    await save();
  }
  return d;
}

/* ------------------------------- Koppeln ------------------------------- */

/**
 * Ein neuer Kopplungscode.
 *
 * Es gibt immer hoechstens EINEN offenen: wer den Knopf zweimal drueckt,
 * macht den ersten Code ungueltig, statt zwei offene Tueren zu hinterlassen.
 *
 * Der Code ist base64url(JSON) und steht hinter # in der Adresse - der Teil
 * einer Adresse, den der Browser nie an einen Server schickt. GitHub sieht
 * beim Laden der App also weder Kennung noch Heimnetz-Adresse.
 *
 * @returns { device, url, code } - url ist das, was in den QR-Code kommt
 */
export async function createPairing({ pcName, baseUrl, now = Date.now() }) {
  const s = await loadPhone();
  const vapid = await ensureVapid();
  s.devices = s.devices.filter(d => d.pairedAt);

  const token = b64url(randomBytes(32));
  const device = {
    id: b64url(randomBytes(8)),
    name: 'Phone',
    tokenHash: hashToken(token),
    createdAt: now,
    pairedAt: null,
    expiresAt: now + PAIRING_TTL_MS,
    lastSeenAt: null,
    push: null,
    pushError: null,
    lastPushAt: null,
    types: normalizeTypes(null)
  };
  s.devices.push(device);
  await save();

  const code = b64url(JSON.stringify({
    v: 1,
    n: String(pcName || 'PC').slice(0, 24),
    u: baseUrl,
    k: vapid.publicKey,
    t: token,
    i: device.id
  }));
  return { device: publicDevice(device), code, url: `${MOBILE_APP_URL}#pair=${code}` };
}

/** Die Gegenrichtung - fuer Tests und die Handy-App (dort in JS nachgebaut). */
export function parsePairingCode(code) {
  try {
    const p = JSON.parse(fromB64url(code).toString('utf8'));
    if (p?.v !== 1 || !p.u || !p.k || !p.t || !p.i) return null;
    return p;
  } catch {
    return null;
  }
}

/* ------------------------------- Geraete ------------------------------- */

/**
 * Nimmt nur, was wie ein Push-Abo aussieht: https-Adresse, ein Punkt auf
 * P-256 und ein 16-Byte-Geheimnis. Was das Handy schickt, landet sonst
 * ungeprueft in phone.json und spaeter in einem Netzaufruf.
 */
export function validSubscription(sub) {
  try {
    if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000) return false;
    if (new URL(sub.endpoint).protocol !== 'https:') return false;
    const p = fromB64url(sub.keys?.p256dh);
    const a = fromB64url(sub.keys?.auth);
    return p.length === 65 && p[0] === 4 && a.length === 16;
  } catch {
    return false;
  }
}

/** Ein lesbarer Name aus der Kennung des Browsers - mehr steht nicht drin. */
export function deviceNameFrom(userAgent) {
  const ua = String(userAgent || '');
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) {
    const m = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(ua);
    return m && !/^K$/.test(m[1]) ? m[1].trim().slice(0, 30) : 'Android phone';
  }
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Phone';
}

export async function setPush(deviceId, sub, { userAgent = '' } = {}) {
  if (!validSubscription(sub)) return false;
  const s = await loadPhone();
  const d = s.devices.find(x => x.id === deviceId);
  if (!d) return false;
  d.push = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  d.pushError = null;
  if (userAgent) d.name = deviceNameFrom(userAgent);
  await save();
  return true;
}

export async function clearPush(deviceId) {
  const s = await loadPhone();
  const d = s.devices.find(x => x.id === deviceId);
  if (!d) return false;
  d.push = null;
  await save();
  return true;
}

export async function setTypes(deviceId, types) {
  const s = await loadPhone();
  const d = s.devices.find(x => x.id === deviceId);
  if (!d) return null;
  d.types = normalizeTypes({ ...d.types, ...(types || {}) });
  await save();
  return d.types;
}

export async function renameDevice(deviceId, name) {
  const s = await loadPhone();
  const d = s.devices.find(x => x.id === deviceId);
  if (!d) return false;
  d.name = String(name || '').trim().slice(0, 40) || d.name;
  await save();
  return true;
}

export async function removeDevice(deviceId) {
  const s = await loadPhone();
  const vorher = s.devices.length;
  s.devices = s.devices.filter(d => d.id !== deviceId);
  if (s.devices.length !== vorher) await save();
  return s.devices.length !== vorher;
}

/** Was die Oberflaeche ueber ein Geraet erfahren darf - keine Geheimnisse. */
export function publicDevice(d, now = Date.now()) {
  return {
    id: d.id,
    name: d.name,
    paired: !!d.pairedAt,
    pending: !d.pairedAt && (!d.expiresAt || d.expiresAt > now),
    expiresAt: d.expiresAt,
    pairedAt: d.pairedAt,
    lastSeenAt: d.lastSeenAt,
    push: !!d.push,
    pushError: d.pushError,
    lastPushAt: d.lastPushAt,
    types: { ...d.types }
  };
}

export async function describePhone({ now = Date.now() } = {}) {
  const s = await loadPhone();
  return {
    enabled: s.enabled,
    port: s.port,
    address: s.address,
    appUrl: MOBILE_APP_URL,
    devices: s.devices
      .filter(d => d.pairedAt || (d.expiresAt && d.expiresAt > now))
      .map(d => publicDevice(d, now))
  };
}

/* ------------------------------ Im Heimnetz ------------------------------ */

/* Adapter, ueber die kein Handy kommt: virtuelle Netze von Hyper-V, WSL,
   Docker und VirtualBox, Tunnel von VPNs. Ihre Adressen sehen privat aus
   (172.x, 10.x), fuehren aber nicht ins WLAN. */
const VIRTUELL = /vEthernet|Hyper-V|WSL|Docker|VirtualBox|VMware|VMnet|Loopback|Bluetooth|Tailscale|ZeroTier|Hamachi|VPN|TAP|TUN|utun|wg\d/i;

/**
 * Die Adressen dieses PCs im Heimnetz, die wahrscheinlichste zuerst.
 *
 * 192.168.x.x zuerst, weil fast jeder Heimrouter dieses Netz vergibt; 10.x
 * und 172.16-31.x danach. Was nach einem virtuellen Adapter aussieht, kommt
 * ans Ende statt ganz weg: ein ungewoehnlicher Aufbau soll waehlbar bleiben.
 */
export function lanAddresses(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces || {})) {
    for (const a of list || []) {
      if (a.internal || (a.family !== 'IPv4' && a.family !== 4)) continue;
      const ip = a.address;
      if (/^169\.254\./.test(ip)) continue;            // keine Adresse vom Router bekommen
      if (!isPrivateAddress(ip)) continue;              // von dort kaeme das Handy nie herein
      let score = /^192\.168\./.test(ip) ? 30 : /^10\./.test(ip) ? 20 : 10;
      if (VIRTUELL.test(name)) score -= 50;
      out.push({ address: ip, iface: name, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Kommt eine Anfrage aus dem Heimnetz? Nur dann antwortet der Server.
 * Auch IPv4 in IPv6-Schreibweise (::ffff:192.168.1.5), wie Node sie liefert.
 */
export function isPrivateAddress(addr) {
  const a = String(addr || '').toLowerCase().replace(/^::ffff:/, '');
  if (/^127\./.test(a) || a === '::1') return true;
  if (/^10\./.test(a) || /^192\.168\./.test(a) || /^169\.254\./.test(a)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a)) return true;
  return false;
}

/* ------------------------------- Zustellen ------------------------------- */

/* Je Art: wie lange der Push-Dienst die Meldung aufhebt, wenn das Handy aus
   ist, und wie eilig sie ist. Eine Zyklus-Meldung ist nach dem Wechsel
   wertlos - sie bekommt ihre Restzeit als Frist mit (siehe deliver). Ein
   Fluestern ist eine Stunde lang interessant, eine fertige Foundry einen Tag. */
const ZUSTELLUNG = {
  fissure: { ttl: 30 * 60,      urgency: 'normal' },
  cycle:   { ttl: 10 * 60,      urgency: 'high' },
  foundry: { ttl: 24 * 60 * 60, urgency: 'normal' },
  whisper: { ttl: 60 * 60,      urgency: 'high' },
  test:    { ttl: 5 * 60,       urgency: 'high' }
};

/**
 * Was in der Meldung steht. Kurz, weil der Push-Dienst nicht mehr als ein
 * paar Kilobyte nimmt - und weil Titel und zwei Zeilen alles sind, was ein
 * Sperrbildschirm zeigt.
 *
 * `pc` ist die aktuelle Adresse im WLAN: wechselt sie (der Router hat dem PC
 * eine neue gegeben), erfaehrt das Handy es mit der naechsten Meldung, statt
 * dass der Knopf "Mein PC" ins Leere zeigt.
 */
export function pushPayload(event, { baseUrl = null, now = Date.now() } = {}) {
  return {
    v: 1,
    type: event.type,
    title: String(event.title || 'Argus').slice(0, 120),
    body: String(event.body || '').slice(0, 400),
    tag: event.tag ? String(event.tag).slice(0, 64) : null,
    nav: event.nav || null,
    pc: baseUrl,
    ts: now
  };
}

/**
 * Eine Meldung an jedes gekoppelte Geraet, das diese Art haben will.
 *
 * Ein Abo, das der Push-Dienst als verschwunden meldet (die App wurde
 * geloescht, die Erlaubnis zurueckgenommen), wird vergessen und am Geraet
 * vermerkt - die Einstellungen zeigen dann "neu koppeln" statt still ins
 * Leere zu senden.
 *
 * @param event { type, title, body, tag?, nav?, ttl? }
 * @param opts.only  nur an dieses Geraet (der Test-Knopf)
 */
export async function deliver(event, { baseUrl = null, only = null, fetchImpl, now = Date.now() } = {}) {
  const s = await loadPhone();
  if (!s.vapid) return { sent: 0, failed: 0, results: [] };
  const z = ZUSTELLUNG[event.type] || ZUSTELLUNG.test;
  const ziele = s.devices.filter(d => d.pairedAt && d.push
    && (only ? d.id === only : (event.type === 'test' || d.types[event.type] !== false)));

  const payload = pushPayload(event, { baseUrl, now });
  const results = await Promise.all(ziele.map(async d => {
    const res = await sendPush(d.push, payload, {
      vapid: s.vapid,
      ttl: Number.isFinite(event.ttl) ? event.ttl : z.ttl,
      urgency: z.urgency,
      topic: event.topic || null,
      ...(fetchImpl ? { fetchImpl } : {})
    });
    if (res.ok) {
      d.lastPushAt = now;
      d.pushError = null;
    } else if (res.gone) {
      d.push = null;
      d.pushError = 'expired';
    } else {
      d.pushError = res.error;
    }
    return { id: d.id, name: d.name, ...res };
  }));
  if (results.length) await save();
  return {
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  };
}
