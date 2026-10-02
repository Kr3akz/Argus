#!/usr/bin/env node
/**
 * Prueft den QR-Code-Erzeuger (core/qrcode.js), ohne Kamera und ohne Paket.
 *
 *   node src/cli/qr-test.js
 *
 * Ein QR-Code, der "fast" stimmt, ist keiner: die Kamera liest ihn nicht und
 * sagt nicht warum. Geprueft wird deshalb an den Stellen, die die Norm fest
 * vorgibt - Reed-Solomon, Formatfeld, Versionsfeld und die festen Muster.
 *
 * Beim Entstehen wurde der Erzeuger ausserdem gegen einen unabhaengigen
 * Leser gehalten (jsQR 1.4.0): jede Version von 1 bis 40 in allen vier
 * Stufen, dazu Umlaute und das Euro-Zeichen - alles gelesen. Einzige
 * Auffaelligkeit war Version 23, und dort lag der Fehler bei jsQR: seine
 * Tabelle fuehrt die vierte Ausrichtungsmarke bei 74 statt bei 78, wie es
 * die Norm (ISO/IEC 18004, Anhang E) vorschreibt. Mit der Korrektur in
 * jsQR liest er auch Version 23.
 */
import { encodeQR, qrToSvg, rsRemainder } from '../core/qrcode.js';

let fehler = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fehler++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};

/* ------------------------------------------------------------------------ */
console.log('\n=== Reed-Solomon ===');
{
  /* Das Standardbeispiel ("HELLO WORLD", Version 1-M): 16 Datenbytes, zehn
     Korrekturbytes. So steht es in der Anleitung von thonky.com, an der sich
     fast jede Umsetzung entlanghangelt. */
  const daten = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  const erwartet = [196, 35, 39, 119, 235, 215, 231, 226, 93, 23];
  const ist = rsRemainder(daten, 10);
  ok('Korrekturbytes wie im Beispiel', ist.join(',') === erwartet.join(','), ist.join(','));
}

/* Das Formatfeld liegt doppelt im Code; gelesen wird die Kopie oben links. */
function formatBits(qr) {
  const m = qr.modules;
  const bits = [];
  for (let i = 0; i <= 5; i++) bits.push(m[i][8]);
  bits.push(m[7][8], m[8][8], m[8][7]);
  for (let i = 9; i < 15; i++) bits.push(m[8][14 - i]);
  /* bits[i] ist Bit i (das niederwertigste zuerst) - als Zeichenkette mit
     dem hoechsten vorn, so wie die Tabellen es schreiben. */
  return bits.map(b => (b ? '1' : '0')).reverse().join('');
}

function formatBitsCopy2(qr) {
  const m = qr.modules, size = qr.size;
  const bits = [];
  for (let i = 0; i < 8; i++) bits.push(m[8][size - 1 - i]);
  for (let i = 8; i < 15; i++) bits.push(m[size - 15 + i][8]);
  return bits.map(b => (b ? '1' : '0')).reverse().join('');
}

/* Die Formatzeichenketten fuer Stufe L und M, Masken 0-7 - die Tabelle aus
   der Norm (dieselbe steht bei thonky.com unter "Format Information"). */
const FORMAT = {
  L: ['111011111000100', '111001011110011', '111110110101010', '111100010011101',
      '110011000101111', '110001100011000', '110110001000001', '110100101110110'],
  M: ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
      '100010111111001', '100000011001110', '100111110010111', '100101010100000']
};

/* ------------------------------------------------------------------------ */
console.log('\n=== Formatfeld ===');
for (const ecc of ['L', 'M']) {
  /* Verschiedene Inhalte, damit verschiedene Masken gewaehlt werden. */
  const masken = new Set();
  for (const text of ['a', 'Argus', 'https://kr3akz.github.io/Argus/app/', 'x'.repeat(90), '0123456789'.repeat(9)]) {
    const qr = encodeQR(text, { ecc });
    masken.add(qr.mask);
    const f = formatBits(qr);
    ok(`${ecc}, Maske ${qr.mask}: Formatfeld laut Tabelle`, f === FORMAT[ecc][qr.mask], f);
    ok(`${ecc}, Maske ${qr.mask}: zweite Kopie gleich`, formatBitsCopy2(qr) === f);
  }
  console.log(`  (Masken in diesem Durchlauf: ${[...masken].sort().join(', ')})`);
}

/* ------------------------------------------------------------------------ */
console.log('\n=== Versionsfeld ===');
{
  /* Ab Version 7 steht die Version zusaetzlich zweimal im Code, 18 Bit mit
     BCH-Schutz. Fuer Version 7 lautet die Folge laut Norm 000111110010010100. */
  let text = 'v';
  let qr = encodeQR(text, { ecc: 'M' });
  while (qr.version < 7) { text += 'vvvvvvvvvv'; qr = encodeQR(text, { ecc: 'M' }); }
  ok('Inhalt reicht fuer Version 7', qr.version === 7, `Version ${qr.version}`);
  const size = qr.size;
  const bits = [];
  for (let i = 0; i < 18; i++) bits.push(qr.modules[Math.floor(i / 3)][size - 11 + i % 3]);
  const v = bits.map(b => (b ? '1' : '0')).reverse().join('');
  ok('Versionsfeld oben rechts', v === '000111110010010100', v);
  const bits2 = [];
  for (let i = 0; i < 18; i++) bits2.push(qr.modules[size - 11 + i % 3][Math.floor(i / 3)]);
  ok('...und gespiegelt unten links', bits2.map(b => (b ? '1' : '0')).reverse().join('') === v);
}

/* ------------------------------------------------------------------------ */
console.log('\n=== Feste Muster ===');
{
  const qr = encodeQR('https://kr3akz.github.io/Argus/app/#pair=test', { ecc: 'M' });
  const { modules: m, size } = qr;
  ok('Kantenlaenge 4 * Version + 17', size === qr.version * 4 + 17, `${size} bei Version ${qr.version}`);
  const finder = (x0, y0) => {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        if (m[y0 + dy][x0 + dx] !== (d !== 2)) return false;
      }
    }
    return true;
  };
  ok('Suchmuster oben links', finder(0, 0));
  ok('Suchmuster oben rechts', finder(size - 7, 0));
  ok('Suchmuster unten links', finder(0, size - 7));
  let takt = true;
  for (let i = 8; i < size - 8; i++) if (m[6][i] !== (i % 2 === 0) || m[i][6] !== (i % 2 === 0)) takt = false;
  ok('Taktlinien wechseln hell und dunkel', takt);
  ok('das immer dunkle Modul', m[size - 8][8] === true);
}

/* ------------------------------------------------------------------------ */
console.log('\n=== Was das Koppeln braucht ===');
{
  /* So lang wird eine echte Kopplungsadresse: Adresse der App, Name, Adresse
     im WLAN, oeffentlicher Schluessel und Kennung - siehe phone.js. */
  const url = 'https://kr3akz.github.io/Argus/app/#pair=' + 'A'.repeat(300);
  const qr = encodeQR(url, { ecc: 'M' });
  ok('eine Kopplungsadresse passt in einen gut lesbaren Code', qr.version <= 15, `Version ${qr.version}, ${qr.size}x${qr.size}`);
  const svg = qrToSvg(qr);
  ok('SVG mit Rand', svg.includes(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`));
  ok('SVG ohne Skript', !/script|on\w+=/i.test(svg));
  let geworfen = false;
  try { encodeQR('x'.repeat(5000)); } catch { geworfen = true; }
  ok('zu viel fuer einen QR-Code wird gemeldet statt abgeschnitten', geworfen);
  ok('Umlaute und Euro kodieren ohne Fehler', encodeQR('Grüße · 5 €').size > 0);
}

console.log(`\n${fehler ? `${fehler} FEHLER` : 'Alles bestanden.'}`);
process.exitCode = fehler ? 1 : 0;
