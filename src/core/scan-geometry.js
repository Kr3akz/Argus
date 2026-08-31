/**
 * Wo die Belohnungskarten auf DIESEM Bildschirm stehen.
 *
 * WARUM ES DIESE DATEI GIBT:
 *   Der Ausschnitt fuer die Texterkennung war bisher ein fester Anteil des
 *   Hauptbildschirms - 0,25 bis 0,68 der Hoehe, ueber die ganze Breite.
 *   Das ist eine SCHAETZUNG, und sie ist grosszuegig, weil sie fuer jede
 *   Aufloesung, jedes Seitenverhaeltnis und jede Oberflaechengroesse passen
 *   muss. 43 % der Bildflaeche werden gelesen, damit 2 % davon reichen.
 *
 *   Enger schaetzen hilft nicht: eine engere Schaetzung ist nur eine engere
 *   Schaetzung, und wo sie danebenliegt, findet der Blick GAR NICHTS - waehrend
 *   der grosszuegige Streifen wenigstens noch etwas liefert.
 *
 *   Also nicht enger schaetzen, sondern MESSEN. Sobald ein Durchgang alle
 *   erwarteten Karten gelesen hat, steht fest, wo sie standen. Diese Geometrie
 *   wird gemerkt und beim naechsten Belohnungsbildschirm zuerst benutzt. Sie
 *   stammt vom Bildschirm des Benutzers und passt damit auf seine Aufloesung,
 *   sein Fenster und seine eingestellte Oberflaechengroesse - ohne dass hier
 *   irgendjemand etwas darueber wissen muesste.
 *
 * WARUM SPALTENWEISE:
 *   Der dokumentierte Fehlermodus ist nicht schlechte Zeichenerkennung, sondern
 *   die Zeilenaufteilung: die Erkennung wirft zwei NEBENEINANDER stehende
 *   Karten in eine Zeile ("Vadarya Prime Receiver Dual Zoren Prime Handle"),
 *   und dann fehlen zwei Namen auf einen Schlag. Der ganze scale-Apparat in
 *   ocr-host.ps1 kaempft dagegen an.
 *
 *   Steht im Ausschnitt nur EINE Karte, kann das nicht mehr passieren. Nicht
 *   weniger wahrscheinlich - unmoeglich. Deshalb schneidet diese Datei die
 *   Kartenreihe in Spalten.
 *
 * DIE ZWEI ZAHLEN, DIE ALLES TRAGEN:
 *   Nachgemessen an data/ocr/ bei 2560x1440 stehen die vier Kartennamen
 *   zentriert auf 794,75 / 1118,25 / 1441,75 / 1765,25 - also im gleichen
 *   Abstand von 323,5 px, und ihre Mitte liegt bei 1280,25. Das ist die
 *   Rahmenmitte auf ein halbes Pixel genau.
 *
 *   Die Reihe ist also im Rahmen ZENTRIERT. Damit braucht es keine linke Kante
 *   und keine Spaltenliste, sondern nur die Kartenbreite und die Anzahl:
 *
 *     Mitte_i = Rahmenmitte + (i - (n-1)/2) * Kartenbreite
 *
 *   Nachgerechnet gegen die Messung liegt das um weniger als ein Pixel daneben.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { dataFile } from './paths.js';

const FILE = () => dataFile('scan-geometry.json');

/* Eine Karte belegt rund 12,6 % der Rahmenbreite - nachgemessen bei 2560x1440
   sind es 323,5 px. Als Anteil ausgedrueckt gilt der Wert auch anderswo.
   Derselbe Wert steht als KARTE_ANTEIL in rewardscan.js; dort traegt er die
   Zuordnung der Schilder, hier den Ausschnitt. */
export const DEFAULT_CARD_WIDTH = 0.1264;

/* Der Streifen, in dem die Namen stehen - Anteil der Rahmenhoehe.
   Nachgemessen: Namen ab y=581 von 1440 (0,4035), und ein ueber drei Zeilen
   umbrechender Name reicht bis etwa y=740 (0,514). Oben und unten ein gutes
   Stueck Luft, weil dies der STANDARD ist: er muss auf einem unvermessenen
   Bildschirm sitzen, und dort ist zu weit besser als zu eng. */
export const DEFAULT_BAND = { top: 0.36, bottom: 0.55 };

/* Der grosszuegige Streifen von frueher. Er bleibt als Rueckfallebene: wo die
   Messung fehlt und der Standard nicht sitzt, hat er bisher funktioniert. */
export const WIDE_BAND = { top: 0.25, bottom: 0.68 };

/* Schranken fuer eine gemerkte Geometrie. Was ausserhalb liegt, ist keine
   Messung, sondern ein Missverstaendnis - und darf den naechsten Durchgang
   nicht in einen leeren Ausschnitt schicken. */
const MIN_CARD_WIDTH = 0.06;
const MAX_CARD_WIDTH = 0.30;
const MIN_BAND_HEIGHT = 0.03;
const MAX_BAND_HEIGHT = 0.45;

/* Luft ueber und unter den gemessenen Namen, als Anteil der Rahmenhoehe.
   Die Messung stammt aus EINEM Durchgang, und im naechsten kann ein laengerer
   Name eine Zeile tiefer reichen. Ein Zehntel Rahmenhoehe waere Verschwendung,
   nichts waere leichtsinnig.

   ACHTUNG, DIESE LUFT REICHT NUR FUER EINE ZUSAETZLICHE ZEILE. Ein Name darf
   ueber drei umbrechen (MAX_LINES_PER_NAME in rewardscan.js), und zwei
   zusaetzliche Zeilen sind bei 1440p rund 106 px - mehr als die 72 px, die
   0,05 hergeben. Den Rest traegt nicht diese Zahl, sondern die Untergrenze in
   recallGeometry; dort steht auch, warum das Band ohne sie nicht mehr
   nachwachsen kann. */
const BAND_PAD_TOP = 0.02;
const BAND_PAD_BOTTOM = 0.05;

/** Ein Bildschirm- oder Fensterformat als Schluessel. */
export function frameKey(frame) {
  return frame ? `${Math.round(frame.w)}x${Math.round(frame.h)}` : 'unbekannt';
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function median(werte) {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Die Kartenbreite aus den Abstaenden der gelesenen Namen.
 *
 * DIE EINE EINSICHT, DIE ALLES TRAEGT: Die Karten stossen aneinander, also ist
 * JEDER Abstand ein ganzzahliges Vielfaches der Kartenbreite. Zwischen zwei
 * benachbarten Karten liegt eine Breite, ueber eine uebersprungene hinweg zwei,
 * ueber zwei hinweg drei.
 *
 * ZWEI SCHAETZER, DIE BEIDE SCHEITERN - und zwar an je einer Haelfte davon:
 *
 *   Math.min traf die Vielfachen richtig (das kleinste Vielfache ist die
 *   Breite), verzerrte aber nach unten: die Abstaende sind Differenzen von
 *   TEXTrahmen-Mitten, OCR-Kanten wackeln um ein paar Pixel, und das Minimum
 *   mehrerer verrauschter Messungen liegt systematisch zu tief. Nachgemessen
 *   sackte die gemerkte Breite darueber von 12,64 % auf 12,3 %.
 *
 *   Der Median war gegen das Rauschen richtig, zerbrach aber an den
 *   Vielfachen: aus den Abstaenden [323, 647] - Karten 1, 2 und 4 gelesen -
 *   macht er 485. Nachgemessen am Lauf #6 vom 30.08. entstand daraus eine
 *   gemerkte Breite von 10,7 %, und das Dock sass sichtbar zu schmal unter
 *   den Karten.
 *
 * RICHTIG IST BEIDES ZUSAMMEN: erst die Vielfachheit jedes Abstands bestimmen,
 * dann herausteilen, dann den Median ueber die entzerrten Werte. Das kleinste
 * Vielfache dient dabei als Massstab - es ist die beste verfuegbare Naeherung,
 * und ein Rundungsfehler darin faellt beim Teilen wieder heraus.
 *
 * null, wenn sich daraus nichts Verlaessliches ergibt - siehe `einheitlich`.
 */
/* Wie weit die gemessene Breite vom Standard abweichen darf. Warframes
   Oberflaechengroesse laesst sich verstellen, also muss Luft bleiben - aber
   das Dreifache ist keine andere Einstellung mehr, sondern ein
   Missverstaendnis. 0,6 bis 1,6 deckt 7,6 bis 20,2 % der Rahmenbreite ab.

   DER ANKER IST BEWUSST DER STANDARD und nicht der zuletzt gemerkte Wert:
   an einem mitwandernden Anker koennte sich der Fehler in kleinen Schritten
   immer weiter fortsetzen, und genau dieses Davonlaufen soll die Schranke ja
   verhindern. */
const PLAUSIBEL_MIN = 0.6;
const PLAUSIBEL_MAX = 1.6;

export function kartenbreiteAus(abstaende, rahmenBreite) {
  if (!abstaende?.length) return null;
  const klein = Math.min(...abstaende);
  if (!(klein > 0)) return null;

  const einheit = median(abstaende.map(d => d / Math.max(1, Math.round(d / klein))));
  if (!einheit) return null;

  /* Jeder Abstand muss zur Einheit passen - siehe einheitlich(). */
  if (!einheitlich(abstaende, einheit)) return null;

  /* UND DIE EINHEIT MUSS EINE KARTENBREITE SEIN KOENNEN.
     Ohne diese Schranke bleibt genau ein Fall offen, und er ist aus den
     Abstaenden allein nicht loesbar: wurden nur die Karten 1 und 4 gelesen,
     gibt es einen einzigen Abstand von drei Kartenbreiten - und ein einzelner
     Abstand ist immer "ein Vielfaches seiner selbst". Auch die Zentrierung
     hilft nicht weiter, denn Karte 1 und 4 liegen symmetrisch zur Mitte und
     sehen damit aus wie eine Zweierreihe aus sehr breiten Karten.
     Was bleibt, ist die Groessenordnung: 970 px sind bei 2560 Rahmenbreite
     achtunddreissig Prozent, und so breit ist keine Karte. */
  if (Number.isFinite(rahmenBreite) && rahmenBreite > 0) {
    const referenz = DEFAULT_CARD_WIDTH * rahmenBreite;
    if (einheit < referenz * PLAUSIBEL_MIN || einheit > referenz * PLAUSIBEL_MAX) return null;
  }
  return einheit;
}

/**
 * Passt die gemessene Einheit zu ALLEN Abstaenden?
 *
 * WOZU: Aus einem EINZELNEN Abstand laesst sich die Kartenbreite nicht
 * gewinnen. Wurden nur die Karten 1 und 4 gelesen, betraegt der Abstand drei
 * Kartenbreiten - und nichts daran verraet, dass es drei sind und nicht eine.
 * Jeder Schaetzer muss hier scheitern, auch der obige; er liefert dann 970
 * statt 323.
 *
 * Solche Faelle sollen nicht gelernt werden. Geprueft wird deshalb, dass jeder
 * Abstand nahe an einem ganzzahligen Vielfachen der Einheit liegt UND dass
 * mindestens einer eine EINFACHE Breite ist - nur dann war ueberhaupt ein
 * benachbartes Kartenpaar dabei, und nur dann ist die Einheit belegt.
 */
export function einheitlich(abstaende, einheit, toleranz = 0.15) {
  if (!abstaende?.length || !einheit) return false;
  let einfache = 0;
  for (const d of abstaende) {
    const k = d / einheit;
    if (Math.abs(k - Math.round(k)) > toleranz) return false;
    if (Math.round(k) === 1) einfache++;
  }
  return einfache > 0;
}

let cache = null;          // { [key]: geometry }, null solange ungelesen

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(FILE(), 'utf8'));
    if (!cache || typeof cache !== 'object') cache = {};
  } catch {
    /* Noch nie gemessen, oder die Datei ist unlesbar geworden. Beides ist
       kein Fehler: dann gilt der Standard, und der naechste vollstaendige
       Durchgang schreibt sie neu. */
    cache = {};
  }
  return cache;
}

function valid(g) {
  if (!g || !g.band) return false;
  const { top, bottom } = g.band;
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return false;
  if (top < 0 || bottom > 1 || bottom <= top) return false;
  const hoehe = bottom - top;
  if (hoehe < MIN_BAND_HEIGHT || hoehe > MAX_BAND_HEIGHT) return false;
  return Number.isFinite(g.cardWidth)
      && g.cardWidth >= MIN_CARD_WIDTH && g.cardWidth <= MAX_CARD_WIDTH;
}

/**
 * Die gemerkte Geometrie fuer diesen Rahmen, oder der Standard.
 *
 * `gemessen` sagt, welche von beiden es wurde - der Aufrufer stellt die
 * Blickweisen danach zusammen und schreibt es ins Protokoll. Ohne diese
 * Unterscheidung waere hinterher nicht zu sagen, ob ein guter Durchgang der
 * Messung zu verdanken war oder dem Zufall.
 */
export async function recallGeometry(frame) {
  const store = await load();
  const treffer = store[frameKey(frame)];
  if (valid(treffer)) {
    return {
      ...treffer,
      /* DAS GEMERKTE BAND DARF DEN STANDARD NACH UNTEN VERLAENGERN, NIE
         VERKUERZEN.

         WARUM: Gemessen wird nur, was gelesen wurde - und gelesen wird nur,
         was im Band stand. Ein Band, das die dritte Zeile eines umgebrochenen
         Namens abschneidet, bekommt deshalb nie einen dreizeiligen Namen zu
         sehen und leitet aus seinen einzeiligen Lesungen dieselbe kurze
         Unterkante wieder ab. Es kann sich nicht mehr aufweiten.

         Nachgemessen an 2560x1440: acht Auffrischungen hintereinander,
         band.top wandert zwischen 0,350 und 0,383, band.bottom steht jedes
         Mal auf 0,4743 - der Unterkante EINER Zeile plus BAND_PAD_BOTTOM.
         Der Kopf dieser Datei nennt 0,514 fuer einen dreizeiligen Namen; das
         Band lag also 57 px darueber und schnitt die letzte Zeile ab.

         Schlimmer als ein fehlender Name ist dabei der beschnittene: faellt
         ein Wort weg, ergibt das bei 154 der 596 Belohnungsnamen einen
         anderen, ebenfalls echten Namen mit Bewertung 1,00 - der Durchgang
         gilt als vollstaendig und zementiert das kurze Band erneut.

         Die Schranke steht auf der LESE-Seite, damit ein bereits verkuerzter
         Eintrag sich beim naechsten Belohnungsbildschirm von selbst heilt und
         nicht erst geloescht werden muss. */
      band: {
        top:    treffer.band.top,
        bottom: Math.max(treffer.band.bottom, DEFAULT_BAND.bottom)
      },
      /* Eintraege aus einer aelteren Fassung kennen die rohe Namenskante noch
         nicht. Statt sie zu verwerfen - die Kartenbreite darin ist ja gut -
         wird die Luft wieder abgezogen, die der Streifen dazubekommen hat. */
      names: treffer.names || {
        top:    treffer.band.top + BAND_PAD_TOP,
        bottom: treffer.band.bottom - BAND_PAD_BOTTOM
      },
      players: treffer.players || 4,
      gemessen: true
    };
  }
  return { cardWidth: DEFAULT_CARD_WIDTH, band: { ...DEFAULT_BAND }, players: 4, gemessen: false };
}

/**
 * Aus einem vollstaendigen Durchgang die Geometrie ableiten und merken.
 *
 * `rewards` traegt Bildschirmkoordinaten in echten Pixeln, `frame` denselben
 * Massstab. Gespeichert werden nur Anteile - so bleibt der Eintrag lesbar,
 * auch wenn jemand die Aufloesung aendert (dann greift er allerdings nicht
 * mehr, weil der Schluessel ein anderer ist; genau das ist gewollt).
 *
 * Gibt die gemerkte Geometrie zurueck, oder null, wenn nichts Brauchbares
 * daraus wurde. Wirft nicht: eine misslungene Messung darf einen gelungenen
 * Durchgang nicht nachtraeglich verderben.
 */
export async function rememberGeometry(frame, rewards, expected) {
  try {
    if (!frame?.w || !frame?.h || !rewards?.length) return null;
    /* Nur aus einem VOLLSTAENDIGEN Durchgang lernen. Aus drei von vier Karten
       liesse sich die Breite zwar auch ablesen, aber der Streifen waere nur so
       hoch wie die drei gelesenen Namen - und die vierte, die eine Zeile
       tiefer umbrach, faende beim naechsten Mal keinen Platz mehr. */
    if (rewards.length < expected) return null;

    const boxes = rewards.map(r => r.box).filter(Boolean);
    if (boxes.length < rewards.length) return null;

    const oben  = (Math.min(...boxes.map(b => b.y)) - frame.y) / frame.h;
    const unten = (Math.max(...boxes.map(b => b.y + b.h)) - frame.y) / frame.h;

    /* Die Kartenbreite ist der Abstand der Mittelpunkte: die Karten stossen
       aneinander. Bei nur einer gelesenen Karte gibt es keinen Abstand - dann
       bleibt es beim Standard, und nur der Streifen wird gemerkt.

       Der Filter haelt Mini-Abstaende draussen. Wird dieselbe Karte zweimal
       gelesen, liegen zwei Mittelpunkte wenige Pixel auseinander, und ein
       ungefiltertes Minimum haette diesen Wert fuer die Kartenbreite gehalten -
       dieselbe Falle, an der panelGeometrie in rewardscan.js schon einmal
       haengengeblieben ist. */
    let cardWidth = DEFAULT_CARD_WIDTH;
    if (boxes.length >= 2) {
      const mitten = boxes.map(b => b.x + b.w / 2).sort((a, b) => a - b);
      const abstaende = mitten.slice(1).map((m, i) => m - mitten[i])
                              .filter(d => d > frame.w * MIN_CARD_WIDTH * 0.9);
      /* Nur lernen, wenn die Abstaende die Einheit auch belegen - siehe
         einheitlich(). Sonst bleibt es beim Standard, und der naechste
         vollstaendige Durchgang misst neu. Eine falsch gemerkte Breite waere
         schlimmer als gar keine: sie schneidet die Spalten zu eng, die engen
         Spalten liefern beschnittene Namen, und deren Rahmen bestaetigen die
         falsche Breite. Genau diese Rueckkopplung hat sie von 12,6 auf 10,7 %
         gezogen. */
      const einheit = kartenbreiteAus(abstaende, frame.w);
      if (einheit) cardWidth = einheit / frame.w;
      /* Sonst bleibt es beim Standard - NICHT bei einer erfundenen Zahl, und
         auch nicht ohne Eintrag: der Streifen darunter ist unabhaengig davon
         gemessen und bleibt wertvoll. Genau so stand es schon fuer den Fall
         "nur eine Karte gelesen" hier. */
    }

    const geometry = {
      cardWidth: clamp(cardWidth, MIN_CARD_WIDTH, MAX_CARD_WIDTH),
      band: {
        top:    clamp(oben - BAND_PAD_TOP, 0, 1),
        /* Dieselbe Untergrenze wie beim Lesen - die Begruendung steht an
           recallGeometry. Sie steht auch hier, damit die Datei und die
           Protokollzeile das Band nennen, das wirklich benutzt wird. */
        bottom: clamp(Math.max(unten + BAND_PAD_BOTTOM, DEFAULT_BAND.bottom), 0, 1)
      },
      /* Die Namenskante OHNE die Luft, die der Streifen oben dazuschlaegt.
         Der Streifen ist zum Lesen da und darf grosszuegig sein; die
         Preisschilder haengen an der echten Unterkante der Namen. Ohne diesen
         Wert saessen sie um die Luft zu tief - und zwar genau dann, wenn sie
         VOR der Erkennung erscheinen sollen und es keine gelesenen Rahmen
         gibt, an denen sie sich ausrichten koennten. */
      names: { top: clamp(oben, 0, 1), bottom: clamp(unten, 0, 1) },
      /* Wie viele Karten die Messung ergeben hat. Dient als Erstannahme fuer
         das Dock, das vor der Erkennung erscheint - die Gruppe bleibt
         zwischen zwei Runden derselben Mission meist dieselbe. */
      players: Math.min(4, Math.max(1, Math.round(expected) || rewards.length)),
      frame: { w: Math.round(frame.w), h: Math.round(frame.h) },
      at: new Date().toISOString()
    };
    if (!valid(geometry)) return null;

    const store = await load();
    store[frameKey(frame)] = geometry;
    await mkdir(path.dirname(FILE()), { recursive: true });
    await writeFile(FILE(), JSON.stringify(store, null, 2), 'utf8');
    return geometry;
  } catch {
    return null;
  }
}

/**
 * Hat sich die Geometrie geaendert, seit sie zuletzt gemerkt wurde?
 *
 * Gebraucht als Verfallsdatum: wer die Oberflaechengroesse im Spiel umstellt,
 * verschiebt die Kartenreihe, und die gemerkten Spalten zeigen ins Leere. Statt
 * das stillschweigend hinzunehmen, wird die Messung dann verworfen und beim
 * naechsten vollstaendigen Durchgang neu genommen.
 */
export function driftedApart(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.cardWidth - b.cardWidth) > 0.02
      || Math.abs(a.band.top - b.band.top) > 0.03;
}

/**
 * Die Ausschnitte fuer die einzelnen Karten - Anteile des Rahmens.
 *
 * Die Spalten stossen aneinander, weil die Karten es auch tun: Spalte i reicht
 * von Mitte_i minus einer halben Kartenbreite bis Mitte_i plus einer halben.
 * Nachgerechnet an der Messung liegt jeder Name mit 15 bis 45 px Rand in
 * seiner Spalte - eng genug, dass der Nachbar draussen bleibt, weit genug,
 * dass der eigene Name vollstaendig drin steht. Weiter darf es auch nicht
 * werden: sonst rutscht der Anfang des Nachbarnamens mit hinein, und genau
 * dagegen sind die Spalten ja da.
 *
 * Sicherheitshalber wird nach beiden Seiten geklemmt: ein zu grosszuegig
 * gemerkter Wert oder eine unerwartete Spielerzahl soll hoechstens einen
 * schlechteren Ausschnitt ergeben, nie einen ungueltigen.
 */
/**
 * Spaltenausschnitte aus dem ableiten, was schon gelesen wurde.
 *
 * WARUM DAS NOETIG IST:
 *   columnCrops setzt die Reihe aus der Zahl der Mitspieler zusammen. Die
 *   kommt aus dem Log - und wenn der Waechter den Bildschirm meldet, gibt es
 *   kein Log: dann wird vier angenommen. Stehen in Wahrheit drei Karten da,
 *   liegt die Reihe um eine halbe Kartenbreite versetzt, und dann faellt JEDE
 *   Karte zwischen zwei Spalten - der Blick, der eigentlich der sicherste
 *   sein soll, findet ausgerechnet dann nichts.
 *
 *   Sobald aber eine einzige Karte gelesen ist, ist das Raten vorbei: die
 *   Karten stossen aneinander, also liegen ihre Nachbarn genau eine
 *   Kartenbreite links und rechts davon. Die Reihe laesst sich von jedem
 *   bekannten Punkt aus fortsetzen.
 *
 * Zurueck kommen hoechstens vier Spalten - mehr Karten gibt es nicht -, und
 * zwar die vier, die der Rahmenmitte am naechsten liegen: die Reihe ist
 * zentriert. Ist gar nichts bekannt, gibt es null, und der Aufrufer bleibt
 * bei dem, was er hatte.
 */
export function columnCropsFrom(frame, rewards, geometry) {
  const boxes = (rewards || []).map(r => r?.box).filter(Boolean);
  if (!frame?.w || !boxes.length) return null;

  const mitten = boxes.map(b => b.x + b.w / 2).sort((a, b) => a - b);

  /* Die Kartenbreite aus den Abstaenden, sonst die gemerkte. Derselbe Filter
     wie in rememberGeometry: zwei Lesungen derselben Karte liegen wenige Pixel
     auseinander und waeren keine Kartenbreite. */
  let breite = clamp(geometry?.cardWidth ?? DEFAULT_CARD_WIDTH,
                     MIN_CARD_WIDTH, MAX_CARD_WIDTH) * frame.w;
  if (mitten.length >= 2) {
    const abstaende = mitten.slice(1).map((m, i) => m - mitten[i])
                            .filter(d => d > frame.w * MIN_CARD_WIDTH * 0.9);
    const einheit = kartenbreiteAus(abstaende, frame.w);
    if (einheit) breite = einheit;
  }

  /* Von jeder bekannten Mitte aus die Reihe nach beiden Seiten fortsetzen.
     Drei Schritte reichen: weiter als drei Karten vom Rand ist keine vierte. */
  const kandidaten = [];
  for (const m of mitten) {
    for (let k = -3; k <= 3; k++) kandidaten.push(m + k * breite);
  }

  /* Was naeher als eine halbe Kartenbreite beieinanderliegt, ist dieselbe
     Spalte - zwei Ausgangspunkte derselben Reihe erzeugen dieselben Schritte. */
  const mitteRahmen = frame.x + frame.w / 2;
  const eindeutig = [];
  for (const c of kandidaten.sort((a, b) => Math.abs(a - mitteRahmen) - Math.abs(b - mitteRahmen))) {
    if (c - breite / 2 < frame.x || c + breite / 2 > frame.x + frame.w) continue;
    if (eindeutig.some(e => Math.abs(e - c) < breite * 0.5)) continue;
    eindeutig.push(c);
    if (eindeutig.length >= 4) break;
  }
  if (!eindeutig.length) return null;

  const band = geometry?.band ?? DEFAULT_BAND;
  return eindeutig
    .sort((a, b) => a - b)
    .map(c => ({
      left:  clamp((c - breite / 2 - frame.x) / frame.w, 0, 1),
      right: clamp((c + breite / 2 - frame.x) / frame.w, 0, 1),
      top: band.top, bottom: band.bottom
    }));
}

export function columnCrops(geometry, count) {
  const n = clamp(Math.round(count) || 4, 1, 4);
  const breite = clamp(geometry?.cardWidth ?? DEFAULT_CARD_WIDTH, MIN_CARD_WIDTH, MAX_CARD_WIDTH);
  const band = geometry?.band ?? DEFAULT_BAND;

  const crops = [];
  for (let i = 0; i < n; i++) {
    const mitte = 0.5 + (i - (n - 1) / 2) * breite;
    const left  = clamp(mitte - breite / 2, 0, 1);
    const right = clamp(mitte + breite / 2, 0, 1);
    /* Eine Spalte, die aus dem Rahmen gerutscht ist, taugt nicht zum Lesen -
       sie wuerde einen Blick kosten und nichts liefern. */
    if (right - left < breite * 0.5) continue;
    crops.push({ left, right, top: band.top, bottom: band.bottom });
  }
  return crops;
}
