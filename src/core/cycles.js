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
 * @returns {{on: boolean, expiry: string, changesAt: number, startedAt: number}}
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
  /* Spiegelbildlich der Anfang der laufenden Phase. Vor der ersten Phase
     lief noch die zweite des VORIGEN Zyklus - die begann bei dessen onEnd. */
  const startedAt = phase < def.onStart ? base - def.length + def.onEnd
                  : phase < def.onEnd   ? base + def.onStart
                  :                       base + def.onEnd;

  return { on, changesAt, startedAt, expiry: new Date(Math.round(changesAt * 1000)).toISOString() };
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

/* ------------------------------------------------------------------------
   Die sechs Uhren fuer den Live-Tracker
   ------------------------------------------------------------------------

   computeCycles() oben bleibt, wie es ist: das Overlay liest genau diese drei
   Felder. Der Live-Tracker zeigt dazu Erde, Zariman und Duviri - und braucht
   von jeder Phase auch den ANFANG, nicht nur das Ende. Erst damit laesst sich
   sagen, wie weit sie schon herum ist (der Balken unter der Uhr) und ob der
   Wechsel kurz bevorsteht.

   Auch diese drei laufen nach der Uhr, nicht nach einem Server. warframestat.us
   rechnet sie selbst aus der Zeit - eine Abfrage braechte also nichts ausser
   ihrer Verzoegerung. */

const H = 3600000;
const iso = ms => new Date(Math.round(ms)).toISOString();

/**
 * Erde: vier Stunden Tag, vier Stunden Nacht, im Takt seit der Unix-Epoche.
 *
 * NACHGEPRUEFT am 2026-10-01: warframestat.us meldete Nacht von 12:00 bis
 * 16:00 UTC. Ab der Epoche gezaehlt ist das der vierte Vierstundenblock des
 * Tages (Index 3, ungerade) - gerade Bloecke sind Tag, ungerade Nacht. Der
 * Tag beginnt also um 0, 8 und 16 Uhr UTC.
 */
function earthPhase(nowMs) {
  const idx = Math.floor(nowMs / (4 * H));
  return { day: idx % 2 === 0, startedAt: idx * 4 * H, changesAt: (idx + 1) * 4 * H };
}

/**
 * Zariman: wer die Ten Zero gerade haelt, wechselt mit jedem Kopfgeld-Takt.
 *
 * Der Takt ist der Cetus-Zyklus, gemessen von Tagesanbruch zu Tagesanbruch -
 * am 2026-10-01 von 12:46:15 bis 15:16:14 UTC. warframestat.us meldete fuer
 * den Zariman 12:46 bis 15:16 und dieselbe Frist an den Kopfgeldern aller
 * drei Syndikate (15:16:15). Es ist dieselbe Uhr.
 *
 * WELCHE HAELFTE WEM GEHOERT, IST BEOBACHTET: der Zyklus ab 12:46 UTC an
 * diesem Tag traegt, ab dem Tagesanbruch der Epoche oben gezaehlt, die Nummer
 * 31280 und gehoerte den Corpus. Seitdem wechselt es streng ab - gerade
 * Nummern Corpus, ungerade Grineer.
 */
function zarimanPhase(nowMs) {
  const d = DEFS.cetus;
  const anchor = d.start + d.onStart;
  const k = Math.floor((nowMs / 1000 - anchor) / d.length);
  return {
    corpus: ((k % 2) + 2) % 2 === 0,
    startedAt: (anchor + k * d.length) * 1000,
    changesAt: (anchor + (k + 1) * d.length) * 1000
  };
}

/* Duviri: fuenf Stimmungen zu je zwei Stunden. Das Wiki nennt sie in der
   Reihenfolge Joy, Anger, Envy, Sorrow, Fear und sagt "120 minutes each";
   beobachtet am 2026-10-01: Sorrow von 12:00 bis 14:00 UTC. Ab der Epoche
   gezaehlt ist das der Zweistundenblock 248730 - durch fuenf ohne Rest. Die
   Liste beginnt deshalb bei Sorrow und laeuft in der Reihenfolge des Wikis
   im Kreis weiter. */
const DUVIRI = ['sorrow', 'fear', 'joy', 'anger', 'envy'];

function duviriPhase(nowMs) {
  const idx = Math.floor(nowMs / (2 * H));
  return {
    mood: DUVIRI[idx % 5],
    next: DUVIRI[(idx + 1) % 5],
    startedAt: idx * 2 * H,
    changesAt: (idx + 1) * 2 * H
  };
}

/* Was eine Stimmung im Spiel aendert - beides vom Wiki (Seite Mood Spirals):
   die Schadensart, die verstaerkte Gegner austeilen, und ob Kullervo's Hold
   auftaucht (nur bei Anger, Sorrow und Fear). */
const DUVIRI_FOLGEN = {
  joy:    { damage: 'Void',        kullervo: false },
  anger:  { damage: 'Heat',        kullervo: true },
  envy:   { damage: 'Toxin',       kullervo: false },
  sorrow: { damage: 'Cold',        kullervo: true },
  fear:   { damage: 'Electricity', kullervo: true }
};

const gross = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Alle sechs Uhren, in der Reihenfolge, in der der Reiter sie zeigt.
 *
 * Jede traegt ihren Zustand (`state`, fuer die Farbe), den lesbaren Namen
 * dazu, den naechsten Zustand und Anfang wie Ende der Phase. `hint` ist ein
 * Satz darueber, was die Phase im Spiel bedeutet - nur dort, wo das belegt
 * ist, sonst null.
 */
export function computeWorldCycles(nowMs = Date.now()) {
  const earth  = earthPhase(nowMs);
  const cetus  = phaseOf(DEFS.cetus,  nowMs);
  const vallis = phaseOf(DEFS.vallis, nowMs);
  const zar    = zarimanPhase(nowMs);
  const duv    = duviriPhase(nowMs);
  const folgen = DUVIRI_FOLGEN[duv.mood];

  return [
    {
      key: 'earth', name: 'Earth', place: 'Forest missions on Earth',
      state: earth.day ? 'day' : 'night',
      label: earth.day ? 'Day' : 'Night', next: earth.day ? 'Night' : 'Day',
      activation: iso(earth.startedAt), expiry: iso(earth.changesAt),
      hint: null
    },
    {
      key: 'cetus', name: 'Plains of Eidolon', place: 'Cetus · Earth',
      state: cetus.on ? 'day' : 'night',
      label: cetus.on ? 'Day' : 'Night', next: cetus.on ? 'Night' : 'Day',
      activation: iso(cetus.startedAt * 1000), expiry: cetus.expiry,
      hint: cetus.on ? null : 'Eidolons roam the Plains'
    },
    {
      key: 'vallis', name: 'Orb Vallis', place: 'Fortuna · Venus',
      state: vallis.on ? 'warm' : 'cold',
      label: vallis.on ? 'Warm' : 'Cold', next: vallis.on ? 'Cold' : 'Warm',
      activation: iso(vallis.startedAt * 1000), expiry: vallis.expiry,
      hint: null
    },
    {
      key: 'cambion', name: 'Cambion Drift', place: 'Necralisk · Deimos',
      state: cetus.on ? 'fass' : 'vome',
      label: cetus.on ? 'Fass' : 'Vome', next: cetus.on ? 'Vome' : 'Fass',
      activation: iso(cetus.startedAt * 1000), expiry: cetus.expiry,
      hint: null
    },
    {
      key: 'zariman', name: 'Zariman Ten Zero', place: 'Chrysalith · Void',
      state: zar.corpus ? 'corpus' : 'grineer',
      label: zar.corpus ? 'Corpus' : 'Grineer', next: zar.corpus ? 'Grineer' : 'Corpus',
      activation: iso(zar.startedAt), expiry: iso(zar.changesAt),
      hint: `Missions are held by the ${zar.corpus ? 'Corpus' : 'Grineer'}`
    },
    {
      key: 'duviri', name: 'Duviri', place: 'Mood spiral',
      state: duv.mood,
      label: gross(duv.mood), next: gross(duv.next),
      activation: iso(duv.startedAt), expiry: iso(duv.changesAt),
      hint: `Enemies deal ${folgen.damage}` + (folgen.kullervo ? ' · Kullervo’s Hold is open' : '')
    }
  ];
}
