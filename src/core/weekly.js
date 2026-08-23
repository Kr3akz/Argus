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
    /* Einzige Stelle mit einer echten Vorschau: die Rotation steht komplett
       in der Antwort, nicht nur der aktuelle Eintrag. */
    rotation: (sp?.rotation || []).map(r => `${r.name} (${r.cost})`),
    expiry: sp?.expiry || null,
    quelle: sp?.expiry ? 'api' : 'reset',
    angebotBekannt: true
  };
}

/* Diese vier tauchen in keiner Antwort auf. Sie stehen hier, weil die
   Frage "was kann ich diese Woche noch holen?" sonst unvollstaendig
   beantwortet waere - aber ohne eigene Zeit, nur am gemeinsamen Reset.
   angebotBekannt: false, WEIL: weder warframestat.us noch das lokale
   Inventar (RecentVendorPurchases traegt nur Kaufhistorie mit rohen
   ItemIds, kein Warenangebot) einen Katalog dieser vier liefern. Erfunden
   wird hier nichts - die Oberflaeche zeigt deshalb Ort und Zweck, aber
   keine erfundene Artikelliste. */
const FESTE_HAENDLER = [
  { key: 'bird3',     name: 'Bird 3',            ort: 'Sanctum Anatomica (Deimos)', was: 'One Archon Shard per week' },
  { key: 'yonta',     name: 'Archimedian Yonta', ort: 'Sanctum Anatomica (Deimos)', was: 'Weekly stock, paid in Entrati Lanthorn' },
  { key: 'acrithis',  name: 'Acrithis',          ort: 'Duviri',                     was: 'Weekly offerings for Pathos Clamps' },
  { key: 'palladino', name: 'Palladino',         ort: 'Iron Wake (Earth)',          was: 'Voidplume trade-in for standing' }
].map(h => ({ ...h, angebotBekannt: false }));

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
    /* Die Namen der Akte selbst sind echt, kommen direkt aus der Antwort -
       kein erfundener Katalog wie bei den vier Haendlern oben. */
    rotation: aufgaben.map(c => c.title || c.desc).filter(Boolean),
    /* Die Staffel laeuft Monate - als Wochenablauf taugt sie nicht.
       Gezeigt wird der Reset, an dem die Aufgaben wechseln. */
    expiry: null,
    quelle: 'reset',
    angebotBekannt: aufgaben.length > 0
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

/* -------------------------- Echter Spielfortschritt -------------------------- */

/**
 * Welche Wochen-Inhalte sich automatisch erkennen lassen - und woraus.
 *
 * NICHT in dieser Liste: Kahl's Garrison und beide Archimedea. Fuer keinen
 * von beiden liefert das Inventar ein Feld, das eindeutig "diese Woche
 * erledigt" bedeutet - Missions[] zaehlt Lebenszeit-Abschluesse ohne
 * Zeitstempel, DailyAffiliationKahl ist gesammelter Ruf, kein Haken. Wo
 * sich das nicht nachweisen laesst, wird nichts geschaetzt: die
 * Oberflaeche zeigt dort einen Schalter zum selbst Abhaken statt eines
 * erfundenen Fortschritts.
 *
 * Die drei anderen sind belegt:
 *   archon      PeriodicMissionCompletions traegt "EliteAlert", "EliteAlertB", ...
 *               - im echten EE.log heisst die Archon-Jagd intern genauso
 *               ("Background.lua: EliteAlertMission at ..."). Gezaehlt wird
 *               nur, wie viele solcher Eintraege in diese Woche fallen -
 *               NICHT welcher Buchstabe zu welchem der drei Knoten gehoert,
 *               das waere schon wieder geraten.
 *   netracells  EntratiVaultCountLastPeriod, gedeckelt bei 5 - Name und
 *               Deckel passen zum bekannten Wochenlimit der Netracells.
 *               EntratiVaultCountResetDate liegt am selben Wochenanfang wie
 *               archonHunt.expiry - die beiden Felder beschreiben denselben
 *               Zeitraum.
 *   circuit     EndlessXP fuehrt Earn (gesammelte XP) gegen
 *               PendingRewards[].RequiredTotalXp - derselbe Vergleich, den
 *               das Spiel selbst fuer die Balkenanzeige im Circuit macht.
 */
export const AUTO_ERKENNBAR = new Set(['archon', 'netracells', 'circuit']);

/** {"$date":{"$numberLong":"..."}} -> Millisekunden. Alles andere -> null. */
function ejsonMillis(v) {
  const n = v?.$date?.$numberLong;
  return n != null ? Number(n) : null;
}

/** Faellt ein EJSON-Datum in [von, bis)? */
function inFenster(v, von, bis) {
  const t = ejsonMillis(v);
  return t != null && t >= von && (bis == null || t < bis);
}

function archonFortschritt(inv, resetAt, jetzt) {
  if (!resetAt) return null;
  const von = new Date(resetAt).getTime();
  const treffer = (inv.PeriodicMissionCompletions || [])
    .filter(x => /^EliteAlert/.test(x.tag) && inFenster(x.date, von, jetzt));
  /* Ohne Doppelzaehlung, falls ein Nachladen dieselbe Zeile zweimal liefert. */
  const anzahl = new Set(treffer.map(x => x.tag)).size;
  return { erledigt: anzahl, von: 3 };
}

function netracellFortschritt(inv, resetAt) {
  const reset = ejsonMillis(inv.EntratiVaultCountResetDate);
  const zahl = inv.EntratiVaultCountLastPeriod;
  if (reset == null || typeof zahl !== 'number' || !resetAt) return null;
  /* Der Feldname klingt nach "letzte" Periode, faellt aber auf denselben
     Wochenanfang wie der Archon-Reset - siehe Kommentar oben an
     AUTO_ERKENNBAR. Weicht er ab, ist das Feld aus einer anderen Woche und
     wird nicht verwendet, statt eine falsche Zahl zu zeigen. */
  const woche = new Date(resetAt).getTime() - 7 * 86400000;
  if (Math.abs(reset - woche) > 2 * 86400000) return null;
  return { erledigt: Math.min(zahl, 5), von: 5 };
}

/** Schwelle, bis zu der Earn reicht: "Rang 4 von 10", plus ob noch Belohnung offen ist. */
function circuitRang(eintrag) {
  if (!eintrag) return null;
  const schwellen = (eintrag.PendingRewards || []).map(r => r.RequiredTotalXp);
  const erreicht = schwellen.filter(s => (eintrag.Earn || 0) >= s).length;
  return { erledigt: erreicht, von: schwellen.length, unclaimed: (eintrag.Earn || 0) > (eintrag.Claim || 0) };
}

/**
 * Haengt echten Fortschritt an die Inhalte, wo er sich nachweisen laesst.
 *
 * rawInventory ist die Antwort von api.warframe.com/api/inventory.php, wie
 * core/inventory.js sie zwischenspeichert - NICHT die aufbereitete Sicht
 * aus inventory-items.js. Fehlt sie (kein Abruf, oder die Berechtigung
 * steht aus), bleibt jeder Eintrag unangetastet: die Oberflaeche faellt
 * dann von selbst auf den manuellen Schalter zurueck.
 */
export function annotateProgress(weekly, rawInventory, jetzt = Date.now()) {
  if (!weekly || !rawInventory) return weekly;

  const fortschritt = {
    archon: archonFortschritt(rawInventory, weekly.resetAt, jetzt),
    netracells: netracellFortschritt(rawInventory, weekly.resetAt),
    circuit: (() => {
      const xp = rawInventory.EndlessXP || [];
      const normal = circuitRang(xp.find(c => c.Category === 'EXC_NORMAL'));
      const hard   = circuitRang(xp.find(c => c.Category === 'EXC_HARD'));
      return (normal || hard) ? { normal, hard } : null;
    })()
  };

  return {
    ...weekly,
    content: weekly.content.map(e => {
      const p = fortschritt[e.key];
      return p ? { ...e, progress: p } : e;
    })
  };
}
