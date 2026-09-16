/**
 * Liest das Inventar aus dem laufenden Spielprozess - ohne einen einzigen
 * Netzwerkaufruf an Digital Extremes.
 *
 * WARUM DIESER WEG:
 *   Der bisherige Abruf lieh sich den Session-nonce aus dem Speicher und rief
 *   damit api.warframe.com/api/inventory.php auf. Genau das ist der Punkt, an
 *   dem Argus die Client-Kommunikation gegenueber DEs eigener API nachahmt -
 *   und der einzige, den DE serverseitig sieht (er hat schon eine IP-Drosselung
 *   ausgeloest). Der Client haelt sein Inventar aber ohnehin im Klartext im
 *   Heap. Von dort gelesen entfaellt der Aufruf, der nonce und die Drosselung.
 *
 * WAS GEMESSEN WURDE (2026-09-02, laufender Client):
 *   Im Heap liegen MEHRERE Ausschnitte desselben Dokuments gleichzeitig. Die
 *   meisten sind an beiden Enden mitten im Token abgeschnitten (100-700 KB,
 *   4 bis 13 der gesuchten Felder). Daneben liegt eine vollstaendige Kopie von
 *   rund 1128 KB mit allen 24 Feldern, ueber fuenf Scanlaeufe hinweg stabil.
 *
 *   ZWEI FALLEN, beide real hineingetappt:
 *     - Die vollstaendige Kopie lag an der HOECHSTEN Adresse. Wer beim ersten
 *       Treffer aufhoert, erwischt systematisch die Reste. Deshalb sammelt
 *       findAllPattern alles ein und die Auswahl faellt hier.
 *     - Ein Scan mit Adressobergrenze schneidet sie weg. Kein Bereichsfilter.
 *
 * DIE DRITTE FALLE, gemessen am 2026-09-04 und der Grund fuer LastInventorySync:
 *   "Vollstaendig" und "aktuell" sind ZWEI Eigenschaften, und die Adresslage
 *   sagt nichts ueber die zweite. Im Heap lagen gleichzeitig fuenf Kopien mit
 *   fuenf verschiedenen Staenden; zwei davon vollstaendig, und die AELTERE der
 *   beiden lag hoeher. Der Scan brach dort ab und lieferte ein Dokument, das
 *   2 Stunden alt war, waehrend 3 GB tiefer eine 20 Minuten alte Kopie lag.
 *   Fuer den Leser sah das aus, als zeige Argus verkaufte Teile weiter an -
 *   und kein noch so oft gedruecktes "Fetch inventory" half dagegen.
 *
 *   Der Stand steht IM Dokument: LastInventorySync ist eine MongoDB-ObjectId,
 *   deren erste vier Bytes ein Unix-Zeitstempel sind. Danach wird sortiert.
 *
 *   ES WIRD DESHALB NICHT MEHR FRUEH ABGEBROCHEN - wer die neueste Kopie will,
 *   muss alle gesehen haben. Bezahlt wird das mit dem Regionsfilter statt mit
 *   Zeit: ohne die Asset-Regionen ueber 4 MB sind es 2893 statt 8437 MB, und
 *   der VOLLSTAENDIGE Durchgang lief in 3,3 s - schneller als die 5,8 s, die
 *   der abbrechende Scan vorher ueber den ganzen Heap brauchte.
 *
 * DIE VIERTE FALLE, gemessen am 2026-09-16 - und sie erklaert, warum derselbe
 * Scan auf einem anderen Rechner scheitert, waehrend er hier laeuft:
 *   Im Heap lag EINE EINZIGE Kopie. Nicht fuenf, nicht zehn - eine, 1192 KB,
 *   vollstaendig, in einer 64-KB-Region. Die ganze Auswahl oben hatte genau
 *   einen Kandidaten. Es gibt also keine Reserve: faellt diese eine Kopie
 *   durch den Regionsfilter, findet der Scan nichts.
 *
 *   Und ob sie durchfaellt, ist keine Eigenschaft des Dokuments, sondern der
 *   NACHBARSCHAFT. VirtualQueryEx fasst aneinandergrenzende Seiten gleicher
 *   Schutzklasse zu einer Region zusammen; wie gross die Region um die Kopie
 *   herum gemeldet wird, haengt davon ab, was zufaellig daneben liegt. Auf
 *   einem dichter gepackten Heap - mehr RAM, laengere Sitzung - wachsen
 *   dieselben Bloecke ueber die 4 MB und fallen still heraus. Der Filter ist
 *   damit eine Wette auf die Speicherlage des Entwicklerrechners.
 *
 *   DESHALB EIN NACHSCHLAG: findet der erste Durchgang nichts Brauchbares,
 *   laeuft ein zweiter ueber genau die Regionen, die der erste ausgelassen
 *   hat (minRegion statt maxRegion - kein Byte doppelt). Bezahlt wird er nur
 *   im Fehlerfall, und dort stand bisher gar nichts. findPattern hat diese
 *   Bauart fuer die Account-ID von Anfang an gehabt; hier fehlte sie.
 *
 * DIE FUENFTE FALLE, und sie war die wirkliche Ursache (2026-09-17):
 *   Der Nachschlag half nicht. Aus dem Bericht eines fremden Rechners kam:
 *   Schalter an, Spiel laeuft, 5049 MB gelesen, beide Durchgaenge, 4,1 s -
 *   und NULL Anker. Nicht "in der falschen Region", sondern gar nicht da.
 *
 *   Der Anker war '"InfestedFoundry"', und darin stehen ConsumedSuits, Slots
 *   und Resources: das ist Helminth. Wer das Segment nie gebaut hat, hat den
 *   Schluessel im Dokument nicht - und dann findet kein noch so gruendlicher
 *   Scan etwas. Das Feld stand zu allem Ueberfluss auch in REQUIRED_FIELDS,
 *   die Kopie waere also selbst dann verworfen worden, haette man sie anders
 *   gefunden.
 *
 *   DIESELBE KRANKHEIT WIE DIE DRITTE UND VIERTE FALLE: eine Regel, die an
 *   EINEM Konto auf EINEM Rechner geeicht wurde, als allgemein ausgegeben.
 *   Erst die Adresslage, dann die Regionsgroesse, jetzt der Feldbestand.
 *
 *   Deshalb ZWEI Anker statt einem, beide Skalare, die es ab Kontoerstellung
 *   gibt (siehe ANCHORS) - und die Pflichtliste um alles erleichtert, was ein
 *   Spielfortschritt voraussetzt (siehe REQUIRED_FIELDS).
 *
 * WAS DER SCAN NICHT KANN:
 *   Die Kopie im Heap ist die Abschrift, die der Client zuletzt vom Server
 *   geholt hat - beim Login und bei Zonenwechseln. Wer etwas verkauft, sieht
 *   das erst nach dem naechsten Sync. Die neueste Kopie zu nehmen ist alles,
 *   was von hier aus geht; deshalb reicht der Scan syncedAt nach oben durch,
 *   damit die Oberflaeche das Alter des Dokuments nennen kann statt nur den
 *   Zeitpunkt des Lesens.
 *
 * ANKER:
 *   '"InfestedFoundry"' mit Anfuehrungszeichen. Wenige Treffer im ganzen Heap -
 *   gemessen zwischen EINEM und zehn, je nach Sitzung; siehe die vierte Falle,
 *   der untere Wert ist der gefaehrliche. "RawUpgrades" hat dagegen Dutzende,
 *   "ItemCount" ueber 2500, und die kosten nur Zeit. Ohne Anfuehrungszeichen
 *   traefe man DEs key=value-Konfiguration (InventoryBins={SuitBin={...}}),
 *   die nur Slot-Limits enthaelt.
 *
 * VORAUSSETZUNG:
 *   Ein Zonenwechsel muss stattgefunden haben - Dojo oder Relais und zurueck
 *   aufs Schiff, oder ein frischer Login. Vorher liegt gar kein Inventar im
 *   Heap. Dieselbe Einschraenkung dokumentiert AlecaFrame fuer sich selbst.
 *
 * KEINE ZUGANGSDATEN:
 *   Dieses Modul fasst weder accountId noch nonce an. Es liest ein Dokument,
 *   keine Anmeldedaten. Aus accountid.js kommen nur die Prozesssuche und der
 *   Worker-Start, nichts Vertrauliches.
 */
import { findGameProcessIds, runInWorker } from './accountid.js';

/* DIE ANKER. Siehe Kopf, fuenfte Falle - Anfuehrungszeichen sind Teil des
   Musters, und es sind ZWEI, weil einer ein einzelner Ausfallpunkt war.
   Beide sind Skalare, die es ab Kontoerstellung gibt: Endo und der
   Mastery-Fortschritt. Am 2026-09-17 im laufenden Heap ausgezaehlt - je EIN
   Treffer, und je einmal im Dokument:

     FusionPoints       1 im Heap,    1 im Dokument
     XPInfo             1 im Heap,    1 im Dokument
     InfestedFoundry    1 im Heap,    1 im Dokument   (aber Helminth noetig)
     RegularCredits     3 im Heap,    1 im Dokument
     PlayerLevel      224 im Heap,    1 im Dokument   <- als Anker untauglich
     Upgrades        5146 im Heap,  352 im Dokument   <- voellig untauglich

   Die letzten beiden stehen hier, damit niemand sie fuer eine gute Idee haelt:
   jeder Treffer kostet ein readSpan, und das schreitet bis zu 32 MB ab. */
const ANCHORS = ['"FusionPoints"', '"XPInfo"'];

/* Regionen darueber werden gar nicht erst gelesen: dort liegen Assets, und die
   Inventarkopien lagen ausnahmslos in Bloecken von 64 bis 128 KB. Siehe Kopf -
   das ist es, was den vollstaendigen Durchgang bezahlt. */
const ASSET_REGION = 4n * 1024n * 1024n;

/* Der Stand des Dokuments, nicht der des Lesens.

   LastInventorySync ist eine MongoDB-ObjectId: die ersten acht Hexziffern sind
   ein Unix-Zeitstempel in Sekunden. Das Feld steht genau einmal je Kopie und
   ist damit der einzige Weg, zwei Fundstellen nach Alter zu ordnen.

   ES IST KEINE ANMELDEDATEN-KENNUNG: die ObjectId benennt den Sync-Vorgang im
   Dokument, das Argus ohnehin ganz liest. Die Zusage im Kopf bleibt gueltig. */
function readSyncStamp(text) {
  /* Grosszuegig mit Leerraum: DEs Dokument kommt kompakt, aber eine Regel, die
     an einem Leerzeichen zerbricht, faellt still aus - und der Ausfall saehe
     aus wie "kein Stand vorhanden", nicht wie ein Fehler. */
  const m = /"LastInventorySync"\s*:\s*\{\s*"\$oid"\s*:\s*"([0-9a-f]{24})"/.exec(text);
  if (!m) return null;
  const seconds = parseInt(m[1].slice(0, 8), 16);
  /* Grobe Plausibilitaet: vor 2015 oder in der Zukunft ist es kein Sync,
     sondern ein zufaellig passender Textschnipsel. */
  if (!Number.isFinite(seconds) || seconds < 1420070400) return null;
  const ms = seconds * 1000;
  return ms > Date.now() + 86400000 ? null : ms;
}

/* PFLICHT: ohne diese Felder ist es kein ganzes Dokument.
   XPInfo steht hier, weil die gesamte Mastery-Rechnung daran haengt.

   DIESE LISTE HAT EIN KONTO BESCHRIEBEN UND NICHT ALLE. Sie behauptete von
   sich, nur Felder zu enthalten, "die JEDES Konto hat" - tatsaechlich standen
   fuenf darin, die ein Spielfortschritt voraussetzt:

     InfestedFoundry   braucht das gebaute Helminth-Segment
     Sentinels         wer nie einen Waechter hatte, hat das Feld nicht
     SentinelWeapons   dasselbe
     Upgrades          gerangte Mods; frische Konten haben nur RawUpgrades
     PendingRecipes    die Foundry-Warteschlange, leer wenn nichts baut

   Sie sind nach READ_FIELDS gewandert: weiter gelesen, nur nicht mehr
   verlangt. Die Auswahl bevorzugt ohnehin die Scheibe mit der GROESSTEN
   Feldabdeckung - die kuerzere Pflichtliste senkt also nur die Schwelle, ab
   der eine Kopie verworfen wird, und aendert nichts daran, welche gewinnt.

   Was hier bleibt, ist entweder ein Skalar, den es ab Kontoerstellung gibt,
   oder Ausruestung aus dem Vorspiel (Startwarframe und drei Waffen). */
export const REQUIRED_FIELDS = [
  'Suits', 'LongGuns', 'Pistols', 'Melee',
  'Recipes', 'MiscItems', 'RawUpgrades',
  'RegularCredits', 'PremiumCredits', 'FusionPoints',
  'XPInfo', 'PlayerLevel'
];

/* GELESEN: alles, was irgendein Teil der Anwendung aus dem Inventar holt.
   Nicht als Pflicht gedacht - viele davon fehlen auf jungen Konten voellig.
   Der Zweck ist ein anderer, und er ist scharf:
     Steht ein Name im Rohtext der Scheibe, fehlt aber im geparsten Objekt,
     dann hat die Reparatur ihn gefressen.
   Genau das ist der stille Fehler, gegen den hier geprueft wird - eine
   angeschnittene Scheibe verliert ihr erstes und letztes Feld, und welche das
   sind, haengt vom Schnittpunkt ab. Ohne diese Probe koennte XPInfo
   verschwinden und die Mastery-Anzeige waere lautlos falsch. */
export const READ_FIELDS = [
  ...REQUIRED_FIELDS,
  /* Die fuenf, die aus der Pflichtliste gewandert sind - siehe dort. Gelesen
     werden sie unveraendert; die Auswertung kommt ohne sie aus (helminth.js,
     foundry.js und inventory-items.js fangen sie alle mit `|| []` ab). */
  'Sentinels', 'SentinelWeapons', 'Upgrades', 'PendingRecipes', 'InfestedFoundry',
  'SpaceSuits', 'SpaceGuns', 'SpaceMelee', 'SpaceWeapons', 'Weapons',
  'SpecialItems', 'MechSuits', 'Hoverboards', 'OperatorAmps', 'QuestKeys',
  'Boosters', 'PrimeTokens', 'RawParts', 'PeriodicMissionCompletions',
  'EntratiVaultCountLastPeriod', 'EntratiVaultCountResetDate'
];

/* Haeppchengroesse beim Abschreiten des Textlaufs. KLEIN, und zwar mit Grund:
   ragt ein Lesefenster ueber das Ende der gemappten Region hinaus, kopiert
   Windows gar nichts statt teilweise. Mit 64 KB kostet das den ganzen Rest des
   Laufs - gemessen als Scheiben, die faelschlich 0 Byte lang schienen. Mit
   4 KB kostet eine nicht gemappte Seite nur diese Seite. */
const CHUNK = 4096;

/* Obergrenze je Richtung. Das Dokument misst rund 1 MB; 32 MB sind reichlich
   Luft und verhindern zugleich, dass ein Fehlgriff den Speicher flutet. */
const MAX_SPAN = 32 * 1024 * 1024;

/* Ein Byte gehoert zum Text, wenn es kein Steuerzeichen ist. Bytes >= 128
   zaehlen ausdruecklich dazu: Umlaute in Clan-, Riven- und Spielernamen sind
   Inhalt. Wer nur 32..126 zulaesst, misst bis zum ersten Sonderzeichen. */
const isText = b => b >= 32 || b === 9 || b === 10 || b === 13;

function fail(code, message, extra) {
  return { ok: false, code, message, ...extra };
}

/**
 * Liest den zusammenhaengenden Textlauf um eine Adresse herum.
 *
 * Laeuft ueber Regionsgrenzen hinweg - die Grenzen sind eine Eigenheit der
 * Speicherverwaltung, keine Grenze des Dokuments. Der Lauf endet am ersten
 * Steuerzeichen oder am ersten nicht lesbaren Haeppchen.
 */
function readSpan(procmem, handle, address) {
  const after = [];
  let forward = 0;
  for (let at = address; forward < MAX_SPAN; ) {
    const buf = procmem.readAt(handle, at, CHUNK);
    if (!buf) break;
    let cut = -1;
    for (let i = 0; i < buf.length; i++) {
      if (!isText(buf[i])) { cut = i; break; }
    }
    if (cut >= 0) { after.push(buf.subarray(0, cut)); forward += cut; break; }
    after.push(buf);
    forward += buf.length;
    at += BigInt(buf.length);
    if (buf.length < CHUNK) break;
  }

  const before = [];
  let backward = 0;
  for (let at = address; backward < MAX_SPAN; ) {
    const start = at - BigInt(CHUNK);
    if (start < 0n) break;
    const buf = procmem.readAt(handle, start, CHUNK);
    if (!buf) break;
    let cut = -1;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (!isText(buf[i])) { cut = i; break; }
    }
    if (cut >= 0) {
      const tail = buf.subarray(cut + 1);
      before.unshift(tail);
      backward += tail.length;
      break;
    }
    before.unshift(buf);
    backward += buf.length;
    at = start;
    if (buf.length < CHUNK) break;
  }

  return {
    text: Buffer.concat([...before, ...after]).toString('latin1'),
    start: address - BigInt(backward),
    backward,
    forward
  };
}

/**
 * Ein Durchgang durch den Text: auf welcher Klammertiefe stehen die gesuchten
 * Felder, und wo liegen dort die Kommas?
 *
 * WARUM DIE TIEFE GEMESSEN UND NICHT ANGENOMMEN WIRD:
 *   Ist der Anfang abgeschnitten, fehlen die oeffnenden Klammern und der
 *   Zaehler startet mitten im Dokument - die oberste Ebene liegt dann bei einer
 *   negativen Tiefe, deren Wert vom Schnittpunkt abhaengt. Statt zu raten,
 *   messen wir, auf welcher Tiefe die bekannten Feldnamen stehen; die haeufigste
 *   ist die oberste Ebene.
 *
 * Zeichenketten werden uebersprungen, sonst zaehlt eine Klammer in einem
 * Item-Pfad mit.
 */
function analyseDepth(text, fields) {
  /* Erst die Fundstellen der Feldnamen sammeln, damit der Durchgang nur
     nachschlagen muss statt 24 Vergleiche je Zeichen anzustellen. */
  const marks = new Map();
  for (const field of fields) {
    const needle = `"${field}":`;
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
      marks.set(i, field);
    }
  }

  const depthCount = new Map();     // Tiefe -> wie viele Feldnamen dort stehen
  const commas = new Map();         // Tiefe -> { first, last }
  let depth = 0, inStr = false, esc = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (esc) { esc = false; continue; }
    if (c === '\\') { if (inStr) esc = true; continue; }

    if (c === '"') {
      /* Der Feldname beginnt AM Anfuehrungszeichen - die Tiefe hier ist die,
         auf der das Feld steht. */
      if (!inStr && marks.has(i)) {
        depthCount.set(depth, (depthCount.get(depth) || 0) + 1);
      }
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;

    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ',') {
      const seen = commas.get(depth);
      if (seen) seen.last = i;
      else commas.set(depth, { first: i, last: i });
    }
  }

  /* Die oberste Ebene ist die NIEDRIGSTE Tiefe, auf der Feldnamen stehen -
     nicht die haeufigste.
     Der Unterschied ist der ganze Unterschied: "Suits", "LongGuns", "Pistols"
     und "Melee" stehen in JEDEM Loadout-Preset noch einmal, verschachtelt und
     damit vielfach oefter als das eine Vorkommen auf oberster Ebene. Die
     Haeufigkeit zeigt also auf die Presets, nicht auf das Dokument. Gemessen
     an einer vorn angeschnittenen Scheibe schnitt die Reparatur dadurch ein
     Stueck heraus, das nach 682 Zeichen zu Ende war.
     Verlangt werden zwei Vorkommen, damit ein einzelner Ausreisser die Ebene
     nicht nach unten zieht; gibt es die nicht, zaehlt die niedrigste Tiefe
     ueberhaupt. */
  let topDepth = null, fieldsAtTop = 0;
  for (const [d, n] of depthCount) {
    if (n < 2) continue;
    if (topDepth === null || d < topDepth) { topDepth = d; fieldsAtTop = n; }
  }
  if (topDepth === null) {
    for (const [d, n] of depthCount) {
      if (topDepth === null || d < topDepth) { topDepth = d; fieldsAtTop = n; }
    }
  }
  return { topDepth, fieldsAtTop, commas };
}

/**
 * Macht aus dem Textlauf ein parsbares Objekt.
 *
 * Der Normalfall ist ein an beiden Enden angeschnittenes Dokument. Repariert
 * wird, indem vom ersten bis zum letzten Komma der obersten Ebene geschnitten
 * und in Klammern gefasst wird: dazwischen stehen ausschliesslich vollstaendige
 * Felder. Verloren geht hoechstens das angeschnittene erste und letzte - und ob
 * darunter ein gebrauchtes war, sagt die Vollstaendigkeitspruefung danach.
 */
function parseSpan(text, fields) {
  if (text.startsWith('{')) {
    try {
      return { data: JSON.parse(text), repaired: false, note: 'complete' };
    } catch {
      /* Vorne heil, hinten abgeschnitten - unten weiterreparieren. */
    }
  }

  const { topDepth, fieldsAtTop, commas } = analyseDepth(text, fields);
  if (topDepth === null) {
    return { data: null, repaired: false, note: 'no field found in span' };
  }
  const bounds = commas.get(topDepth);
  if (!bounds || bounds.first >= bounds.last) {
    return { data: null, repaired: false, note: `no usable commas at depth ${topDepth}` };
  }

  const candidate = '{' + text.slice(bounds.first + 1, bounds.last) + '}';
  try {
    return {
      data: JSON.parse(candidate),
      repaired: true,
      note: `repaired at depth ${topDepth} (${fieldsAtTop} fields), `
          + `dropped ${bounds.first + 1} bytes head, ${text.length - bounds.last} bytes tail`
    };
  } catch (e) {
    return { data: null, repaired: true, note: 'repair did not parse: ' + e.message };
  }
}

/** Wie viele der gesuchten Felder stehen als Schluessel im Text? */
function countFields(text, fields) {
  const found = [];
  for (const field of fields) {
    if (text.includes(`"${field}":`)) found.push(field);
  }
  return found;
}

/**
 * Was die Reparatur unterwegs verloren hat.
 *
 * Steht ein Name im Rohtext, fehlt aber im geparsten Objekt, dann lag er in
 * dem angeschnittenen Stueck, das vorn oder hinten weggeschnitten wurde. Das
 * ist der einzige Weg, diesen Verlust zu bemerken - die Pflichtliste faengt
 * ihn nicht, weil sie absichtlich kurz ist.
 */
function lostInRepair(text, data) {
  return READ_FIELDS.filter(f => text.includes(`"${f}":`) && !(f in data));
}

/**
 * Wie scanInventory(), aber in einem Worker-Thread.
 *
 * Der Scan laeuft rund zehn Sekunden am Stueck und wuerde das Fenster genauso
 * lange einfrieren. Aus dem Hauptprozess IMMER diesen Weg nehmen.
 */
export function scanInventoryInWorker({ maxSeconds = 180, timeoutMs = 240000,
                                        wide = true } = {}) {
  return runInWorker({ job: 'inventory', options: { maxSeconds, wide } }, timeoutMs);
}

/**
 * Sucht das Inventar im laufenden Spiel und liefert es geparst.
 *
 * BLOCKIERT mehrere Sekunden - aus dem Hauptprozess ueber
 * scanInventoryInWorker() aufrufen, nicht direkt.
 */
export async function scanInventory({ maxSeconds = 120, keepText = false,
                                      wide = true } = {}) {
  const procmem = await import('./procmem.js').catch(() => null);
  if (!procmem) return fail('koffi_missing', 'The memory module could not be loaded.');
  if (!procmem.isSupported()) {
    return fail('unsupported', 'Reading the inventory needs Windows (64 bit).');
  }

  const pids = await findGameProcessIds();
  if (!pids.length) {
    return fail('no_process', 'Warframe is not running. Start the game and log in.');
  }

  const started = Date.now();

  /* EIN Zeitbudget fuer BEIDE Durchgaenge, nicht eines je Durchgang.
     Sonst stuende hier im schlimmsten Fall die doppelte Zeit - und der Worker
     darueber bricht nach timeoutMs ab, ohne dass irgendjemand erfaehrt, woran
     es lag. Der Nachschlag bekommt also, was der erste uebriggelassen hat. */
  const deadline = started + maxSeconds * 1000;
  const restSeconds = () => (deadline - Date.now()) / 1000;

  let lastError = null;

  for (const pid of pids) {
    let handle = null;
    try {
      handle = procmem.openProcess(pid);

      const candidates = [];
      const passes = [];

      /* Ein Durchgang ueber eine Auswahl von Regionen.

         Jede Fundstelle wird sofort ausgemessen, geparst wird sie erst in
         select() - eine Scheibe kann alle Feldnamen tragen und sich trotzdem
         nicht zusammensetzen lassen, und das kostet Zeit, die der Scan noch
         braucht.

         KEIN FRUEHER ABBRUCH - siehe Kopf, dritte Falle. Wer die neueste Kopie
         will, muss alle gesehen haben; ein Durchgang, der beim ersten heilen
         Fund aufhoert, nimmt die erstbeste statt der aktuellsten. Deshalb
         liefert onHit immer false.

         Groesse taugt uebrigens nicht als Mass: eine lange Scheibe kann mitten
         im Dokument liegen und die Haelfte der Felder verfehlen. */
      const sweep = (label, opts) => {
        const before = candidates.length;
        let doppelt = 0;
        const scan = procmem.findAllPattern(handle, ANCHORS, {
          limit: 64, maxSeconds: restSeconds(), ...opts,
          onHit: (address, anchor) => {
            /* ZWEI ANKER HEISST ZWEI TREFFER IN DERSELBEN KOPIE.
               "FusionPoints" und "XPInfo" stehen beide im Dokument, also meldet
               dieselbe Scheibe sich zweimal. Sie ein zweites Mal abzuschreiten
               kostet noch einmal 1,2 MB Lesen und einen zweiten JSON-Durchlauf,
               und im Protokoll staende sie doppelt.
               Der Treffer liegt IN einer bekannten Scheibe: verworfen, bevor
               readSpan ueberhaupt laeuft. */
            for (const c of candidates) {
              if (address >= c.start && address < c.end) { doppelt++; return false; }
            }

            const span = readSpan(procmem, handle, address);
            if (!span.text.length) return false;
            candidates.push({
              address,
              anchor,
              /* Die Grenzen der Scheibe, fuer die Pruefung oben. */
              start: span.start,
              end: span.start + BigInt(span.text.length),
              fields: countFields(span.text, REQUIRED_FIELDS),
              syncedAt: readSyncStamp(span.text),
              bytes: span.text.length,
              backward: span.backward,
              forward: span.forward,
              text: span.text
            });
            return false;                  // weitersuchen, es kann Neueres kommen
          }
        });
        const found = candidates.length - before;
        passes.push({
          pass: label,
          regions: scan.regions,
          megabytes: Math.round(scan.bytes / 1048576),
          anchors: scan.addresses.length,
          spans: found,
          /* Treffer, die in einer schon bekannten Scheibe lagen. Steht im
             Bericht, weil "8 Anker, 2 Scheiben" sonst wie ein Fehler aussieht
             und in Wahrheit heisst: beide Anker haben in vier Kopien
             gegriffen, wie sie sollen. */
          dupes: doppelt,
          seconds: Number(scan.seconds.toFixed(1)),
          timedOut: Boolean(scan.timedOut)
        });
        return found;
      };

      const baseStats = () => ({
        /* Je Durchgang eine Zeile - erst daran ist abzulesen, ob der
           Nachschlag ueberhaupt gelaufen ist und was er gekostet hat. */
        passes,
        /* Damit der Bericht "11/12" schreiben kann statt einer fest
           eingebauten Zahl - die Pflichtliste ist schon einmal kuerzer
           geworden, und dann log das Protokoll. */
        requiredFields: REQUIRED_FIELDS.length,
        candidates: candidates.map(c => ({
          address: '0x' + c.address.toString(16).toUpperCase(),
          anchor: c.anchor || null,
          kilobytes: Math.round(c.bytes / 1024),
          fields: c.fields.length,
          syncedAt: c.syncedAt || null
        })),
        stoppedEarly: false,
        regions: passes.reduce((n, p) => n + p.regions, 0),
        megabytes: passes.reduce((n, p) => n + p.megabytes, 0),
        seconds: Number(((Date.now() - started) / 1000).toFixed(1))
      });

      const describe = (cand, parsed, attempted, missing) => ({
        ...baseStats(),
        chosen: {
          address: '0x' + cand.address.toString(16).toUpperCase(),
          kilobytes: Math.round(cand.bytes / 1024),
          backward: cand.backward,
          forward: cand.forward,
          startsWithBrace: cand.text.startsWith('{'),
          syncedAt: cand.syncedAt || null
        },
        fieldsInSpan: cand.fields.length,
        repaired: parsed.repaired,
        note: parsed.note,
        attempts: attempted,
        ...(missing ? { missing } : {})
      });

      /* DIE REIHENFOLGE IST DER FIX.

         Erst die Feldabdeckung: eine Scheibe ohne Pflichtfelder ist unbrauchbar,
         wie frisch sie auch sei. Dann der Stand - das ist die Achse, die vorher
         ganz fehlte und die Adresslage als Ersatz hatte. Groesse bleibt als
         letzte Entscheidungshilfe.

         Eine Scheibe OHNE lesbaren Stempel steht hinter jeder mit: sie ist
         angeschnitten oder alt genug, dass das Feld fehlt - in beiden Faellen
         ist sie die schlechtere Wahl, wenn es eine datierte Alternative gibt.

         JEDE Fundstelle wird danach der Reihe nach durchprobiert - die erste,
         die alle Proben besteht, gewinnt. Weil die Liste nach Stand sortiert
         ist, ist das die neueste brauchbare Kopie und nicht die erstbeste.
         Die Gruende werden dabei gesammelt, damit im Fehlerfall dasteht,
         woran es lag.

         WIRD ZWEIMAL AUFGERUFEN, wenn der Nachschlag laeuft: dann ueber die
         VEREINIGUNG beider Durchgaenge, damit die Sortierung auch ueber die
         Grenze der beiden Durchgaenge hinweg gilt. parseSpan haengt deshalb am
         Kandidaten und nicht an dieser Funktion - sonst wuerde jede Scheibe
         aus dem ersten Durchgang ein zweites Mal geparst. */
      const select = () => {
        candidates.sort((a, b) =>
          b.fields.length - a.fields.length
          || (b.syncedAt || 0) - (a.syncedAt || 0)
          || b.bytes - a.bytes);

        const attempted = [];
        let lastAttemptError = null;

        for (const cand of candidates) {
          if (!cand.parsed) cand.parsed = parseSpan(cand.text, READ_FIELDS);
          const parsed = cand.parsed;
          const address = '0x' + cand.address.toString(16).toUpperCase();

          if (!parsed.data) {
            attempted.push({ address, result: parsed.note });
            lastAttemptError = fail('unparsable', 'The inventory span could not be parsed.',
                                    { stats: describe(cand, parsed, attempted),
                                      text: keepText ? cand.text : undefined });
            continue;
          }

          /* Vollstaendigkeit gegen die geparsten Schluessel pruefen, nicht gegen
             den Rohtext: ein Feldname kann im Text stehen und beim Reparieren
             trotzdem weggefallen sein. Ein halbes Inventar ist schlechter als
             keins - der Aufrufer soll dann den Zwischenspeicher behalten. */
          const missing = REQUIRED_FIELDS.filter(f => !(f in parsed.data));
          if (missing.length) {
            attempted.push({ address, result: `missing ${missing.length}: ${missing.join(', ')}` });
            lastAttemptError = fail('incomplete',
              `Inventory is missing ${missing.length} field(s): ${missing.join(', ')}`,
              { stats: describe(cand, parsed, attempted, missing), inventory: parsed.data });
            continue;
          }

          /* Und die zweite Probe: hat die Reparatur ein Feld gefressen, das im
             Rohtext noch stand? Dann ist die Scheibe unbrauchbar, auch wenn alle
             Pflichtfelder ueberlebt haben. */
          const lost = lostInRepair(cand.text, parsed.data);
          if (lost.length) {
            attempted.push({ address, result: `repair dropped: ${lost.join(', ')}` });
            lastAttemptError = fail('incomplete',
              `The repair dropped ${lost.length} field(s) that were present: ${lost.join(', ')}`,
              { stats: describe(cand, parsed, attempted, lost) });
            continue;
          }

          attempted.push({ address, result: 'ok' });
          return {
            ok: true, inventory: parsed.data,
            /* Der Stand des Dokuments, nicht der des Lesens - die Oberflaeche
               kann damit sagen, wie alt das Inventar wirklich ist. */
            syncedAt: cand.syncedAt || null,
            stats: describe(cand, parsed, attempted, []),
            text: keepText ? cand.text : undefined
          };
        }

        return lastAttemptError
            || fail('not_found',
                    'No inventory found in memory. Travel to a relay or your dojo and back '
                  + 'to your ship, then try again.',
                    { stats: baseStats() });
      };

      /* ERSTER DURCHGANG: die kleinen Regionen. Der Normalfall, und der
         guenstige - siehe ASSET_REGION. */
      sweep('small regions (<= 4 MB)', { maxRegion: ASSET_REGION });
      let outcome = select();

      /* NACHSCHLAG, und der Grund dafuer ist gemessen (2026-09-16):
         Im Heap lag EINE EINZIGE Kopie. Nicht fuenf, nicht zehn - eine. Die
         ganze Auswahl oben hatte genau einen Kandidaten, und der lag zufaellig
         in einer 64-KB-Region. Damit steht und faellt der Scan mit der Frage,
         ob ASSET_REGION diese eine Kopie durchlaesst.

         Und das ist keine Eigenschaft des Dokuments, sondern der Nachbarschaft:
         VirtualQueryEx fasst ANEINANDERGRENZENDE Seiten gleicher Schutzklasse
         zu EINER Region zusammen. Wie gross die Region um die Kopie herum
         gemeldet wird, haengt also davon ab, was zufaellig daneben liegt. Auf
         einem dichter gepackten Heap - mehr RAM, laengere Sitzung - wachsen
         dieselben Bloecke ueber die 4 MB hinaus und fallen still heraus.

         Der Nachschlag liest deshalb genau das, was der erste ausgelassen hat:
         minRegion statt maxRegion, kein Byte doppelt. Nachgemessen teilt das
         exakt auf - 26273 + 196 = 26469 Regionen, 3161 + 5012 = 8173 MB, keine
         Ueberschneidung, nichts verfehlt. Genau dieselbe Bauart hat findPattern
         fuer die Account-ID schon immer gehabt; dem Inventar-Scan fehlte sie.

         WARUM ER NICHT IMMER LAEUFT (`wide`):
           Er kostet echtes Geld - 5012 MB in 32,7 s gemessen, und das sind
           ueberwiegend ausgelagerte Asset-Regionen, die dabei in den
           Arbeitsspeicher zurueckgeholt werden. Auf Kosten des laufenden
           Spiels. Einmal auf Knopfdruck ist das in Ordnung; alle drei Minuten
           im Hintergrund waehrend einer Farmrunde nicht.
           Deshalb: wer selbst auf "Fetch inventory" drueckt, bekommt den
           Nachschlag. Der Auto-Sync bleibt beim guenstigen Durchgang. Welche
           Durchgaenge gelaufen sind, steht im Scan-Protokoll - wenn der
           Nachschlag dort regelmaessig das Ergebnis liefert, ist ASSET_REGION
           auf dieser Maschine schlicht falsch gewaehlt. */
      if (!outcome.ok && wide && restSeconds() > 1) {
        /* OHNE OBERGRENZE, und das ist eine Korrektur: heapRegions deckelt von
           sich aus bei 128 MB, also lief der "vollstaendige" Nachschlag bis
           hierher an einem toten Winkel vorbei. Nachgemessen am 2026-09-17
           lagen dort 2024 MB in fuenf privaten, beschreibbaren Regionen - von
           17433 MB committed sahen beide Durchgaenge zusammen nur 10137 MB.
           Siehe REGION_NO_LIMIT in procmem.js. */
        if (sweep('large regions (> 4 MB)',
                  { minRegion: ASSET_REGION + 1n, maxRegion: procmem.REGION_NO_LIMIT })) {
          outcome = select();
        }
      }

      if (outcome.ok) return outcome;
      lastError = outcome;
      continue;
    } catch (e) {
      lastError = fail(e.code || 'scan_failed', e.message, { detail: e.detail });
    } finally {
      if (handle) procmem.closeHandle(handle);
    }
  }

  return lastError || fail('not_found', 'No inventory found in memory.');
}
