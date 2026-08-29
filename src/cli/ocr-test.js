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
import { readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadRelicTables, allRewardNames } from '../core/relics.js';
import {
  buildRewardIndex, extractRewards, mergeRewards, scanRewardScreen, stopOcrWorker,
  panelGeometrie, panelGeometrieGemessen
} from '../core/rewardscan.js';
import { columnCrops, columnCropsFrom, recallGeometry, rememberGeometry } from '../core/scan-geometry.js';
import { setDataDir } from '../core/paths.js';

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

// ---------------- Test 7: Spaltengeometrie ----------------
/* Reine Rechnung, ohne Erkennung: sitzen die Spalten dort, wo die Namen in der
   echten Aufnahme standen? Die Zahlen unten sind aus data/ocr/test.json
   abgelesen und nicht erfunden - genau darin liegt der Wert dieses Tests. */
console.log('\n8. Test: Spaltenausschnitte treffen die gemessenen Namen');
/* In ein eigenes Verzeichnis, BEVOR die Geometrie zum ersten Mal gelesen wird:
   sonst faende der Test eine echte Messung des Benutzers vor und pruefte je
   nach Rechner etwas anderes. */
const geoDir = path.join(tmpdir(), `argus-geo-test-${process.pid}`);
await mkdir(geoDir, { recursive: true });
setDataDir(geoDir);

const rahmen1440 = { x: 0, y: 0, w: 2560, h: 1440 };
const geo1440 = await recallGeometry(rahmen1440);
assert(geo1440.gemessen === false, 'Ohne Messung gilt der Standard');
const spalten = columnCrops(geo1440, 4);
/* x und Breite der vier Namensrahmen bei 2560x1440. */
const gemesseneNamen = [[678, 234], [977, 283], [1295, 294], [1642, 247]];

assert(spalten.length === 4, 'Vier Karten ergeben vier Spalten');
assert(columnCrops(geo1440, 1).length === 1, 'Ein Mitspieler ergibt eine Spalte');
assert(columnCrops(geo1440, 9).length === 4, 'Mehr als vier Spalten kann es nicht geben');

let alleDrin = true;
let ueberlappung = false;
for (let i = 0; i < 4; i++) {
  const links  = spalten[i].left * 2560;
  const rechts = spalten[i].right * 2560;
  const [nx, nw] = gemesseneNamen[i];
  if (nx < links || nx + nw > rechts) alleDrin = false;
  /* Der Nachbarname darf NICHT hineinragen - das ist der ganze Zweck. */
  for (let j = 0; j < 4; j++) {
    if (j === i) continue;
    const [ox, ow] = gemesseneNamen[j];
    if (ox + ow > links && ox < rechts) ueberlappung = true;
  }
}
assert(alleDrin, 'Jeder gemessene Name liegt vollstaendig in seiner Spalte');
assert(!ueberlappung, 'Kein Nachbarname ragt in eine fremde Spalte');

const streifen = geo1440.band;
assert(streifen.top * 1440 < 581 && streifen.bottom * 1440 > 740,
       'Der Standardstreifen umfasst die Namen (581) und drei Zeilen Umbruch (740)');

/* Der Fall, an dem die Spalten sonst geschlossen scheitern: der Waechter
   meldet den Bildschirm, es gibt kein Log und damit keine Mitspielerzahl,
   also wird vier angenommen - dastehen aber drei Karten. Dann liegt die Reihe
   um eine halbe Kartenbreite versetzt. */
console.log('\n8b. Test: Spalten aus gelesenen Karten nachziehen');
const dreierMitten = [1280 - 323.5, 1280, 1280 + 323.5];       // drei Karten, zentriert
const dreierNamen = dreierMitten.map(m => ({ box: { x: m - 120, y: 581, w: 240, h: 30 } }));

const fuerVier = columnCrops(geo1440, 4).map(c => (c.left + c.right) / 2 * 2560);
assert(dreierMitten.every(m => fuerVier.some(c => Math.abs(c - m) < 40)) === false,
       'Die Vierer-Spalten treffen eine Dreierreihe NICHT - genau das Problem');

const nachgezogen = columnCropsFrom(rahmen1440, [dreierNamen[0]], geo1440);
assert(!!nachgezogen && nachgezogen.length > 0, 'Eine einzige gelesene Karte genuegt zum Nachziehen');
const nachMitten = nachgezogen.map(c => (c.left + c.right) / 2 * 2560);
assert(dreierMitten.every(m => nachMitten.some(c => Math.abs(c - m) < 20)),
       `Alle drei Karten haben danach eine eigene Spalte (${nachMitten.map(m => m.toFixed(0)).join(', ')})`);
assert(nachgezogen.length <= 4, 'Nie mehr als vier Spalten');

/* Und der gewoehnliche Fall: vier Karten bleiben vier Spalten an Ort und Stelle. */
const vierNachgezogen = columnCropsFrom(rahmen1440, gemesseneNamen.map(([x, w]) =>
  ({ box: { x, y: 581, w, h: 30 } })), geo1440);
assert(vierNachgezogen.length === 4, 'Vier gelesene Karten ergeben vier Spalten');
assert(vierNachgezogen.every((c, i) => {
  const [nx, nw] = gemesseneNamen[i];
  return nx >= c.left * 2560 && nx + nw <= c.right * 2560;
}), 'Die nachgezogenen Spalten enthalten jeden gemessenen Namen');

assert(columnCropsFrom(rahmen1440, [], geo1440) === null,
       'Ohne gelesene Karte gibt es nichts nachzuziehen');

/* Das Dock soll waehrend des Fuellens STILLSTEHEN. Aus den gelesenen Karten
   abgeleitet tut es das nicht: mit zwei Karten ist es zwei Spalten breit, mit
   vier dann vier - es rueckt bei jeder Nachlieferung zurecht. Aus der Messung
   abgeleitet bleibt es, wo es ist. */
console.log('\n8c. Test: Dock steht still, waehrend Karten nachkommen');
const alleVier = gemesseneNamen.map(([x, w], i) =>
  ({ name: 'Karte ' + i, score: 1, box: { x, y: 581, w, h: 30 } }));
const nurZwei = [alleVier[0], alleVier[2]];        // Karte 1 und 3 gelesen

const abgeleitetVier = panelGeometrie(alleVier, 2560, 4);
const abgeleitetZwei = panelGeometrie(nurZwei, 2560, 4);
assert(abgeleitetVier.anzahlSpalten !== abgeleitetZwei.anzahlSpalten ||
       Math.abs(abgeleitetVier.links - abgeleitetZwei.links) > 1,
       'Aus den Karten abgeleitet wandert das Dock - genau das stoert');

const festVier = panelGeometrieGemessen(alleVier, rahmen1440, geo1440.cardWidth, 4);
const festZwei = panelGeometrieGemessen(nurZwei, rahmen1440, geo1440.cardWidth, 4);
assert(festVier.anzahlSpalten === 4 && festZwei.anzahlSpalten === 4,
       'Aus der Messung bleibt es vier Spalten breit, egal wie viel gelesen ist');
assert(Math.abs(festVier.links - festZwei.links) < 0.001,
       'Und die linke Kante bleibt exakt dieselbe');
assert(festVier.eintraege.map(e => e.spalte).join() === '0,1,2,3',
       'Vier Karten landen in den Spalten 0-3');
assert(festZwei.eintraege.map(e => e.spalte).join() === '0,2',
       'Zwei gelesene Karten behalten ihre Spalten 0 und 2 - die Luecke bleibt');

/* Und die Platzhalter-Lage muss mit der spaeteren Lage uebereinstimmen, sonst
   rueckt das Dock beim ersten gelesenen Namen doch noch zur Seite. */
const leer = panelGeometrieGemessen([], rahmen1440, geo1440.cardWidth, 4);
assert(Math.abs(leer.links - festVier.links) < 0.001 && leer.anzahlSpalten === 4,
       'Das leere Dock sitzt dort, wo spaeter die gelesenen Karten sitzen');

// ---------------- Test 8: Geometrie merken und wiederfinden ----------------
console.log('\n9. Test: Gemessene Geometrie ueberlebt den Neustart');
const gemerkt = await rememberGeometry(rahmen1440, [
  { box: { x: 678,  y: 581, w: 234, h: 30 } },
  { box: { x: 977,  y: 581, w: 283, h: 30 } },
  { box: { x: 1295, y: 581, w: 294, h: 24 } },
  { box: { x: 1642, y: 581, w: 247, h: 30 } }
], 4);
assert(!!gemerkt, 'Ein vollstaendiger Durchgang wird gemerkt');
/* Die Mittelpunkte liegen 323,5 px auseinander - das ist die Kartenbreite. */
assert(Math.abs(gemerkt.cardWidth * 2560 - 323.5) < 2,
       `Kartenbreite aus den Mittelpunkten gemessen (${(gemerkt.cardWidth * 2560).toFixed(1)} px)`);
assert(Math.abs(gemerkt.band.top * 1440 - (581 - 0.02 * 1440)) < 2,
       'Streifen beginnt eine Handbreit ueber dem obersten Namen');

assert(await rememberGeometry(rahmen1440, [{ box: { x: 678, y: 581, w: 234, h: 30 } }], 4) === null,
       'Ein unvollstaendiger Durchgang wird NICHT gemerkt');

/* Frisch importieren: so liest das Modul die Datei wirklich neu, statt aus
   seinem eigenen Zwischenspeicher zu antworten. */
const frisch = await import(`../core/scan-geometry.js?neu=${Date.now()}`);
const zurueck = await frisch.recallGeometry(rahmen1440);
assert(zurueck.gemessen === true, 'Beim naechsten Start gilt die Messung, nicht der Standard');
assert(Math.abs(zurueck.cardWidth - gemerkt.cardWidth) < 1e-9, 'Kartenbreite unveraendert wieder da');
assert((await frisch.recallGeometry({ x: 0, y: 0, w: 1920, h: 1080 })).gemessen === false,
       'Eine andere Aufloesung erbt die Messung nicht');

await rm(geoDir, { recursive: true, force: true });
setDataDir(null);

// ---------------- Test 9: Spaltenlesung an einer echten Aufnahme ----------
console.log('\n10. Test: Spaltenweise Lesung findet alle vier Karten');
if (existsSync(testPng)) {
  const ab = Date.now();
  const spaltig = await scanRewardScreen(index, { sourceImage: testPng, columns: spalten });
  assert(spaltig.ok, 'Spaltenlesung erfolgreich durchgefuehrt');
  assert(spaltig.rewards?.length === 4, `4 Belohnungen aus 4 Ausschnitten in ${Date.now() - ab}ms`);
  assert(spaltig.rewards?.[0]?.box.x === 678,
         'Rahmen aus dem Spaltenausschnitt sind Bildschirmkoordinaten');
  assert(spaltig.rewards?.[3]?.name === 'Perigale Prime Stock',
         'Die rechte Karte kommt aus der rechten Spalte');

  /* Der Beweis, dass der Ausschnitt wirklich schneidet: nur die linke Haelfte
     lesen: dann duerfen die beiden rechten Karten NICHT dabei sein. Vor dieser
     Aenderung ignorierte der Erkennungsprozess bei einem Bild jeden Zuschnitt
     und lieferte immer alle vier. */
  const linkeHaelfte = await scanRewardScreen(index, { sourceImage: testPng, left: 0, right: 0.5 });
  const gefunden = (linkeHaelfte.rewards || []).map(r => r.name);
  assert(gefunden.includes('Pyrana Prime Barrel'), 'Linke Haelfte enthaelt die erste Karte');
  assert(!gefunden.includes('Perigale Prime Stock'),
         'Linke Haelfte enthaelt die vierte Karte NICHT - der Zuschnitt greift');
}

stopOcrWorker();

console.log(`\n=== Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen ===`);
if (failed > 0) process.exit(1);
