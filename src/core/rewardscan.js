/**
 * Liest die Belohnungsnamen vom Auswahlbildschirm.
 *
 * WARUM UEBERHAUPT VOM BILDSCHIRM:
 *   Warframes EE.log protokolliert nur den EIGENEN Fund. Die drei Funde der
 *   Mitspieler kommen ueber das Netz an, aber nie mit Item. Wer alle vier
 *   Namen will, muss sie dort lesen, wo sie stehen.
 *
 * WARUM DAS TROTZ TEXTERKENNUNG ZUVERLAESSIG IST:
 *   Nicht der erkannte Text zaehlt, sondern der Abgleich gegen die Menge der
 *   moeglichen Belohnungen - rund 600 Namen aus DEs Droptabellen. Aus einem
 *   verlesenen "kris Grip" wird so wieder "Paris Prime Grip". Erkannt werden
 *   muss nur genug, um im Kandidatenfeld eindeutig zu sein.
 *
 * WAS AUFGENOMMEN WIRD:
 *   Ein Bild des Hauptbildschirms - oder nur des Streifens, in dem die Namen
 *   stehen. Es geht direkt in die Erkennung und landet gar nicht erst auf der
 *   Platte, ausser jemand verlangt es ausdruecklich (siehe ocr-host.ps1).
 */
import { recognise, warmUp, stop as stopOcrHost } from './ocr-host.js';

/* Ab hier gilt ein unscharfer Treffer als derselbe Name. 0.72 laesst rund ein
   Viertel der Zeichen daneben liegen - genug fuer verlesene Buchstaben, zu
   wenig, um zwei verschiedene Prime-Teile zu verwechseln. */
const FUZZY_MIN = 0.72;

/* Wie viele Textzeilen ein Kartenname hoechstens belegt.
   "Caliban Prime Neuroptics Blueprint" sind 34 Zeichen - im Spiel bricht das
   unter der Karte auf zwei, bei schmalen Karten auf drei Zeilen um. Wer nur
   einzelne Zeilen abgleicht, findet solche Namen NIE: "Caliban Prime" allein
   erreicht gegen den vollen Namen keine 0.72. Genau daran fehlten bisher
   regelmaessig ein oder zwei der vier Karten. */
const MAX_LINES_PER_NAME = 3;

const normalise = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Levenshtein-Abstand, iterativ mit einer Zeile Speicher. */
function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

const similarity = (a, b) => {
  const max = Math.max(a.length, b.length);
  return max ? 1 - distance(a, b) / max : 0;
};

/**
 * Erkannte Zeile -> bekannter Belohnungsname.
 * index ist eine Map normalisiert -> Anzeigename.
 */
export function matchReward(text, index) {
  const key = normalise(text);
  if (!key || key.length < 4) return null;

  const exact = index.get(key);
  if (exact) return { name: exact, score: 1 };

  let best = null;
  for (const [candidate, display] of index) {
    /* Grober Vorfilter: Namen mit stark abweichender Laenge koennen den
       Schwellwert ohnehin nicht erreichen, und der Abstand kostet Zeit. */
    if (Math.abs(candidate.length - key.length) > key.length * 0.35) continue;
    const score = similarity(key, candidate);
    if (score >= FUZZY_MIN && (!best || score > best.score)) best = { name: display, score };
  }
  return best;
}

/** Aus einer Liste von Belohnungsnamen den Suchindex bauen. */
export function buildRewardIndex(names) {
  const index = new Map();
  for (const name of names) {
    const key = normalise(name);
    if (key) index.set(key, name);
  }
  return index;
}

/** Rahmen einer erkannten Zeile, aus den Rahmen ihrer Woerter. */
function lineBox(line) {
  const words = line.words || [];
  if (!words.length) return null;
  const x = Math.min(...words.map(w => w.x));
  const y = Math.min(...words.map(w => w.y));
  const right = Math.max(...words.map(w => w.x + w.w));
  const bottom = Math.max(...words.map(w => w.y + w.h));
  return { text: line.text, x, y, w: right - x, h: bottom - y, cx: (x + right) / 2 };
}

function unionBox(boxes) {
  const x = Math.min(...boxes.map(b => b.x));
  const y = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.w));
  const bottom = Math.max(...boxes.map(b => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Gehoert `next` als Folgezeile zu `prev`, also zu derselben Karte?
 *
 * Zwei Bedingungen, beide notwendig: die Zeile steht DARUNTER und dicht
 * darunter, und sie steht ungefaehr mittig unter derselben Karte. Ohne die
 * zweite waechst der Name der ersten Karte in die zweite hinein - die vier
 * stehen schliesslich auf einer Hoehe nebeneinander.
 */
function continuesCard(prev, next) {
  if (next.y <= prev.y + prev.h * 0.5) return false;          // nicht darunter
  if (next.y - (prev.y + prev.h) > prev.h * 1.2) return false; // zu weit weg
  const reach = Math.max(prev.w, next.w) * 0.75;
  return Math.abs(prev.cx - next.cx) <= reach;
}

/**
 * Die naechste Zeile derselben Karte, oder -1.
 *
 * Gesucht wird ueber die ganze Liste ab `after` und nicht nur beim direkten
 * Nachbarn - die Liste ist nach Hoehe sortiert, die Karten stehen aber
 * nebeneinander. Von mehreren moeglichen Fortsetzungen gewinnt die hoechste,
 * bei gleicher Hoehe die mittiger stehende.
 */
function continuationOf(lines, prev, after) {
  let best = -1;
  for (let j = after + 1; j < lines.length; j++) {
    if (!continuesCard(prev, lines[j])) continue;
    if (best < 0 ||
        lines[j].y < lines[best].y ||
        (lines[j].y === lines[best].y &&
         Math.abs(lines[j].cx - prev.cx) < Math.abs(lines[best].cx - prev.cx))) best = j;
  }
  return best;
}

/**
 * Wertet ein OCR-Ergebnis aus: welche Zeilen sind Belohnungen, und in welcher
 * Reihenfolge stehen sie auf dem Bildschirm?
 *
 * Getrennt vom Aufnehmen, damit sich die Zuordnung an einer gespeicherten
 * Aufnahme pruefen laesst, ohne das Spiel zu starten.
 */
export function extractRewards(ocr, index) {
  /* Rahmen kommen in Koordinaten des AUSSCHNITTS an. Ab hier sind sie
     Bildschirmkoordinaten - sonst liesse sich das Ergebnis zweier Aufnahmen
     mit verschiedenem Ausschnitt nicht zusammenlegen, und die Preisschilder
     saessen um den Versatz des Ausschnitts daneben. */
  const originX = ocr.region?.x ?? 0;
  const originY = ocr.region?.y ?? 0;

  const lines = (ocr.lines || [])
    .map(lineBox)
    .filter(Boolean)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  /* Jede Zeile, jede Zeile plus Fortsetzung, jede Zeile plus zwei:
     welcher dieser Texte trifft einen bekannten Namen?

     Die Fortsetzung wird ueber die LAGE gesucht, nicht ueber die Nachbarschaft
     in der Liste. Die Liste ist nach Hoehe sortiert, und die vier Karten
     stehen nebeneinander - auf "Karyst Prime" folgt darin "Hydroid Prime" von
     der Nachbarkarte, nicht das "Handle" der eigenen. */
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const group = [lines[i]];
    const rows = [i];
    for (let n = 0; n < MAX_LINES_PER_NAME; n++) {
      const hit = matchReward(group.map(g => g.text).join(' '), index);
      if (hit) candidates.push({ ...hit, rows: [...rows], box: unionBox(group) });

      const j = continuationOf(lines, group[group.length - 1], rows[rows.length - 1]);
      if (j < 0) break;
      group.push(lines[j]);
      rows.push(j);
    }
  }

  /* Bester Treffer zuerst, bei Gleichstand der laengere: "Mesa Prime Systems"
     und "Mesa Prime Systems Blueprint" koennen beide passen, gemeint ist der
     vollstaendige. Jede Zeile gehoert am Ende zu hoechstens einer Karte. */
  candidates.sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);

  const usedLines = new Set();
  const hits = [];
  for (const c of candidates) {
    if (c.rows.some(r => usedLines.has(r))) continue;
    for (const r of c.rows) usedLines.add(r);
    hits.push({
      name: c.name, score: c.score,
      x: originX + c.box.x, y: originY + c.box.y, w: c.box.w, h: c.box.h
    });
  }

  /* Nach Zeilen gruppieren und die groesste Gruppe nehmen: ein Prime-Name kann
     auch anderswo auf dem Bildschirm stehen - im Arsenal, im Chat -, aber die
     Belohnungen stehen zu viert nebeneinander auf einer Hoehe.

     Die Toleranz haengt an der Texthoehe und nicht an einer festen Pixelzahl:
     was bei 1440p 60 px sind, ist bei 1080p schon zu grosszuegig. */
  const tolerance = rowTolerance(hits);
  let best = [];
  for (const hit of hits) {
    const row = hits.filter(h => Math.abs(h.y - hit.y) <= tolerance);
    if (row.length > best.length) best = row;
  }

  const rewards = best
    .sort((a, b) => a.x - b.x)
    .slice(0, 4)
    .map((h, i) => ({
      position: i + 1, name: h.name, score: h.score,
      /* Bildschirmkoordinaten in echten Pixeln, wie aufgenommen. Die
         Umrechnung in Fensterkoordinaten passiert dort, wo die
         Bildschirmskalierung bekannt ist - im Hauptprozess. */
      box: { x: h.x, y: h.y, w: h.w, h: h.h }
    }));

  /* Die Nummer stimmt nur, wenn alle vier gelesen wurden.
     Sie entsteht aus der Reihenfolge der TREFFER von links nach rechts - fehlt
     die erste Karte, wird aus der zweiten eine Eins, und die Nummer zeigt auf
     die falsche Karte. Wer sie anzeigt, muss das wissen. */
  return { rewards, complete: rewards.length >= 4,
           language: ocr.language, lines: (ocr.lines || []).length, region: ocr.region || null };
}

function rowTolerance(hits) {
  if (!hits.length) return 60;
  const heights = hits.map(h => h.h).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  return Math.max(40, median * 2);
}

/**
 * Zwei Aufnahmen desselben Bildschirms zu einem Ergebnis zusammenlegen.
 *
 * WARUM NICHT EINFACH DIE BESSERE NEHMEN:
 *   Der Bildschirm baut sich auf, waehrend gelesen wird, und mitten hinein
 *   schiebt sich eine Meldung oder ein Mitspielername. Ein Blick liest dann
 *   Karte 1, 2 und 4, der naechste 2, 3 und 4 - beide unvollstaendig, zusammen
 *   aber vollstaendig. Wer nur den besseren Blick behaelt, wirft die eine
 *   Karte weg, die der andere hatte.
 *
 * Zusammengelegt wird ueber die Position: dieselbe Karte steht in beiden
 * Aufnahmen an derselben Stelle. Bei zwei Lesungen derselben Karte gewinnt
 * die mit der besseren Bewertung.
 */
export function mergeRewards(a, b) {
  if (!a?.rewards?.length) return b;
  if (!b?.rewards?.length) return a;

  const merged = [];
  for (const reward of [...a.rewards, ...b.rewards]) {
    /* Toleranz aus der Kartenbreite: die vier stehen weit auseinander, aber
       derselbe Name liegt zwischen zwei Aufnahmen nur wenige Pixel daneben. */
    const near = merged.find(m =>
      Math.abs(m.box.x - reward.box.x) <= Math.max(60, reward.box.w * 0.5) &&
      Math.abs(m.box.y - reward.box.y) <= Math.max(40, reward.box.h * 1.5));

    if (!near) { merged.push({ ...reward }); continue; }
    if (reward.score > near.score) Object.assign(near, reward);
  }

  const rewards = merged
    .sort((x, y) => x.box.x - y.box.x)
    .slice(0, 4)
    .map((r, i) => ({ ...r, position: i + 1 }));

  return {
    ok: true,
    rewards,
    complete: rewards.length >= 4,
    language: b.language || a.language,
    lines: (a.lines || 0) + (b.lines || 0),
    /* Der Ausschnitt der letzten Aufnahme, nur noch zur Diagnose: die Rahmen
       oben sind bereits Bildschirmkoordinaten. */
    region: b.region || a.region
  };
}

/**
 * Nimmt den Bildschirm auf und gibt die gefundenen Belohnungen zurueck,
 * sortiert wie sie auf dem Bildschirm stehen: von links nach rechts.
 *
 * top/bottom schneiden einen waagerechten Streifen aus, als Anteil der
 * Bildschirmhoehe - ohne Angabe wird der ganze Hauptbildschirm gelesen.
 *
 * scale vergroessert die Aufnahme vor der Erkennung, ohne an den
 * zurueckgegebenen Koordinaten etwas zu aendern. Warum das ueberhaupt etwas
 * bringt, steht im Kopf von ocr-host.ps1.
 */
export async function scanRewardScreen(index, { top, bottom, sourceImage, keepImage, scale } = {}) {
  /* ARGUS_SCAN_IMAGE wertet ein vorhandenes Bild aus, statt den Bildschirm
     aufzunehmen - fuer Tests ohne laufendes Spiel. */
  const source = sourceImage || process.env.ARGUS_SCAN_IMAGE || null;

  const res = await recognise({ top, bottom, source, scale, png: keepImage || undefined });
  if (!res.ok) return { ok: false, error: res.error || 'OCR fehlgeschlagen' };

  return { ok: true, ...extractRewards(res, index) };
}

/* Der Streifen ganz oben, in dem "VOID FISSURE/REWARDS" steht. Sehr schmal
   gehalten, weil er oft gelesen wird: 2560x101 kostet 31 ms, der ganze
   Bildschirm 248 ms. */
/* Eine Karte belegt rund 12,6 % der Bildschirmbreite - nachgemessen bei
   2560x1440 sind es 323 px. Als Anteil ausgedrueckt gilt der Wert auch auf
   anderen Aufloesungen. */
const KARTE_ANTEIL = 0.126;

/* Mehr Karten als Mitspieler gibt es nicht, und mehr als vier Mitspieler auch
   nicht. Diese Schranke ist die letzte Rettung, falls die Breitenschaetzung
   trotz allem danebenliegt: lieber vier Spalten mit einer falschen Zuordnung
   als achtzig Spalten, in denen die Anzeige unlesbar zerfaellt. */
const MAX_KARTEN = 4;

/**
 * Wie breit ist eine Karte, und in welcher Spalte steht jede Belohnung?
 *
 * WARUM DAS NICHT TRIVIAL IST: Die Erkennung liefert keine Kartenbreite - ihre
 * Rahmen umschliessen den TEXT, und "Forma Blueprint" ist schmaler als
 * "Dual Zoren Prime Handle". Die Karten stehen aber in gleichem Abstand und
 * stossen aneinander, also IST der Abstand ihrer Mittelpunkte die Breite.
 *
 * DIE FALLE, die diese Funktion zum eigenen Modul gemacht hat: Es stand einmal
 * schlicht Math.min ueber allen Abstaenden. Wird dieselbe Karte zweimal
 * gelesen - bei langen, ueber drei Zeilen umbrechenden Namen kommt das vor -,
 * liegen zwei Treffer wenige Pixel auseinander. Dieser Mini-Abstand galt dann
 * als Kartenbreite, und aus vier Karten wurden achtzig Spalten: die Anzeige
 * zerfiel in schmale Streifen ueber die ganze Bildschirmbreite.
 *
 * Deshalb zaehlen nur Abstaende, die ueberhaupt eine Kartenbreite sein KOENNEN.
 * Was darunter liegt, sind zwei Lesungen desselben Namens.
 */
export function panelGeometrie(rewards, screenWidth, maxKarten = MAX_KARTEN) {
  const erwartet = screenWidth * KARTE_ANTEIL;
  const mitten = rewards.map(r => r.box.x + r.box.w / 2);
  const sortiert = [...mitten].sort((a, b) => a - b);

  const abstaende = sortiert.slice(1).map((m, i) => m - sortiert[i])
                            .filter(d => d >= erwartet * 0.55);
  const breite = abstaende.length ? Math.min(...abstaende) : erwartet;

  const links = sortiert[0];
  const deckel = Math.max(1, Math.min(MAX_KARTEN, maxKarten)) - 1;
  const spalten = mitten.map(m =>
    Math.min(deckel, Math.max(0, Math.round((m - links) / breite))));

  /* Zwei Karten koennen nicht in derselben Spalte stehen. Passiert es doch,
     war es dieselbe Karte zweimal gelesen - dann gewinnt die bessere Lesung,
     und die andere faellt weg, statt die Nachbarspalte zu verdecken. */
  const proSpalte = new Map();
  spalten.forEach((sp, i) => {
    const bisher = proSpalte.get(sp);
    if (bisher === undefined || (rewards[i].score ?? 0) > (rewards[bisher].score ?? 0)) {
      proSpalte.set(sp, i);
    }
  });

  const behalten = [...proSpalte.values()].sort((a, b) => spalten[a] - spalten[b]);
  return {
    breite,
    links: links - breite / 2,          // linke Kante der linkesten Karte
    anzahlSpalten: Math.max(...behalten.map(i => spalten[i])) + 1,
    eintraege: behalten.map(i => ({ index: i, spalte: spalten[i] }))
  };
}

const TITLE_BAND = { top: 0.02, bottom: 0.10 };

/**
 * Steht der Belohnungsbildschirm gerade auf dem Schirm?
 *
 * WOZU: Warframe schreibt EE.log gepuffert. Laeuft das Spiel im Hintergrund,
 * fuellt sich der Puffer kaum - nachgemessen kamen "Got rewards" und
 * "Relic reward screen shut down" 15 Sekunden Spielzeit auseinander, aber
 * 1 Millisekunde auseinander in der Datei. Wer nur auf das Log hoert, erfaehrt
 * vom Bildschirm dann erst, wenn er schon zu ist. Der Bildschirm selbst luegt
 * nicht.
 *
 * Gesucht wird "FISSUREREW" am Stueck und nicht nur "FISSURE": letzteres steht
 * waehrend der Mission auch im Missionskopf, ersteres nur in dieser einen
 * Ueberschrift. Ein Fehlalarm waere allerdings harmlos - der Blick auf die
 * Karten faende dann einfach keine Namen.
 */
export async function rewardScreenVisible({ sourceImage } = {}) {
  /* Wie scanRewardScreen: ein vorhandenes Bild statt des Bildschirms, damit
     sich der Ausloeser ohne laufendes Spiel pruefen laesst. */
  const source = sourceImage || process.env.ARGUS_SCAN_IMAGE || null;
  const res = await recognise(source ? { source } : TITLE_BAND);
  if (!res.ok) return false;
  const text = (res.lines || []).map(l => l.text).join(' ')
                 .toUpperCase().replace(/[^A-Z]/g, '');
  return /FISSUREREW/.test(text);
}

/** Die Erkennung vorziehen, bevor jemand auf sie wartet. */
export { warmUp as warmUpOcr };

/** Den Erkennungsprozess beenden - fuer CLI-Werkzeuge und das Herunterfahren. */
export { stopOcrHost as stopOcrWorker };
