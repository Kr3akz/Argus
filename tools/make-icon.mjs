/**
 * Erzeugt build/icon.png und renderer-Icons aus den Quelldateien unter assets/.
 *
 * Neben den Logos werden die Eintraege aus MASKEN verarbeitet: grosse weisse
 * Silhouetten, die als CSS-Maske in der Seitenleiste landen.
 *
 * Aufruf: node tools/make-icon.mjs
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_BLAU = path.join(ROOT, 'assets', 'Logo-blau.png');
const SRC_WHITE = path.join(ROOT, 'assets', 'Logo.png');
/* Weitere Maskenvorlagen aus assets/: weisse Silhouette auf transparent,
   beliebige Groesse - hier wird auf Icon-Mass heruntergerechnet. */
const MASKEN = [
  { quelle: 'trading.png', ziel: 'trading.png', groesse: 256 },
  /* Die Quelle heisst calender.png (so abgelegt), das Ziel schreibt sich
     richtig - der Dateiname in src/renderer/ ist der, den icons.js und das
     Stylesheet ansprechen, und dort soll kein Tippfehler festwachsen. */
  { quelle: 'calender.png', ziel: 'calendar.png', groesse: 256 },
  /* Narmer-Zeichen fuer die Archon-Jagd. Spielsymbol von Digital Extremes,
     wie die uebrigen Zeichen in der Oberflaeche auch - siehe die
     Lizenznotiz am Ende des README. */
  { quelle: 'narmer.png', ziel: 'narmer.png', groesse: 256 }
];
const OUT_BUILD = path.join(ROOT, 'build', 'icon.png');
const OUT_BUILD_ICO = path.join(ROOT, 'build', 'icon.ico');
const OUT_ICONS_DIR = path.join(ROOT, 'src', 'renderer', 'assets', 'icons');
const OUT_RENDERER_ASSETS = path.join(ROOT, 'src', 'renderer', 'assets');
const OUT_APP_ICON = path.join(OUT_RENDERER_ASSETS, 'app-icon.png');

function decodePNG(file) {
  const buf = readFileSync(file);
  let pos = 8;
  let ihdr, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  /* Farbtyp 6 ist RGBA (4 Bytes je Pixel), Farbtyp 4 Graustufe+Alpha (2).
     Die zweite Sorte kommt vor: das Narmer-Zeichen aus dem Wiki ist eine
     weisse Silhouette und deshalb graustufig gespeichert. Frueher stand
     hier fest bpp = 4 - eine solche Datei wurde dann zeilenweise falsch
     ausgelesen und kam als Streifenmuster heraus. */
  const farbtyp = ihdr[9];
  if (farbtyp !== 6 && farbtyp !== 4) {
    throw new Error(`${file}: PNG-Farbtyp ${farbtyp} wird nicht unterstuetzt `
                  + '(erwartet 6 = RGBA oder 4 = Graustufe+Alpha)');
  }
  const bpp = farbtyp === 6 ? 4 : 2;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  let srcPos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[srcPos++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const byte = raw[srcPos++];
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev ? prev[x] : 0;
      const upleft = prev && x >= bpp ? prev[x - bpp] : 0;
      let val = 0;
      if (filter === 0) val = byte;
      else if (filter === 1) val = (byte + left) & 0xff;
      else if (filter === 2) val = (byte + up) & 0xff;
      else if (filter === 3) val = (byte + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upleft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upleft);
        const pr = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upleft);
        val = (byte + pr) & 0xff;
      }
      row[x] = val;
    }
  }
  /* Nach aussen IMMER RGBA: alles dahinter (Beschneiden, Skalieren,
     Zusammensetzen) rechnet mit vier Kanaelen. Bei Graustufe+Alpha wird
     der Grauwert auf R, G und B gelegt. */
  if (bpp === 4) return { w, h, data: out };
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < out.length; i += 2, j += 4) {
    rgba[j] = rgba[j + 1] = rgba[j + 2] = out[i];
    rgba[j + 3] = out[i + 1];
  }
  return { w, h, data: rgba };
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA

  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const at = y * (w * 4 + 1);
    raw[at] = 0;
    rgba.copy(raw, at + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function encodeICO(pngImages) {
  const count = pngImages.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO format
  header.writeUInt16LE(count, 4); // Image count

  let offset = 6 + count * 16;
  const dirEntries = [];
  const imageBuffers = [];

  for (const img of pngImages) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // Width (0 = 256)
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // Height (0 = 256)
    entry.writeUInt8(0, 2); // Palette colors
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Size of image data
    entry.writeUInt32LE(offset, 12); // Offset to image data

    dirEntries.push(entry);
    imageBuffers.push(img.buffer);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

function resizeRGBA(src, targetSize, paddingRatio = 0) {
  const dst = Buffer.alloc(targetSize * targetSize * 4);
  const innerSize = targetSize * (1 - paddingRatio * 2);
  const offset = targetSize * paddingRatio;
  const scale = src.w / innerSize;

  for (let dy = 0; dy < targetSize; dy++) {
    for (let dx = 0; dx < targetSize; dx++) {
      const srcXStart = (dx - offset) * scale;
      const srcXEnd = (dx + 1 - offset) * scale;
      const srcYStart = (dy - offset) * scale;
      const srcYEnd = (dy + 1 - offset) * scale;

      if (srcXEnd <= 0 || srcXStart >= src.w || srcYEnd <= 0 || srcYStart >= src.h) {
        continue;
      }

      const x0 = Math.max(0, Math.floor(srcXStart));
      const x1 = Math.min(src.w - 1, Math.floor(srcXEnd));
      const y0 = Math.max(0, Math.floor(srcYStart));
      const y1 = Math.min(src.h - 1, Math.floor(srcYEnd));

      let totalWeight = 0;
      let accR = 0, accG = 0, accB = 0, accA = 0;

      for (let sy = y0; sy <= y1; sy++) {
        const yWeight = Math.min(sy + 1, srcYEnd) - Math.max(sy, srcYStart);
        if (yWeight <= 0) continue;
        for (let sx = x0; sx <= x1; sx++) {
          const xWeight = Math.min(sx + 1, srcXEnd) - Math.max(sx, srcXStart);
          if (xWeight <= 0) continue;
          const w = xWeight * yWeight;
          const sidx = (sy * src.w + sx) * 4;
          const a = src.data[sidx + 3] / 255;
          accR += src.data[sidx] * a * w;
          accG += src.data[sidx + 1] * a * w;
          accB += src.data[sidx + 2] * a * w;
          accA += src.data[sidx + 3] * w;
          totalWeight += w;
        }
      }

      if (totalWeight > 0 && accA > 0) {
        const finalA = accA / totalWeight;
        const alphaFrac = finalA / 255;
        const didx = (dy * targetSize + dx) * 4;
        dst[didx] = Math.round((accR / totalWeight) / alphaFrac);
        dst[didx + 1] = Math.round((accG / totalWeight) / alphaFrac);
        dst[didx + 2] = Math.round((accB / totalWeight) / alphaFrac);
        dst[didx + 3] = Math.round(finalA);
      }
    }
  }
  return dst;
}

/* ---------------------------------------------------------------
   Das Programmsymbol

   Vorher lag hier ein fertiger Kreis, der nur noch verkleinert wurde. In
   der Taskleiste steht er damit zwangslaeufig kleiner da als die Symbole
   daneben: ein Kreis deckt nur pi/4, also 78 %, des gleichen Quadrats ab,
   und an den Ecken weicht er zurueck. Riot, Discord, Steam zeichnen alle
   ein abgerundetes Quadrat, das bis an die Kante laeuft.
   Die Platte entsteht deshalb hier, das Auge wird darauf gesetzt.
   --------------------------------------------------------------- */

/* Wie gross ein Symbol in der Taskleiste wirkt, haengt nicht an seiner Form,
   sondern daran, wie viel davon sich vom Grund abhebt. Die urspruengliche
   Platte #1e2530 war so dunkel wie die Leiste selbst - Kontrast 1.07:1 - und
   damit unsichtbar; sichtbar blieb nur die duenne Glyphe. Gemessen gegen
   einen Grund von #1f1f1f:

     Platte    Glyphe   sichtbare Flaeche
     #1e2530   #4a9eff   11.5 %     wie urspruenglich
     #1e2530   #4a9eff   20.0 %     Glyphe auf 92 % vergroessert
     keine     #4a9eff   23.5 %     nur die Glyphe
     #1e2530   weiss     17.0 %
     #33415a   weiss     95.8 %
     #2f7fe0   weiss     95.9 %
     #2f7fe0   #0d1420   82.3 %
     #1e2530   #4a9eff   34.7 %     mit blauem Rand, 5.5 %
     #1e2530   weiss     35.0 %     mit blauem Rand, 5.5 %
     #1e2530   #4a9eff   46.6 %     mit blauem Rand, 10 %

   Bei den Randfassungen untertreibt die Zahl: sie zaehlt nur Farbe, aber ein
   geschlossener Rand zeichnet die Silhouette, und das Auge ergaenzt das
   Quadrat auch dort, wo die Fuellung dunkel bleibt.

   Zum Vergleich: Symbole wie das von Riot liegen bei rund 96 %. Eine dunkle
   Platte bleibt also klein, egal wie hell die Glyphe darauf ist - das
   entscheidet die Platte.

   PLATTE_FARBE auf null laesst die Platte ganz weg. Das Symbol haengt dann
   allerdings am Farbschema des Systems: eine weisse Glyphe ohne Grund ist auf
   einer hellen Taskleiste unsichtbar. Eine Platte traegt ihren Kontrast
   dagegen selbst mit. */
const PLATTE_FARBE   = [0x08, 0x09, 0x0c];   // null laesst die Platte ganz weg
const PLATTE_FARBE_2 = [0x36, 0x3b, 0x43];   // null = einfarbig, sonst Verlauf dorthin
const RAND_FARBE     = null;                 // null laesst den Rand weg
const RAND_BREITE    = 0.055;                // Anteil der Kantenlaenge
const AUGE_FARBE     = [0xff, 0xff, 0xff];
const PLATTE_RADIUS  = 0.22;                 // Anteil der Kantenlaenge
const AUGE_BREITE    = 0.76;                 // Anteil der Kantenlaenge

/** Deckung eines Punktes im abgerundeten Quadrat, 4x4 ueberabgetastet. */
function plattenDeckung(px, py, size, radius) {
  const N = 4;
  let treffer = 0;
  for (let sy = 0; sy < N; sy++) {
    for (let sx = 0; sx < N; sx++) {
      const x = px + (sx + 0.5) / N;
      const y = py + (sy + 0.5) / N;
      // Abstand zum naechsten Eckmittelpunkt; ausserhalb der Ecken immer drin.
      const dx = Math.max(radius - x, x - (size - radius), 0);
      const dy = Math.max(radius - y, y - (size - radius), 0);
      if (dx * dx + dy * dy <= radius * radius) treffer++;
    }
  }
  return treffer / (N * N);
}

/** Schneidet den durchsichtigen Rand weg - sonst zaehlt er als Bildinhalt. */
function aufInhaltBeschneiden(src) {
  let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.data[(y * src.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    src.data.copy(data, y * w * 4, ((y + y0) * src.w + x0) * 4, ((y + y0) * src.w + x0 + w) * 4);
  }
  return { w, h, data };
}

/**
 * Legt ein Bild mittig in ein quadratisches, durchsichtiges Feld.
 *
 * WARUM DAS NOETIG IST: resizeRGBA() rechnet mit EINER Skala fuer beide
 * Achsen, abgeleitet aus der Breite. Bei einer nicht quadratischen Vorlage
 * greift es senkrecht daneben - das Bild sitzt dann verschoben im Rahmen,
 * mit totem Raum an einer Kante. Die Handelsschilder kamen mit 2914x2739
 * herein und waeren genau so gelandet.
 */
function aufQuadratBringen(src) {
  const size = Math.max(src.w, src.h);
  if (src.w === src.h) return src;
  const data = Buffer.alloc(size * size * 4);          // transparent
  const ox = Math.floor((size - src.w) / 2);
  const oy = Math.floor((size - src.h) / 2);
  for (let y = 0; y < src.h; y++) {
    src.data.copy(data, ((y + oy) * size + ox) * 4, y * src.w * 4, (y + 1) * src.w * 4);
  }
  return { w: size, h: size, data };
}

/** Setzt src mittig auf dst, auf zielBreite skaliert, Seitenverhaeltnis erhalten. */
function daraufSetzen(dst, dstSize, src, zielBreite, farbe) {
  const zielHoehe = Math.round(zielBreite * src.h / src.w);
  const ox = (dstSize - zielBreite) / 2;
  const oy = (dstSize - zielHoehe) / 2;
  const sx = src.w / zielBreite, sy = src.h / zielHoehe;

  for (let dy = 0; dy < zielHoehe; dy++) {
    for (let dx = 0; dx < zielBreite; dx++) {
      // Kastenfilter ueber den abgedeckten Quellbereich
      const x0 = dx * sx, x1 = (dx + 1) * sx, y0 = dy * sy, y1 = (dy + 1) * sy;
      // Nur die Deckung der Quelle zaehlt, die Farbe kommt von aussen
      let accA = 0, gewicht = 0;
      for (let py = Math.floor(y0); py < Math.min(src.h, Math.ceil(y1)); py++) {
        const wy = Math.min(py + 1, y1) - Math.max(py, y0);
        if (wy <= 0) continue;
        for (let px = Math.floor(x0); px < Math.min(src.w, Math.ceil(x1)); px++) {
          const wx = Math.min(px + 1, x1) - Math.max(px, x0);
          if (wx <= 0) continue;
          const g = wx * wy;
          accA += src.data[(py * src.w + px) * 4 + 3] * g;
          gewicht += g;
        }
      }
      if (!gewicht || !accA) continue;
      const a = (accA / gewicht) / 255;

      const tx = Math.round(ox + dx), ty = Math.round(oy + dy);
      if (tx < 0 || ty < 0 || tx >= dstSize || ty >= dstSize) continue;
      const di = (ty * dstSize + tx) * 4;
      // Ueber den Untergrund legen
      const ua = dst[di + 3] / 255;
      const na = a + ua * (1 - a);
      dst[di]     = Math.round((farbe[0] * a + dst[di]     * ua * (1 - a)) / na);
      dst[di + 1] = Math.round((farbe[1] * a + dst[di + 1] * ua * (1 - a)) / na);
      dst[di + 2] = Math.round((farbe[2] * a + dst[di + 2] * ua * (1 - a)) / na);
      dst[di + 3] = Math.round(na * 255);
    }
  }
}

function programmSymbol(size, auge) {
  const dst = Buffer.alloc(size * size * 4);
  if (PLATTE_FARBE) {
    const radius = size * PLATTE_RADIUS;
    const rb = RAND_FARBE ? size * RAND_BREITE : 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const aussen = plattenDeckung(x, y, size, radius);
        if (aussen <= 0) continue;
        /* Dieselbe Form, um die Randbreite eingerueckt. Was innerhalb der
           aeusseren, aber ausserhalb der inneren liegt, ist der Rand - und
           der Uebergang bleibt weich, weil beide Deckungen Zwischenwerte
           liefern. */
        const innen = rb > 0
          ? plattenDeckung(x - rb, y - rb, size - 2 * rb, Math.max(1, radius - rb))
          : 1;
        /* Verlauf ueber die Diagonale: oben links der erste Ton, unten
           rechts der zweite. Ohne zweiten Ton bleibt die Platte einfarbig. */
        const t = PLATTE_FARBE_2 ? (x + y) / (2 * (size - 1)) : 0;
        const i = (y * size + x) * 4;
        for (let k = 0; k < 3; k++) {
          const flaeche = PLATTE_FARBE_2
            ? PLATTE_FARBE[k] + (PLATTE_FARBE_2[k] - PLATTE_FARBE[k]) * t
            : PLATTE_FARBE[k];
          const randTon = RAND_FARBE ? RAND_FARBE[k] : flaeche;
          dst[i + k] = Math.round(randTon * (1 - innen) + flaeche * innen);
        }
        dst[i + 3] = Math.round(aussen * 255);
      }
    }
  }
  daraufSetzen(dst, size, aufInhaltBeschneiden(auge), Math.round(size * AUGE_BREITE), AUGE_FARBE);
  return dst;
}

if (!existsSync(SRC_BLAU) || !existsSync(SRC_WHITE)) {
  console.error('assets/Logo.png and assets/Logo-blau.png not found!');
  process.exit(1);
}

const blauSrc = decodePNG(SRC_BLAU);
const whiteSrc = decodePNG(SRC_WHITE);

mkdirSync(path.dirname(OUT_BUILD), { recursive: true });
mkdirSync(OUT_ICONS_DIR, { recursive: true });
mkdirSync(OUT_RENDERER_ASSETS, { recursive: true });

// 1. build/icon.png (App Icon) & build/icon.ico (Windows Icon mit allen Aufloesungen)
const appPng = encodePNG(512, 512, programmSymbol(512, whiteSrc));
writeFileSync(OUT_BUILD, appPng);
writeFileSync(OUT_APP_ICON, appPng);
console.log(`${OUT_BUILD} (512x512, ${(appPng.length / 1024).toFixed(1)} KB)`);
console.log(`${OUT_APP_ICON} (512x512, ${(appPng.length / 1024).toFixed(1)} KB)`);

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = icoSizes.map(size => ({
  size,
  buffer: encodePNG(size, size, programmSymbol(size, whiteSrc))
}));
const icoBuf = encodeICO(icoImages);
writeFileSync(OUT_BUILD_ICO, icoBuf);
console.log(`${OUT_BUILD_ICO} (Multi-Resolution [${icoSizes.join(', ')} px], ${(icoBuf.length / 1024).toFixed(1)} KB)`);

// 2. Renderer masks & images
const logoMaskRGBA = resizeRGBA(whiteSrc, 512, 0);
const maskPng = encodePNG(512, 512, logoMaskRGBA);
writeFileSync(path.join(OUT_ICONS_DIR, 'logo.png'), maskPng);
writeFileSync(path.join(OUT_RENDERER_ASSETS, 'logo.png'), maskPng);

const logoBlauRGBA = resizeRGBA(blauSrc, 512, 0);
const blauPng = encodePNG(512, 512, logoBlauRGBA);
writeFileSync(path.join(OUT_ICONS_DIR, 'logo-blau.png'), blauPng);
writeFileSync(path.join(OUT_RENDERER_ASSETS, 'logo-blau.png'), blauPng);

/* 3. Einzelne Maskenbilder.
      Sie kommen als grosse Zeichnungen herein (die Handelsschilder mit
      3000 px), gebraucht werden sie mit 15 bis 22 px in der Seitenleiste.
      Erst auf den Inhalt beschneiden, dann auf Icon-Mass verkleinern: der
      Zuschnitt holt den durchsichtigen Rand weg, der die Zeichnung sonst
      kleiner erscheinen laesst als die uebrigen Symbole daneben. */
for (const m of MASKEN) {
  const quelle = path.join(ROOT, 'assets', m.quelle);
  if (!existsSync(quelle)) {
    console.log(`${m.quelle} nicht gefunden - uebersprungen`);
    continue;
  }
  const zugeschnitten = aufQuadratBringen(aufInhaltBeschneiden(decodePNG(quelle)));
  const png = encodePNG(m.groesse, m.groesse, resizeRGBA(zugeschnitten, m.groesse, 0));
  const ziel = path.join(OUT_ICONS_DIR, m.ziel);
  writeFileSync(ziel, png);
  console.log(`${ziel} (${m.groesse}x${m.groesse}, ${(png.length / 1024).toFixed(1)} KB)`);
}

console.log('Icons and masks updated successfully.');
