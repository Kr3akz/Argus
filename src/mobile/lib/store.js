/* Was die Handy-App sich merkt: die Kopplung, die letzten Antworten und ein
 * paar Vorlieben - alles in localStorage dieses Browsers, nirgends sonst.
 *
 * Jeder Zugriff in try/catch: Safari wirft im privaten Modus und bei
 * vollem Speicher, und eine App, die deshalb nicht startet, waere schlimmer
 * als eine, die sich nichts merkt. */

const PREFIX = 'argus.';

export function get(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function del(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* egal */ }
}

/**
 * Die letzte gute Antwort je Quelle - damit die App beim Oeffnen sofort etwas
 * zeigt und ohne Netz wenigstens den letzten Stand, mit seinem Alter.
 */
export const remember = (name, data) => set(`cache.${name}`, { at: Date.now(), data });
export const recall = name => get(`cache.${name}`, null);
