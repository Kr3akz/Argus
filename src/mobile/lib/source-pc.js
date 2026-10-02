/* Zuhause: die App fragt Argus auf dem PC (core/phone-server.js).
 *
 * So laeuft sie, wenn der PC sie selbst ausliefert - unter
 * http://192.168.x.x:47120, geoeffnet mit "Mein PC" aus der installierten App
 * oder direkt im Browser. Die Kennung kommt beim Oeffnen hinter # mit (siehe
 * pairing.pcViewUrl) und wird hier fuer diesen Ursprung gemerkt.
 *
 * Jede Antwort ist dieselbe, die das Fenster am PC bekommt, nur
 * zurechtgeschnitten (core/phone-views.js). */

import * as store from './store.js';

const TOKEN = 'lan.token';

/**
 * Die Seite aus der Adresse, ohne die Kennung: "#foundry/goals&t=..." ->
 * "foundry/goals", "#t=..." -> "".
 */
export function routeHash(hash) {
  return String(hash || '').replace(/^#/, '').split('&').filter(teil => teil && !/^t=/.test(teil)).join('&');
}

/** Die Kennung aus #t=... uebernehmen und aus der Adresszeile nehmen - die
    Seite dahinter (#foundry&t=...) bleibt stehen. */
export function adoptToken() {
  const m = /[#&]t=([A-Za-z0-9_-]{20,100})/.exec(location.hash);
  if (m) {
    store.set(TOKEN, m[1]);
    const seite = routeHash(location.hash);
    history.replaceState(null, '', location.pathname + location.search + (seite ? `#${seite}` : ''));
  }
  return store.get(TOKEN, null);
}

export const hasToken = () => !!store.get(TOKEN, null);
export const token = () => store.get(TOKEN, null);

export class Unpaired extends Error {}

async function api(name, params = null, { method = 'GET', body = null } = {}) {
  const token = store.get(TOKEN, null);
  if (!token) throw new Unpaired('This phone is not paired with this PC.');
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')) : '';
  let res;
  try {
    res = await fetch(`/api/${name}${qs}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : null,
      cache: 'no-store',
      signal: AbortSignal.timeout(name === 'inventory' || name === 'world' ? 45000 : 20000)
    });
  } catch {
    throw new Error('Argus on your PC is not answering. Is the PC on and Argus running?');
  }
  const json = await res.json().catch(() => null);
  if (res.status === 401) {
    store.del(TOKEN);
    throw new Unpaired('This phone was removed on the PC. Pair it again under Settings → Phone.');
  }
  if (res.status === 429) throw new Error('Too many attempts. Wait ten minutes, then try again.');
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Argus answered with HTTP ${res.status}`);
  return json.data;
}

export const hello = () => api('hello');
export const world = () => api('world');
export const dashboard = () => api('dashboard');
export const foundry = () => api('foundry');
export const inventory = () => api('inventory');
export const drops = opts => api('drops', { q: opts.q, mode: opts.mode, kinds: (opts.kinds || []).join(',') });
export const marketSearch = q => api('marketSearch', { q });
export const price = (slug, rank = null) => api('price', { slug, rank });
export const setTypes = types => api('types', null, { method: 'POST', body: { types } });
