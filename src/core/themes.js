/**
 * Themes: die Presets, eigene Themes und alles, was sich aus ihnen ableitet.
 *
 * WAS EIN THEME IST:
 *   Sechs Grundfarben - Akzent, Hintergrund, Flaechentoenung, Text, Positiv,
 *   Negativ - und vier Regler fuer Form und Effekte. Alles Weitere steht in
 *   style.css als eigener Ton (Panel-Grau, die Textabstufungen, die hellen
 *   Varianten des Akzents, die Schrift AUF dem Akzent) und wird hier daraus
 *   gerechnet. Ein Theme bleibt damit klein genug, um es als Code
 *   weiterzugeben, und kann trotzdem keine unlesbaren Zwischentoene erzeugen.
 *
 * WOHER DIE REGELN KOMMEN:
 *   Aus dem Standard-Theme, nachgemessen im OKLCH-Farbraum (gleiche Abstaende
 *   dort sehen auch gleich aus - in RGB nicht). Das Panel liegt dort 0.064
 *   ueber dem Grund, die zweite Textstufe hat 9.2:1 Kontrast, die dritte
 *   4.2:1, und so fort. Ein anderes Theme bekommt dieselben Abstaende zu SEINEN
 *   Grundfarben. Wo eine Stufe als Schrift dient, hat sie zusaetzlich eine
 *   Mindesthelligkeit - ein dunkler Akzent darf seine Schrift nicht mit
 *   hinunterziehen.
 *
 *   Die Werte von "Argus" selbst stehen in PINS genau so, wie style.css sie
 *   bisher ausgeschrieben hatte. Die Regeln treffen sie auf wenige Stufen
 *   genau, aber "wenige Stufen" waere eine sichtbare Aenderung fuer alle, die
 *   nie ein Theme anfassen. Die Pins gelten je Familie: ein eigenes Theme, das
 *   nur den Akzent tauscht, behaelt die exakten Grautoene von Argus.
 *
 * NUR DUNKEL:
 *   style.css traegt ueber 200 helle Ueberlagerungen - auf einem hellen Grund
 *   waeren sie unsichtbar. normalizeColor() haelt deshalb jede Grundfarbe in
 *   ihrem Bereich: der Hintergrund dunkel, Text und Flaechentoenung hell. Das
 *   gilt fuer eingefuegte Codes genauso wie fuer den Farbwaehler.
 *
 * Laeuft im Hauptprozess und in den Tests. Die Fenster bekommen fertige
 * Variablen-Listen (resolveTheme) und rechnen nichts selbst.
 */

/* ============================== Farbrechnung ============================== */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** '#rrggbb' oder '#rgb' -> [r, g, b]; alles andere -> null. */
export function parseHex(v) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(v ?? '').trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

export const toHex = rgb => '#' + rgb.map(c => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('');

const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
}

export function rgbToOklch(rgb) {
  const [L, a, b] = rgbToOklab(rgb);
  const C = Math.hypot(a, b);
  let h = Math.atan2(b, a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

/** OKLCH -> [r, g, b] (Gleitkomma). Faellt die Farbe aus sRGB heraus, wird
    die Buntheit bei gleicher Helligkeit und gleichem Ton zurueckgenommen -
    Abschneiden je Kanal wuerde den Ton verschieben. */
export function oklchToRgb(L, C, h) {
  L = clamp(L, 0, 1);
  const hr = h * Math.PI / 180, ca = Math.cos(hr), sa = Math.sin(hr);
  const inGamut = c => {
    const lin = oklabToLinear([L, c * ca, c * sa]);
    return lin.every(v => v >= -1e-4 && v <= 1 + 1e-4) ? lin : null;
  };
  let lin = inGamut(C);
  if (!lin) {
    let lo = 0, hi = C;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(mid)) lo = mid; else hi = mid;
    }
    lin = inGamut(lo) || oklabToLinear([L, 0, 0]);
  }
  return lin.map(v => clamp(fromLin(clamp(v, 0, 1)), 0, 255));
}

const round3 = rgb => rgb.map(c => clamp(Math.round(c), 0, 255));

/** Relative Leuchtdichte nach WCAG. */
export function luminance([r, g, b]) {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/** Kontrastverhaeltnis nach WCAG, 1 bis 21. */
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Abstand zweier Farben in OKLab - unter etwa 0.05 wirken sie gleich. */
export function distance(a, b) {
  const p = rgbToOklab(a), q = rgbToOklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function mixOklab(x, y, t) {
  const p = rgbToOklab(x), q = rgbToOklab(y);
  const lab = p.map((v, i) => v + (q[i] - v) * t);
  return oklabToLinear(lab).map(v => clamp(fromLin(clamp(v, 0, 1)), 0, 255));
}

/** Eine Stufe relativ zu ihrer Grundfarbe: Helligkeit verschieben, Buntheit
    skalieren. Skaliert und nicht addiert, damit aus einem neutralen Grau kein
    zufaelliger Farbton entsteht (dessen Winkel ist bei Buntheit 0 beliebig). */
function step(base, { dL = 0, kC = 1, minL = 0, maxL = 1, maxC = 0.4 }) {
  const o = rgbToOklch(base);
  return oklchToRgb(clamp(o.L + dL, minL, maxL), Math.min(maxC, o.C * kC), o.h);
}

/** Eine Textstufe mit festem Kontrast zum Grund. Den Ton nimmt sie vom Text,
    wenn der selbst getoent ist, sonst vom Grund - wie im Standard-Theme, wo
    das Grau leicht ins Blaue des Hintergrunds geht. */
function textStep(text, bg, target, kC) {
  const t = rgbToOklch(text), b = rgbToOklch(bg);
  const hue = t.C > 0.02 ? t.h : b.h;
  const C = Math.max(t.C, Math.min(0.05, b.C * kC));
  let lo = b.L, hi = t.L;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(oklchToRgb(mid, C, hue), bg) < target) lo = mid; else hi = mid;
  }
  return oklchToRgb(hi, C, hue);
}

/** Dunkle Tinte im Ton der Grundfarbe - fuer Schrift auf hellen Flaechen. */
function darkInk(base, kC) {
  const o = rgbToOklch(base);
  return oklchToRgb(0.1767, Math.min(0.0343, o.C * kC), o.h);
}

/* =============================== Grundfarben =============================== */

/* Texte hier landen unveraendert in der Oberflaeche - deshalb Englisch.
   L und maxC sind die erlaubten Bereiche in OKLCH (siehe NUR DUNKEL). */
export const COLOR_KEYS = [
  { key: 'accent',   label: 'Accent',       hint: 'Buttons, the active tab, links and highlights',
    L: [0.5, 0.9], maxC: 0.37 },
  { key: 'bg',       label: 'Background',   hint: 'The window behind everything. The raised panels follow from it',
    L: [0, 0.26], maxC: 0.06 },
  { key: 'surface',  label: 'Surface tint', hint: 'Cards, lines and hover states are this colour at low opacity',
    L: [0.9, 1], maxC: 0.04 },
  { key: 'text',     label: 'Text',         hint: 'Headings and body text. The dimmer greys follow from it',
    L: [0.82, 1], maxC: 0.06 },
  { key: 'positive', label: 'Positive',     hint: 'Owned, done, profit, a good roll',
    L: [0.55, 0.92], maxC: 0.37 },
  { key: 'negative', label: 'Negative',     hint: 'Missing, vaulted, loss, errors',
    L: [0.55, 0.92], maxC: 0.37 }
];

export const SHAPE_KEYS = [
  { key: 'radius',          label: 'Corners',          min: 0,   max: 1.5, step: 0.05, def: 1,
    hint: 'From square to round' },
  { key: 'surfaceContrast', label: 'Surface contrast', min: 0.6, max: 1.6, step: 0.05, def: 1,
    hint: 'How far cards stand out from the background' },
  { key: 'glow',            label: 'Background glow',  min: 0,   max: 1.5, step: 0.05, def: 1,
    hint: 'The soft light at the top of the window' }
];

/* Die Groesse der Oberflaeche gehoert NICHT zum Theme: sie haengt am
   Bildschirm, nicht am Geschmack, und reist deshalb auch nicht im Code mit. */
export const ZOOM_STEPS = [0.9, 1, 1.1, 1.25];

export const LIMITS = { maxCustom: 50, nameMax: 40, codeMax: 2048 };

/* Das feste Gold (Dukaten, Prime, Kaufen) - fuer die Warnung, wenn ein Akzent
   ihm zu nahe kommt. Steht in style.css als --t-gold. */
const FIXED_GOLD = [240, 184, 73];

/* ================================ Presets ================================ */

const DEFAULT_SHAPE = { radius: 1, surfaceContrast: 1, glow: 1, blur: true };

/* Namen und Werte sind Vorschlaege aus dem Bildschirm heraus abgestimmt -
   Aenderungen bitte mit Aufnahmen aller Reiter pruefen, nicht am Farbfeld. */
export const PRESETS = [
  { id: 'argus', name: 'Argus', note: 'The original: blue on deep night',
    colors: { accent: '#4a9eff', bg: '#0a0d12', surface: '#ffffff', text: '#f2f5f9', positive: '#4ade80', negative: '#ff5c5c' } },
  { id: 'orokin', name: 'Orokin', note: 'Pale gold on warm black',
    colors: { accent: '#e0c58f', bg: '#0f0d0a', surface: '#fff6e8', text: '#f7f2ea', positive: '#6fd89a', negative: '#ff6a5c' } },
  { id: 'void', name: 'Void', note: 'Violet on indigo',
    colors: { accent: '#a98bff', bg: '#0c0a15', surface: '#f7f4ff', text: '#f4f1fb', positive: '#52dca0', negative: '#ff6284' } },
  { id: 'corpus', name: 'Corpus', note: 'Cyan on cold slate',
    colors: { accent: '#35c6db', bg: '#081115', surface: '#f2fdff', text: '#eef7f9', positive: '#5fe08c', negative: '#ff6464' } },
  { id: 'grineer', name: 'Grineer', note: 'Rust on scorched metal',
    colors: { accent: '#e2793d', bg: '#100d0b', surface: '#fff5ec', text: '#f5efe8', positive: '#7fd38a', negative: '#ff5c7c' } },
  { id: 'infested', name: 'Infested', note: 'Acid green on dark moss',
    colors: { accent: '#a4d23f', bg: '#0b0e09', surface: '#f6ffee', text: '#f1f6ea', positive: '#3fd8b0', negative: '#ff6a5c' } },
  { id: 'midnight', name: 'Midnight', note: 'True black, for OLED screens',
    colors: { accent: '#4a9eff', bg: '#000000', surface: '#ffffff', text: '#f2f5f9', positive: '#4ade80', negative: '#ff5c5c' },
    shape: { surfaceContrast: 1.15, glow: 0.5 } },
  { id: 'high-contrast', name: 'High contrast', note: 'Pure black and white, clearer edges',
    colors: { accent: '#66b5ff', bg: '#000000', surface: '#ffffff', text: '#ffffff', positive: '#5ff08f', negative: '#ff6b6b' },
    shape: { surfaceContrast: 1.6, glow: 0 } },
  { id: 'rg-safe', name: 'Red–green safe', note: 'Blue and orange instead of green and red',
    colors: { accent: '#b48cff', bg: '#0a0d12', surface: '#ffffff', text: '#f2f5f9', positive: '#4aa8ff', negative: '#ff9b3d' } }
].map(p => ({ ...p, shape: { ...DEFAULT_SHAPE, ...(p.shape || {}) } }));

const PRESET_BY_ID = new Map(PRESETS.map(p => [p.id, p]));
const ARGUS = PRESET_BY_ID.get('argus');

/* Die Werte, die style.css fuer "Argus" ausgeschrieben hatte - je Familie
   unter dem Schluessel ihrer Grundfarbe(n). Siehe WOHER DIE REGELN KOMMEN. */
const PINS = {
  bg:       { '#0a0d12': { 'bg-hi': [16, 20, 28], deep: [6, 9, 14], chrome: [11, 15, 22], panel: [22, 27, 37], ink: [4, 18, 31] } },
  text:     { '#f2f5f9|#0a0d12': { 'text-2': [168, 179, 194], 'text-3': [107, 118, 134] } },
  brand:    { '#f2f5f9|#4a9eff': { brand: [219, 230, 244] } },
  glow:     { '#0a0d12|#4a9eff|1': { glow: [26, 33, 48] } },
  accent:   { '#4a9eff': { 'accent-hi': [102, 174, 255], 'accent-lo': [45, 127, 216], 'accent-text': [121, 192, 255],
                           'accent-soft': [156, 200, 255], 'accent-pale': [207, 228, 255], 'on-accent': [4, 18, 31] } },
  positive: { '#4ade80': { 'green-lo': [46, 160, 67], 'green-text': [126, 231, 135], 'green-pale': [191, 242, 211] } },
  negative: { '#ff5c5c': { 'red-lo': [199, 68, 68], 'red-text': [255, 143, 143], 'red-pale': [255, 180, 180] } }
};

/* ================================ Ableitung ================================ */

/**
 * Alle Kanaele eines (normalisierten) Themes: { 'bg-hi': [r,g,b], ... }.
 * Ganzzahlig - in style.css stehen sie als "r g b".
 * `pins: false` rechnet auch Argus nur nach den Regeln - fuer den Test, der
 * zeigt, wie nahe die Regeln an die Pins herankommen.
 */
export function deriveChannels(theme, { pins = true } = {}) {
  const c = theme.colors, sh = theme.shape;
  const P = Object.fromEntries(COLOR_KEYS.map(k => [k.key, parseHex(c[k.key])]));
  const out = {
    bg: P.bg, fg: P.surface, text: P.text, accent: P.accent, green: P.positive, red: P.negative
  };
  const pin = (family, key) => (pins && PINS[family][key]) || null;

  /* Grundtoene - Abstaende aus Argus: +0.033, -0.020, +0.010, +0.064. */
  Object.assign(out, pin('bg', c.bg) || {
    'bg-hi':  step(P.bg, { dL: 0.0328, kC: 1.48, maxC: 0.09 }),
    deep:     step(P.bg, { dL: -0.0197, kC: 1.08, maxC: 0.09 }),
    chrome:   step(P.bg, { dL: 0.0095, kC: 1.36, maxC: 0.09 }),
    panel:    step(P.bg, { dL: 0.0636, kC: 1.79, maxC: 0.09 }),
    ink:      darkInk(P.bg, 2.9)
  });

  /* Der Schein oben: das obere Ende des Verlaufs, ein Stueck zum Akzent hin.
     Staerke 0 heisst: kein Schein, nur der Verlauf. */
  const glowPin = pin('glow', `${c.bg}|${c.accent}|${sh.glow}`);
  out.glow = glowPin ? glowPin.glow : mixOklab(out['bg-hi'], P.accent, 0.114 * sh.glow);

  /* Schriftstufen: gleiche Kontrastanteile wie in Argus (9.2:1 und 4.2:1 bei
     17.8:1 fuer den Text), aber nie unter 4.5:1 bzw. 3.2:1. */
  const textPin = pin('text', `${c.text}|${c.bg}`);
  if (textPin) Object.assign(out, textPin);
  else {
    const full = contrast(P.text, P.bg);
    const t2 = Math.max(4.5, 1 + (full - 1) * 0.4866);
    const t3 = Math.min(t2 - 1, Math.max(3.2, 1 + (full - 1) * 0.1924));
    out['text-2'] = textStep(P.text, P.bg, t2, 2.1);
    out['text-3'] = textStep(P.text, P.bg, t3, 2.38);
  }
  const brandPin = pin('brand', `${c.text}|${c.accent}`);
  out.brand = brandPin ? brandPin.brand : mixOklab(P.text, P.accent, 0.15);

  /* Akzent - die Stufen, die als Schrift dienen, haben eine Mindesthelligkeit. */
  Object.assign(out, pin('accent', c.accent) || {
    'accent-hi':   step(P.accent, { dL: 0.045, kC: 0.84, maxL: 0.96 }),
    'accent-lo':   step(P.accent, { dL: -0.10, kC: 0.95, minL: 0.25 }),
    'accent-text': step(P.accent, { dL: 0.093, kC: 0.70, minL: 0.74, maxL: 0.95 }),
    'accent-soft': step(P.accent, { dL: 0.129, kC: 0.55, minL: 0.80, maxL: 0.96 }),
    'accent-pale': step(P.accent, { dL: 0.219, kC: 0.26, minL: 0.88, maxL: 0.98 }),
    'on-accent':   onAccent(P.accent)
  });

  Object.assign(out, pin('positive', c.positive) || {
    'green-lo':   step(P.positive, { dL: -0.178, kC: 0.91, minL: 0.45 }),
    'green-text': step(P.positive, { dL: 0.041, kC: 0.90, minL: 0.78, maxL: 0.95 }),
    'green-pale': step(P.positive, { dL: 0.117, kC: 0.37, minL: 0.88, maxL: 0.97 })
  });
  Object.assign(out, pin('negative', c.negative) || {
    'red-lo':   step(P.negative, { dL: -0.12, kC: 0.84, minL: 0.42 }),
    'red-text': step(P.negative, { dL: 0.079, kC: 0.68, minL: 0.74, maxL: 0.95 }),
    'red-pale': step(P.negative, { dL: 0.15, kC: 0.44, minL: 0.82, maxL: 0.97 })
  });

  for (const k of Object.keys(out)) out[k] = round3(out[k]);
  return out;
}

/** Schrift auf dem Akzent: dunkle Tinte in seinem Ton, oder fast Weiss -
    was auf ihm mehr Kontrast hat. */
function onAccent(accent) {
  const dark = darkInk(accent, 0.21);
  const o = rgbToOklch(accent);
  const light = oklchToRgb(0.985, Math.min(0.01, o.C * 0.05), o.h);
  return contrast(dark, accent) >= contrast(light, accent) ? dark : light;
}

/* Radius einer Pille bei Ecken 100 % knapp darunter: etwa die halbe Hoehe
   der Chips, Knoepfe und Reiter (22 bis 36 px). Kleinere Pillen sind damit
   schon vor 100 % ganz rund, groessere werden es beim letzten Schritt. */
const PILL_RADIUS = 16;

/* Reihenfolge wie in :root, damit ein Blick in die Entwicklerwerkzeuge
   dieselbe Liste zeigt wie style.css. */
const CHANNEL_ORDER = [
  'bg', 'bg-hi', 'deep', 'glow', 'chrome', 'panel', 'fg',
  'text', 'text-2', 'text-3', 'brand',
  'accent', 'accent-hi', 'accent-lo', 'accent-text', 'accent-soft', 'accent-pale', 'on-accent', 'ink',
  'green', 'green-lo', 'green-text', 'green-pale', 'red', 'red-lo', 'red-text', 'red-pale'
];

/**
 * Ein Theme als fertige CSS-Variablen fuer <html>, dazu die beiden Toene, die
 * der Hauptprozess als Fensterhintergrund braucht (sichtbar, bevor die Seite
 * steht).
 */
export function resolveTheme(theme) {
  const t = normalizeTheme(theme);
  const ch = deriveChannels(t);
  const vars = {};
  for (const k of CHANNEL_ORDER) vars['--t-' + k] = ch[k].join(' ');
  vars['--r-k'] = String(t.shape.radius);
  /* Pillen folgen den Ecken nur unter 100 % - darueber sind sie schon so
     rund, wie es geht. Siehe --r-pill in style.css. */
  vars['--r-pill'] = t.shape.radius >= 1 ? '999px' : `${Math.round(PILL_RADIUS * t.shape.radius * 100) / 100}px`;
  vars['--sf-k'] = String(t.shape.surfaceContrast);
  /* Ohne Unschaerfe scheint durch eine zu 88 % deckende Sidebar das durch,
     was darunter rollt - dann muss sie fast ganz decken. */
  vars['--blur-k'] = t.shape.blur ? '1' : '0';
  vars['--chrome-a'] = t.shape.blur ? '.88' : '.97';
  /* Der Fensterhintergrund liegt zwischen den Enden des Verlaufs - als
     schlichter RGB-Mittelwert, denn genau so war er fuer Argus gewaehlt
     (#0d1117). In OKLab gemischt kaeme #0d1017 heraus. */
  return {
    vars,
    windowBg: toHex(ch.bg.map((v, i) => (v + ch['bg-hi'][i]) / 2)),
    overlayBg: toHex(ch.chrome)
  };
}

/* ============================== Normalisieren ============================== */

/** Eine Grundfarbe in ihren Bereich holen. Was schon drin liegt, bleibt
    unangetastet - die Hin-und-Rueck-Rechnung koennte sonst eine Stufe
    verschieben. Ungueltiges wird zur Ersatzfarbe. */
export function normalizeColor(value, spec, fallback) {
  const rgb = parseHex(value);
  if (!rgb) return fallback;
  const o = rgbToOklch(rgb);
  const [lo, hi] = spec.L;
  const inside = x => x.L >= lo - 1e-9 && x.L <= hi + 1e-9 && x.C <= spec.maxC + 1e-9;
  if (inside(o)) return toHex(rgb);
  /* Nach dem Runden auf ganze Kanaele kann die Farbe um ein Haar ueber der
     Grenze liegen (#242424 hat L 0.2602 bei einer Grenze von 0.26). Dann das
     Ziel um genau diesen Ueberhang nachziehen - sonst wuerde dieselbe Farbe
     beim naechsten Laden erneut geklemmt. */
  let L = clamp(o.L, lo, hi), C = Math.min(o.C, spec.maxC), out = null;
  for (let i = 0; i < 6; i++) {
    out = oklchToRgb(L, C, o.h).map(Math.round);
    const got = rgbToOklch(out);
    if (inside(got)) break;
    if (got.L > hi) L -= got.L - hi + 0.0005;
    if (got.L < lo) L += lo - got.L + 0.0005;
    if (got.C > spec.maxC) C -= got.C - spec.maxC + 0.0005;
  }
  return toHex(out);
}

function normalizeNumber(value, spec, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const snapped = Math.round(clamp(n, spec.min, spec.max) / spec.step) * spec.step;
  return Math.round(snapped * 100) / 100;
}

/** { colors, shape } in gueltiger Form. `base` liefert, was fehlt. */
export function normalizeTheme(raw, base = ARGUS) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const colors = {}, shape = {};
  for (const k of COLOR_KEYS) colors[k.key] = normalizeColor(src.colors?.[k.key], k, base.colors[k.key]);
  for (const s of SHAPE_KEYS) shape[s.key] = normalizeNumber(src.shape?.[s.key], s, base.shape?.[s.key] ?? s.def);
  shape.blur = typeof src.shape?.blur === 'boolean' ? src.shape.blur : (base.shape?.blur ?? true);
  return { colors, shape };
}

/* Steuerzeichen, dazu die beiden Unicode-Zeilentrenner (U+2028, U+2029).
   Ueber den Codepunkt geprueft und nicht per Regex-Escape: die Trenner als
   Escape in einem Regex-Literal sind schon einmal beim Schreiben der Datei zu
   echten Zeilenumbruechen geworden - und dann parst die Datei nicht mehr. */
const isControl = ch => {
  const c = ch.codePointAt(0);
  return c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029;
};

/** Namen: sichtbarer Text, gekuerzt. Steuerzeichen raus - der Name steht
    spaeter in der Oberflaeche und in einem Code, den jemand anderes einfuegt. */
function cleanName(v, fallback = 'Custom theme') {
  const s = [...String(v ?? '')].map(ch => isControl(ch) ? ' ' : ch).join('').replace(/\s+/g, ' ').trim();
  return (s || fallback).slice(0, LIMITS.nameMax).trim() || fallback;
}

function uniqueName(name, taken) {
  if (!taken.has(name.toLowerCase())) return name;
  const stem = name.replace(/\s\(\d+\)$/, '').slice(0, LIMITS.nameMax - 5);
  for (let i = 2; i < 1000; i++) {
    const n = `${stem} (${i})`;
    if (!taken.has(n.toLowerCase())) return n;
  }
  return stem;
}

const allNames = app => new Set([...PRESETS.map(p => p.name), ...app.custom.map(c => c.name)].map(n => n.toLowerCase()));

/**
 * Der gespeicherte Stand (config.json -> appearance) in gueltiger Form:
 * { theme, custom: [{ id, name, from, colors, shape }], zoom }.
 * Alles Unbrauchbare faellt auf den Standard zurueck, statt den Start zu
 * verhindern - ein kaputtes Theme darf die App nicht unbenutzbar machen.
 */
export function normalizeAppearance(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const custom = [];
  const ids = new Set();
  const taken = new Set(PRESETS.map(p => p.name.toLowerCase()));
  for (const c of Array.isArray(src.custom) ? src.custom : []) {
    if (custom.length >= LIMITS.maxCustom) break;
    if (!c || typeof c !== 'object' || !/^c\d{1,6}$/.test(String(c.id)) || ids.has(c.id)) continue;
    const from = PRESET_BY_ID.has(c.from) ? c.from : null;
    const name = uniqueName(cleanName(c.name), taken);
    taken.add(name.toLowerCase());
    ids.add(c.id);
    custom.push({ id: c.id, name, from, ...normalizeTheme(c, PRESET_BY_ID.get(from) || ARGUS) });
  }
  const theme = PRESET_BY_ID.has(src.theme) || ids.has(src.theme) ? src.theme : 'argus';
  const zoom = ZOOM_STEPS.includes(Number(src.zoom)) ? Number(src.zoom) : 1;
  return { theme, custom, zoom };
}

function findTheme(app, id) {
  const p = PRESET_BY_ID.get(id);
  if (p) return { ...p, isPreset: true };
  const c = app.custom.find(x => x.id === id);
  return c ? { ...c, isPreset: false } : null;
}

/** Das aktive Theme, fertig fuer die Fenster. */
export function resolveActive(app) {
  const a = normalizeAppearance(app);
  const t = findTheme(a, a.theme) || { ...ARGUS, isPreset: true };
  return { id: t.id, name: t.name, ...resolveTheme(t), zoom: a.zoom };
}

/* ================================ Warnungen ================================ */

/** Was an einem Theme schwer lesbar oder missverstaendlich ist - Text fuer
    die Zeile unter dem Editor. Leer heisst: nichts zu sagen. */
export function checkTheme(theme) {
  const t = normalizeTheme(theme);
  const ch = deriveChannels(t);
  const out = [];
  const ratio = (a, b) => contrast(ch[a], ch[b]);
  const fmt = r => r.toFixed(1) + ':1';
  const r1 = ratio('text', 'panel');
  if (r1 < 7) out.push({ key: 'text', text: `Text is hard to read on the panels (${fmt(r1)}).` });
  const r2 = ratio('accent', 'bg');
  if (r2 < 3) out.push({ key: 'accent', text: `The accent is hard to see on this background (${fmt(r2)}).` });
  const r3 = ratio('green', 'bg');
  if (r3 < 3) out.push({ key: 'positive', text: `Positive is hard to see on this background (${fmt(r3)}).` });
  const r4 = ratio('red', 'bg');
  if (r4 < 3) out.push({ key: 'negative', text: `Negative is hard to see on this background (${fmt(r4)}).` });
  if (distance(ch.green, ch.red) < 0.1) {
    out.push({ key: 'negative', text: 'Positive and negative look almost the same.' });
  }
  if (distance(ch.accent, FIXED_GOLD) < 0.06) {
    out.push({ key: 'accent', text: 'The accent is close to the gold that marks ducats, Prime and buying.' });
  }
  return out;
}

/* ============================ Fuer die Oberflaeche ============================ */

/** Alles, was der Unterreiter "Appearance" zeigt, in einem Stueck. */
export function describeAppearance(app) {
  const a = normalizeAppearance(app);
  const entry = t => ({
    id: t.id, name: t.name, note: t.note || null, from: t.from || null,
    fromName: t.from ? PRESET_BY_ID.get(t.from)?.name || null : null,
    colors: { ...t.colors }, shape: { ...t.shape },
    vars: resolveTheme(t).vars
  });
  const active = findTheme(a, a.theme) || { ...ARGUS, isPreset: true };
  return {
    active: active.id,
    activeTheme: { ...entry(active), isPreset: !!active.isPreset, warnings: checkTheme(active) },
    presets: PRESETS.map(entry),
    custom: a.custom.map(entry),
    zoom: a.zoom,
    zoomSteps: ZOOM_STEPS,
    colorKeys: COLOR_KEYS,
    shapeKeys: SHAPE_KEYS,
    limits: LIMITS
  };
}

/* ================================ Aenderungen ================================ */

function nextId(app) {
  let n = 0;
  for (const c of app.custom) n = Math.max(n, Number(c.id.slice(1)) || 0);
  return 'c' + (n + 1);
}

/** Legt ein eigenes Theme als Kopie von `srcTheme` an und waehlt es. */
function addCustom(app, srcTheme, name, from) {
  if (app.custom.length >= LIMITS.maxCustom) {
    return { ok: false, error: `You can keep up to ${LIMITS.maxCustom} themes of your own. Delete one first.` };
  }
  const id = nextId(app);
  const base = PRESET_BY_ID.get(from) || ARGUS;
  const entry = { id, name: uniqueName(cleanName(name), allNames(app)), from: PRESET_BY_ID.has(from) ? from : null,
                  ...normalizeTheme(srcTheme, base) };
  return { ok: true, appearance: { ...app, custom: [...app.custom, entry], theme: id }, created: id };
}

/**
 * Eine Aenderung aus der Oberflaeche anwenden. Veraendert `app` nicht, sondern
 * gibt den neuen Stand zurueck: { ok, appearance, created?, error? }.
 *
 *   { select: id }                         Theme waehlen
 *   { edit: { colors?, shape? } }          das AKTIVE Theme aendern - ist es ein
 *                                          Preset, entsteht erst eine Kopie
 *   { create: { from?, name? } }           neues eigenes Theme als Kopie
 *   { duplicate: id }                      Kopie eines Themes
 *   { rename: { id, name } }
 *   { reset: id }                          eigenes Theme auf sein Preset zurueck
 *   { remove: id }
 *   { import: code }                       Teilen-Code einfuegen
 *   { zoom: n }
 */
export function applyPatch(app, patch) {
  const a = normalizeAppearance(app);
  const p = patch && typeof patch === 'object' ? patch : {};
  const fail = error => ({ ok: false, error, appearance: a });

  if ('select' in p) {
    if (!findTheme(a, p.select)) return fail('That theme no longer exists.');
    return { ok: true, appearance: { ...a, theme: p.select } };
  }

  if ('edit' in p) {
    const e = p.edit && typeof p.edit === 'object' ? p.edit : {};
    let cur = findTheme(a, a.theme) || { ...ARGUS, isPreset: true };
    let next = a, created = null;
    /* Presets bleiben, wie sie sind: die erste Aenderung legt eine Kopie an
       und arbeitet dort weiter. */
    if (cur.isPreset) {
      const r = addCustom(a, cur, `${cur.name} custom`, cur.id);
      if (!r.ok) return fail(r.error);
      next = r.appearance; created = r.created;
      cur = findTheme(next, created);
    }
    const merged = {
      colors: { ...cur.colors, ...(e.colors && typeof e.colors === 'object' ? e.colors : {}) },
      shape: { ...cur.shape, ...(e.shape && typeof e.shape === 'object' ? e.shape : {}) }
    };
    const clean = normalizeTheme(merged, cur);
    const custom = next.custom.map(c => c.id === cur.id ? { ...c, ...clean } : c);
    return { ok: true, appearance: { ...next, custom }, created };
  }

  if ('create' in p) {
    const c = p.create && typeof p.create === 'object' ? p.create : {};
    const src = findTheme(a, c.from || a.theme) || { ...ARGUS, isPreset: true };
    const from = src.isPreset ? src.id : src.from;
    return addCustom(a, src, c.name || `${src.name} custom`, from);
  }

  if ('duplicate' in p) {
    const src = findTheme(a, p.duplicate);
    if (!src) return fail('That theme no longer exists.');
    return addCustom(a, src, `${src.name} copy`, src.isPreset ? src.id : src.from);
  }

  if ('rename' in p) {
    const r = p.rename && typeof p.rename === 'object' ? p.rename : {};
    const own = a.custom.find(c => c.id === r.id);
    if (!own) return fail('Only your own themes can be renamed.');
    const others = new Set([...PRESETS.map(x => x.name), ...a.custom.filter(c => c.id !== own.id).map(c => c.name)]
      .map(n => n.toLowerCase()));
    const name = uniqueName(cleanName(r.name, own.name), others);
    return { ok: true, appearance: { ...a, custom: a.custom.map(c => c.id === own.id ? { ...c, name } : c) } };
  }

  if ('reset' in p) {
    const own = a.custom.find(c => c.id === p.reset);
    if (!own) return fail('Only your own themes can be reset.');
    const base = PRESET_BY_ID.get(own.from);
    if (!base) return fail('This theme was not made from a preset, so there is nothing to reset it to.');
    const clean = normalizeTheme(base, base);
    return { ok: true, appearance: { ...a, custom: a.custom.map(c => c.id === own.id ? { ...c, ...clean } : c) } };
  }

  if ('remove' in p) {
    const own = a.custom.find(c => c.id === p.remove);
    if (!own) return fail('Presets cannot be deleted.');
    const custom = a.custom.filter(c => c.id !== own.id);
    /* Wer das aktive Theme loescht, landet bei dem Preset, aus dem es kam -
       das naechstliegende, was es noch gibt. */
    const theme = a.theme === own.id ? (own.from || 'argus') : a.theme;
    return { ok: true, appearance: { ...a, custom, theme } };
  }

  if ('import' in p) {
    const d = decodeShare(p.import);
    if (!d.ok) return fail(d.error);
    return addCustom(a, d.theme, d.theme.name, d.theme.from);
  }

  if ('zoom' in p) {
    const z = Number(p.zoom);
    if (!ZOOM_STEPS.includes(z)) return fail('That size is not available.');
    return { ok: true, appearance: { ...a, zoom: z } };
  }

  return fail('Nothing to change.');
}

/* ================================ Teilen ================================ */

/* Ein Code ist Text, den man in einen Chat kopiert: kurz, ohne Leerzeichen und
   ohne Zeichen, die ein Messenger umdeutet. Daher base64url und kurze
   Schluessel. Die Versionsnummer im Vorspann erlaubt spaeter ein anderes
   Format, ohne dass alte Codes kaputtgehen. */
const SHARE_PREFIX = 'argus-theme:1:';
const SHAPE_SHORT = { radius: 'r', surfaceContrast: 'c', glow: 'g' };

export function encodeShare(theme) {
  const t = normalizeTheme(theme);
  const payload = {
    n: cleanName(theme?.name, 'Shared theme'),
    ...(PRESET_BY_ID.has(theme?.from) ? { f: theme.from } : {}),
    c: Object.fromEntries(COLOR_KEYS.map(k => [k.key, t.colors[k.key].slice(1)])),
    s: { ...Object.fromEntries(SHAPE_KEYS.map(s => [SHAPE_SHORT[s.key], t.shape[s.key]])), b: t.shape.blur ? 1 : 0 }
  };
  return SHARE_PREFIX + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Liest einen Code. Alles darin wird geprueft, als kaeme es aus dem Netz -
    genau das ist es: ein Text, den jemand anderes geschrieben hat. */
export function decodeShare(code) {
  const s = String(code ?? '').replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Paste a theme code first.' };
  if (s.length > LIMITS.codeMax) return { ok: false, error: 'That code is too long to be a theme.' };
  if (!s.toLowerCase().startsWith(SHARE_PREFIX)) {
    return { ok: false, error: 'That is not an Argus theme code. It should start with "argus-theme:".' };
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(s.slice(SHARE_PREFIX.length), 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'The code is damaged. Copy it again in full.' };
  }
  if (!data || typeof data !== 'object' || !data.c || typeof data.c !== 'object') {
    return { ok: false, error: 'The code is damaged. Copy it again in full.' };
  }
  const colors = {};
  for (const k of COLOR_KEYS) {
    if (typeof data.c[k.key] !== 'string' || !parseHex('#' + data.c[k.key])) {
      return { ok: false, error: 'The code is missing a colour. Copy it again in full.' };
    }
    colors[k.key] = '#' + data.c[k.key];
  }
  const shape = {};
  const s2 = data.s && typeof data.s === 'object' ? data.s : {};
  for (const sk of SHAPE_KEYS) if (SHAPE_SHORT[sk.key] in s2) shape[sk.key] = s2[SHAPE_SHORT[sk.key]];
  if ('b' in s2) shape.blur = !!s2.b;
  const from = PRESET_BY_ID.has(data.f) ? data.f : null;
  const t = normalizeTheme({ colors, shape }, PRESET_BY_ID.get(from) || ARGUS);
  return { ok: true, theme: { name: cleanName(data.n, 'Shared theme'), from, ...t } };
}

/** Code fuer ein vorhandenes Theme (Preset oder eigenes). */
export function shareCodeFor(app, id) {
  const a = normalizeAppearance(app);
  const t = findTheme(a, id);
  if (!t) return { ok: false, error: 'That theme no longer exists.' };
  return { ok: true, code: encodeShare({ ...t, from: t.isPreset ? t.id : t.from }) };
}
