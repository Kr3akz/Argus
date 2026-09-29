/**
 * Die Empfehlung auf dem Reliktauswahlbildschirm - was ihr eigenes Fenster
 * zeigt (siehe relic-pick.html und den Abschnitt Relikt-Empfehlung in main.js).
 *
 * GERECHNET WIRD HIER NICHTS NEUES. Bestand, Politur, Preise und
 * Erwartungswert kommen aus demselben Aufbau wie im Planer
 * (describeRecommendedRelics in main.js, planRelics in relics.js). Hier wird
 * nur ausgewaehlt, was ueber dem Bildschirm stehen soll - ohne Electron, damit
 * es sich pruefen laesst (npm run relic-pick-test).
 *
 * WELCHE AERA GEMEINT IST, sagt der Riss, und der ist nicht immer bekannt.
 * Nachgemessen an Kaans EE.log vom 28.09.2026:
 *
 *   - Zwischen zwei Runden einer Endlosmission steht er fest. Das Spiel
 *     schreibt ihn beim Laden der Mission mit ("Client loaded {... "voidTier":
 *     "VoidT6" ...} with MissionInfo"), Minuten bevor die Auswahl aufgeht.
 *   - Auf der Sternenkarte NICHT. Dort geht die Auswahl zuerst auf, und die
 *     Mission samt voidTier kommt erst NACH der Wahl ins Log - bei der
 *     Axi-Mission 0,9 s nach der Sicherheitsfrage. Wer vorher fragt, bekommt
 *     keine Antwort, auch nicht ueber die Knoten, ueber die der Mauszeiger
 *     fuhr: der letzte vor der Auswahl war Nakki, gewaehlt wurde Hydron.
 *
 * Fuer die Sternenkarte liest Argus die Aera deshalb vom Bildschirm ab -
 * siehe eraFromScreen unten.
 *
 * Deshalb mehrere Faelle statt eines Filters:
 *   era      Aera bekannt - nur Relikte, die hineinpassen.
 *   any      Omnia-Riss, die Konsole im Schiff oder "All" von Hand - eine
 *            Liste ueber alle Aeren.
 *   unknown  Aera unbekannt - die besten JEDER Aera, damit man seine findet,
 *            egal welche das Spiel gerade zeigt. Eine gemeinsame Rangliste
 *            waere hier irrefuehrend: oben stuenden Lith-Relikte, waehrend der
 *            Bildschirm nur Axi anbietet.
 *   tracked  Nur die im Planer gemerkten, von Hand gewaehlt.
 */
import { RELIC_TIERS } from './relics.js';

/* So viele Relikte bei bekannter Aera. Die Auswahl dauert kurz - bei Kaan
   lagen zwischen Aufgehen und Wahl 1,1 bis 2,8 s (sechs Wahlen am
   28.09.2026). In der Zeit liest niemand eine lange Liste; sechs Zeilen sind
   die Entscheidung und zwei Ausweichen. */
export const PICK_ROWS = 6;

/* Je Aera, wenn der Riss nicht bekannt ist. Zwei statt einem: das beste
   Relikt ist oft das einzige seiner Art, und wer es nicht verbrauchen will,
   braucht das naechste gleich daneben. */
export const PICK_PER_ERA = 2;

/* Unterhalb dieses Anteils bekannter Preise ist der Platinwert nur eine
   Untergrenze - dieselbe Schwelle wie auf den Karten im Relikt-Planer. */
const THIN_PRICES = 0.9;

/** Was ein Oeffnen im Schnitt bringt - Platin zuerst, Dukaten bei Gleichstand. */
function byValue(a, b) {
  return (b.expPlat || 0) - (a.expPlat || 0)
      || (b.expDucats || 0) - (a.expDucats || 0)
      || String(a.id || a.key || '').localeCompare(String(b.id || b.key || ''), 'en', { numeric: true });
}

function toRow(r, top) {
  const share = Number.isFinite(r.pricedShare) ? r.pricedShare : null;
  return {
    id: r.id,
    tier: r.tier,
    name: r.name,
    state: r.state || 'Intact',
    count: r.count || 0,
    image: r.image || null,
    expPlat: r.expPlat ?? 0,
    expDucats: r.expDucats ?? 0,
    /* Kein einziger Preis bekannt heisst: gar keine Aussage, nicht "0". */
    unpriced: share === 0,
    thin: share !== null && share > 0 && share < THIN_PRICES,
    best: r.bestPlat && Number.isFinite(r.bestPlat.plat)
      ? { name: r.bestPlat.name, plat: r.bestPlat.plat }
      : null,
    tracked: !!r.tracked,
    top
  };
}

/**
 * Die Ansicht fuer das Fenster.
 *
 * @param relics  Relikte aus describeRecommendedRelics - je Relikt UND Politur
 *                ein Eintrag, strahlend und intakt sind zwei Entscheidungen.
 * @param tier    'Lith' … 'Requiem' fuer eine Aera, 'Omnia' oder 'all' fuer
 *                alle, 'tracked' fuer die gemerkten, null fuer "nicht bekannt".
 */
export function buildRelicPick(relics, { tier = null, traces = 0, rows = PICK_ROWS,
                                         perEra = PICK_PER_ERA } = {}) {
  const list = (Array.isArray(relics) ? relics : []).filter(r => r && r.tier).sort(byValue);

  let mode, pool, shown;
  if (tier === 'tracked') {
    mode = 'tracked';
    pool = list.filter(r => r.tracked);
    shown = pool.slice(0, rows).map((r, i) => toRow(r, i === 0));
  } else if (tier && tier !== 'Omnia' && tier !== 'all') {
    mode = 'era';
    pool = list.filter(r => r.tier === tier);
    shown = pool.slice(0, rows).map((r, i) => toRow(r, i === 0));
  } else if (tier === 'Omnia' || tier === 'all') {
    /* Ein Omnia-Riss nimmt jede Aera, Requiem eingeschlossen - im Log lud
       die Auswahl zwischen zwei Omnia-Runden 196 Reliktsorten, genau so
       viele, wie Kaan besass, die fuenf Requiem-Sorten mitgezaehlt. Das ist
       ein Indiz, kein Beweis (der Bestand kann sich dazwischen verschoben
       haben); das Overlay-Fenster behandelt Omnia seit jeher genauso. */
    mode = 'any';
    pool = list;
    shown = pool.slice(0, rows).map((r, i) => toRow(r, i === 0));
  } else {
    mode = 'unknown';
    pool = list;
    shown = [];
    const known = new Set(RELIC_TIERS);
    /* Unbekannte Aeren hinten anhaengen statt verschlucken - eine neue Aera
       von DE soll nicht still aus der Liste fallen. */
    const order = [...RELIC_TIERS, ...new Set(list.map(r => r.tier).filter(t => !known.has(t)))];
    for (const t of order) {
      list.filter(r => r.tier === t).slice(0, perEra)
          .forEach((r, i) => shown.push(toRow(r, i === 0)));
    }
  }

  return {
    mode,
    tier: tier || null,
    rows: shown,
    /* Wie viele im Bestand ueberhaupt in Frage kamen - fuer die Fusszeile
       und dafuer, eine leere Liste richtig zu erklaeren. */
    total: pool.length,
    owned: list.length,
    traces: Number.isFinite(traces) ? traces : 0
  };
}

/* ------------------------------------------------------------------------
   Die Aera vom Bildschirm - fuer die Sternenkarte.

   WARUM VOM BILDSCHIRM: von der Sternenkarte steht die Mission erst NACH der
   Wahl im Log (siehe oben). Kaans Test am 29.09.2026 bestaetigt das an zwei
   weiteren Auswahlen: auch dort nichts davor, und die Knoten, ueber die der
   Zeiger zuletzt fuhr (Maroo's Bazaar, Wahiba), hatten mit dem Riss nichts
   zu tun. Was es geben muss, ist die Anzeige des Spiels selbst - nach
   Spielerberichten nennt der Auswahlbildschirm die Aera oben links, bei
   einem Omnia-Riss "ALL".

   WIE DER BILDSCHIRM AUSSIEHT, nachgemessen an Kaans drei Aufnahmen vom
   29.09.2026 (2560x1440, englischer Client, data/diag/auswahl-*):
     - Oben links unter "VOID RELICS/REFINEMENT" steht die Aera als eigene
       Zeile: "LITH ERA", "NEO ERA".
     - Daneben der Zaehler "COLLECTED 75/202". 202 ist genau die Zahl der
       Lith-Relikte in den Droptabellen; bei Neo stand 62/196, und 196 sind
       es dort. Der Nenner sagt also, wie viele Relikte der Bildschirm fuehrt.
     - Im Raster nur Karten der einen Aera ("Lith G14 Relic").

   WANN SICH WAS LESEN LAESST: der Bildschirm blendet sich ein. Bei rund
   0,45 s nach dem Aufgehen war alles noch halb durchsichtig - Karten und
   Zaehler lasen sich schon, die kleine Aera-Zeile noch nicht; bei 0,7 s
   stand sie da. Wer nur auf die Zeile wartet, zeigt so lange etwas
   Ungefiltertes - genau das hat Kaan beim ersten Test gestoert.

   Deshalb drei Belege, in dieser Rangfolge:
     1. Die Zeile "<Aera> ERA". Sie IST die Antwort.
     2. Der Zaehler: fuehrt der Bildschirm mehr als die Haelfte aller
        Relikte, zeigt er alle Aeren - Omnia. Ein Omnia-Bildschirm ist nicht
        gemessen; der Schluss folgt aus dem, was der Nenner bei Lith und Neo
        nachweislich zaehlt.
     3. Die Karten - Aeren nur mit dem Zaehler als Beleg, dass der Bildschirm
        EINE Aera fuehrt. Ohne ihn koennten die sichtbaren Karten die erste
        Reihe eines Omnia-Rasters sein, die zufaellig mit einer Aera beginnt.
        Karten zweier Aeren heissen dagegen immer: alle Aeren.
   Waehrend des Einblendens verliest die Erkennung die blassen Karten gern
   ("Lit%", "Liti", "Lfth" fuer "Lith"). Am Zeilenanfang zaehlt deshalb auch
   ein Wort, das sich um einen Buchstaben unterscheidet - bei gleichem
   ersten Buchstaben und nur fuer die langen Namen. "Liii" zaehlt nicht
   mehr, das waere Raten; die Nachbarkarten reichen dann.

   Im Zweifel faellt keine Entscheidung, und der naechste Blick folgt.
   ------------------------------------------------------------------------ */

const ERA_EXACT = { LITH: 'Lith', MESO: 'Meso', NEO: 'Neo', AXI: 'Axi', REQUIEM: 'Requiem' };
/* Was in der Aera-Zeile eines Omnia-Risses stehen kann - nicht gemessen,
   nur zugelassen. */
const ERA_ALL = new Set(['ALL', 'OMNIA']);

/* Nur Buchstaben, gross - Ziffern, die die Erkennung fuer Buchstaben haelt,
   zurueckgetauscht ("AX1" ist "AXI"). */
const norm = text => String(text || '').toUpperCase()
  .replace(/1/g, 'I').replace(/0/g, 'O').replace(/[^A-Z]/g, '');

/* Levenshtein-Abstand - fuer Woerter von drei bis sieben Buchstaben. */
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/* Ein Wort als Aera, oder null. Neo und Axi nur genau - bei drei Buchstaben
   ist ein Buchstabe daneben schon ein anderes Wort. */
function eraOf(text) {
  const t = norm(text);
  if (ERA_EXACT[t]) return ERA_EXACT[t];
  if (t.length < 3) return null;
  for (const [word, era] of Object.entries(ERA_EXACT)) {
    if (word.length >= 4 && t[0] === word[0] && distance(t, word) <= 1) return era;
  }
  return null;
}

const inside = (w, r) => {
  const cx = w.x + (w.w || 0) / 2;
  const cy = w.y + (w.h || 0) / 2;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
};

/**
 * Die Aera aus einer Lesung des Auswahlbildschirms.
 *
 * @param ocr        Ergebnis von recognise() - Rahmen der Woerter relativ zum
 *                   Ausschnitt, der Ausschnitt selbst in `region`.
 * @param exclude    Rechtecke in Bildschirmpixeln, deren Woerter nicht
 *                   zaehlen: das eigene Feld und das Overlay-Fenster. Beide
 *                   nennen selbst Aeren und wuerden sich sonst selbst vorlesen.
 * @param allRelics  Wie viele Relikte es ueberhaupt gibt (Droptabellen) - die
 *                   Schwelle fuer "der Bildschirm fuehrt alle".
 * @returns          { tier: 'Lith' … 'Requiem' | 'Omnia' | null, why,
 *                     labels, cards, count }
 */
export function eraFromScreen(ocr, { exclude = [], allRelics = 800 } = {}) {
  const ox = ocr?.region?.x ?? 0;
  const oy = ocr?.region?.y ?? 0;

  const lines = [];
  for (const line of ocr?.lines || []) {
    const words = (line.words || [])
      .map(w => ({ text: String(w.text || ''), x: w.x + ox, y: w.y + oy, w: w.w, h: w.h }))
      .filter(w => !exclude.some(r => r && inside(w, r)));
    if (!words.length) continue;
    lines.push({
      text: words.map(w => w.text).join(' '),
      words,
      x: Math.min(...words.map(w => w.x)),
      y: Math.min(...words.map(w => w.y))
    });
  }

  const labels = [];
  const perEra = {};
  let count = null;
  for (const l of lines) {
    const erstes = norm(l.words[0].text);
    const zweites = l.words[1] ? norm(l.words[1].text) : '';

    /* "COLLECTED 75/202": der Nenner ist die Zahl der Relikte im Bild. Nur
       wenn er stimmen KANN - eine verlesene Ziffer mehr ("75/2020") ergaebe
       sonst "alle Aeren", und das bliebe fuer die ganze Auswahl stehen. */
    if (count == null && /COLLECTED/.test(norm(l.text))) {
      const m = /(\d+)\s*\/\s*(\d+)/.exec(l.text);
      const [hat, von] = m ? [Number(m[1]), Number(m[2])] : [0, 0];
      if (m && von > 0 && hat <= von && von <= allRelics * 1.2) count = von;
      continue;
    }

    if (l.words.length >= 2 && /^ERAS?$/.test(zweites)) {
      const era = ERA_ALL.has(erstes) ? 'Omnia' : eraOf(l.words[0].text);
      if (era) labels.push({ era, text: l.text, x: l.x, y: l.y });
      continue;
    }

    /* Eine Karte: Aera am Anfang und noch etwas dahinter ("Lith GI",
       "Neo Al I 'Relic"). Allein stehend koennte es alles Moegliche sein. */
    const era = l.words.length >= 2 ? eraOf(l.words[0].text) : null;
    if (era) perEra[era] = (perEra[era] || 0) + 1;
  }
  labels.sort((a, b) => a.y - b.y || a.x - b.x);

  const cards = Object.entries(perEra).map(([era, n]) => `${era}×${n}`);
  const shown = { labels: labels.slice(0, 3).map(l => l.text), cards, count };

  if (labels.length) return { tier: labels[0].era, why: `"${labels[0].text}"`, ...shown };

  if (count != null && count > allRelics / 2) {
    return { tier: 'Omnia', why: `the screen lists ${count} relics`, ...shown };
  }

  const eras = Object.entries(perEra).sort((a, b) => b[1] - a[1]);
  if (eras.filter(([, n]) => n >= 2).length >= 2) {
    return { tier: 'Omnia', why: `cards of ${eras.map(([e]) => e).join('/')}`, ...shown };
  }
  if (count != null && eras.length === 1 && eras[0][1] >= 2) {
    return { tier: eras[0][0], why: `${eras[0][1]} ${eras[0][0]} cards, ${count} relics listed`, ...shown };
  }
  return { tier: null, why: 'undecided', ...shown };
}
