/* Die Verbindung zum PC - und die Push-Meldungen, die darueber laufen.
 *
 * WAS IM KOPPLUNGSCODE STEHT (siehe core/phone.js, createPairing):
 *   n  Name des PCs            u  Adresse im WLAN (http://192.168.x.x:47120)
 *   k  oeffentlicher Schluessel des PCs fuer Push (VAPID)
 *   t  Kennung dieses Handys   i  Nummer des Geraets am PC
 *
 * WARUM DER UMWEG UEBER WEITERLEITUNGEN:
 *   Diese App laeuft unter https. Den PC unter http im WLAN darf sie nicht
 *   abfragen - das ist "mixed content", und Safari macht dafuer keine
 *   Ausnahme. Erlaubt ist, dorthin zu NAVIGIEREN. Also:
 *     - das Push-Abo geht als Adresse zum PC (/pair/push, ein Fingertipp)
 *     - "Mein PC" oeffnet die App so, wie der PC sie selbst ausliefert, mit
 *       der Kennung hinter # (die nie ueber das Netz geht)
 *
 * Kein DOM beim Laden - siehe ui.js. */

import * as store from './store.js';

const KEY = 'pc';

function fromB64url(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function toB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const b64urlText = text => toB64url(new TextEncoder().encode(text));

/**
 * Kopplungscode -> Kopplung, oder null.
 *
 * Nur, was wie ein PC im Heimnetz aussieht, wird angenommen: http auf eine
 * IP-Adresse oder einen .local-Namen. Ein Code, der auf irgendeinen Server im
 * Netz zeigt, waere eine Einladung, die Kennung dorthin zu schicken.
 */
export function parseCode(code) {
  try {
    const raw = String(code || '').trim().replace(/^.*#pair=/, '');
    const p = JSON.parse(new TextDecoder().decode(fromB64url(raw)));
    if (p?.v !== 1) return null;
    const u = new URL(p.u);
    const lokal = /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || /\.local$/i.test(u.hostname) || u.hostname === 'localhost';
    if (u.protocol !== 'http:' || !lokal || u.pathname !== '/' || u.search || u.hash) return null;
    if (fromB64url(p.k).length !== 65 || !/^[A-Za-z0-9_-]{20,100}$/.test(p.t) || !/^[A-Za-z0-9_-]{4,40}$/.test(p.i)) return null;
    return { name: String(p.n || 'PC').slice(0, 40), url: u.origin, key: p.k, token: p.t, id: p.i };
  } catch {
    return null;
  }
}

/**
 * Die Gegenrichtung: ein Link in die App auf GitHub Pages, MIT Kopplungscode.
 *
 * Gebaut von der Seite, die der PC zuhause ausliefert. Die kann selbst keine
 * Meldungen empfangen (http), kennt aber alles fuer den Code: die Kennung
 * (hinter #t=), Name und Schluessel des PCs (/api/hello) und als eigene
 * Adresse die des PCs. So fuehrt "Set up notifications" ohne neuen QR-Code
 * in die App, die es kann.
 */
export function pairingLink(appUrl, { name, url, key, token, id } = {}) {
  if (!/^https:\/\//.test(String(appUrl || '')) || !name || !url || !key || !token || !id) return null;
  return `${appUrl}#pair=${b64urlText(JSON.stringify({ v: 1, n: name, u: url, k: key, t: token, i: id }))}`;
}

export const current = () => store.get(KEY, null);

export function save(pc) {
  store.set(KEY, { ...pc, pairedAt: Date.now() });
  return current();
}

export function forget() {
  store.del(KEY);
  store.del('push');
}

/** Die Adresse hat sich geaendert (neue IP vom Router) - kam mit einer Meldung. */
export function updateUrl(url) {
  const pc = current();
  if (!pc || !url || url === pc.url) return pc;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:') return pc;
    store.set(KEY, { ...pc, url: u.origin });
  } catch { /* alte Adresse behalten */ }
  return current();
}

/* ------------------------------ Umgebung ------------------------------ */

export function platform() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return { ios, android: /Android/.test(ua), standalone };
}

/**
 * Was mit Push auf diesem Geraet geht.
 *
 *   needsInstall  iPhone/iPad im Browser: Push gibt es nur fuer Apps auf dem
 *                 Home-Bildschirm (iOS 16.4 und neuer)
 *   unsupported   der Browser kann es gar nicht (alt, oder http zuhause)
 */
export function pushSupport() {
  const p = platform();
  const api = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return {
    ...p,
    secure: window.isSecureContext,
    supported: api && window.isSecureContext,
    needsInstall: p.ios && !p.standalone,
    permission: 'Notification' in window ? Notification.permission : 'unsupported'
  };
}

/**
 * Push einschalten: Erlaubnis, dann ein Abo beim Push-Dienst des Handys -
 * abgeschlossen mit dem Schluessel DIESES PCs, damit nur er Meldungen
 * schicken kann (siehe core/webpush.js).
 *
 * Muss aus einem Fingertipp heraus aufgerufen werden: iOS fragt sonst gar
 * nicht erst nach der Erlaubnis.
 */
export async function subscribe(pc) {
  /* Zuerst fragen, noch bevor irgendetwas abgewartet wird: Safari zeigt die
     Frage nach Mitteilungen nur unmittelbar aus einem Antippen heraus. Schon
     ein await davor kann sie kosten - dann kommt still "nicht erlaubt"
     zurueck, ohne dass je gefragt wurde. */
  const frage = Notification.permission === 'granted'
    ? Promise.resolve('granted')
    : Promise.resolve(Notification.requestPermission());
  const reg = await navigator.serviceWorker.ready;
  const erlaubnis = await frage;
  if (erlaubnis !== 'granted') {
    throw new Error(erlaubnis === 'denied'
      ? 'Notifications are blocked for Argus. Allow them in the phone settings, then try again.'
      : 'Notifications were not allowed.');
  }
  const key = fromB64url(pc.key);
  let sub = await reg.pushManager.getSubscription();
  /* Ein Abo mit dem Schluessel eines ANDEREN PCs (neu gekoppelt) nimmt keine
     Meldungen dieses PCs an - dann ein neues. */
  if (sub) {
    const alt = sub.options?.applicationServerKey;
    const gleich = alt && toB64url(new Uint8Array(alt)) === pc.key;
    if (!gleich) { await sub.unsubscribe().catch(() => {}); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  store.set('push', { endpoint: sub.endpoint, at: Date.now(), pc: pc.id });
  return sub;
}

export async function existingSubscription() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

/** Die Adresse, unter der der PC das Abo entgegennimmt (phone-server.js). */
export function registerUrl(pc, sub) {
  return `${pc.url}/pair/push?t=${encodeURIComponent(pc.token)}&s=${b64urlText(JSON.stringify(sub.toJSON()))}`;
}

/** Die App, wie der PC sie zuhause ausliefert - mit allen eigenen Daten. */
export const pcViewUrl = pc => `${pc.url}/#t=${encodeURIComponent(pc.token)}`;
