/**
 * Was in Warframe woechentlich zurueckgesetzt wird - Inhalte und Haendler.
 *
 * WARUM EIN EIGENES MODUL:
 *   Der Weltzustand ist eine Liste von Dingen, die gerade laufen. Diese
 *   Ansicht beantwortet eine andere Frage: "Was habe ich diese Woche noch
 *   offen, und wie lange noch?" Dafuer gehoeren Sachen zusammen, die in der
 *   API weit auseinanderliegen - der Archon steht neben dem Circuit, und
 *   Teshins Angebot neben Palladinos Tausch.
 *
 * WOHER DIE ZEITEN KOMMEN - UND WO NICHT:
 *   Alles mit `quelle: 'api'` traegt ein echtes Ablaufdatum aus der
 *   Antwort. Fuer die uebrigen (Netracells, die meisten Haendler) liefert
 *   die API keins. Die haengen aber alle am selben woechentlichen Reset,
 *   und DEN kennen wir aus einer echten Quelle: dem Ablauf der Archon-Jagd.
 *   Sie tragen `quelle: 'reset'` - die Oberflaeche kennzeichnet das, damit
 *   niemand eine abgeleitete Zeit fuer eine gemessene haelt.
 *
 *   Erfunden wird nichts. Fehlt die Archon-Jagd, fehlt auch der Reset, und
 *   die betroffenen Eintraege stehen ohne Restzeit da.
 */

/* Die Typkennungen aus der API kommen zerschossen an ("C T_ L A B"). Der
   Vergleich laeuft deshalb ueber die Buchstaben ohne Leerzeichen. */
const ARCHIMEDEA_ARTEN = {
  CTLAB: {
    key: 'deep-archimedea',
    name: 'Deep Archimedea',
    ort: 'Sanctum Anatomica (Deimos)'
  },
  CTHEX: {
    key: 'temporal-archimedea',
    name: 'Temporal Archimedea',
    ort: 'Höllvania (1999)'
  }
};

const entkleiden = s => String(s || '').replace(/[^A-Za-z]/g, '').toUpperCase();

/**
 * Restzeit als kurzer Text. Ohne Ziel oder in der Vergangenheit: null,
 * damit die Oberflaeche gar nichts anzeigt statt "vor 3 Stunden".
 */
export function etaBis(expiry, jetzt = Date.now()) {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - jetzt;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.floor(ms / 60000);
  const tage = Math.floor(min / 1440);
  const std = Math.floor((min % 1440) / 60);
  const rest = min % 60;
  if (tage > 0) return `${tage}d ${std}h`;
  if (std > 0)  return `${std}h ${rest}m`;
  return `${rest}m`;
}

/* ------------------------------ Inhalte ------------------------------ */

function archonJagd(a) {
  if (!a) return null;
  return {
    key: 'archon',
    name: 'Archon Hunt',
    detail: [a.boss, a.faction].filter(Boolean).join(' · '),
    ort: null,
    expiry: a.expiry || null,
    quelle: 'api',
    eintraege: (a.missions || []).map(m => ({
      titel: m.node || '',
      unter: m.type || m.missionType || ''
    }))
  };
}

/**
 * Der Circuit rotiert woechentlich, was es zu gewinnen gibt. Die Auswahl
 * steckt in duviriCycle.choices - dessen activation/expiry NICHT: die
 * gehoeren zum Zweistundentakt der Stimmung, nicht zur Wochenrotation.
 * Deshalb haengt der Circuit hier am gemeinsamen Reset.
 */
function circuit(duviri) {
  const auswahl = duviri?.choices || [];
  if (!auswahl.length) return null;
  const holen = k => auswahl.find(c => String(c.category).toLowerCase() === k)?.choices || [];
  const normal = holen('normal');
  const hart   = holen('hard');
  if (!normal.length && !hart.length) return null;

  const eintraege = [];
  if (normal.length) eintraege.push({ titel: normal.join(', '), unter: 'The Circuit — Warframes' });
  if (hart.length)   eintraege.push({ titel: hart.join(', '),   unter: 'Steel Path — weapons' });

  return {
    key: 'circuit',
    name: 'The Circuit',
    detail: 'Duviri',
    ort: null,
    expiry: null,
    quelle: 'reset',
    eintraege
  };
}

function archimedea(a) {
  const art = ARCHIMEDEA_ARTEN[entkleiden(a.type || a.typeKey)];
  if (!art) return null;
  return {
    key: art.key,
    name: art.name,
    detail: null,
    ort: art.ort,
    expiry: a.expiry || null,
    quelle: 'api',
    eintraege: (a.missions || []).map(m => ({
      titel: m.missionType || m.missionTypeKey || '',
      /* Abweichung und Risiken sind das, was die Woche ausmacht - ohne sie
         steht dort dreimal dasselbe Wort. */
      unter: [m.deviation?.name, ...(m.risks || []).map(r => r.name)].filter(Boolean).join(' · ')
    }))
  };
}

function kahl(syndikate) {
  const k = (syndikate || []).find(s => /kahl/i.test(s.syndicate || ''));
  if (!k) return null;
  return {
    key: 'kahl',
    name: "Kahl's Garrison",
    detail: 'Break Narmer',
    ort: null,
    expiry: k.expiry || null,
    quelle: 'api',
    eintraege: [{ titel: 'Weekly mission for Stock and Archon Shards', unter: '' }]
  };
}

/* Kein Eintrag in der API - haengt am gemeinsamen Reset. */
const netracells = () => ({
  key: 'netracells',
  name: 'Netracells',
  detail: '5 runs per week',
  ort: 'Sanctum Anatomica (Deimos)',
  expiry: null,
  quelle: 'reset',
  eintraege: [{ titel: 'Archon Shards and Arcanes from the Cavia', unter: '' }]
});

/* ------------------------------ Haendler ------------------------------ */

function teshin(sp) {
  const belohnung = sp?.currentReward;
  return {
    key: 'teshin',
    name: 'Teshin',
    ort: 'Any relay',
    was: belohnung
      ? `${belohnung.name} — ${belohnung.cost} Steel Essence`
      : 'Steel Path Honors',
    expiry: sp?.expiry || null,
    quelle: sp?.expiry ? 'api' : 'reset'
  };
}

/* Diese vier tauchen in keiner Antwort auf. Sie stehen hier, weil die
   Frage "was kann ich diese Woche noch holen?" sonst unvollstaendig
   beantwortet waere - aber ohne eigene Zeit, nur am gemeinsamen Reset. */
const FESTE_HAENDLER = [
  { key: 'bird3',     name: 'Bird 3',            ort: 'Sanctum Anatomica (Deimos)', was: 'One Archon Shard per week' },
  { key: 'yonta',     name: 'Archimedian Yonta', ort: 'Sanctum Anatomica (Deimos)', was: 'Weekly stock, paid in Entrati Lanthorn' },
  { key: 'acrithis',  name: 'Acrithis',          ort: 'Duviri',                     was: 'Weekly offerings for Pathos Clamps' },
  { key: 'palladino', name: 'Palladino',         ort: 'Iron Wake (Earth)',          was: 'Voidplume trade-in for standing' }
];

function nightwave(nw) {
  if (!nw) return null;
  const aufgaben = (nw.activeChallenges || []).filter(c => !c.isDaily);
  const elite = aufgaben.filter(c => c.isElite).length;
  return {
    key: 'nightwave',
    name: 'Nightwave',
    ort: nw.season ? `Season ${nw.season}` : null,
    was: aufgaben.length
      ? `${aufgaben.length} weekly acts open${elite ? `, ${elite} elite` : ''}`
      : 'No weekly acts right now',
    /* Die Staffel laeuft Monate - als Wochenablauf taugt sie nicht.
       Gezeigt wird der Reset, an dem die Aufgaben wechseln. */
    expiry: null,
    quelle: 'reset'
  };
}

/* ------------------------------ Zusammenbau ------------------------------ */

/**
 * Baut die Wochenansicht aus der rohen Antwort von warframestat.us.
 *
 * Nimmt bewusst die ROHDATEN und nicht den bereits aufbereiteten
 * Weltzustand: dort sind die Ablaufdaten schon zu Textbausteinen
 * verrechnet, und hier werden sie als Zeitpunkte gebraucht.
 */
export function buildWeekly(data, jetzt = Date.now()) {
  if (!data) return null;

  /* Der gemeinsame Reset. Die Archon-Jagd ist die verlaesslichste Quelle
     dafuer: sie laeuft genau von Reset zu Reset. */
  const resetAt = data.archonHunt?.expiry || null;

  const inhalte = [
    archonJagd(data.archonHunt),
    circuit(data.duviriCycle),
    ...(data.archimedeas || []).map(archimedea),
    netracells(),
    kahl(data.syndicateMissions)
  ].filter(Boolean);

  const haendler = [
    teshin(data.steelPath),
    ...FESTE_HAENDLER.map(h => ({ ...h, expiry: null, quelle: 'reset' })),
    nightwave(data.nightwave)
  ].filter(Boolean);

  /* Eine abgeleitete Zeit ist nur so gut wie der Reset, aus dem sie
     stammt - fehlt der, bleibt das Feld leer statt geraten. */
  const mitZeit = e => ({
    ...e,
    eta: etaBis(e.quelle === 'api' ? e.expiry : resetAt, jetzt)
  });

  return {
    resetAt,
    resetEta: etaBis(resetAt, jetzt),
    content: inhalte.map(mitZeit),
    vendors: haendler.map(mitZeit)
  };
}
