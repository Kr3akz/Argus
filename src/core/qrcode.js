/**
 * QR-Codes, nur fuer das Koppeln eines Handys.
 *
 * WOFUER: In den Einstellungen steht ein Code, den die Kamera des Handys
 * liest - darin die Adresse der Handy-App und alles, was sie braucht, um
 * diesen PC zu finden (siehe phone.js). Abtippen waere die Alternative, und
 * bei rund dreihundert Zeichen ist das keine.
 *
 * WARUM SELBST GEBAUT: Ein QR-Code ist ein fester, gut beschriebener
 * Algorithmus (ISO/IEC 18004) - Bitstrom, Reed-Solomon, Muster, Maske. Das
 * sind ein paar hundert Zeilen ohne Netz und ohne Datei. Ein Paket dafuer
 * waere die erste Abhaengigkeit, die nur einem einzigen Bild dient.
 * Aufbau und Tabellen folgen Project Nayukis "QR Code generator" (MIT),
 * der Referenz, an der sich die meisten Umsetzungen messen.
 *
 * Nur der Byte-Modus: die Inhalte hier sind URLs, und fuer die gibt es
 * keinen kleineren Modus, der alle Zeichen abdeckt.
 *
 * Geprueft wird mit src/cli/qr-test.js - unter anderem gegen das
 * Reed-Solomon-Beispiel, mit dem fast jede Anleitung zum Thema arbeitet.
 */

/* Fehlerkorrektur: wie viel vom Code fehlen darf. Die Bits sind die, die im
   Formatfeld stehen - deshalb die ungewohnte Reihenfolge. */
const ECC = {
  L: { ordinal: 0, bits: 1 },   // ~7 %
  M: { ordinal: 1, bits: 0 },   // ~15 %
  Q: { ordinal: 2, bits: 3 },   // ~25 %
  H: { ordinal: 3, bits: 2 }    // ~30 %
};

/* Je Version (1-40) und Stufe: Korrekturbytes je Block und Zahl der Bloecke.
   Index 0 ist Platzhalter. */
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];

const getBit = (x, i) => ((x >>> i) & 1) !== 0;

/** Module, die Daten tragen koennen - alles ausser den festen Mustern. */
function rawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(ver, ecl) {
  return Math.floor(rawDataModules(ver) / 8)
    - ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
}

/* --------------------------- Reed-Solomon --------------------------- */

/** Multiplikation im Koerper GF(2^8) mit dem Polynom 0x11D. */
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Die Korrekturbytes zu einem Datenblock. Exportiert fuer den Test. */
export function rsRemainder(data, degree) {
  const divisor = rsDivisor(degree);
  const result = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
  }
  return result;
}

/* ------------------------------ Bitstrom ------------------------------ */

/**
 * Daten in Bloecke teilen, je Block die Korrektur anhaengen und alles
 * verschraenkt hintereinander legen - so verteilt sich ein Kratzer auf viele
 * Bloecke statt einen ganz zu zerstoeren.
 */
function withErrorCorrection(data, ver, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
  const blockEcc = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - raw % numBlocks;
  const shortLen = Math.floor(raw / numBlocks);

  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - blockEcc + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, blockEcc);
    /* Kurze Bloecke bekommen eine Luecke, damit beim Verschraenken alle
       gleich lang sind - die Luecke wird unten uebersprungen. */
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - blockEcc || j >= numShort) result.push(block[i]);
    });
  }
  return result;
}

function encodeBytes(bytes, ecl, minVersion = 1) {
  let ver = minVersion;
  for (; ver <= 40; ver++) {
    const countBits = ver < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(ver, ecl) * 8) break;
  }
  if (ver > 40) throw new Error('Too much data for a QR code');

  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);                                   // Byte-Modus
  put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);

  const capacity = dataCodewords(ver, ecl) * 8;
  put(0, Math.min(4, capacity - bits.length));      // Endmarke
  put(0, (8 - bits.length % 8) % 8);                // auf volle Bytes
  for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) put(pad, 8);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  return { ver, codewords: withErrorCorrection(data, ver, ecl) };
}

/* ------------------------------- Raster ------------------------------- */

function alignmentPositions(ver, size) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
];

function buildMatrix(ver, ecl, codewords, mask) {
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = (x, y, dark) => { modules[y][x] = dark; isFn[y][x] = true; };

  /* Taktlinien, dann die drei Suchmuster samt hellem Rand darueber. */
  for (let i = 0; i < size; i++) { fn(6, i, i % 2 === 0); fn(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        fn(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const align = alignmentPositions(ver, size);
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) fn(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  const drawFormat = m => {
    const data = (ecl.bits << 3) | m;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) fn(8, i, getBit(bits, i));
    fn(8, 7, getBit(bits, 6));
    fn(8, 8, getBit(bits, 7));
    fn(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) fn(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) fn(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) fn(8, size - 15 + i, getBit(bits, i));
    fn(8, size - 8, true);
  };
  drawFormat(0);   // reserviert die Plaetze; der echte Wert folgt nach der Maske

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + i % 3, b = Math.floor(i / 3);
      fn(a, b, bit);
      fn(b, a, bit);
    }
  }

  /* Die Daten im Zickzack, je zwei Spalten, von rechts unten nach oben. */
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && i < codewords.length * 8) {
          modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }

  const invert = MASKS[mask];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (!isFn[y][x] && invert(x, y)) modules[y][x] = !modules[y][x];
  }
  drawFormat(mask);
  return modules;
}

/**
 * Strafpunkte nach der Norm - je niedriger, desto leichter liest ein Scanner
 * den Code. Gueltig ist er mit jeder der acht Masken; die Wahl hier macht ihn
 * nur robuster gegen eine schlechte Kamera.
 */
function penalty(m) {
  const size = m.length;
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(m[y]);
  for (let x = 0; x < size; x++) lines.push(m.map(row => row[x]));

  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) { run++; continue; }
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
    /* 1:1:3:1:1 mit vier hellen Modulen davor oder danach - sieht aus wie
       ein Suchmuster und verwirrt Scanner. */
    for (let i = 0; i + 11 <= size; i++) {
      const s = line.slice(i, i + 11).map(b => (b ? 1 : 0)).join('');
      if (s === '10111010000' || s === '00001011101') score += 40;
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  }
  let dark = 0;
  for (const row of m) for (const b of row) if (b) dark++;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * Text -> QR-Code.
 *
 * @param text      der Inhalt (UTF-8)
 * @param opts.ecc  'L' | 'M' | 'Q' | 'H' - Standard M: auf einem Bildschirm
 *                  gibt es keine Kratzer, aber Spiegelungen und Moiré
 * @returns { version, size, modules } - modules[y][x], true = dunkel
 */
export function encodeQR(text, { ecc = 'M' } = {}) {
  const ecl = ECC[ecc] || ECC.M;
  const bytes = [...Buffer.from(String(text), 'utf8')];
  const { ver, codewords } = encodeBytes(bytes, ecl);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const modules = buildMatrix(ver, ecl, codewords, mask);
    const score = penalty(modules);
    if (!best || score < best.score) best = { modules, score, mask };
  }
  return { version: ver, size: best.modules.length, mask: best.mask, modules: best.modules };
}

/**
 * Als SVG, ein einziger Pfad - scharf in jeder Groesse und ohne Canvas.
 * Der Rand (quiet zone) gehoert zur Norm: ohne die vier hellen Module
 * ringsum finden manche Kameras den Code auf dunklem Grund nicht.
 */
export function qrToSvg(qr, { border = 4, dark = '#000', light = '#fff' } = {}) {
  const dim = qr.size + border * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) d += `M${x + border} ${y + border}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
