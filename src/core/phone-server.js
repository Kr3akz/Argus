/**
 * Argus im Heimnetz: liefert der Handy-App die eigenen Daten.
 *
 * WAS ER TUT:
 *   - die Handy-App ausliefern (src/mobile), dieselbe wie auf GitHub Pages
 *   - unter /api/ beantworten, was die App fragt: Live-Tracker, Foundry,
 *     Ziele, Inventar, Preise, Droptabellen - LESEND, ueber die Kanaele, die
 *     main.js dafuer freigibt (siehe phoneReadable dort)
 *   - unter /pair/push das Push-Abo eines Handys entgegennehmen
 *
 * WAS ER NICHT TUT:
 *   - nichts schreiben ausser den Meldungs-Einstellungen des eigenen Geraets
 *   - nichts beantworten, was nicht aus dem Heimnetz kommt
 *   - nichts beantworten ohne Kennung (siehe authenticate in phone.js)
 *   - nichts an fremde Seiten herausgeben: kein CORS, also kann keine andere
 *     Webseite die Antworten lesen, auch nicht aus dem eigenen Browser heraus
 *
 * WARUM HTTP UND NICHT HTTPS:
 *   Ein Zertifikat fuer 192.168.x.x gibt es von keiner Stelle, der ein Handy
 *   vertraut, und ein selbst ausgestelltes muesste man auf dem iPhone von Hand
 *   als Wurzelzertifikat eintragen - das waere die gefaehrlichere Loesung.
 *   Die Verbindung im WLAN ist deshalb unverschluesselt. Wer im selben WLAN
 *   mitschneidet, koennte sehen, was das Handy abfragt; docs/security.md sagt
 *   das so. Push-Meldungen betrifft das nicht - die gehen verschluesselt ueber
 *   den Push-Dienst (webpush.js).
 *
 * src/core/ kennt kein Electron: was beantwortet wird, reicht der
 * Hauptprozess als `api` herein. So laesst sich der Server ohne App testen
 * (src/cli/phone-test.js).
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate, isPrivateAddress, setPush, setTypes, clearPush, renameDevice, deviceNameFrom,
         MOBILE_APP_URL } from './phone.js';
import { fromB64url } from './webpush.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/* Nur diese drei Ordner, und darin nur diese Dateiarten. Alles andere -
   allen voran data/ mit Inventar und Kennungen - liegt ausserhalb und ist
   ueber keinen Pfad erreichbar (siehe resolveStatic).

   /core/ sind die Rechenregeln, die die App unterwegs selbst ausfuehrt
   (Live-Tracker, Droptabellen) - derselbe Quelltext, der ohnehin offen auf
   GitHub steht. Nur .js, und nur direkt im Ordner. */
const ROOTS = [
  { prefix: '/assets/', dir: path.resolve(here, '..', 'renderer', 'assets') },
  { prefix: '/core/', dir: here, flat: true, only: '.js' },
  { prefix: '/', dir: path.resolve(here, '..', 'mobile') }
];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

/* Ein paar Fehlversuche sind ein Vertipper oder ein altes Handy mit
   entferntem Geraet. Zwanzig in zehn Minuten von derselben Adresse sind
   etwas anderes - dann ist zehn Minuten Ruhe. */
const SPERRE_VERSUCHE = 20;
const SPERRE_MS = 10 * 60 * 1000;

const SICHERHEIT = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

/**
 * Die Datei zu einem Pfad - oder null.
 *
 * Dreifach abgesichert, weil hier der einzige Weg von aussen auf die Platte
 * fuehrt: keine "..", keine Nullbytes, und das aufgeloeste Ziel muss im
 * jeweiligen Ordner liegen. Dazu nur bekannte Dateiendungen.
 */
export function resolveStatic(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0') || p.includes('\\') || p.split('/').some(seg => seg === '..')) return null;
  if (p === '/' || p === '') p = '/index.html';
  for (const { prefix, dir, flat, only } of ROOTS) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length - 1);
    if (flat && rest.lastIndexOf('/') !== 0) return null;
    const ziel = path.resolve(dir, '.' + rest);
    if (ziel !== dir && !ziel.startsWith(dir + path.sep)) return null;
    const ext = path.extname(ziel).toLowerCase();
    if (only && ext !== only) return null;
    const typ = TYPES[ext];
    return typ ? { file: ziel, type: typ } : null;
  }
  return null;
}

/* DNS-Rebinding: eine fremde Seite kann einen eigenen Namen auf
   192.168.x.x zeigen lassen und den Browser so zu uns schicken. Dann steht
   ihr Name im Host-Kopf. Angenommen wird deshalb nur, was ein Handy hier
   wirklich benutzt: eine IP-Adresse, localhost oder ein .local-Name. */
function hostOk(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^\[[0-9a-f:.]+\]$/.test(h)
    || h === 'localhost' || /^[a-z0-9-]+\.local$/.test(h);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SICHERHEIT, ...headers });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
}

const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Die Seite nach /pair/push. Ohne Skript und ohne fremde Dateien - sie steht
   im kleinen Browserfenster, das iOS ueber der Web-App oeffnet, und hat
   nichts zu tun, als Bescheid zu sagen. */
function ergebnisSeite(ok, text) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Argus</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0a0d12;
         color: #f2f5f9; font: 16px/1.5 -apple-system, system-ui, "Segoe UI", sans-serif; }
  main { max-width: 340px; padding: 32px 24px; text-align: center; }
  .mark { width: 56px; height: 56px; margin: 0 auto 18px; border-radius: 50%; display: grid; place-items: center;
          font-size: 28px; background: ${ok ? 'rgba(74,222,128,.14)' : 'rgba(255,92,92,.14)'};
          color: ${ok ? '#4ade80' : '#ff8f8f'}; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #a8b3c2; margin: 0 0 20px; }
  a { color: #79c0ff; }
</style></head><body><main>
<div class="mark">${ok ? '&#10003;' : '!'}</div>
<h1>${ok ? 'Notifications are on' : 'That did not work'}</h1>
<p>${escHtml(text)}</p>
<p><a href="${escHtml(MOBILE_APP_URL)}">Back to Argus</a></p>
</main></body></html>`;
}

/* Ein zu grosser Rumpf wird zu Ende gelesen und verworfen, nicht mit
   abgerissener Verbindung beantwortet - sonst bekommt das Handy statt eines
   413 nur "Verbindung verloren" und kann nicht sagen, was los war. */
async function readBody(req, limit = 16 * 1024) {
  const zuGross = () => Object.assign(new Error('too large'), { status: 413 });
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    throw zuGross();
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', c => {
      size += c.length;
      if (size <= limit) parts.push(c);
    });
    req.on('end', () => (size > limit ? reject(zuGross()) : resolve(Buffer.concat(parts).toString('utf8'))));
    req.on('error', reject);
  });
}

/**
 * @param api    { [name]: async (device, params) => data } - die lesenden
 *               Antworten, vom Hauptprozess gebaut
 * @param onPush async (device) => void - nach einem neuen Push-Abo, damit der
 *               Hauptprozess gleich eine Probemeldung schicken kann
 */
export function createPhoneServer({ api = {}, onPush = null, log = () => {} } = {}) {
  const fehlversuche = new Map();   // Adresse -> { n, seit, gesperrtBis }

  const gesperrt = addr => {
    const f = fehlversuche.get(addr);
    return !!(f && f.gesperrtBis && f.gesperrtBis > Date.now());
  };
  const fehlgeschlagen = addr => {
    const jetzt = Date.now();
    const f = fehlversuche.get(addr) || { n: 0, seit: jetzt, gesperrtBis: 0 };
    if (jetzt - f.seit > SPERRE_MS) { f.n = 0; f.seit = jetzt; }
    f.n++;
    if (f.n >= SPERRE_VERSUCHE) { f.gesperrtBis = jetzt + SPERRE_MS; f.n = 0; f.seit = jetzt; }
    fehlversuche.set(addr, f);
  };

  async function geraet(req, addr, token) {
    if (gesperrt(addr)) return { status: 429 };
    const device = await authenticate(token);
    if (!device) { fehlgeschlagen(addr); return { status: 401 }; }
    /* Ein Name fuer die Liste am PC, sobald das Handy sich zum ersten Mal
       meldet - sonst hiesse ein Geraet, das nur die Ansicht im WLAN nutzt
       und nie Push einschaltet, fuer immer "Phone". */
    if (device.name === 'Phone' && req.headers['user-agent']) {
      await renameDevice(device.id, deviceNameFrom(req.headers['user-agent']));
    }
    return { device };
  }

  async function handle(req, res) {
    const addr = req.socket.remoteAddress;
    if (!isPrivateAddress(addr)) return send(res, 403, 'Forbidden');
    if (!hostOk(req.headers.host)) return send(res, 421, 'Misdirected Request');

    const url = new URL(req.url, 'http://localhost');
    const method = req.method;

    /* --------------------------- Push-Abo --------------------------- */
    if (url.pathname === '/pair/push') {
      if (method !== 'GET') return send(res, 405, 'Method Not Allowed', { Allow: 'GET' });
      const html = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
                     'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" };
      const { device, status } = await geraet(req, addr, url.searchParams.get('t'));
      if (!device) {
        return send(res, status, ergebnisSeite(false, status === 429
          ? 'Too many attempts. Wait ten minutes and try again.'
          : 'This phone is not paired with Argus any more. Pair it again from Settings → Phone on your PC.'), html);
      }
      let sub = null;
      try { sub = JSON.parse(fromB64url(url.searchParams.get('s')).toString('utf8')); } catch { /* unten */ }
      const ok = await setPush(device.id, sub, { userAgent: req.headers['user-agent'] });
      if (!ok) return send(res, 400, ergebnisSeite(false, 'The phone sent something that is not a push subscription. Try again from the app.'), html);
      log(`Push-Abo fuer ${device.id} gespeichert`);
      if (onPush) Promise.resolve(onPush(device)).catch(err => log(`Probemeldung gescheitert: ${err.message}`));
      return send(res, 200, ergebnisSeite(true, 'You will get a test notification in a moment. You can close this page now.'), html);
    }

    /* ------------------------------ API ------------------------------ */
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5);
      if (method !== 'GET' && method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method' });
      const auth = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
      const { device, status } = await geraet(req, addr, auth?.[1]);
      if (!device) return sendJson(res, status, { ok: false, error: status === 429 ? 'locked' : 'unpaired' });

      if (method === 'POST') {
        let body = {};
        try { body = JSON.parse((await readBody(req)) || '{}'); } catch (err) {
          return sendJson(res, err.status || 400, { ok: false, error: 'body' });
        }
        if (name === 'types') return sendJson(res, 200, { ok: true, data: await setTypes(device.id, body.types) });
        if (name === 'unpush') return sendJson(res, 200, { ok: await clearPush(device.id) });
        return sendJson(res, 404, { ok: false, error: 'unknown' });
      }

      const fn = Object.hasOwn(api, name) ? api[name] : null;
      if (typeof fn !== 'function') return sendJson(res, 404, { ok: false, error: 'unknown' });
      try {
        const data = await fn(device, Object.fromEntries(url.searchParams));
        return sendJson(res, 200, { ok: true, data });
      } catch (err) {
        log(`/api/${name}: ${err.message}`);
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    /* ---------------------------- Dateien ---------------------------- */
    if (method !== 'GET' && method !== 'HEAD') return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    const ziel = resolveStatic(url.pathname);
    if (!ziel) return send(res, 404, 'Not Found');
    let info;
    try { info = await stat(ziel.file); } catch { return send(res, 404, 'Not Found'); }
    if (!info.isFile()) return send(res, 404, 'Not Found');

    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const headers = { 'Content-Type': ziel.type, 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) return send(res, 304, null, headers);
    return send(res, 200, method === 'HEAD' ? null : await readFile(ziel.file), headers);
  }

  return http.createServer((req, res) => {
    handle(req, res).catch(err => {
      log(`Fehler: ${err.message}`);
      if (!res.headersSent) send(res, 500, 'Internal Server Error');
      else res.end();
    });
  });
}

/**
 * Startet den Server auf allen Adressen des PCs - die Pruefung, ob eine
 * Anfrage aus dem Heimnetz kommt, steht in handle(). Auf eine einzelne
 * Adresse zu binden waere enger, haelt aber nicht: bekommt der PC vom
 * Router eine neue, waere der Server taub, bis Argus neu startet.
 *
 * Windows fragt beim ersten Start, ob Argus "in privaten Netzwerken"
 * kommunizieren darf. Nur mit Ja erreicht das Handy den PC.
 */
export function startPhoneServer({ port, ...opts }) {
  const server = createPhoneServer(opts);
  return new Promise((resolve, reject) => {
    const onError = err => { server.close(); reject(err); };
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      /* Ein Fehler im laufenden Betrieb (etwa zu viele offene Dateien beim
         Annehmen) kommt ebenfalls als 'error' - ohne Zuhoerer risse er den
         ganzen Hauptprozess mit. */
      server.on('error', err => (opts.log || (() => {}))(`Serverfehler: ${err.message}`));
      resolve(server);
    });
  });
}
