/**
 * Erzeugt build/icon.png - das Programmsymbol fuer Installer und Fenster.
 *
 * WARUM GEZEICHNET STATT MITGELIEFERT:
 *   Die Symbole unter src/renderer/assets/ stammen aus dem Spiel bzw. dem Wiki.
 *   Als Bild IN der Oberflaeche ist das eine Fan-Nutzung wie jede andere; als
 *   Programmsymbol im Startmenue und in der Taskleiste waere es etwas anderes -
 *   dort steht es fuer den Absender der Software. Deshalb ein eigenes Motiv:
 *   das Auge des hundertaeugigen Waechters, in den Farben der Oberflaeche.
 *
 * WARUM OHNE BIBLIOTHEK:
 *   Ein Icon rechtfertigt keine Abhaengigkeit. PNG ist an dieser Stelle
 *   ueberschaubar: ein IHDR, ein zlib-Block mit den Zeilen, ein IEND.
 *
 * Aufruf: node tools/make-icon.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');

const SIZE = 512;
const SS   = 2;              // 2x2-Ueberabtastung, danach verkleinert = weiche Kanten
const N    = SIZE * SS;

const BG    = [0x0d, 0x11, 0x17];
const RING  = [0xf0, 0xb8, 0x49];   // --gold
const IRIS  = [0x4a, 0x9e, 0xff];   // --accent
const PUPIL = [0x0a, 0x0d, 0x12];
const GLINT = [0xf2, 0xf5, 0xf9];   // --text

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

/* Die Linsenform des Auges ist der Schnitt zweier gleich grosser Kreise, deren
   Mittelpunkte senkrecht auseinanderliegen. Ueber R und OFF stellt man die
   Lidoeffnung ein, ohne Kurven von Hand zu setzen: R-OFF ist die halbe Hoehe,
   sqrt(R^2-OFF^2) die halbe Breite. Die Werte unten ergeben rund 1,9:1 - die
   Proportion, die als Auge gelesen wird, mit Rand zum Bildrand. */
const C   = N / 2;
const R   = N * 0.52;
const OFF = N * 0.29;

const LID    = N * 0.026;    // Strichstaerke der Kontur
const LINING = [0x16, 0x1e, 0x28];   // Innenflaeche, minimal heller als der Grund

function shade(x, y) {
  const dLower = dist(x, y, C, C + OFF);   // untere Lidlinie
  const dUpper = dist(x, y, C, C - OFF);   // obere Lidlinie
  if (dLower > R || dUpper > R) return BG;

  /* Abstand zur naechsten Lidkante. Innerhalb der Strichstaerke ist es die
     Kontur - so entsteht ein Linienmotiv statt einer goldenen Flaeche. */
  if (Math.min(R - dLower, R - dUpper) < LID) return RING;

  const d = dist(x, y, C, C);
  const rIris  = N * 0.200;
  const rPupil = N * 0.092;

  if (d < rPupil) {
    // Lichtpunkt oben links - ohne ihn wirkt das Auge flach
    return dist(x, y, C - N * 0.038, C - N * 0.040) < N * 0.030 ? GLINT : PUPIL;
  }
  if (d < rIris) {
    // Zur Pupille hin dunkler, damit die Iris Tiefe bekommt
    return mix(IRIS, PUPIL, 0.45 * (1 - (d - rPupil) / (rIris - rPupil)));
  }
  return LINING;
}

/* Ueberabtasten und mitteln. */
const px = Buffer.alloc(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = shade(x * SS + sx, y * SS + sy);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
    }
    const i = (y * SIZE + x) * 3, n = SS * SS;
    px[i] = acc[0] / n; px[i + 1] = acc[1] / n; px[i + 2] = acc[2] / n;
  }
}

/* ---- PNG ---- */
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

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;    // 8 Bit je Kanal
ihdr[9] = 2;    // Truecolor RGB

// Jede Zeile bekommt ihr Filterbyte 0 vorangestellt
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++) {
  const at = y * (SIZE * 3 + 1);
  raw[at] = 0;
  px.copy(raw, at + 1, y * SIZE * 3, (y + 1) * SIZE * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`${OUT}  (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KB)`);
