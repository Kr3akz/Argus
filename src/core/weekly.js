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
 *   Antwort. Fuer die uebrigen (Netracells, Descendia, Kahl, die meisten
 *   Haendler) liefert die API keins - oder ein falsches, siehe den
 *   Kommentar bei kahl(). Die haengen aber alle am selben woechentlichen
 *   Reset, und DEN kennen wir aus einer echten Quelle: dem Ablauf der
 *   Archon-Jagd. Sie tragen `quelle: 'reset'` - die Oberflaeche
 *   kennzeichnet das, damit niemand eine abgeleitete Zeit fuer eine
 *   gemessene haelt.
 *
 *   Erfunden wird nichts. Fehlt die Archon-Jagd, fehlt auch der Reset, und
 *   die betroffenen Eintraege stehen ohne Restzeit da.
 *
 * WOHER DER FORTSCHRITT KOMMT:
 *   Der zweite Teil dieser Datei (ab "Echter Spielfortschritt") liest aus
 *   dem eigenen Inventar, was diese Woche schon gelaufen ist. Jede Quelle
 *   traegt dort ihren Beleg im Kommentar - und jede muss zuerst durch
 *   dieselbe Frage: stammt dieses Inventar ueberhaupt aus DIESER Woche?
 *   Siehe inventarStand(). Wo sich nichts belegen laesst, steht ein
 *   Handhaken statt einer erfundenen Zahl.
 */

/**
 * Was es woechentlich zu holen gibt, als Item-Kennungen.
 *
 * UEBER uniqueName UND NICHT UEBER NAMEN: die Splitter heissen im Katalog
 * "<SHARD_RED_SIMPLE> Crimson Archon Shard" - mit der Farbmarkierung des
 * Spiels davor. Ein Namensvergleich ginge daran vorbei; die Kennung nicht.
 * Aufgeloest wird sie im Hauptprozess, der den Katalog ohnehin geladen hat.
 *
 * WELCHE BELOHNUNG ZU WELCHEM INHALT GEHOERT, IST NACHGESCHLAGEN und nicht
 * aus dem Kopf: wiki.warframe.com, Seiten Deep Archimedea, Temporal
 * Archimedea und The Descendia. Wo ich es nicht belegen konnte, steht der
 * allgemeine Splitter statt einer Farbe, die vielleicht stimmt.
 */
const SPLITTER = {
  jede:    '/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal',
  crimson: '/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystalAmar',
  amber:   '/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystalNira',
  azure:   '/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystalBoreal',
  emerald: '/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystalGreen',
  topaz:   '/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystalOrange',
  violet:  '/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystalViolet'
};

/* Welcher Archon welchen Splitter fallen laesst, sagt DE selbst - die
   Kennung des roten Splitters lautet ArchonCrystalAmar. Kein Ratschluss,
   sondern der Dateiname. */
const ARCHON_SPLITTER = { amar: SPLITTER.crimson, nira: SPLITTER.amber, boreal: SPLITTER.azure };

/* Die Typkennungen aus der API kommen zerschossen an ("C T_ L A B"). Der
   Vergleich laeuft deshalb ueber die Buchstaben ohne Leerzeichen. */
const ARCHIMEDEA_ARTEN = {
  CTLAB: {
    key: 'deep-archimedea',
    name: 'Deep Archimedea',
    ort: 'Sanctum Anatomica (Deimos)',
    /* Praefix der Inventarfelder: ...CacheScoreMission traegt die Research
       Points, ...ActiveFrameVariants die vier Personal Modifiers der Woche.
       Siehe archimedeaFortschritt weiter unten. */
    feld: 'EntratiLabConquest',
    /* Wiki, Deep Archimedea: Crimson, Amber oder Azure, dazu ein legendaeres
       Nahkampf-Arkanum oder der Melee Arcane Adapter. */
    belohnungen: [SPLITTER.crimson, SPLITTER.amber, SPLITTER.azure,
                  '/Lotus/Types/Items/MiscItems/WeaponMeleeArcaneUnlocker']
  },
  CTHEX: {
    key: 'temporal-archimedea',
    name: 'Temporal Archimedea',
    ort: 'Höllvania (1999)',
    feld: 'EchoesHexConquest',
    /* Wiki, Temporal Archimedea: alle sechs Farben, dazu Arkana und die
       Omni Forma. */
    belohnungen: [SPLITTER.crimson, SPLITTER.amber, SPLITTER.azure,
                  SPLITTER.emerald, SPLITTER.topaz, SPLITTER.violet,
                  '/Lotus/Types/Items/MiscItems/FormaAura']
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
    /* Der Archon bestimmt die Farbe - welcher es ist, steht in der Antwort. */
    belohnungen: [ARCHON_SPLITTER[String(a.boss || '').toLowerCase().replace(/^archon\s+/, '')]
                  || SPLITTER.jede],
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
    feld: art.feld,
    belohnungen: art.belohnungen,
    /* Die vier Personal Modifiers dieser Woche. Sie stehen hier nicht zum
       Anzeigen, sondern als Wochenbeweis: dasselbe Quartett taucht im
       Inventar unter ...ActiveFrameVariants auf, und nur wenn beide Mengen
       gleich sind, gehoert der gespeicherte Punktestand zu DIESER Woche. */
    modifiers: (a.personalModifiers || []).map(m => m.key).filter(Boolean),
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
    /* NICHT k.expiry: der Eintrag in syndicateMissions traegt ein
       TAEGLICHES Fenster (beobachtet: activation 09.09. 15:59 -> expiry
       10.09. 15:59), waehrend Kahls Auftrag woechentlich zurueckgesetzt
       wird. Als "live" ausgezeichnet stand dort ein paar Stunden Restzeit,
       wo dreieinhalb Tage richtig waren. */
    expiry: null,
    quelle: 'reset',
    belohnungen: ['/Lotus/Types/Items/MiscItems/KahlCreds', SPLITTER.jede],
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
  belohnungen: [SPLITTER.jede],
  eintraege: [{ titel: 'Archon Shards and Arcanes from the Cavia', unter: '' }]
});

/**
 * Ebenfalls kein Eintrag in der API - warframestat.us kennt Descendia in
 * keinem seiner Felder. Was diese Woche an Challenges ansteht, laesst sich
 * deshalb nicht anzeigen; der Fortschritt dafuer umso genauer, der steht
 * naemlich im Inventar (siehe descendiaFortschritt).
 *
 * Zahlen am Wiki gegengelesen (wiki.warframe.com/w/The_Descendia): 21
 * Infernums, Belohnungen auf 2/4/6/9/11/13/16/18/20/21, jede genau einmal
 * pro Woche, Reset Montag 00:00 UTC - derselbe wie hier ueberall.
 */
const descendia = () => ({
  key: 'descendia',
  name: 'The Descendia',
  detail: '21 Infernums',
  ort: 'Dark Refractory (Navigation)',
  expiry: null,
  quelle: 'reset',
  belohnungen: [
    '/Lotus/Powersuits/DemonFrame/DemonFrame',                  // Uriel
    '/Lotus/Weapons/Tenno/Bayonet/TnBayonetRifleWeapon',        // Vinquibus
    '/Lotus/Types/Gameplay/Tau/Resources/CoHResourceRareItem',  // Maphica
    '/Lotus/Types/Gameplay/Tau/Resources/CoHResourceCommonItem' // Ignia
  ],
  eintraege: [{
    titel: 'Ignia, Maphica and Arcanes along the way',
    unter: 'Roathe on Infernum 21 drops Uriel and Vinquibus parts'
  }]
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
    /* NICHT sp.rotation: das ist der Zyklus ueber ALLE Wochen, nicht das
       Angebot dieser einen. Als Chips unter dem aktuellen Posten gelesen
       sah es aus, als gaebe es diese Woche acht Dinge zu kaufen - und
       dann steht dort "3x Forma", was diese Woche eben nicht stimmt.
       evergreens ist das Dauersortiment: was tatsaechlich jederzeit bei
       ihm liegt, unabhaengig von der Woche. */
    rotation: (sp?.evergreens || []).map(r => `${r.name} (${r.cost})`),
    rotationTitel: 'Always in stock',
    expiry: sp?.expiry || null,
    quelle: sp?.expiry ? 'api' : 'reset',
    angebotBekannt: !!(sp?.evergreens || []).length
  };
}

/* Diese vier tauchen in keiner Antwort auf. Sie stehen hier, weil die
   Frage "was kann ich diese Woche noch holen?" sonst unvollstaendig
   beantwortet waere - aber ohne eigene Zeit, nur am gemeinsamen Reset.
   angebotBekannt: false, WEIL: weder warframestat.us noch das lokale
   Inventar (RecentVendorPurchases traegt nur Kaufhistorie mit rohen
   ItemIds, kein Warenangebot) einen Katalog dieser vier liefern. Erfunden
   wird hier nichts - die Oberflaeche zeigt deshalb Ort und Zweck, aber
   keine erfundene Artikelliste.

   ORT UND ZWECK SIND NACHGESCHLAGEN, NICHT GERATEN. Die erste Fassung
   dieser Liste stammte aus dem Gedaechtnis und hatte drei Fehler drin -
   Palladino tauschte angeblich Voidplume (tut sie nicht, das ist Yonta),
   und Yonta stand auf Deimos statt im Zariman. Gegengelesen am Wiki:
     wiki.warframe.com/w/Palladino        Riven Slivers, Iron Wake
     wiki.warframe.com/w/Archimedean_Yonta Chrysalith, Voidplume Pinions
     wiki.warframe.com/w/Acrithis          Duviri, Pathos Clamps
     wiki.warframe.com/w/Bird_3            Cavia, ein Posten je Woche
   Wer hier etwas aendert: erst nachsehen, dann tippen. */
const FESTE_HAENDLER = [
  { key: 'bird3',     name: 'Bird 3',             ort: 'Sanctum Anatomica (Deimos)',
    was: 'One rotating offering per week at Rank 5 — Archon Shards among them' },
  { key: 'yonta',     name: 'Archimedean Yonta',  ort: 'Chrysalith (Zariman)',
    was: '35,000 Kuva for 5 Voidplume Pinions, once per week' },
  { key: 'acrithis',  name: 'Acrithis',           ort: 'Duviri',
    was: 'Five weekly wares for Pathos Clamps' },
  { key: 'palladino', name: 'Palladino',          ort: 'Iron Wake (Earth)',
    was: 'Riven Slivers for Riven Mods, Kuva, Endo and Requiem Relics — weekly limits' }
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
    rotationTitel: 'This week’s acts',
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
    descendia(),
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

/** {"$date":{"$numberLong":"..."}} -> Millisekunden. Alles andere -> null. */
function ejsonMillis(v) {
  const n = v?.$date?.$numberLong;
  return n != null ? Number(n) : null;
}

/**
 * Wann hat der Spielclient dieses Dokument zuletzt vom Server bekommen?
 *
 * DIE WICHTIGSTE PRUEFUNG IM GANZEN MODUL. Ohne sie stand hier letzte Woche
 * neben dieser: ein Abzug vom Sonntagabend trug vier gelaufene Netracells
 * und zwei Archon-Missionen, und beides wurde am Montag als "diese Woche"
 * ausgegeben, obwohl der Reset dazwischen lag.
 *
 * WARUM AUSGERECHNET LastInventorySync: das ist eine ObjectId, und deren
 * erste vier Byte sind der Unix-Zeitstempel ihrer Erzeugung. Sie ist damit
 * die EINZIGE Angabe im ganzen Dokument, die sagt, wie alt das Dokument
 * selbst ist.
 *
 * WAS HIER FRUEHER STAND UND WARUM ES FALSCH WAR: erst diente EndlessXP.
 * Expiry als Massstab, in der Annahme, der Server schreibe es woechentlich
 * fort. Tut er nicht - er schreibt jeden dieser Datensaetze erst, wenn man
 * den Inhalt anfasst, und zwar jede Kategorie fuer sich. In einem heute
 * gelesenen Dokument stand EXC_NORMAL auf dem 07.09. und EXC_HARD auf dem
 * 14.09.; wer davon das Maximum nimmt, hat einmal Glueck und einmal nicht.
 * Faul sind sie alle - deshalb taugt keiner von ihnen als Uhr, und deshalb
 * traegt jede Auswertung weiter unten ihre eigene Wochenpruefung.
 */
export function inventarStand(inv) {
  const oid = inv?.LastInventorySync?.$oid;
  if (typeof oid !== 'string' || oid.length < 8) return null;
  const sek = parseInt(oid.slice(0, 8), 16);
  return Number.isFinite(sek) ? sek * 1000 : null;
}

/* Eine Woche in Millisekunden. */
const WOCHE_MS = 7 * 86400000;

/**
 * Meinen zwei Zeitpunkte denselben woechentlichen Reset?
 *
 * Mit Spielraum, weil die beiden Seiten aus verschiedenen Systemen kommen -
 * das Wochenende aus warframestat.us, die Datumsfelder aus DEs Inventar.
 * Beide meinen denselben Montag; sie auf die Millisekunde festzunageln
 * waere eine Falle, an der eine Sekunde Unterschied die ganze Auswertung
 * fuer immer verstummen liesse. Sechs Stunden sind weit weg von einer
 * Woche und weit jenseits jeder Abweichung, die hier vorkommen kann.
 */
const gleicheWoche = (a, b) => a != null && b != null && Math.abs(a - b) < 6 * 3600000;

/* Punktreihe: n von m, fertig bei m. */
const punkte = (erledigt, von) => ({ art: 'pips', erledigt, von, fertigAb: von });

/**
 * Zwei unabhaengige Reihen (normal / Steel Path) zu einem Fortschritt.
 * erledigt/von ist die Summe - nur dafuer da, dass die Uebersicht zaehlen
 * kann, ohne die Bauart der einzelnen Karte zu kennen.
 */
function balken(reihen) {
  const gefiltert = reihen.filter(Boolean);
  if (!gefiltert.length) return null;
  const summe = f => gefiltert.reduce((s, r) => s + r[f], 0);
  return { art: 'bars', reihen: gefiltert, erledigt: summe('erledigt'), von: summe('von'), fertigAb: summe('von') };
}

/* ---- Archon-Jagd ---- */

function archonFortschritt(inv, wochenStart, jetzt) {
  const treffer = (inv.PeriodicMissionCompletions || [])
    .filter(x => /^EliteAlert/.test(x.tag))
    .filter(x => {
      const t = ejsonMillis(x.date);
      /* [Wochenanfang, jetzt). Hier stand frueher der Wochenanfang gar
         nicht, sondern das Wochenende - die Bedingung lautete damit
         "nach Montag naechster Woche und vor heute" und war nie erfuellbar,
         der Zaehler blieb zwangslaeufig bei 0. */
      return t != null && t >= wochenStart && t < jetzt;
    });
  /* Ohne Doppelzaehlung, falls ein Nachladen dieselbe Zeile zweimal liefert. */
  return punkte(Math.min(new Set(treffer.map(x => x.tag)).size, 3), 3);
}

/* ---- Netracells ---- */

function netracellFortschritt(inv, wochenEnde) {
  const reset = ejsonMillis(inv.EntratiVaultCountResetDate);
  const zahl = inv.EntratiVaultCountLastPeriod;
  if (reset == null || typeof zahl !== 'number') return null;
  /* EntratiVaultCountResetDate ist das ENDE der Zaehlperiode, nicht ihr
     Anfang. Frueher wurde es gegen den Wochenanfang geprueft, also gegen
     einen Wert, der genau eine Woche daneben liegt - die Pruefung ging
     dadurch nur bei VERALTETEN Daten durch und lehnte frische ab. Sie tat
     das Gegenteil dessen, wofuer sie dastand.
     Passt das Ende nicht, gehoert die Zahl zu einer vergangenen Woche -
     und diese hier steht dann belegbar bei 0, nicht bei "unbekannt". */
  return punkte(gleicheWoche(reset, wochenEnde) ? Math.min(zahl, 5) : 0, 5);
}

/* ---- The Circuit ---- */

function circuitReihe(label, eintrag, wochenEnde) {
  if (!eintrag) return null;
  const schwellen = (eintrag.PendingRewards || []).map(r => r.RequiredTotalXp);
  if (!schwellen.length) return null;
  /* Auch hier der Eintrag gegen seine eigene Woche - EndlessXP traegt sein
     Ende mit, und ohne diese Frage stuende der Stand der Vorwoche da. */
  const frisch = gleicheWoche(ejsonMillis(eintrag.Expiry), wochenEnde);
  const earn  = frisch ? (eintrag.Earn || 0) : 0;
  const claim = frisch ? (eintrag.Claim || 0) : 0;
  return {
    label,
    erledigt: schwellen.filter(s => earn >= s).length,
    von: schwellen.length,
    hinweis: earn > claim ? 'Unclaimed rewards waiting' : null
  };
}

function circuitFortschritt(inv, wochenEnde) {
  const xp = inv.EndlessXP || [];
  return balken([
    circuitReihe('Normal',     xp.find(c => c.Category === 'EXC_NORMAL'), wochenEnde),
    circuitReihe('Steel Path', xp.find(c => c.Category === 'EXC_HARD'), wochenEnde)
  ]);
}

/* ---- The Descendia ---- */

/* Zwei Kategorien, feste Reihenfolge - die Reihenfolge im Inventar ist
   nicht zugesichert, die Anzeige soll aber nicht springen. */
const DESCENDIA_REIHEN = [
  ['DM_COH_NORMAL', 'Normal'],
  ['DM_COH_HARD',   'Steel Path']
];

function descendiaReihe(eintrag, label, wochenEnde) {
  if (!eintrag) return null;
  const stufen = (eintrag.PendingRewards || [])
    .map(r => r.FloorCheckpoint)
    .filter(n => typeof n === 'number')
    .sort((a, b) => a - b);
  if (!stufen.length) return null;

  /* Der Eintrag traegt sein eigenes Wochenende - und ein aktuelles nur
     dann, wenn diese Woche gespielt wurde. Steht dort ein altes Datum, ist
     diese Woche nichts geholt worden; 0 ist damit belegt und nicht
     geraten. Descendia ist deshalb der einzige Wochen-Inhalt, der seine
     eigene Gueltigkeit mitbringt. */
  const boden = gleicheWoche(ejsonMillis(eintrag.Expiry), wochenEnde) ? (eintrag.FloorClaimed || 0) : 0;
  const tiefe = stufen[stufen.length - 1];
  return {
    label,
    erledigt: stufen.filter(s => s <= boden).length,
    von: stufen.length,
    hinweis: boden > 0 && boden < tiefe ? `Infernum ${boden} of ${tiefe}` : null
  };
}

function descendiaFortschritt(inv, wochenEnde) {
  const eintraege = inv.DescentRewards || [];
  return balken(DESCENDIA_REIHEN.map(([kat, label]) =>
    descendiaReihe(eintraege.find(e => e.Category === kat), label, wochenEnde)));
}

/* ---- Deep und Temporal Archimedea ---- */

/* Am Wiki gegengelesen; beide Archimedea sind identisch aufgebaut:
     3 Punkte fuers Durchspielen aller drei Missionen
     1 Punkt je Individual Parameter und Mission - vier Loadout-Vorgaben
       und vier Personal Modifiers, ueber drei Missionen also 24
   macht 27 als Maximum. Elite legt 10 obendrauf, macht 37. Die
   Belohnungsstufen liegen auf diesen Punktzahlen: */
const ARCHIMEDEA_STUFEN       = [5, 10, 15, 20, 25];
const ARCHIMEDEA_STUFEN_ELITE = [28, 31, 34, 37];
const ARCHIMEDEA_MAX = 27;

/* /Lotus/.../PersonalModifiers/WitheringVariableItem -> "Withering", und
   genau so heisst der Schluessel in der API unter personalModifiers. */
const variantenSchluessel = p => String(p).split('/').pop().replace(/VariableItem$/, '');

function archimedeaFortschritt(inv, eintrag) {
  const roh = inv[`${eintrag.feld}CacheScoreMission`];
  if (typeof roh !== 'number') return null;

  /* Der Punktestand traegt kein Datum. Bewiesen wird die Woche ueber die
     vier Personal Modifiers: das Inventar fuehrt sie unter
     ...ActiveFrameVariants, die API unter personalModifiers - und laut Wiki
     sind sie fuer jeden Spieler dieselben. Stimmen die Mengen ueberein,
     gehoert der Stand zu dieser Woche.
     EINSCHRAENKUNG, DIE HIER STEHEN BLEIBEN MUSS: dass Punktestand und
     Varianten beim Reset GEMEINSAM zuruecksetzen, ist plausibel (es sind
     Nachbarfelder desselben Datensatzes), aber noch nicht ueber einen
     Reset hinweg beobachtet. Wer das nachpruefen kann: einmal montags nach
     dem Reset ins frische Inventar sehen. Faellt es anders aus, steht hier
     dieselbe Falle wie frueher bei den Netracells. */
  const imInventar = (inv[`${eintrag.feld}ActiveFrameVariants`] || []).map(variantenSchluessel);
  const ausApi = eintrag.modifiers || [];
  const belegt = ausApi.length > 0
    && new Set(imInventar).size === new Set(ausApi).size
    && ausApi.every(k => imInventar.includes(k));

  const stand = belegt ? roh : 0;
  /* Ueber 27 kommt man nur mit Elite - das sagt der Stand selbst, ganz ohne
     ...HardModeStatus, dessen Bedeutung sich nicht belegen laesst (er stand
     auf 0, waehrend 27 Punkte Elite laengst freigeschaltet hatten). */
  const elite = stand > ARCHIMEDEA_MAX;
  const stufen = elite ? [...ARCHIMEDEA_STUFEN, ...ARCHIMEDEA_STUFEN_ELITE] : ARCHIMEDEA_STUFEN;
  return {
    art: 'score',
    punkte: stand,
    max: elite ? ARCHIMEDEA_STUFEN_ELITE[ARCHIMEDEA_STUFEN_ELITE.length - 1] : ARCHIMEDEA_MAX,
    stufen,
    erledigt: stand,
    von: elite ? ARCHIMEDEA_STUFEN_ELITE[ARCHIMEDEA_STUFEN_ELITE.length - 1] : ARCHIMEDEA_MAX,
    /* Fertig ist die Woche, wenn die letzte erreichbare Belohnungsstufe
       vergeben ist - nicht erst beim rechnerischen Maximum. */
    fertigAb: stufen[stufen.length - 1]
  };
}

/* ---- Kahl's Garrison ---- */

/**
 * Kahls Wochenauftrag steht im Inventar - aber ohne Datum.
 *
 * Affiliations[KahlSyndicate].WeeklyMissions traegt je Woche einen Eintrag
 * mit CompletedMission und einer laufenden WeekCount. Was WeekCount 650
 * fuer ein Kalenderdatum ist, steht nirgends: es ist DEs eigener Zaehler
 * mit unbekanntem Nullpunkt. Und der Eintrag entsteht erst beim Starten
 * der Mission - im Abzug vom 12.08. und im Abzug vom 06.09. stand deshalb
 * dieselbe 649/650, 25 Tage auseinander.
 *
 * "Hoechster WeekCount = diese Woche" waere also falsch. Es liefert nie ein
 * falsches "offen", aber regelmaessig ein falsches "erledigt" - naemlich
 * immer dann, wenn man Kahl letzte Woche gemacht und diese noch nicht
 * angefasst hat. Der haeufigste Fall ueberhaupt.
 *
 * Der Anker loest das ohne zu raten: sehen wir die WeekCount steigen,
 * WAEHREND wir dieselbe Woche schon vorher beobachtet haben, dann kann die
 * neue Zahl nur zu dieser Woche gehoeren. Ab da rechnet sich jede weitere
 * Woche daraus aus. Vorher bleibt Kahl beim Schalter - lieber eine Woche
 * laenger von Hand als eine Woche lang falsch.
 */
export function kahlWoche(inv) {
  const auftraege = (inv?.Affiliations || [])
    .find(a => a.Tag === 'KahlSyndicate')?.WeeklyMissions || [];
  const zahlen = auftraege.map(x => x.WeekCount).filter(n => typeof n === 'number');
  return zahlen.length ? Math.max(...zahlen) : null;
}

/**
 * Anker fortschreiben. Gibt den alten zurueck, wenn sich nichts Belegbares
 * ergibt - der Aufrufer speichert nur, was sich geaendert hat.
 */
export function kahlAnker(alt, inv, wochenEnde, wochenStart) {
  const woche = kahlWoche(inv);
  /* Nur ein Inventar aus DIESER Woche darf ankern - sonst datiert der
     Anker eine alte Beobachtung auf heute. */
  const stand = inventarStand(inv);
  if (woche == null || wochenStart == null || stand == null || stand < wochenStart) return alt;
  /* Aenderung innerhalb derselben, schon beobachteten Woche gesehen: das
     ist der Beweis. */
  if (alt && alt.resetAt === wochenEnde && woche > alt.week) {
    return { week: woche, resetAt: wochenEnde, bestaetigt: true };
  }
  if (alt?.bestaetigt) return alt;
  /* Sonst nur merken, was gerade dasteht - ohne Anspruch darauf, dass es
     zu dieser Woche gehoert. */
  return { week: woche, resetAt: wochenEnde, bestaetigt: false };
}

function kahlFortschritt(inv, anker, wochenEnde) {
  if (!anker?.bestaetigt || wochenEnde == null) return null;
  const diese = anker.week + Math.round((wochenEnde - anker.resetAt) / WOCHE_MS);
  const auftraege = (inv.Affiliations || [])
    .find(a => a.Tag === 'KahlSyndicate')?.WeeklyMissions || [];
  const eintrag = auftraege.find(x => x.WeekCount === diese);
  /* Kein Eintrag fuer diese Woche = nicht gestartet = offen. */
  return punkte(eintrag?.CompletedMission ? 1 : 0, 1);
}

/* ------------------------------ Zusammenfuehren ------------------------------ */

/**
 * JEDER Wert wird gegen die Woche geprueft, zu der sein eigener Datensatz
 * gehoert - und nicht ein einziges Mal fuer das ganze Inventar.
 *
 * Der Grund steht in den Daten: DE schreibt diese Datensaetze erst, wenn man
 * den Inhalt anfasst, und jeden fuer sich. In einem heute gelesenen Dokument
 * standen nebeneinander EndlessXP/EXC_NORMAL auf dem 07.09., EndlessXP/
 * EXC_HARD auf dem 14.09., EntratiVaultCount auf dem 07.09. und
 * DescentRewards auf dem 14.09. - vier Datensaetze, zwei Wochen, ein
 * Dokument. Ein gemeinsamer Massstab waere hier zwangslaeufig falsch.
 */
function fortschrittFuer(e, inv, c) {
  switch (e.key) {
    case 'archon':     return archonFortschritt(inv, c.wochenStart, c.jetzt);
    case 'netracells': return netracellFortschritt(inv, c.wochenEnde);
    case 'circuit':    return circuitFortschritt(inv, c.wochenEnde);
    case 'descendia':  return descendiaFortschritt(inv, c.wochenEnde);
    case 'kahl':       return kahlFortschritt(inv, c.kahlAnker, c.wochenEnde);
    /* Beide Archimedea tragen ihr Inventarfeld selbst mit sich (siehe
       ARCHIMEDEA_ARTEN) - eine dritte Art faende sich hier von allein ein. */
    default:           return e.feld ? archimedeaFortschritt(inv, e) : null;
  }
}

/**
 * Ein Zustand je Eintrag, berechnet an genau EINER Stelle.
 *
 * Vorher rechnete die Oberflaeche zweimal aus, was "fertig" heisst - einmal
 * fuer die Karte, einmal fuer die Zaehlerpille - und die zwei Rechnungen
 * waren nicht dieselbe. Jetzt steht das Ergebnis in den Daten, und beide
 * lesen es nur noch ab.
 */
function zustand(e) {
  /* Ein gemessener Stand aus DIESER Woche schlaegt den Handhaken - er weiss
     es besser. Ist der Stand aelter oder gibt es keinen, gilt der Haken. */
  if (e.nachweis !== 'auto' && e.manuellErledigt) return 'done';
  if (e.progress) {
    const { erledigt, fertigAb, von } = e.progress;
    const ziel = fertigAb ?? von;
    if (ziel > 0 && erledigt >= ziel) return 'done';
    return erledigt > 0 ? 'partial' : 'open';
  }
  return e.manuellErledigt ? 'done' : 'open';
}

/**
 * Haengt Fortschritt, Handhaken und Zustand an die Wochenansicht.
 *
 * rawInventory ist die Antwort von api.warframe.com/api/inventory.php, wie
 * core/inventory.js sie zwischenspeichert - NICHT die aufbereitete Sicht
 * aus inventory-items.js.
 *
 * ES WIRD NUR AUSGEWERTET, WAS AUS DIESER WOCHE STAMMT. Fehlt das Inventar,
 * oder ist es aelter als der laufende Reset, bleibt jeder Eintrag beim
 * Handhaken - und `inventar` sagt der Oberflaeche, warum. Ein Fortschritt
 * aus der Vorwoche ist schlimmer als gar keiner: er sieht richtig aus.
 *
 * opts.manuell    - { key: true } der selbst gesetzten Haken dieser Woche
 * opts.kahlAnker  - siehe kahlAnker weiter oben
 */
export function annotateWeekly(weekly, rawInventory, jetzt = Date.now(), opts = {}) {
  if (!weekly) return weekly;

  const manuell = opts.manuell || {};
  const wochenEnde  = weekly.resetAt ? new Date(weekly.resetAt).getTime() : null;
  const wochenStart = wochenEnde != null ? wochenEnde - WOCHE_MS : null;

  /* Wie alt ist das Dokument selbst? Nur DAS entscheidet, ob die Auswertung
     etwas ueber diese Woche sagen kann - die einzelnen Datensaetze darin
     pruefen ihre Woche danach jeweils selbst. */
  const stand  = rawInventory ? inventarStand(rawInventory) : null;
  const frisch = stand != null && wochenStart != null && stand >= wochenStart;

  const ctx = { wochenStart, wochenEnde, jetzt, kahlAnker: opts.kahlAnker };

  const content = weekly.content.map(e => {
    const eintrag = { ...e, manuellErledigt: !!manuell[e.key] };
    /* Gerechnet wird IMMER, auch mit altem Dokument - jeder Datensatz prueft
       seine eigene Woche und liefert dann eben 0. Das ist besser als gar
       keine Anzeige: die Karte behaelt ihre Form, und das Schild daneben
       sagt, ob die Null gemessen oder bloss ungelesen ist. */
    const p = rawInventory ? fortschrittFuer(e, rawInventory, ctx) : null;
    if (p) eintrag.progress = p;
    /* 'auto'    gemessen, aus einem Dokument dieser Woche
       'alt'     gerechnet, aber das Dokument ist aelter als diese Woche
       'manuell' gar kein Nachweis moeglich (Kahl ohne Anker) */
    eintrag.nachweis = !p ? 'manuell' : (frisch ? 'auto' : 'alt');
    eintrag.status = zustand(eintrag);
    return eintrag;
  });

  return {
    ...weekly,
    content,
    /* Damit die Oberflaeche sagen kann, wie aktuell das alles ist - und
       gegebenenfalls, warum gerade gar nichts verfolgt wird. */
    inventar: { vorhanden: !!rawInventory, stand, frisch },
    offen: content.filter(c => c.status !== 'done').length
  };
}

