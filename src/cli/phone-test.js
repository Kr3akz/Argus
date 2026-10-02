#!/usr/bin/env node
/**
 * Prueft das Koppeln eines Handys und den Server im Heimnetz
 * (core/phone.js, core/phone-server.js) - ohne Electron, ohne Handy.
 *
 *   node src/cli/phone-test.js
 *
 * Laeuft gegen einen eigenen, leeren Datenordner: die echten Kopplungen in
 * data/phone.json fasst der Test nicht an.
 *
 * Teil 1  Kopplungscode: was drinsteht, dass er nur einmal offen ist und
 *         nach einer Viertelstunde verfaellt
 * Teil 2  Kennungen: richtige, falsche, entfernte
 * Teil 3  Push-Abos, Heimnetz-Adressen, Geraetenamen
 * Teil 4  Zustellung an die Geraete, mit nachgebautem Push-Dienst
 * Teil 5  Der Server: Kennung, Host-Kopf, Sperre, Dateien, Push-Abo, API
 */
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createECDH } from 'node:crypto';
import { setDataDir } from '../core/paths.js';
import * as phone from '../core/phone.js';
import { startPhoneServer, resolveStatic } from '../core/phone-server.js';
import { b64url } from '../core/webpush.js';

let fehler = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fehler++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const ordner = await mkdtemp(path.join(tmpdir(), 'argus-phone-'));
setDataDir(ordner);
phone._resetForTest();

const tokenAus = url => phone.parsePairingCode(url.split('#pair=')[1])?.t;

function abo() {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  return {
    endpoint: 'https://web.push.apple.com/QGZ8nHwBM-' + Math.random().toString(36).slice(2),
    keys: { p256dh: b64url(ua.getPublicKey()), auth: b64url(Buffer.from('0123456789abcdef')) }
  };
}

try {
  /* ---------------------------------------------------------------------- */
  console.log('\n=== Teil 1: Kopplungscode ===');
  const t0 = Date.UTC(2026, 9, 2, 12, 0, 0);
  const p1 = await phone.createPairing({ pcName: 'KAAN-PC', baseUrl: 'http://192.168.178.20:47120', now: t0 });
  ok('Adresse zeigt auf die Handy-App, Code hinter #', p1.url.startsWith(phone.MOBILE_APP_URL + '#pair='));
  const code = phone.parsePairingCode(p1.code);
  ok('Code enthaelt Name, Adresse, Schluessel, Kennung',
     code?.n === 'KAAN-PC' && code.u === 'http://192.168.178.20:47120' && code.k?.length === 87 && code.t?.length === 43 && code.i === p1.device.id);
  ok('neues Geraet wartet auf das Handy', p1.device.pending && !p1.device.paired);
  const st = await phone.loadPhone();
  ok('auf der Platte steht nur der Hash der Kennung',
     !JSON.stringify(st).includes(code.t) && st.devices[0].tokenHash.length > 20);

  const p2 = await phone.createPairing({ pcName: 'KAAN-PC', baseUrl: 'http://192.168.178.20:47120', now: t0 + 1000 });
  ok('ein zweiter Code macht den ersten ungueltig',
     (await phone.authenticate(code.t, { now: t0 + 2000 })) === null);
  const t2 = tokenAus(p2.url);
  ok('nach 16 Minuten verfaellt ein nie benutzter Code',
     (await phone.authenticate(t2, { now: t0 + 1000 + 16 * 60 * 1000 })) === null);

  const p3 = await phone.createPairing({ pcName: 'KAAN-PC', baseUrl: 'http://192.168.178.20:47120', now: t0 });
  const t3 = tokenAus(p3.url);
  const d3 = await phone.authenticate(t3, { now: t0 + 60 * 1000 });
  ok('innerhalb der Frist gekoppelt', d3?.id === p3.device.id && !!d3.pairedAt);
  ok('gekoppelt verfaellt nicht mehr', (await phone.authenticate(t3, { now: t0 + 400 * 24 * 3600 * 1000 }))?.id === p3.device.id);

  /* ---------------------------------------------------------------------- */
  console.log('\n=== Teil 2: Kennungen ===');
  ok('falsche Kennung', (await phone.authenticate('x'.repeat(43))) === null);
  ok('leere Kennung', (await phone.authenticate('')) === null);
  ok('ueberlange Kennung', (await phone.authenticate('x'.repeat(5000))) === null);
  const beschr = await phone.describePhone({ now: t0 + 60 * 1000 });
  ok('die Oberflaeche sieht keine Hashes', !JSON.stringify(beschr).includes('tokenHash'));
  ok('Zugang im WLAN ist anfangs aus', beschr.enabled === false);

  /* ---------------------------------------------------------------------- */
  console.log('\n=== Teil 3: Abos, Adressen, Namen ===');
  const a = abo();
  ok('ein echtes Abo wird angenommen', phone.validSubscription(a));
  ok('http statt https nicht', !phone.validSubscription({ ...a, endpoint: 'http://x.example/1' }));
  ok('kaputter Schluessel nicht', !phone.validSubscription({ ...a, keys: { ...a.keys, p256dh: 'abc' } }));
  ok('kurzes auth nicht', !phone.validSubscription({ ...a, keys: { ...a.keys, auth: 'abc' } }));
  ok('gar nichts nicht', !phone.validSubscription(null));

  const ifaces = {
    'vEthernet (WSL)': [{ address: '172.20.48.1', family: 'IPv4', internal: false }],
    'Ethernet': [{ address: '10.0.0.7', family: 'IPv4', internal: false }],
    'WLAN': [{ address: '192.168.178.20', family: 'IPv4', internal: false },
             { address: 'fe80::1', family: 'IPv6', internal: false }],
    'Loopback Pseudo-Interface 1': [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    'APIPA': [{ address: '169.254.10.1', family: 'IPv4', internal: false }],
    'Modem': [{ address: '93.184.216.34', family: 'IPv4', internal: false }]
  };
  const lan = phone.lanAddresses(ifaces);
  ok('192.168.x.x zuerst', lan[0]?.address === '192.168.178.20', lan.map(l => l.address).join(', '));
  ok('WSL-Adapter zuletzt', lan.at(-1)?.address === '172.20.48.1');
  ok('Loopback und 169.254 fehlen', !lan.some(l => l.address.startsWith('127.') || l.address.startsWith('169.254')));
  ok('eine Adresse ausserhalb des Heimnetzes fehlt', !lan.some(l => l.address === '93.184.216.34'));

  for (const [addr, erwartet] of [
    ['192.168.1.5', true], ['::ffff:192.168.1.5', true], ['10.1.2.3', true], ['172.16.0.1', true],
    ['172.31.255.1', true], ['127.0.0.1', true], ['::1', true], ['fe80::abcd', true], ['fd12::1', true],
    ['172.32.0.1', false], ['8.8.8.8', false], ['::ffff:93.184.216.34', false], ['2001:db8::1', false], ['', false]
  ]) ok(`${addr || '(leer)'} ist ${erwartet ? '' : 'nicht '}im Heimnetz`, phone.isPrivateAddress(addr) === erwartet);

  for (const [ua, name] of [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15', 'iPhone'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) AppleWebKit/537.36', 'Pixel 8'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36', 'Android phone']
  ]) ok(`Name aus der Browserkennung: ${name}`, phone.deviceNameFrom(ua) === name, phone.deviceNameFrom(ua));

  ok('Abo am Geraet gespeichert, Name aus der Kennung',
     await phone.setPush(p3.device.id, a, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' })
     && (await phone.describePhone()).devices.find(d => d.id === p3.device.id)?.name === 'iPhone');
  ok('ein ungueltiges Abo aendert nichts', !(await phone.setPush(p3.device.id, { endpoint: 'x' })));

  /* ---------------------------------------------------------------------- */
  console.log('\n=== Teil 4: Zustellung ===');
  const gesendet = [];
  const dienst = status => async (url, init) => {
    gesendet.push({ url, headers: init.headers });
    return { ok: status < 300, status, text: async () => '' };
  };
  let r = await phone.deliver({ type: 'fissure', title: 'Axi Cascade', body: 'Tuvul Commons' },
    { baseUrl: 'http://192.168.178.20:47120', fetchImpl: dienst(201) });
  ok('an das gekoppelte Geraet zugestellt', r.sent === 1 && gesendet[0]?.url === a.endpoint);
  ok('Riss: 30 Minuten aufheben', gesendet[0]?.headers.TTL === '1800');

  await phone.setTypes(p3.device.id, { fissure: false });
  gesendet.length = 0;
  r = await phone.deliver({ type: 'fissure', title: 'x' }, { fetchImpl: dienst(201) });
  ok('abgewaehlte Art kommt nicht an', r.sent === 0 && gesendet.length === 0);
  r = await phone.deliver({ type: 'cycle', title: 'Night in 3 min', ttl: 180, topic: 'cycle-cetus' }, { fetchImpl: dienst(201) });
  ok('Zyklus: Frist und Thema von der Meldung', gesendet[0]?.headers.TTL === '180' && gesendet[0]?.headers.Topic === 'cycle-cetus');
  r = await phone.deliver({ type: 'test', title: 'Test' }, { only: p3.device.id, fetchImpl: dienst(201) });
  ok('der Test geht an genau ein Geraet', r.sent === 1);

  r = await phone.deliver({ type: 'foundry', title: 'Ready' }, { fetchImpl: dienst(410) });
  const nachher = (await phone.describePhone()).devices.find(d => d.id === p3.device.id);
  ok('410: Abo vergessen und am Geraet vermerkt', r.failed === 1 && !nachher.push && nachher.pushError === 'expired');
  r = await phone.deliver({ type: 'foundry', title: 'Ready' }, { fetchImpl: dienst(201) });
  ok('ohne Abo wird niemand angesprochen', r.sent === 0 && r.failed === 0);

  const payload = phone.pushPayload({ type: 'whisper', title: 'x'.repeat(500), body: 'y'.repeat(900), nav: 'trading' },
    { baseUrl: 'http://192.168.178.20:47120', now: t0 });
  ok('Titel und Text werden gekuerzt', payload.title.length === 120 && payload.body.length === 400);
  ok('die Adresse des PCs reist mit', payload.pc === 'http://192.168.178.20:47120');

  /* ---------------------------------------------------------------------- */
  console.log('\n=== Teil 5: Der Server ===');
  ok('.. im Pfad', resolveStatic('/../data/phone.json') === null);
  ok('kodiertes ..', resolveStatic('/%2e%2e/%2e%2e/package.json') === null);
  ok('Backslash', resolveStatic('/..\\..\\package.json') === null);
  ok('Nullbyte', resolveStatic('/index.html%00.png') === null);
  ok('unbekannte Endung', resolveStatic('/app.map') === null);
  ok('/ ist die App', resolveStatic('/')?.file.endsWith(path.join('mobile', 'index.html')));
  ok('/assets/ zeigt in die Bilder des Renderers', resolveStatic('/assets/icons/logo.png')?.file.endsWith(path.join('renderer', 'assets', 'icons', 'logo.png')));
  ok('/core/ liefert die Rechenregeln', resolveStatic('/core/worldstate.js')?.file.endsWith(path.join('core', 'worldstate.js')));
  ok('/core/ nur .js', resolveStatic('/core/phone.json') === null);
  ok('/core/ nur direkt im Ordner', resolveStatic('/core/sub/x.js') === null);
  ok('/core/ nicht hinaus', resolveStatic('/core/%2e%2e/main/main.js') === null);

  const p4 = await phone.createPairing({ pcName: 'KAAN-PC', baseUrl: 'http://127.0.0.1' });
  const t4 = tokenAus(p4.url);
  const gemeldet = [];
  const server = await startPhoneServer({
    port: 0,
    api: {
      hello: async device => ({ id: device.id }),
      kaputt: async () => { throw new Error('absichtlich'); }
    },
    onPush: async device => { gemeldet.push(device.id); }
  });
  const port = server.address().port;
  const basis = `http://127.0.0.1:${port}`;
  const holen = (p, opts = {}) => fetch(basis + p, opts);
  const mit = token => ({ headers: { Authorization: `Bearer ${token}` } });

  try {
    let res = await holen('/api/hello');
    ok('ohne Kennung: 401', res.status === 401);
    res = await holen('/api/hello', mit(t4));
    const json = await res.json();
    ok('mit Kennung: Antwort vom Hauptprozess', res.status === 200 && json.data?.id === p4.device.id);
    ok('keine CORS-Freigabe', !res.headers.get('access-control-allow-origin'));
    ok('nicht zwischengespeichert', res.headers.get('cache-control') === 'no-store');

    res = await holen('/api/gibtsnicht', mit(t4));
    ok('unbekannter Aufruf: 404', res.status === 404);
    res = await holen('/api/kaputt', mit(t4));
    ok('Fehler im Hauptprozess: 500 statt Absturz', res.status === 500);
    res = await holen('/api/constructor', mit(t4));
    ok('kein Weg an Object-Eigenschaften vorbei', res.status === 404);

    /* fetch laesst den Host-Kopf nicht ueberschreiben - also von Hand. */
    const mitHost = host => new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: '/api/hello', headers: { Host: host, ...mit(t4).headers } },
        antwort => { antwort.resume(); resolve(antwort.statusCode); });
      r.on('error', reject);
      r.end();
    });
    ok('fremder Host-Kopf (DNS-Rebinding): 421', (await mitHost('boese.example')) === 421);
    ok('...auch mit Port', (await mitHost('boese.example:47120')) === 421);
    ok('IP-Adresse als Host: angenommen', (await mitHost('192.168.178.20:47120')) === 200);
    ok('.local-Name: angenommen', (await mitHost('kaan-pc.local:47120')) === 200);

    res = await holen('/api/types', { method: 'POST', headers: { ...mit(t4).headers, 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ types: { whisper: false } }) });
    const typen = (await res.json()).data;
    ok('Meldungsarten vom Handy aus umstellbar', typen?.whisper === false && typen.fissure === true);

    res = await holen('/api/types', { method: 'POST', headers: mit(t4).headers, body: 'x'.repeat(20000) });
    ok('zu grosser Rumpf: 413', res.status === 413, String(res.status));

    const sub = abo();
    res = await holen(`/pair/push?t=${encodeURIComponent(t4)}&s=${b64url(JSON.stringify(sub))}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' } });
    const seite = await res.text();
    ok('Push-Abo per Weiterleitung angenommen', res.status === 200 && /Notifications are on/.test(seite));
    ok('Seite ohne Skript', !/<script/i.test(seite) && /default-src 'none'/.test(res.headers.get('content-security-policy') || ''));
    await new Promise(r => setTimeout(r, 20));
    ok('danach geht die Probemeldung los', gemeldet.includes(p4.device.id));
    ok('Abo steht am Geraet', (await phone.describePhone()).devices.find(d => d.id === p4.device.id)?.push === true);

    res = await holen(`/pair/push?t=${encodeURIComponent(t4)}&s=kaputt`);
    ok('kaputtes Abo: 400 mit Erklaerung', res.status === 400 && /not a push subscription/.test(await res.text()));

    res = await holen('/../data/phone.json');
    ok('kein Weg nach data/', res.status === 404);
    res = await holen('/assets/icons/logo.png');
    ok('Bilder aus assets/', res.status === 200 && res.headers.get('content-type') === 'image/png');
    const etag = res.headers.get('etag');
    res = await holen('/assets/icons/logo.png', { headers: { 'If-None-Match': etag } });
    ok('unveraendert: 304', res.status === 304);
    res = await holen('/', { method: 'DELETE' });
    ok('DELETE: 405', res.status === 405);

    /* Zum Schluss die Sperre - danach antwortet der Server dieser Adresse
       zehn Minuten lang nicht mehr. */
    for (let i = 0; i < 20; i++) await holen('/api/hello', mit('falsch' + i));
    res = await holen('/api/hello', mit(t4));
    ok('nach 20 Fehlversuchen: 429, auch mit richtiger Kennung', res.status === 429);
  } finally {
    server.close();
  }

  ok('Geraet entfernen', await phone.removeDevice(p4.device.id));
  ok('...danach gilt seine Kennung nicht mehr', (await phone.authenticate(t4)) === null);
} finally {
  await rm(ordner, { recursive: true, force: true });
}

console.log(`\n${fehler ? `${fehler} FEHLER` : 'Alles bestanden.'}`);
process.exitCode = fehler ? 1 : 0;
