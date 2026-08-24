/**
 * Die Freiland-Zyklen - gerechnet statt abgefragt.
 *
 * WARUM NICHT AUS DER API:
 *   warframestat.us liefert regelmaessig stundenalte Staende. Bei Rissen faellt
 *   das auf und wird aufgefangen (leere Liste -> tenno.tools). Bei den Zyklen
 *   fiel es NICHT auf: der Stand meldet brav "Tag" und ein Ablaufdatum, das
 *   seit Stunden vorbei ist. Die Anzeige stand dann auf "jetzt" und blieb
 *   dort stehen. Nachgemessen am 24.08.2026: die Quelle lag 360 Minuten
 *   zurueck, alle drei Zyklen abgelaufen.
 *
 *   Abfragen ist hier aber ohnehin der Umweg. Tag und Nacht auf Cetus laufen
 *   seit 2017 nach einer festen Uhr weiter - kein Server entscheidet das,
 *   nichts daran ist zufaellig. Wer die Uhr kennt, braucht niemanden zu
 *   fragen, und die Anzeige stimmt auch dann noch, wenn gar keine Verbindung
 *   besteht.
 *
 * WOHER DIE KONSTANTEN KOMMEN:
 *   Aus dem daynight-Block von api.tenno.tools/worldstate - dort stehen sie
 *   als Definition (Epoche, Periode, Phasengrenzen), nicht als Momentaufnahme.
 *   Die Laengen sind KEINE runden Zahlen: Cetus laeuft auf 8998.8748 s, nicht
 *   auf 9000. Auf einen Tag gerechnet sind das gut 10 s Unterschied - wer
 *   rundet, laeuft dem Spiel langsam davon.
 *
 * NACHGEPRUEFT gegen den (veralteten, aber phasenrichtigen) Stand derselben
 * API: Cetus 13 s, Orb Vallis 16 s Abweichung an der Phasengrenze. Das ist die
 * Rundung der Gegenseite, nicht unsere.
 */

/* Epoche und Phasen in Sekunden seit 1970. `onStart`/`onEnd` umschliessen die
   erste der beiden Phasen - auf Cetus den Tag, im Orb Vallis die Waerme. */
const DEFS = {
  cetus:  { start: 1509371722, length: 8998.8748, onStart: 2249.7187, onEnd: 8248.9686 },
  vallis: { start: 1542131224, length: 1600,      onStart:  800,      onEnd: 1200 }
};

/**
 * Wo im Zyklus stehen wir, und wann schlaegt er um?
 * @returns {{on: boolean, expiry: string, changesAt: number}}
 */
function phaseOf(def, nowMs = Date.now()) {
  const t = nowMs / 1000;
  const base = def.start + Math.floor((t - def.start) / def.length) * def.length;
  const phase = t - base;

  const on = phase >= def.onStart && phase < def.onEnd;
  /* Drei Faelle, nicht zwei: vor der ersten Phase, mitten drin, danach. Der
     dritte laeuft in den naechsten Zyklus hinein - dort beginnt die naechste
     Phase erst nach der Epoche des Folgezyklus. */
  const changesAt = phase < def.onStart ? base + def.onStart
                  : phase < def.onEnd   ? base + def.onEnd
                  :                       base + def.length + def.onStart;

  return { on, changesAt, expiry: new Date(Math.round(changesAt * 1000)).toISOString() };
}

/** "1h 12m" bzw. "12m 30s" - dieselbe Form wie bisher aus der API. */
function leftText(expiry) {
  const ms = new Date(expiry).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}h ${m}m` : `${m}m ${s}s`;
}

/**
 * Alle drei Zyklen zum gegebenen Zeitpunkt.
 *
 * Die Form ist absichtlich dieselbe, die formatCetus/formatVallis/formatCambion
 * bisher aus der API gebaut haben - fuer die Oberflaeche aendert sich nichts
 * ausser der Herkunft.
 */
export function computeCycles(nowMs = Date.now()) {
  const cetus  = phaseOf(DEFS.cetus,  nowMs);
  const vallis = phaseOf(DEFS.vallis, nowMs);

  return {
    cetus: {
      state: cetus.on ? 'day' : 'night',
      isDay: cetus.on,
      timeLeft: leftText(cetus.expiry),
      expiry: cetus.expiry,
      shortString: `${leftText(cetus.expiry)} to ${cetus.on ? 'Night' : 'Day'}`
    },
    vallis: {
      state: vallis.on ? 'warm' : 'cold',
      isWarm: vallis.on,
      timeLeft: leftText(vallis.expiry),
      expiry: vallis.expiry,
      shortString: `${leftText(vallis.expiry)} to ${vallis.on ? 'Cold' : 'Warm'}`
    },
    /* Der Cambion-Drift haengt an derselben Uhr wie die Ebene: Fass, solange
       auf Cetus Tag ist, sonst Vome - mit denselben Umschaltpunkten. Nicht
       geraten, sondern die Paarung, die auch die API meldet (dort tragen
       cetusCycle und cambionCycle denselben Ablaufzeitpunkt). */
    cambion: {
      state: cetus.on ? 'fass' : 'vome',
      isFass: cetus.on,
      timeLeft: leftText(cetus.expiry),
      expiry: cetus.expiry
    }
  };
}
