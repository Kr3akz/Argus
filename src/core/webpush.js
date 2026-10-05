/**
 * Web Push: eine Meldung vom PC aufs Handy, ohne eigenen Server und ohne
 * Konto bei irgendwem.
 *
 * WIE DAS GEHT:
 *   Das Handy meldet sich bei SEINEM Push-Dienst an - Apple beim iPhone,
 *   Google bei Chrome und Android, Mozilla bei Firefox - und bekommt dafuer
 *   eine Adresse (den "endpoint") und zwei Schluessel. Diese drei Werte
 *   wandern beim Koppeln zum PC (siehe phone.js). Argus schickt die Meldung
 *   dann verschluesselt an genau diese Adresse, und der Dienst reicht sie an
 *   das Handy weiter, auch wenn die Web-App gerade zu ist.
 *
 *   Um den Push-Dienst kommt keine Benachrichtigung herum, die ankommt,
 *   waehrend die App geschlossen ist: er ist Teil des Betriebssystems, nicht
 *   etwas, das man zusaetzlich installiert. Was er zu sehen bekommt, steht
 *   unten bei encrypt().
 *
 * DREI STANDARDS, SONST NICHTS:
 *   RFC 8030  die Zustellung selbst (POST an den endpoint, TTL, Urgency, Topic)
 *   RFC 8291  die Verschluesselung des Inhalts (ECDH + HKDF + AES-128-GCM)
 *   RFC 8292  VAPID: woran der Push-Dienst erkennt, dass die Meldung vom
 *             selben Absender kommt, bei dem sich das Handy angemeldet hat
 *
 * WARUM SELBST GESCHRIEBEN UND NICHT DAS PAKET web-push:
 *   Alles, was es dafuer braucht, steckt in node:crypto - ECDH auf P-256,
 *   HKDF, AES-GCM und ECDSA. Das Paket braechte dieselben hundert Zeilen plus
 *   eine Kette von Abhaengigkeiten mit, und bei einem Programm, das den
 *   Speicher eines anderen Prozesses liest, zaehlt jede Abhaengigkeit, die
 *   man nicht hat. Ob die Rechnung stimmt, prueft src/cli/webpush-test.js
 *   gegen das ausgerechnete Beispiel aus RFC 8291 - Byte fuer Byte.
 */
import {
  createECDH, createPrivateKey, createCipheriv, hkdfSync, randomBytes, sign
} from 'node:crypto';

/* Eine Nachricht, ein Datensatz. Der Push-Dienst muss mindestens 4096 Byte
   annehmen (RFC 8030, 7.2) - Kopf (86 Byte) und Pruefsumme (16) gehen davon
   ab. Was Argus schickt, sind Titel und zwei Zeilen Text; die Grenze ist
   also nur die Sicherung gegen einen Fluesterer, der einen Roman schreibt. */
const RECORD_SIZE = 4096;
export const MAX_PAYLOAD = 3000;

/* Wie lange die Unterschrift gilt. RFC 8292 erlaubt hoechstens 24 Stunden;
   zwoelf lassen Luft fuer eine Uhr, die ein paar Stunden falsch geht, ohne
   an der Obergrenze zu kratzen. Erzeugt wird sie ohnehin je Meldung neu -
   das kostet Bruchteile einer Millisekunde. */
const VAPID_TTL_S = 12 * 60 * 60;

/* Der Absender, wie ihn VAPID verlangt: eine mailto:- oder https:-Adresse.
   Apple weist eine Meldung ohne diese Angabe ab (BadJwtToken). Die
   Projektseite statt einer Mailadresse: niemand soll fuer Argus eine
   Adresse hergeben muessen, und der Push-Dienst erfaehrt so nichts ueber
   den Menschen am PC. */
export const VAPID_SUBJECT = 'https://github.com/Kr3akz/Argus';

/* ----------------------------- Base64url ----------------------------- */

export const b64url = buf => Buffer.from(buf).toString('base64url');
export const fromB64url = s => Buffer.from(String(s || ''), 'base64url');

/* ------------------------------- VAPID ------------------------------- */

/**
 * Ein neues Schluesselpaar fuer diesen PC.
 *
 * Je Installation ein eigenes, nie ein gemeinsames fuer alle: ein Abo, das
 * das Handy mit DIESEM oeffentlichen Schluessel abgeschlossen hat, nimmt nur
 * Meldungen an, die mit dem zugehoerigen privaten unterschrieben sind. Ein
 * Schluessel im Quelltext gaebe jedem, der einen endpoint aufschnappt, die
 * Moeglichkeit, Meldungen auf fremde Handys zu schicken.
 *
 * publicKey ist der unkomprimierte Punkt (65 Byte, beginnt mit 0x04) - genau
 * die Form, die das Handy als applicationServerKey erwartet.
 */
export function generateVapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(scalar32(ecdh.getPrivateKey())) };
}

/**
 * Der private Schluessel auf volle 32 Byte.
 *
 * getPrivateKey() laesst fuehrende Null-Bytes weg: etwa jeder 256. Schluessel
 * kam mit 31 Byte heraus (am 05.10.2026 129 Versuche bis zum ersten;
 * webpush-test scheiterte daran in 5 von 721 Laeufen). Unterschreiben klappte
 * damit trotzdem - nachgeprueft unter Node 24 und unter Electron 33 -, aber
 * JWK verlangt fuer P-256 genau 32 Byte (RFC 7518, 6.2.2.1), und ein
 * strengerer Importer duerfte den kurzen ablehnen. Hier aufgefuellt, damit
 * auch ein schon gespeicherter kurzer Schluessel in Ordnung geht.
 */
function scalar32(buf) {
  return buf.length >= 32 ? buf : Buffer.concat([Buffer.alloc(32 - buf.length), buf]);
}

function privateKeyObject({ publicKey, privateKey }) {
  const pub = fromB64url(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key is not an uncompressed P-256 point');
  return createPrivateKey({
    key: {
      kty: 'EC', crv: 'P-256',
      d: b64url(scalar32(fromB64url(privateKey))),
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65))
    },
    format: 'jwk'
  });
}

/**
 * Der Authorization-Kopf einer Meldung an `endpoint`.
 *
 * aud ist der Ursprung des endpoints (Schema + Host), nicht die ganze
 * Adresse - so steht es in RFC 8292, und die Dienste pruefen das genau.
 * Die Unterschrift ist ES256 in der rohen Form r||s (64 Byte), nicht DER:
 * JWT schreibt das so vor, node:crypto liefert ohne dsaEncoding aber DER.
 */
export function vapidAuthorization(endpoint, vapid, { subject = VAPID_SUBJECT, now = Date.now() } = {}) {
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + VAPID_TTL_S,
    sub: subject
  }));
  const unsigned = `${head}.${claims}`;
  const sig = sign('sha256', Buffer.from(unsigned), { key: privateKeyObject(vapid), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64url(sig)}, k=${vapid.publicKey}`;
}

/* --------------------------- Verschluesselung --------------------------- */

const info = (label, ...parts) => Buffer.concat([Buffer.from(label, 'utf8'), Buffer.from([0]), ...parts]);
const hkdf = (ikm, salt, inf, len) => Buffer.from(hkdfSync('sha256', ikm, salt, inf, len));

/**
 * Verschluesselt eine Meldung fuer genau ein Handy (RFC 8291, aes128gcm).
 *
 * WAS DER PUSH-DIENST DAVON SIEHT: einen Block ohne Bedeutung, wann er kam
 * und wie gross er ist. Den Schluessel dazu kennen nur das Handy, das das
 * Abo abgeschlossen hat, und - fuer diese eine Meldung - Argus. Der Weg ueber
 * Apple oder Google ist also kein Weg, auf dem jemand mitliest, was im
 * Fluestern stand.
 *
 * Ablauf, Schritt fuer Schritt aus RFC 8291 Abschnitt 3:
 *   1. ein Wegwerf-Schluesselpaar fuer diese eine Meldung
 *   2. ECDH mit dem oeffentlichen Schluessel des Handys (p256dh)
 *   3. HKDF mit dem gemeinsamen Geheimnis aus dem Abo (auth) -> IKM
 *   4. HKDF mit einem zufaelligen Salz -> Inhaltsschluessel und Nonce
 *   5. AES-128-GCM ueber Inhalt + 0x02 (das Zeichen "letzter Datensatz")
 *
 * `salt` und `senderKeys` sind nur fuer den Test da: mit den Werten aus dem
 * RFC muss Byte fuer Byte dasselbe herauskommen wie dort abgedruckt.
 */
export function encrypt(payload, { p256dh, auth }, { salt = randomBytes(16), senderKeys = null } = {}) {
  const plain = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh is not an uncompressed P-256 point');
  if (authSecret.length !== 16) throw new Error('auth secret must be 16 bytes');
  if (salt.length !== 16) throw new Error('salt must be 16 bytes');

  const ecdh = createECDH('prime256v1');
  if (senderKeys) ecdh.setPrivateKey(fromB64url(senderKeys.privateKey));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const ikm = hkdf(shared, authSecret, info('WebPush: info', uaPublic, asPublic), 32);
  const cek = hkdf(ikm, salt, info('Content-Encoding: aes128gcm'), 16);
  const nonce = hkdf(ikm, salt, info('Content-Encoding: nonce'), 12);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plain, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  /* Kopf nach RFC 8188: Salz, Datensatzgroesse, Laenge und Wert der
     Schluesselkennung - hier der oeffentliche Wegwerf-Schluessel, aus dem
     das Handy seine Haelfte des Geheimnisses rechnet. */
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(RECORD_SIZE, 16);
  head.writeUInt8(asPublic.length, 20);
  return Buffer.concat([head, asPublic, body]);
}

/* ------------------------------ Zustellung ------------------------------ */

/* Topic (RFC 8030, 5.4): eine neue Meldung mit demselben Thema ersetzt eine
   noch nicht zugestellte alte. Erlaubt sind hoechstens 32 Zeichen aus dem
   base64url-Alphabet - alles andere fliegt hier raus, statt dass der Dienst
   die ganze Meldung ablehnt. */
const cleanTopic = t => String(t || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || null;

const URGENCIES = new Set(['very-low', 'low', 'normal', 'high']);

/**
 * Schickt eine Meldung an ein Abo.
 *
 * @param subscription { endpoint, keys: { p256dh, auth } } - so, wie das
 *                     Handy es mit PushSubscription.toJSON() liefert
 * @param data         was die Web-App im push-Ereignis bekommt (wird JSON)
 * @param opts.vapid   { publicKey, privateKey } dieses PCs
 * @param opts.ttl     wie lange der Dienst die Meldung aufhebt, wenn das
 *                     Handy gerade aus ist - in Sekunden
 * @param opts.urgency 'very-low' | 'low' | 'normal' | 'high'
 * @param opts.topic   ersetzt eine noch wartende Meldung desselben Themas
 *
 * Gibt nie eine Ausnahme weiter: { ok, status, gone, error }. `gone` heisst,
 * das Abo gibt es nicht mehr (404/410) - das Handy hat die App geloescht
 * oder die Erlaubnis zurueckgenommen. Dann soll der Aufrufer es vergessen,
 * statt bei jeder Meldung erneut ins Leere zu senden.
 */
export async function sendPush(subscription, data, { vapid, ttl = 3600, urgency = 'normal', topic = null,
                                                     timeoutMs = 10000, fetchImpl = fetch } = {}) {
  try {
    const endpoint = subscription?.endpoint;
    if (!endpoint || !/^https:\/\//.test(endpoint)) throw new Error('subscription has no https endpoint');
    const payload = Buffer.from(JSON.stringify(data), 'utf8');
    if (payload.length > MAX_PAYLOAD) throw new Error(`payload too large (${payload.length} bytes)`);

    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: String(Math.max(0, Math.round(ttl))),
      Urgency: URGENCIES.has(urgency) ? urgency : 'normal',
      Authorization: vapidAuthorization(endpoint, vapid)
    };
    const t = cleanTopic(topic);
    if (t) headers.Topic = t;

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: encrypt(payload, subscription.keys || {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (res.ok) return { ok: true, status: res.status, gone: false, error: null };

    /* Die Begruendung steht bei Apple als JSON im Rumpf ({"reason":
       "BadJwtToken"}), bei Google als Text. Beides ist fuer das Protokoll
       wertvoller als die nackte Zahl. */
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      gone: res.status === 404 || res.status === 410,
      error: `HTTP ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`
    };
  } catch (err) {
    /* fetch meldet jeden Netzfehler nur als "fetch failed" - der Grund
       (kein Netz, Name unbekannt, Verbindung abgelehnt) steckt in cause. */
    const error = err.name === 'TimeoutError' ? 'push service did not answer in time'
      : err.message === 'fetch failed'
        ? `push service not reachable${err.cause?.code ? ` (${err.cause.code})` : ''}`
        : err.message;
    return { ok: false, status: 0, gone: false, error };
  }
}
