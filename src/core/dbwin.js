/**
 * Der Draht zum Windows-Debugkanal (src/core/dbwin-worker.js).
 *
 * WOZU DAS DA IST:
 *   Warframe schreibt EE.log traege. Nachgemessen kamen "Got rewards" und
 *   "Relic reward screen shut down" 15 Sekunden Spielzeit auseinander, aber
 *   1 Millisekunde auseinander in der Datei - wer nur auf die Datei hoert,
 *   erfaehrt vom Belohnungsbildschirm erst, wenn er schon zu ist.
 *
 *   Dieselben Zeilen gibt das Spiel gleichzeitig ueber OutputDebugString aus,
 *   und die kommen SOFORT an. Nachgemessen an einer 238-Sekunden-Sitzung: der
 *   Abstand zwischen unserer Uhr und Warframes eigener blieb ueber 234
 *   Sekunden auf 2 ms konstant. Bei Pufferung wuerde er in Spruengen wandern.
 *
 * WAS DAS DEN DATEIWEG NICHT ERSETZT:
 *   Es kann systemweit nur EINEN Zuhoerer geben. Laeuft DebugView, Overwolf
 *   oder ein anderes Begleitwerkzeug, ist der Platz belegt und hier kommt
 *   nichts an - still. Der Dateiwaechter bleibt deshalb bestehen, und wer
 *   beide Quellen zusammenfuehrt, muss doppelte Zeilen erwarten.
 *
 * WAS ES DAS SPIEL KOSTET:
 *   OutputDebugString WARTET auf den Zuhoerer. Nachgemessen: ohne Zuhoerer
 *   3,3 us je Zeile, mit Zuhoerer rund 15 us, davon 3 us auf unserer Seite -
 *   der Rest ist Windows' eigener Handshake. Bei der beobachteten Rate von
 *   groessenordnungsmaessig 50 Zeilen je Sekunde sind das 0,7 ms je Sekunde.
 *   Gefaehrlich ist nicht der Mittelwert, sondern ein Aussetzer: wird der
 *   Arbeiter angehalten, wartet das Spiel die Pause mit. Deshalb laeuft er in
 *   einem eigenen Thread, und deshalb steht im heissen Pfad dort nichts
 *   ausser Herauskopieren und Freigeben.
 *
 * PRIVATSPHAERE:
 *   Der Kanal ist systemweit - hier kaeme die Debugausgabe JEDES Programms an.
 *   Der Arbeiter verwirft alles, was nicht von einer gemeldeten
 *   Warframe-Prozessnummer stammt, noch bevor daraus Text wird. Solange keine
 *   Nummer bekannt ist, geht gar nichts hinaus. Wer setPids nie aufruft,
 *   bekommt nie eine Zeile.
 */
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Belegung des gemeinsamen Steuerspeichers, in Int32-Feldern.
 *
 * HIER steht sie, und nur hier: der Arbeiter bekommt sie beim Start gereicht,
 * statt eine eigene Kopie zu fuehren. Zwei Kopien einer Speicherbelegung
 * laufen irgendwann auseinander, und der Fehler waere dann kein Absturz,
 * sondern ein falsch gelesenes Feld.
 */
const BELEGUNG = Object.freeze({
  stop: 0,          // 1 = bitte beenden
  pidAnzahl: 1,     // wie viele Nummern gelten
  pidAb: 2          // ab hier die Nummern selbst
});

/* Mehr Warframe-Prozesse als das hat niemand gleichzeitig offen. Die Schranke
   ist noetig, weil der Arbeiter diese Liste bei JEDER Zeile durchlaeuft. */
const MAX_PIDS = 8;
const STEUER_LAENGE = BELEGUNG.pidAb + MAX_PIDS;

/* So lange wird auf das Ende des Arbeiters gewartet, bevor er abgeraeumt wird.
   Ein Warteruf haelt hoechstens 200 ms, also ist alles darueber ein Haenger. */
const ENDE_TIMEOUT_MS = 1500;

let worker = null;
let steuer = null;
let aktiv = false;
let belegtGemeldet = false;
let endeVersprechen = Promise.resolve();

/* Die zuletzt gemeldeten Prozessnummern.
 *
 * WARUM SIE HIER LIEGEN UND NICHT NUR IM GEMEINSAMEN SPEICHER: der Aufrufer
 * meldet sie nur bei AENDERUNG - alles andere waere eine Protokollzeile je
 * Minute. Dadurch haengt aber alles an dem einen Aufruf: kommt er, bevor der
 * gemeinsame Speicher steht, oder faellt der Arbeiter aus und wird neu
 * gestartet, kaeme nie wieder eine Nummer an, und der Kanal bliebe fuer immer
 * stumm. Gemerkt laesst sich das jederzeit nachholen. */
let letztePids = [];

/** Laeuft der Draht gerade und hat sich angemeldet? */
export function isActive() {
  return aktiv;
}

/** Hat sich beim Anmelden ein anderer Zuhoerer gezeigt? */
export function otherListener() {
  return belegtGemeldet;
}

/**
 * Welche Prozesse gelten als Warframe.
 *
 * Darf jederzeit aufgerufen werden, auch waehrend der Arbeiter laeuft: er
 * liest die Liste bei jeder Zeile frisch aus dem gemeinsamen Speicher. Eine
 * Nachricht waere hier NICHT moeglich - seine Schleife ist synchron und
 * bearbeitet keinen Ereignisumlauf.
 */
export function setPids(pids) {
  const liste = [...new Set((pids || []).map(Number).filter(Number.isInteger))].slice(0, MAX_PIDS);
  letztePids = liste;
  if (!steuer) return;
  /* Erst die Nummern, dann die Anzahl: der Arbeiter liest ohne Sperre, und in
     dieser Reihenfolge sieht er nie eine Anzahl, zu der die Nummern noch
     fehlen. Andersherum koennte er kurz eine alte Nummer als gueltig lesen. */
  for (let i = 0; i < liste.length; i++) steuer[BELEGUNG.pidAb + i] = liste[i];
  Atomics.store(steuer, BELEGUNG.pidAnzahl, liste.length);
}

/**
 * Den Arbeiter starten.
 *
 * onLines bekommt Buendel von Zeilen, nicht einzelne: ueber die Threadgrenze
 * je Zeile zu gehen waere bei Ladevorgaengen die teuerste Stelle im ganzen
 * Weg. Die Zeilen sind bereits von Zeilenenden befreit und nach
 * Prozessnummer gefiltert.
 */
export function start(onLines, { onError } = {}) {
  if (worker) return;
  if (process.platform !== 'win32') return;

  steuer = new Int32Array(new SharedArrayBuffer(STEUER_LAENGE * 4));

  worker = new Worker(path.join(__dirname, 'dbwin-worker.js'), {
    workerData: { steuerPuffer: steuer.buffer, belegung: BELEGUNG }
  });

  let fertig;
  endeVersprechen = new Promise(r => { fertig = r; });

  worker.on('message', m => {
    switch (m.type) {
      case 'ready':
        aktiv = true;
        belegtGemeldet = !!m.belegt;
        /* Was vor der Anmeldung gemeldet wurde, jetzt nachreichen. Ohne das
           haengt es an der Reihenfolge zweier unabhaengiger Vorgaenge, ob der
           Kanal je eine Zeile durchlaesst. */
        if (letztePids.length) setPids(letztePids);
        console.log('[DBWIN] angemeldet'
          + ` - Spielprozesse: ${letztePids.join(', ') || 'noch keine gemeldet'}`
          + (m.belegt ? ' | ACHTUNG, ein anderes Programm hoert ebenfalls mit' : '')
          + (m.fremd ? ' (DBWinMutex gehoert einem anderen Prozess)' : ''));
        break;
      case 'lines':
        onLines?.(m.lines);
        break;
      case 'error':
        console.log('[DBWIN] ' + m.message);
        onError?.(m.message);
        break;
      case 'stopped':
        break;
    }
  });

  worker.on('error', err => {
    console.log('[DBWIN] Arbeiter abgestuerzt:', String(err));
    aktiv = false;
    onError?.(String(err));
  });

  worker.on('exit', () => {
    worker = null;
    steuer = null;
    aktiv = false;
    fertig();
  });

  /* Der Arbeiter darf Electron nicht am Beenden hindern. Kommt stop() nicht
     mehr dazu, geht er mit dem Prozess. */
  worker.unref();
}

/**
 * Den Arbeiter beenden.
 *
 * Der Wunsch geht ueber den gemeinsamen Speicher und nicht ueber eine
 * Nachricht: die Schleife dort ist synchron und wuerde eine Nachricht nie
 * abholen. Bemerkt wird er spaetestens nach einem Warteruf, also 200 ms.
 */
export async function stop() {
  if (!worker || !steuer) return;
  Atomics.store(steuer, BELEGUNG.stop, 1);

  /* Dieser Wecker wird NICHT abgekoppelt. Der Arbeiter ist es (er darf
     Electron nicht am Beenden hindern), und damit haelt waehrend des
     Herunterfahrens sonst nichts mehr den Ereignisumlauf am Leben: Node
     entschiede, es gebe nichts mehr zu tun, und liesse dieses Warten ewig
     offen stehen. Genau das ist im Test passiert. */
  const abgelaufen = new Promise(r => setTimeout(r, ENDE_TIMEOUT_MS));
  await Promise.race([endeVersprechen, abgelaufen]);

  /* Haengt er trotzdem - etwa in einem Warteruf, der nicht zurueckkommt -,
     dann hilft nur noch das harte Ende. Ein Arbeiter, der den Kanal weiter
     besetzt haelt, waere schlimmer als einer, der abgeschnitten wird. */
  if (worker) {
    await worker.terminate().catch(() => {});
  }
}
