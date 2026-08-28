#!/usr/bin/env node
/**
 * Testet die Belohnungs-Texterkennung (OCR):
 *  - Erkennung mehrzeiliger Kartennamen (z.B. "Orthos Prime Blueprint", "Karyst Prime Handle")
 *  - Sonderzeichen (& vs and), Zahlen (2X Forma) und OCR-Vertipper
 *  - Echte Bildschirnaufnahme aus data/ocr/reward-2026-08-20T17-53-33.json
 *  - Zusammenlegen zweier unvollstaendiger Aufnahmen
 *  - Rahmen aus einem Ausschnitt in Bildschirmkoordinaten
 *  - Schnellerfassung ueber den persistenten Erkennungsprozess
 *
 *   node src/cli/ocr-test.js
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadRelicTables, allRewardNames } from '../core/relics.js';
import {
  buildRewardIndex, extractRewards, mergeRewards, scanRewardScreen, stopOcrWorker
} from '../core/rewardscan.js';

console.log('=== Relikt-Belohnungserkennung (OCR) Test ===\n');

console.log('1. Relikt-Katalog laden …');
const relicIdx = await loadRelicTables();
const names = allRewardNames(relicIdx);
const index = buildRewardIndex(names);
console.log(`   ${index.size} Belohnungsnamen im Suchindex.\n`);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`   [PASS] ${message}`);
    passed++;
  } else {
    console.error(`   [FAIL] ${message}`);
    failed++;
  }
}

// ---------------- Test 1: Mehrzeilige Karten ----------------
console.log('2. Test: Mehrzeilige Kartennamen (2- & 3-zeilig)');
const mockMultiline = {
  ok: true,
  region: { x: 0, y: 0, w: 2560, h: 1440 },
  lines: [
    { text: "Karyst Prime", words: [{ text: "Karyst", x: 678, y: 560, w: 80, h: 25 }, { text: "Prime", x: 765, y: 560, w: 70, h: 25 }] },
    { text: "Handle", words: [{ text: "Handle", x: 720, y: 590, w: 85, h: 25 }] },
    { text: "Hydroid Prime", words: [{ text: "Hydroid", x: 1000, y: 560, w: 90, h: 25 }, { text: "Prime", x: 1100, y: 560, w: 70, h: 25 }] },
    { text: "Chassis Blueprint", words: [{ text: "Chassis", x: 990, y: 590, w: 85, h: 25 }, { text: "Blueprint", x: 1080, y: 590, w: 100, h: 25 }] },
    { text: "Forma Blueprint", words: [{ text: "Forma", x: 1320, y: 580, w: 70, h: 25 }, { text: "Blueprint", x: 1400, y: 580, w: 100, h: 25 }] },
    { text: "Corvas Prime", words: [{ text: "Corvas", x: 1650, y: 560, w: 80, h: 25 }, { text: "Prime", x: 1740, y: 560, w: 70, h: 25 }] },
    { text: "Stock", words: [{ text: "Stock", x: 1700, y: 590, w: 60, h: 25 }] }
  ]
};

const res1 = extractRewards(mockMultiline, index);
assert(res1.rewards.length === 4, 'Alle 4 Karten erkannt');
assert(res1.rewards[0]?.name === 'Karyst Prime Handle', 'Karte 1: Karyst Prime Handle');
assert(res1.rewards[1]?.name === 'Hydroid Prime Chassis Blueprint', 'Karte 2: Hydroid Prime Chassis Blueprint');
assert(res1.rewards[2]?.name === 'Forma Blueprint', 'Karte 3: Forma Blueprint');
assert(res1.rewards[3]?.name === 'Corvas Prime Stock', 'Karte 4: Corvas Prime Stock');
assert(res1.rewards[0]?.box.h > 40, 'Bounding-Box umfasst beide Zeilen der Karte 1');

// ---------------- Test 2: Sonderzeichen & Vertipper ----------------
console.log('\n3. Test: Sonderzeichen (& vs and), 2X Forma & OCR-Vertipper');
const mockEdge = {
  ok: true,
  region: { x: 0, y: 0, w: 2560, h: 1440 },
  lines: [
    { text: "Silva & Aegis Prime", words: [{ text: "Silva", x: 678, y: 560, w: 60, h: 25 }, { text: "&", x: 742, y: 560, w: 20, h: 25 }, { text: "Aegis", x: 765, y: 560, w: 60, h: 25 }, { text: "Prime", x: 830, y: 560, w: 60, h: 25 }] },
    { text: "Blade", words: [{ text: "Blade", x: 750, y: 590, w: 65, h: 25 }] },
    { text: "2X Forma", words: [{ text: "2X", x: 1000, y: 560, w: 30, h: 25 }, { text: "Forma", x: 1035, y: 560, w: 70, h: 25 }] },
    { text: "Blueprint", words: [{ text: "Blueprint", x: 1010, y: 590, w: 100, h: 25 }] },
    { text: "Akbronco Pr1me", words: [{ text: "Akbronco", x: 1320, y: 560, w: 90, h: 25 }, { text: "Pr1me", x: 1415, y: 560, w: 60, h: 25 }] },
    { text: "Link", words: [{ text: "Link", x: 1370, y: 590, w: 50, h: 25 }] }
  ]
};

const res2 = extractRewards(mockEdge, index);
assert(res2.rewards.length === 3, '3 von 3 Karten erkannt');
assert(res2.rewards[0]?.name === 'Silva & Aegis Prime Blade', 'Silva & Aegis Prime Blade erkannt trotz & und Zeilenumbruch');
assert(res2.rewards[1]?.name === '2X Forma Blueprint', '2X Forma Blueprint erkannt');
assert(res2.rewards[2]?.name === 'Akbronco Prime Link', 'Akbronco Prime Link erkannt trotz Typo "Pr1me"');

// ---------------- Test 3: Echter Screenshot ----------------
console.log('\n4. Test: Echter Belohnungs-Datensatz (data/ocr/reward-2026-08-20T17-53-33.json)');
const realJsonPath = 'data/ocr/reward-2026-08-20T17-53-33.json';
if (existsSync(realJsonPath)) {
  const realJson = JSON.parse(await readFile(realJsonPath, 'utf8'));
  const res3 = extractRewards(realJson, index);
  assert(res3.rewards.length === 4, 'Alle 4 echten Belohnungen erkannt');
  assert(res3.rewards[0]?.name === 'Pyrana Prime Barrel', 'Pyrana Prime Barrel');
  assert(res3.rewards[1]?.name === 'Vadarya Prime Receiver', 'Vadarya Prime Receiver');
  assert(res3.rewards[2]?.name === 'Dual Zoren Prime Handle', 'Dual Zoren Prime Handle');
  assert(res3.rewards[3]?.name === 'Perigale Prime Stock', 'Perigale Prime Stock');
} else {
  console.log('   (Datensatz nicht vorhanden, uebersprungen)');
}

// ---------------- Test 4: Zusammenlegen unvollstaendiger Aufnahmen ----------
console.log('\n5. Test: Zwei halbe Aufnahmen ergeben vier Karten');
/* Der Bildschirm baut sich auf, waehrend gelesen wird: der erste Blick sieht
   Karte 1 und 2, der zweite Karte 3 und 4. Keiner allein ist vollstaendig. */
const halfA = extractRewards({
  ok: true, region: { x: 0, y: 0, w: 2560, h: 1440 },
  lines: [
    { text: 'Pyrana Prime Barrel',     words: [{ text: 'Pyrana', x: 678,  y: 581, w: 234, h: 30 }] },
    { text: 'Vadarya Prime Receiver',  words: [{ text: 'Vadarya', x: 977, y: 581, w: 283, h: 30 }] }
  ]
}, index);
const halfB = extractRewards({
  ok: true, region: { x: 0, y: 0, w: 2560, h: 1440 },
  lines: [
    { text: 'Vadarya Prime Receiver',  words: [{ text: 'Vadarya', x: 977,  y: 581, w: 283, h: 30 }] },
    { text: 'Dual Zoren Prime Handle', words: [{ text: 'Dual',    x: 1295, y: 581, w: 294, h: 24 }] },
    { text: 'Perigale Prime Stock',    words: [{ text: 'Perigale', x: 1642, y: 581, w: 247, h: 30 }] }
  ]
}, index);
assert(halfA.rewards.length === 2, 'Erste Aufnahme allein: 2 Karten');
assert(halfB.rewards.length === 3, 'Zweite Aufnahme allein: 3 Karten');

const both = mergeRewards(halfA, halfB);
assert(both.rewards.length === 4, 'Zusammengelegt: alle 4 Karten');
assert(both.complete === true, 'Zusammengelegt gilt als vollstaendig');
assert(both.rewards.map(r => r.position).join() === '1,2,3,4', 'Nummerierung neu vergeben');
assert(both.rewards[0]?.name === 'Pyrana Prime Barrel', 'Karte 1 aus der ersten Aufnahme');
assert(both.rewards[3]?.name === 'Perigale Prime Stock', 'Karte 4 aus der zweiten Aufnahme');
assert(both.rewards.filter(r => r.name === 'Vadarya Prime Receiver').length === 1,
       'Die doppelt gelesene Karte steht nur einmal da');

// ---------------- Test 5: Ausschnitt -> Bildschirmkoordinaten --------------
console.log('\n6. Test: Rahmen aus einem Ausschnitt sind Bildschirmkoordinaten');
/* Wird nur der Streifen aufgenommen, in dem die Namen stehen, zaehlt die
   Erkennung ab der Oberkante DES STREIFENS. Die Preisschilder im Spiel
   brauchen aber die Stelle auf dem BILDSCHIRM - sonst sitzen sie um den
   Versatz des Streifens zu hoch. */
const cropped = extractRewards({
  ok: true, region: { x: 0, y: 403, w: 2560, h: 490 },
  lines: [
    { text: 'Pyrana Prime Barrel',     words: [{ text: 'Pyrana',   x: 678,  y: 178, w: 234, h: 30 }] },
    { text: 'Vadarya Prime Receiver',  words: [{ text: 'Vadarya',  x: 977,  y: 178, w: 283, h: 30 }] },
    { text: 'Dual Zoren Prime Handle', words: [{ text: 'Dual',     x: 1295, y: 178, w: 294, h: 24 }] },
    { text: 'Perigale Prime Stock',    words: [{ text: 'Perigale', x: 1642, y: 178, w: 247, h: 30 }] }
  ]
}, index);
assert(cropped.rewards.length === 4, 'Alle 4 Karten im Ausschnitt erkannt');
assert(cropped.rewards[0]?.box.y === 581, 'Rahmen um den Versatz des Ausschnitts verschoben (178 + 403)');
assert(cropped.rewards[0]?.box.x === 678, 'Waagerecht unveraendert, der Ausschnitt beginnt bei x = 0');

// ---------------- Test 6: Fast Worker OCR Scan ----------------
console.log('\n7. Test: Erkennungsprozess ohne Bild auf der Platte (Bilddatei-Auswertung)');
const testPng = path.resolve('data/ocr/reward-2026-08-20T17-53-33.png');
if (existsSync(testPng)) {
  const start = Date.now();
  const res4 = await scanRewardScreen(index, { sourceImage: testPng });
  const took = Date.now() - start;
  assert(res4.ok, 'Scan erfolgreich durchgefuehrt');
  assert(res4.rewards?.length === 4, `4 Belohnungen erkannt in ${took}ms`);
  console.log(`   Dauer: ${took} ms`);
}

stopOcrWorker();

console.log(`\n=== Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen ===`);
if (failed > 0) process.exit(1);
