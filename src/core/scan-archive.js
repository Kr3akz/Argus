/**
 * Legt zu einer Beweisaufnahme dazu, was Argus dabei gedacht hat.
 *
 * WARUM EIN BILD ALLEIN NICHTS TAUGT:
 *   Ein Ordner voller Bildschirmfotos beantwortet keine einzige Frage. Zu
 *   sehen ist, was dastand - nicht, mit welchem Streifen gesucht wurde, welche
 *   Kartenbreite galt, wie viele Karten erwartet waren und was die Erkennung
 *   daraus gemacht hat. Genau das entscheidet aber, ob ein Fehlschlag am
 *   Ausschnitt lag, an der Geometrie oder an der Erkennung selbst.
 *
 *   Im Protokoll steht das alles - aber `data/argus.log` wird bei JEDEM Start
 *   ueberschrieben (createWriteStream mit flags 'w'). Nach dem naechsten Start
 *   liegt das Bild also ohne jeden Zusammenhang da. Deshalb kommt das
 *   Wichtigste neben das Bild und nicht nur ins Protokoll.
 *
 * WOZU DAS GUT IST, UEBER DIE FEHLERSUCHE HINAUS:
 *   Aus Bild plus Beiblatt wird ein Pruefstueck. Wer die Geometrie aendert -
 *   die Kartenbreite, den Streifen, die Balkensuche -, kann sie gegen echte
 *   Aufnahmen halten statt gegen eine Vermutung. Dafuer fehlt genau eine
 *   Angabe, und die kann Argus nicht wissen: was WIRKLICH dastand. Die traegt
 *   ein Mensch nach, in das Feld `soll`. Bis dahin steht dort null - und
 *   null heisst "noch nicht nachgesehen", nicht "nichts".
 *
 * PLATZ:
 *   Ein Vollbild in 2560x1440 wiegt als PNG rund 7 MB. Ein Abend Spielen mit
 *   eingeschaltetem Schalter fuellt damit schnell ein Gigabyte. Deshalb wird
 *   aufgeraeumt: die juengsten Paare bleiben, aeltere gehen. Wer eine Aufnahme
 *   behalten will, traegt `soll` ein - was ein Beiblatt mit `soll` hat, wird
 *   nie weggeraeumt. Damit entscheidet die Arbeit, die drinsteckt, und nicht
 *   das Alter.
 */
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

/* So viele Paare ohne `soll` bleiben liegen. 30 mal 7 MB sind gut 200 MB -
   genug fuer mehrere Abende, und wenig genug, dass es niemandem auffaellt,
   der den Schalter einmal anlaesst und vergisst. */
const BEHALTEN = 30;

/** Aus dem Bildpfad den Pfad des Beiblatts. */
const beiblattZu = bild => bild.replace(/\.png$/i, '') + '.json';

/**
 * Das Beiblatt schreiben.
 *
 * Wirft nie: eine Buchfuehrung ist kein Grund, einen Durchgang zu stoeren.
 * Liefert den Pfad zurueck, wenn es geklappt hat, sonst null.
 */
export async function archiveScan(bild, daten) {
  if (!bild) return null;
  try {
    const beiblatt = beiblattZu(bild);
    await writeFile(beiblatt, JSON.stringify({
      /* `soll` steht ABSICHTLICH ganz oben: es ist das einzige Feld, das von
         Hand gefuellt wird, und es soll beim Oeffnen ins Auge fallen statt
         hinter dreissig Zeilen Messwerten zu verschwinden. */
      soll: null,
      ...daten,
      bild: path.basename(bild)
    }, null, 2), 'utf8');
    return beiblatt;
  } catch {
    return null;
  }
}

/**
 * Alte Aufnahmen wegraeumen.
 *
 * Gezaehlt wird nach Beiblatt, nicht nach Bild: ein Bild ohne Beiblatt stammt
 * aus einem Durchgang, der vorzeitig abgebrochen ist, und genau das ist ein
 * interessanter Fall - es wird deshalb wie ein frisches Paar behandelt und
 * nicht bevorzugt geloescht.
 */
export async function pruneArchive(ordner, behalten = BEHALTEN) {
  try {
    const namen = await readdir(ordner);
    const bilder = namen.filter(n => /^relikt-.*\.png$/i.test(n));
    if (bilder.length <= behalten) return 0;

    /* Wer `soll` eingetragen hat, hat Arbeit hineingesteckt - das bleibt,
       unabhaengig vom Alter und ohne auf das Kontingent zu zaehlen. */
    const geschuetzt = new Set();
    for (const bild of bilder) {
      try {
        const bei = JSON.parse(await readFile(path.join(ordner, beiblattZu(bild)), 'utf8'));
        if (bei?.soll != null) geschuetzt.add(bild);
      } catch { /* kein oder kaputtes Beiblatt: nicht geschuetzt */ }
    }

    /* Der Name traegt den Zeitstempel (relikt-<lauf>-<ISO>.png), also sortiert
       er auch chronologisch - kein Dateidatum noetig, das beim Kopieren
       verlorenginge. */
    /* Die Grenze gilt fuer die UNGEPRUEFTEN. Geschuetzte zaehlen nicht mit:
       sie sind kein Umlauf, sondern eine Sammlung, und wer dreissig Stueck
       nachgetragen hat, hat sich dreissig Stueck ausgesucht. Waeren sie
       angerechnet, wuerde jedes nachgetragene `soll` den Vorrat an frischen
       Aufnahmen um eins schrumpfen - bis gar nichts Neues mehr liegenbliebe. */
    const wegwerfbar = bilder.filter(b => !geschuetzt.has(b)).sort();
    const zuviel = wegwerfbar.length - behalten;
    if (zuviel <= 0) return 0;

    let weg = 0;
    for (const bild of wegwerfbar.slice(0, zuviel)) {
      for (const datei of [bild, beiblattZu(bild)]) {
        await unlink(path.join(ordner, datei)).catch(() => {});
      }
      weg++;
    }
    return weg;
  } catch {
    return 0;
  }
}
