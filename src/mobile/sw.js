/* Service Worker der Handy-App - nur unter https (GitHub Pages).
 *
 * Drei Aufgaben:
 *   1. Push: eine Meldung vom PC anzeigen, auch wenn die App zu ist. Auf dem
 *      iPhone MUSS jede Meldung sichtbar werden - eine stille Meldung zaehlt
 *      Safari als Regelverstoss und kuendigt nach drei davon das Abo.
 *   2. Ein Tipp auf die Meldung oeffnet die App auf der passenden Seite.
 *   3. Die App startet auch ohne Netz: was einmal geladen wurde, kommt aus
 *      dem Zwischenspeicher (und wird im Hintergrund aufgefrischt).
 *
 * Die letzten Meldungen und eine neue Adresse des PCs haelt er unter
 * argus-state fest - die App liest beides beim Oeffnen (app.js, swZustand). */

/* tools/build-mobile.mjs setzt hier die Fassung ein. Eine neue Fassung
   macht diese Datei zu einer anderen, der Browser installiert den Worker neu,
   und der alte Zwischenspeicher wird geraeumt. */
const VERSION = 'dev';
const SHELL = `argus-shell-${VERSION}`;
const STATE = 'argus-state';
const INBOX_MAX = 25;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    /* Die Liste der Dateien schreibt der Bau (precache.json). Fehlt sie -
       beim Entwickeln -, faellt nur das Vorladen weg. */
    try {
      const res = await fetch('precache.json', { cache: 'no-store' });
      /* 'reload': am Browser-Zwischenspeicher vorbei. GitHub Pages erlaubt
         zehn Minuten Aufheben - kurz nach einer neuen Fassung kaemen sonst
         alte und neue Dateien gemischt in den Speicher. */
      if (res.ok) {
        const liste = await res.json();
        await (await caches.open(SHELL)).addAll(liste.map(u => new Request(u, { cache: 'reload' })));
      }
    } catch { /* ohne Vorladen weiter */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('argus-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

/* Nur die eigenen Dateien. Abfragen an warframestat.us und warframe.market
   gehen am Worker vorbei - deren Antworten verwaltet die App selbst. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const box = await caches.open(SHELL);
    const hit = await box.match(req, { ignoreSearch: true });
    const netz = fetch(req)
      .then(res => { if (res.ok) box.put(req, res.clone()); return res; })
      .catch(() => null);
    if (hit) {
      event.waitUntil(netz);
      return hit;
    }
    return (await netz) || new Response('Argus is offline and this page was never loaded before.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});

async function merken(p) {
  const box = await caches.open(STATE);
  const alt = await box.match('state/inbox').then(r => (r ? r.json() : [])).catch(() => []);
  const inbox = [{ title: p.title || 'Argus', body: p.body || '', type: p.type || null, ts: p.ts || Date.now() },
                 ...(Array.isArray(alt) ? alt : [])].slice(0, INBOX_MAX);
  await box.put('state/inbox', new Response(JSON.stringify(inbox), { headers: { 'Content-Type': 'application/json' } }));
  if (p.pc) {
    await box.put('state/pc', new Response(JSON.stringify({ url: p.pc, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
  }
}

self.addEventListener('push', event => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch { p = { title: 'Argus', body: event.data?.text() || '' }; }
  event.waitUntil((async () => {
    await self.registration.showNotification(p.title || 'Argus', {
      body: p.body || '',
      tag: p.tag || undefined,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      timestamp: p.ts || Date.now(),
      data: { nav: p.nav || null }
    });
    await merken(p).catch(() => {});
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      c.postMessage({ type: 'push', payload: p });
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const nav = event.notification.data?.nav || null;
  event.waitUntil((async () => {
    const offen = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .find(c => new URL(c.url).origin === self.location.origin);
    if (offen) {
      await offen.focus();
      if (nav) offen.postMessage({ type: 'nav', nav });
      return;
    }
    await self.clients.openWindow(nav ? `./#${nav}` : './');
  })());
});
