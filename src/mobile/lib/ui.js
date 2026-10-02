/* Kleine Bausteine fuer alle Ansichten: Entschaerfen, Zahlen, Zeiten,
 * Symbole und die tickenden Uhren.
 *
 * Kein DOM beim Laden - so laesst sich das Modul auch in src/cli/mobile-test.js
 * unter Node pruefen. */

/** Alles, was aus fremden Daten kommt, vor dem Einsetzen entschaerfen. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const nf = n => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-GB') : '—');

/** Bild nur aus https oder vom eigenen Ursprung - nie javascript: o. Ae. */
export function img(src, cls = 'thumb', alt = '') {
  const s = String(src || '');
  if (!s || !(/^https:\/\//.test(s) || /^(assets|icons)\//.test(s))) return `<span class="glyph ${cls === 'thumb sm' ? 'sm' : ''}"></span>`;
  return `<img class="${cls}" src="${esc(s)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

/**
 * Restzeit wie am PC: "2d 4h", "1h 12m", unter einer Stunde "12m 30s".
 * Die Sekunden nur unter einer Stunde - dort entscheidet die Minute.
 */
export function left(expiry, now = Date.now()) {
  const t = typeof expiry === 'number' ? expiry : Date.parse(expiry);
  if (!Number.isFinite(t)) return '';
  const ms = t - now;
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/** "vor 5 Minuten" - fuer den Stand einer Antwort. */
export function ago(ts, now = Date.now()) {
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(t)) return 'unknown';
  const min = Math.round((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Uhrzeit in der Zeitzone des Handys. */
export const clockTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const dayTime = ts => new Date(ts).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Ein Element, das sich jede Sekunde selbst nachzaehlt (siehe tick()). */
export const countdown = (expiry, cls = '') =>
  `<span class="cd ${cls}" data-expiry="${esc(expiry)}">${esc(left(expiry))}</span>`;

/** Fortschritt einer Phase - die Breite setzt tick(). */
export const phaseBar = (from, to, cls = '') =>
  `<div class="bar ${cls}"><i data-from="${esc(from)}" data-to="${esc(to)}"></i></div>`;

/**
 * Alle Uhren auf der Seite nachstellen. Eine einzige Schleife fuer die ganze
 * App statt einer je Element - sonst laeuft nach drei Reiterwechseln ein
 * Dutzend Zeitgeber, die auf verschwundene Elemente zeigen.
 */
export function tick(root, now = Date.now()) {
  for (const el of root.querySelectorAll('[data-expiry]')) {
    const t = left(el.dataset.expiry, now);
    if (el.textContent !== t) el.textContent = t;
    const rest = Date.parse(el.dataset.expiry) - now;
    el.closest('.clock')?.classList.toggle('soon', rest > 0 && rest < 15 * 60000);
  }
  for (const el of root.querySelectorAll('[data-from][data-to]')) {
    const a = Date.parse(el.dataset.from), b = Date.parse(el.dataset.to);
    const p = b > a ? Math.max(0, Math.min(1, (now - a) / (b - a))) : 0;
    el.style.width = `${(p * 100).toFixed(1)}%`;
  }
}

/* ------------------------------- Symbole ------------------------------- */

const svg = (inner, size = 22) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const svgFilled = (inner, size = 22) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" stroke="none" aria-hidden="true">${inner}</svg>`;

/* Ein Bild als Maske: die Farbe kommt vom Text (aktiver Reiter blau, sonst
   grau), genau wie in der Seitenleiste am PC (.nav-icon-mask). Der Faktor
   gleicht aus, wie voll die Zeichnung ihr Bild fuellt - dieselben Werte wie
   in src/renderer/style.css. */
const maske = (pfad, size, faktor = 1) =>
  `<span class="mask-icon" style="width:${size}px;height:${size}px;-webkit-mask-image:url('${pfad}');mask-image:url('${pfad}');transform:scale(${faktor})" aria-hidden="true"></span>`;

export const Icon = {
  /* Die fuenf Reiter tragen die Symbole der Seitenleiste am PC (src/renderer/
     icons.js): Live-Tracker, Mastery (dort liegen Foundry und Ziele),
     Inventar, Drop-Tabellen und Einstellungen. */
  live:     s => svgFilled('<path fill-rule="evenodd" clip-rule="evenodd" d="M13.06 3.02a1.22 1.22 0 0 0-2.12 0L1.29 20.06A1.22 1.22 0 0 0 2.35 21.9h19.3a1.22 1.22 0 0 0 1.06-1.84L13.06 3.02ZM12 8.3a1.2 1.2 0 0 0-1.2 1.2v4.9a1.2 1.2 0 0 0 2.4 0V9.5A1.2 1.2 0 0 0 12 8.3Zm0 8.05a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7Z"/>', s),
  foundry:  s => maske(ASSET.nav.mastery, s, 1.18),
  inventory:s => maske(ASSET.nav.inventory, s, 1.12),
  drops:    s => maske(ASSET.nav.drops, s, 1.1),
  more:     s => svg('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', s),
  refresh:  s => svg('<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>', s),
  search:   s => svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', s),
  chevron:  s => svg('<path d="m9 18 6-6-6-6"/>', s),
  bell:     s => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>', s),
  pc:       s => svg('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>', s),
  phone:    s => svg('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>', s),
  share:    s => svg('<path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', s),
  check:    s => svg('<path d="M20 6 9 17l-5-5"/>', s)
};

/* Die Bilder, die das Programm ohnehin mitbringt (src/renderer/assets). Am PC
   und auf GitHub Pages liegen sie unter demselben Pfad (siehe
   phone-server.js und tools/build-mobile.mjs). */
export const ASSET = {
  /* Die Reiter unten - dieselben Bilder wie in der Seitenleiste am PC. */
  nav: {
    mastery: 'assets/icons/mastered.png',
    inventory: 'assets/icons/inventory.png',
    drops: 'assets/icons/droptables.png'
  },
  fissure: 'assets/icons/worldstate/fissure.png',
  steelpath: 'assets/icons/worldstate/steelpath.png',
  storm: 'assets/icons/worldstate/voidtear.png',
  sortie: 'assets/icons/worldstate/sortie.png',
  archon: 'assets/icons/worldstate/archon.png',
  nightwave: 'assets/icons/worldstate/nightwave.png',
  invasion: 'assets/icons/worldstate/invasion.png',
  alert: 'assets/icons/worldstate/alert.png',
  events: 'assets/icons/worldstate/events.png',
  syndicates: 'assets/icons/worldstate/syndicates.png',
  ducats: 'assets/icons/currency/ducats.png',
  platinum: 'assets/icons/currency/platinum.png',
  credits: 'assets/icons/currency/credits.png',
  endo: 'assets/icons/currency/endo.png',
  traces: 'assets/icons/currency/traces.png',
  relic: tier => `assets/icons/worldstate/relic-${String(tier || 'lith').toLowerCase()}.png`,
  world: {
    earth: 'assets/icons/worldstate/sun.png',
    cetus: 'assets/icons/worldstate/cetus.png',
    vallis: 'assets/icons/worldstate/solaris.png',
    cambion: 'assets/icons/worldstate/entrati.png',
    zariman: 'assets/icons/worldstate/zariman.png',
    duviri: 'assets/icons/worldstate/events.png'
  }
};
