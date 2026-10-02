#!/usr/bin/env node
/**
 * Prueft den Push-Versand ans Handy (core/webpush.js), ohne Netz.
 *
 *   node src/cli/webpush-test.js
 *
 * Teil 1  Die Verschluesselung gegen das ausgerechnete Beispiel aus RFC 8291
 *         (Anhang A): mit denselben Schluesseln und demselben Salz muss
 *         Byte fuer Byte derselbe Rumpf herauskommen. Stimmt hier ein Byte
 *         nicht, kann das Handy KEINE Meldung entschluesseln - und es sagt
 *         das niemandem, die Meldung bleibt einfach aus.
 * Teil 2  Hin und zurueck mit frischen Schluesseln: was Argus verschluesselt,
 *         bekommt ein Empfaenger nach RFC 8291 wieder heraus.
 * Teil 3  VAPID: der Kopf traegt eine gueltige ES256-Unterschrift, aud ist der
 *         Ursprung des endpoints, exp liegt hoechstens 24 Stunden voraus.
 * Teil 4  Zustellung mit einem nachgebauten Push-Dienst: Koepfe, und was aus
 *         201, 410 und 403 wird.
 */
import { createECDH, createPublicKey, createDecipheriv, hkdfSync, verify } from 'node:crypto';
import {
  encrypt, vapidAuthorization, generateVapidKeys, sendPush, b64url, fromB64url, MAX_PAYLOAD, VAPID_SUBJECT
} from '../core/webpush.js';

let fehler = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fehler++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};

/* Der Empfaenger, so wie ihn ein Handy rechnet - absichtlich hier neu
   geschrieben und nicht aus webpush.js geholt: ein Fehler, der in beiden
   Richtungen gleich falsch ist, faellt sonst nie auf. */
function decrypt(body, { uaPrivate, auth }) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(fromB64url(uaPrivate));
  const uaPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(asPublic);

  const h = (ikm, s, label, extra, len) =>
    Buffer.from(hkdfSync('sha256', ikm, s, Buffer.concat([Buffer.from(label), Buffer.from([0]), ...extra]), len));
  const ikm = h(shared, fromB64url(auth), 'WebPush: info', [uaPublic, asPublic], 32);
  const cek = h(ikm, salt, 'Content-Encoding: aes128gcm', [], 16);
  const nonce = h(ikm, salt, 'Content-Encoding: nonce', [], 12);

  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([d.update(record.subarray(0, record.length - 16)), d.final()]);
  /* Hinten steht das Trennzeichen 0x02 ("letzter Datensatz"), davor
     hoechstens Nullen als Polster. */
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('kein Endezeichen 0x02');
  return { text: plain.subarray(0, end).toString('utf8'), rs };
}

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 1: RFC 8291, Anhang A ===');

/* Abgeschrieben aus RFC 8291, Abschnitt 5 und Anhang A. */
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  ecdhSecret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
        'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
        'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
};

/* Die Zwischenwerte einzeln, damit eine Abweichung sagt, WO sie entsteht. */
{
  const as = createECDH('prime256v1');
  as.setPrivateKey(fromB64url(RFC.asPrivate));
  ok('oeffentlicher Absenderschluessel passt zum privaten', b64url(as.getPublicKey()) === RFC.asPublic);
  const shared = as.computeSecret(fromB64url(RFC.uaPublic));
  ok('gemeinsames ECDH-Geheimnis', b64url(shared) === RFC.ecdhSecret, b64url(shared));

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info'), Buffer.from([0]),
                                 fromB64url(RFC.uaPublic), fromB64url(RFC.asPublic)]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, fromB64url(RFC.auth), keyInfo, 32));
  ok('IKM', b64url(ikm) === RFC.ikm, b64url(ikm));
  const cek = Buffer.from(hkdfSync('sha256', ikm, fromB64url(RFC.salt),
    Buffer.concat([Buffer.from('Content-Encoding: aes128gcm'), Buffer.from([0])]), 16));
  ok('Inhaltsschluessel (CEK)', b64url(cek) === RFC.cek, b64url(cek));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, fromB64url(RFC.salt),
    Buffer.concat([Buffer.from('Content-Encoding: nonce'), Buffer.from([0])]), 12));
  ok('Nonce', b64url(nonce) === RFC.nonce, b64url(nonce));
}

const body = encrypt(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, {
  salt: fromB64url(RFC.salt),
  senderKeys: { privateKey: RFC.asPrivate }
});
ok('Rumpf Byte fuer Byte wie im RFC', b64url(body) === RFC.body,
   b64url(body) === RFC.body ? '' : b64url(body));
ok('Laenge 144 Byte (86 Kopf + 41 Text + 1 Ende + 16 Pruefsumme)', body.length === 144, String(body.length));
const zurueck = decrypt(body, { uaPrivate: RFC.uaPrivate, auth: RFC.auth });
ok('der RFC-Empfaenger liest den Text wieder', zurueck.text === RFC.plaintext, zurueck.text);
ok('Datensatzgroesse 4096', zurueck.rs === 4096, String(zurueck.rs));

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 2: Hin und zurueck mit frischen Schluesseln ===');

const ua = createECDH('prime256v1');
ua.generateKeys();
const sub = {
  endpoint: 'https://web.push.apple.com/QGZ8nHwBM-test-endpoint',
  keys: { p256dh: b64url(ua.getPublicKey()), auth: b64url(Buffer.from('0123456789abcdef')) }
};
const uaPrivate = b64url(ua.getPrivateKey());

for (const text of ['', 'kurz', 'Ümläute, Emoji 🜂 und "Anführungszeichen"', 'x'.repeat(MAX_PAYLOAD)]) {
  const enc = encrypt(text, sub.keys);
  const dec = decrypt(enc, { uaPrivate, auth: sub.keys.auth });
  ok(`${String(text.length).padStart(4)} Zeichen kommen unveraendert an`, dec.text === text);
}
const a = encrypt('gleich', sub.keys);
const b = encrypt('gleich', sub.keys);
ok('zweimal derselbe Text ergibt zwei verschiedene Rumpfe (frisches Salz und Wegwerfschluessel)',
   !a.equals(b));

let geworfen = null;
try { encrypt('x', { p256dh: 'kaputt', auth: sub.keys.auth }); } catch (err) { geworfen = err.message; }
ok('ein unbrauchbarer p256dh wird abgewiesen', !!geworfen, geworfen || '');

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 3: VAPID ===');

const vapid = generateVapidKeys();
ok('oeffentlicher Schluessel ist ein unkomprimierter Punkt (65 Byte, 0x04)',
   fromB64url(vapid.publicKey).length === 65 && fromB64url(vapid.publicKey)[0] === 4);
ok('privater Schluessel hat 32 Byte', fromB64url(vapid.privateKey).length === 32);

const jetzt = Date.UTC(2026, 9, 2, 12, 0, 0);
const kopf = vapidAuthorization(sub.endpoint, vapid, { now: jetzt });
const m = /^vapid t=([^,]+), k=(.+)$/.exec(kopf);
ok('Form "vapid t=..., k=..."', !!m);
if (m) {
  const [h, c, s] = m[1].split('.');
  const header = JSON.parse(fromB64url(h).toString());
  const claims = JSON.parse(fromB64url(c).toString());
  ok('Kopf ES256/JWT', header.alg === 'ES256' && header.typ === 'JWT');
  ok('aud ist nur der Ursprung', claims.aud === 'https://web.push.apple.com', claims.aud);
  ok('sub ist die Projektseite', claims.sub === VAPID_SUBJECT, claims.sub);
  const vorlauf = claims.exp - jetzt / 1000;
  ok('exp liegt in der Zukunft und hoechstens 24 h voraus', vorlauf > 0 && vorlauf <= 86400, `${vorlauf} s`);
  ok('k ist der oeffentliche Schluessel', m[2] === vapid.publicKey);

  const pub = fromB64url(vapid.publicKey);
  const key = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33)) },
    format: 'jwk'
  });
  const sig = fromB64url(s);
  ok('Unterschrift hat die rohe Form r||s (64 Byte)', sig.length === 64, String(sig.length));
  ok('Unterschrift ist gueltig',
     verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, sig));
  const fremd = generateVapidKeys();
  const fpub = fromB64url(fremd.publicKey);
  const fkey = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64url(fpub.subarray(1, 33)), y: b64url(fpub.subarray(33)) },
    format: 'jwk'
  });
  ok('...und mit einem fremden Schluessel nicht',
     !verify('sha256', Buffer.from(`${h}.${c}`), { key: fkey, dsaEncoding: 'ieee-p1363' }, sig));
}

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 4: Zustellung ===');

function dienst(status, text = '') {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { calls, fetchImpl };
}

{
  const { calls, fetchImpl } = dienst(201);
  const res = await sendPush(sub, { title: 'Riss', body: 'Axi Cascade' },
    { vapid, ttl: 900.4, urgency: 'high', topic: 'fissure:Axi/Cascade!', fetchImpl });
  ok('201 heisst zugestellt', res.ok && !res.gone, JSON.stringify(res));
  const h = calls[0]?.init?.headers || {};
  ok('POST an den endpoint', calls[0]?.url === sub.endpoint && calls[0]?.init?.method === 'POST');
  ok('Content-Encoding aes128gcm', h['Content-Encoding'] === 'aes128gcm');
  ok('TTL ganzzahlig', h.TTL === '900', h.TTL);
  ok('Urgency high', h.Urgency === 'high');
  ok('Topic nur aus erlaubten Zeichen', h.Topic === 'fissureAxiCascade', h.Topic);
  ok('Authorization mit vapid', String(h.Authorization).startsWith('vapid t='));
  const dec = decrypt(calls[0].init.body, { uaPrivate, auth: sub.keys.auth });
  ok('der Inhalt ist JSON und kommt so an', JSON.parse(dec.text).body === 'Axi Cascade', dec.text);
}
{
  const { fetchImpl } = dienst(410, '{"reason":"Unregistered"}');
  const res = await sendPush(sub, { t: 1 }, { vapid, fetchImpl });
  ok('410 heisst: Abo vergessen', !res.ok && res.gone, res.error);
}
{
  const { fetchImpl } = dienst(404);
  const res = await sendPush(sub, { t: 1 }, { vapid, fetchImpl });
  ok('404 ebenso', !res.ok && res.gone);
}
{
  const { fetchImpl } = dienst(403, '{"reason":"BadJwtToken"}');
  const res = await sendPush(sub, { t: 1 }, { vapid, fetchImpl });
  ok('403 ist ein Fehler, aber kein verlorenes Abo', !res.ok && !res.gone && /BadJwtToken/.test(res.error), res.error);
}
{
  const { calls, fetchImpl } = dienst(201);
  const res = await sendPush({ endpoint: 'http://unsicher.example/x', keys: sub.keys }, { t: 1 }, { vapid, fetchImpl });
  ok('ein endpoint ohne https wird gar nicht erst angesprochen', !res.ok && calls.length === 0, res.error);
}
{
  const { calls, fetchImpl } = dienst(201);
  const res = await sendPush(sub, { body: 'x'.repeat(MAX_PAYLOAD) }, { vapid, fetchImpl });
  ok('zu grosser Inhalt wird vor dem Senden abgewiesen', !res.ok && calls.length === 0, res.error);
}
{
  const fetchImpl = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  const res = await sendPush(sub, { t: 1 }, { vapid, fetchImpl });
  ok('ein Netzfehler wird gemeldet statt geworfen', !res.ok && /ENOTFOUND/.test(res.error));
}
{
  const fetchImpl = async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) });
  };
  const res = await sendPush(sub, { t: 1 }, { vapid, fetchImpl });
  ok('"fetch failed" wird mit Grund verstaendlich', res.error === 'push service not reachable (ECONNREFUSED)', res.error);
}
{
  const fetchImpl = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
  const res = await sendPush(sub, { t: 1 }, { vapid, fetchImpl });
  ok('Zeitueberschreitung wird verstaendlich', res.error === 'push service did not answer in time', res.error);
}

console.log(`\n${fehler ? `${fehler} FEHLER` : 'Alles bestanden.'}`);
process.exitCode = fehler ? 1 : 0;
