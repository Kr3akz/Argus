/**
 * Warframe World-State Live-Tracker
 * Holt offizielle DE-Echtzeitdaten über die warframestat.us API mit
 * automatischem tenno.tools Live-Fallback bei Ausfällen oder veraltetem Server-Stand.
 */
import { buildWeekly } from './weekly.js';
import { computeCycles, computeWorldCycles } from './cycles.js';

let cachedWorldstate = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 30000; // 30 Sekunden Cache

const TIER_NUMS = {
  Lith: 1,
  Meso: 2,
  Neo: 3,
  Axi: 4,
  Requiem: 5,
  Omnia: 6
};

export async function fetchWorldState({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedWorldstate && (now - lastFetchedAt < CACHE_TTL_MS)) {
    return cachedWorldstate;
  }

  let data = null;
  let primaryError = null;

  try {
    const res = await fetch('https://api.warframestat.us/pc/', {
      headers: { 'User-Agent': 'Argus/2.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    primaryError = err.message;
  }

  /* Die drei Freiland-Zyklen kommen NICHT aus der Antwort, sondern aus der
     Uhr - siehe core/cycles.js. Sie laufen nach einem festen Takt, und die
     Quelle hing hier regelmaessig Stunden hinterher, ohne dass es auffiel:
     ein abgelaufener Ablaufzeitpunkt sieht aus wie ein gueltiger. */
  const cycles = computeCycles();

  /* Risse aus der Primaerquelle formatieren und pruefen */
  let fissures = data?.fissures ? formatFissures(data.fissures) : [];
  let sourceName = 'warframestat';

  /* Wenn warframestat.us 0 aktive Risse liefert (haeufiger Parser-Lag / Stale Cache)
     oder die Anfrage scheiterte: Live-Risse von tenno.tools nachladen. */
  let fissureStamp = data?.timestamp || null;
  if (!fissures.length) {
    const fb = await fetchTennoToolsFissures();
    if (fb?.fissures?.length) {
      fissures = fb.fissures;
      sourceName = data ? 'warframestat+tennotools' : 'tennotools';
      /* Der Zeitstempel MUSS mitwandern. Sonst meldet die Anzeige weiter den
         Rueckstand der Primaerquelle - "Quelle haengt, abgelaufene Eintraege
         fehlen" - waehrend die Liste darunter aus einer frischen Quelle kommt
         und vollstaendig ist. Der Hinweis waere dann selbst der Fehler. */
      fissureStamp = fb.timestamp || fissureStamp;
    }
  }

  if (data) {
    try {
      const formatted = formatWorldState(data, {
        fissures,
        source: sourceName,
        sourceTimestamp: fissureStamp,
        cycles
      });

      cachedWorldstate = formatted;
      lastFetchedAt = now;
      return formatted;
    } catch (err) {
      console.warn('[WorldState] Formatierungsfehler Primaerquelle:', err.message);
    }
  }

  /* Primaerquelle komplett ausgefallen: Vollstaendigen Fallback ueber tenno.tools bauen */
  const fallbackFull = await fetchTennoToolsFullWorldState();
  if (fallbackFull) {
    fallbackFull.fissures = fissures.length ? fissures : fallbackFull.fissures;
    fallbackFull.counts = countAll(fallbackFull);
    cachedWorldstate = fallbackFull;
    lastFetchedAt = now;
    return fallbackFull;
  }

  /* Letzte Rettung: alter Cache oder leerer Stand. Die Uhren werden auch
     dann neu gerechnet - sie brauchen keine Quelle, und ein alter Stand
     zeigte sonst eine Nacht, die laengst vorbei ist. */
  if (cachedWorldstate) {
    return {
      ...cachedWorldstate,
      ...computeCycles(),
      cycles: computeWorldCycles(),
      error: primaryError || 'World state is out of date'
    };
  }

  const leer = {
    error: primaryError || 'World state unreachable',
    fetchedAt: new Date().toISOString(),
    source: 'none',
    sourceTimestamp: null,
    ...computeCycles(),
    cycles: computeWorldCycles(),
    ...LEERE_ZUSAETZE,
    voidTrader: null, fissures: [], sortie: null, archonHunt: null,
    events: [], nightwave: [], alerts: [], invasions: [], syndicates: [], steelPath: null
  };
  leer.counts = countAll(leer);
  return leer;
}

/* Die Felder, die erst mit dem Live-Tracker-Ausbau dazukamen. Ein Rueckfall,
   der sie nicht fuehrt, muss sie trotzdem LEER fuehren - die Oberflaeche
   fragt nicht bei jedem einzeln nach, ob es ihn gibt. */
const LEERE_ZUSAETZE = Object.freeze({
  nightwaveSeason: null,
  vaultTrader: null,
  dailyDeals: [],
  circuit: null,
  bounties: [],
  factionMissions: [],
  simaris: null,
  anomaly: null,
  construction: null
});

/**
 * Die rohe Antwort von warframestat.us in die Form, mit der Argus rechnet.
 *
 * Bewusst ohne Netz und ohne Zwischenspeicher: dieselbe Funktion laeuft im
 * Hauptprozess auf der Live-Antwort und in den Tests auf einem gespeicherten
 * Abzug. Was sie braucht, bekommt sie herein - auch die Uhrzeit.
 *
 * @param data  die rohe Antwort (api.warframestat.us/pc)
 * @param opts.fissures        schon gepruefte Risse (z. B. aus dem Rueckfall);
 *                             fehlen sie, kommen sie aus `data`
 * @param opts.source          Name der Quelle fuer die Anzeige
 * @param opts.sourceTimestamp Zeitstempel der Quelle, aus der die Risse stammen
 * @param opts.cycles          schon gerechnete Zyklen (sonst jetzt gerechnet)
 * @param opts.now             Bezugszeit in ms
 */
export function formatWorldState(data, {
  fissures = null, source = 'warframestat', sourceTimestamp, cycles = null, now = Date.now()
} = {}) {
  const formatted = {
    fetchedAt: new Date(now).toISOString(),
    source,
    /* Der Zeitstempel der QUELLE, nicht unserer - und zwar der Quelle, aus
       der die Risse stammen. Nur sie kann unvollstaendig sein; die Zyklen
       kommen aus der Uhr und die Wochenansicht schaut selbst nach. */
    sourceTimestamp: sourceTimestamp === undefined ? (data.timestamp || null) : sourceTimestamp,
    ...(cycles || computeCycles(now)),
    cycles: computeWorldCycles(now),
    voidTrader: formatVoidTrader(data.voidTrader),
    fissures: fissures || formatFissures(data.fissures || []),
    sortie: formatSortie(data.sortie),
    archonHunt: formatArchonHunt(data.archonHunt),
    events: formatEvents(data.events || []),
    nightwave: formatNightwave(data.nightwave),
    nightwaveSeason: formatNightwaveSeason(data.nightwave),
    alerts: [
      ...formatAlerts(data.alerts || []),
      ...formatKuva(data.kuva),
      ...formatArbitration(data.arbitration)
    ],
    invasions: formatInvasions(data.invasions || []),
    syndicates: formatSyndicates(data.syndicateMissions || []),
    bounties: formatBounties(data.syndicateMissions || [], data.events || []),
    factionMissions: formatFactionMissions(data.syndicateMissions || []),
    steelPath: formatSteelPath(data.steelPath),
    vaultTrader: formatVaultTrader(data.vaultTrader),
    dailyDeals: formatDailyDeals(data.dailyDeals),
    circuit: formatCircuit(data.duviriCycle),
    simaris: formatSimaris(data.simaris),
    anomaly: formatAnomaly(data.sentientOutposts, now),
    construction: formatConstruction(data.constructionProgress),
    /* Die Wochenansicht bekommt die ROHdaten: hier oben sind die
       Ablaufdaten schon zu Textbausteinen verrechnet, dort werden sie
       als Zeitpunkte gebraucht. Siehe core/weekly.js. */
    weekly: buildWeekly(data)
  };

  formatted.counts = countAll(formatted);
  return formatted;
}

/** Knoten-Name von 'Planet/Knoten' in 'Knoten (Planet)' normalisieren. */
function normaliseNode(loc) {
  if (!loc) return 'Unbekannt';
  const parts = loc.split('/');
  if (parts.length === 2) return `${parts[1]} (${parts[0]})`;
  return loc;
}

/**
 * Holt die aktuellen Void-Risse und Void-Stürme direkt von tenno.tools.
 * tenno.tools pollt DEs offiziellen Feed im Minutentakt und ist auch dann live,
 * wenn der warframestat.us-Dienst stundenlang hängt.
 */
export async function fetchTennoToolsFissures() {
  try {
    const res = await fetch('https://api.tenno.tools/worldstate', {
      headers: { 'User-Agent': 'Argus/2.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const now = Date.now();
    const fissures = [];

    for (const f of d.fissures?.data || []) {
      const expMs = f.end ? f.end * 1000 : null;
      if (expMs && expMs <= now) continue;
      const expiry = expMs ? new Date(expMs).toISOString() : null;
      const tier = f.tier || 'Lith';
      fissures.push({
        id: f.id,
        node: normaliseNode(f.location),
        missionType: f.missionType || 'Mission',
        enemy: f.faction || 'Corrupted',
        tier,
        tierNum: TIER_NUMS[tier] || 1,
        isHard: !!f.hard,
        isStorm: false,
        eta: etaFrom(expiry),
        expiry
      });
    }

    for (const s of d.voidstorms?.data || []) {
      const expMs = s.end ? s.end * 1000 : null;
      if (expMs && expMs <= now) continue;
      const expiry = expMs ? new Date(expMs).toISOString() : null;
      const tier = s.tier || 'Lith';
      fissures.push({
        id: s.id,
        node: normaliseNode(s.location),
        missionType: s.missionType || 'Mission',
        enemy: s.faction || 'Corrupted',
        tier,
        tierNum: TIER_NUMS[tier] || 1,
        isHard: false,
        isStorm: true,
        eta: etaFrom(expiry),
        expiry
      });
    }

    return {
      fissures: fissures.sort((a, b) => a.tierNum - b.tierNum || a.node.localeCompare(b.node)),
      timestamp: d.time ? new Date(d.time * 1000).toISOString() : null
    };
  } catch (err) {
    console.warn('[WorldState] tenno.tools Riss-Abruf fehlgeschlagen:', err.message);
    return null;
  }
}

/**
 * Vollstaendiger Fallback ueber tenno.tools, falls warframestat.us komplett ausfaellt.
 */
async function fetchTennoToolsFullWorldState() {
  try {
    const res = await fetch('https://api.tenno.tools/worldstate', {
      headers: { 'User-Agent': 'Argus/2.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const now = Date.now();

    const fissures = [];
    for (const f of d.fissures?.data || []) {
      const expMs = f.end ? f.end * 1000 : null;
      if (expMs && expMs <= now) continue;
      const expiry = expMs ? new Date(expMs).toISOString() : null;
      const tier = f.tier || 'Lith';
      fissures.push({
        id: f.id,
        node: normaliseNode(f.location),
        missionType: f.missionType || 'Mission',
        enemy: f.faction || 'Corrupted',
        tier,
        tierNum: TIER_NUMS[tier] || 1,
        isHard: !!f.hard,
        isStorm: false,
        eta: etaFrom(expiry),
        expiry
      });
    }
    for (const s of d.voidstorms?.data || []) {
      const expMs = s.end ? s.end * 1000 : null;
      if (expMs && expMs <= now) continue;
      const expiry = expMs ? new Date(expMs).toISOString() : null;
      const tier = s.tier || 'Lith';
      fissures.push({
        id: s.id,
        node: normaliseNode(s.location),
        missionType: s.missionType || 'Mission',
        enemy: s.faction || 'Corrupted',
        tier,
        tierNum: TIER_NUMS[tier] || 1,
        isHard: false,
        isStorm: true,
        eta: etaFrom(expiry),
        expiry
      });
    }

    const sorties = (d.sorties?.data || []).map(s => ({
      boss: s.bossName || 'Sortie Boss',
      faction: s.faction || 'Grineer',
      eta: s.end ? etaFrom(new Date(s.end * 1000).toISOString()) : '',
      variants: (s.missions || []).map(m => ({
        node: normaliseNode(m.location),
        missionType: m.missionType || '',
        modifier: m.modifier || '',
        modifierDescription: ''
      }))
    }))[0] || null;

    const alerts = (d.alerts?.data || [])
      .filter(a => !a.end || a.end * 1000 > now)
      .map(a => ({
        id: a.id,
        art: 'alert',
        titel: a.missionType || 'Alert',
        node: normaliseNode(a.location),
        missionType: a.missionType || 'Mission',
        faction: a.faction || '',
        minLevel: a.minLevel ?? null,
        maxLevel: a.maxLevel ?? null,
        reward: a.rewards?.credits ? `${a.rewards.credits} credits` : 'Reward',
        eta: a.end ? etaFrom(new Date(a.end * 1000).toISOString()) : ''
      }));

    const invasions = (d.invasions?.data || []).map(i => {
      const completion = i.endScore && i.score ? Math.round((i.score / i.endScore) * 100) : 50;
      return {
        id: i.id,
        node: normaliseNode(i.location),
        desc: `${i.factionAttacker || ''} vs ${i.factionDefender || ''}`,
        attacker: i.factionAttacker || '',
        attackerReward: '',
        defender: i.factionDefender || '',
        defenderReward: '',
        completion: Math.max(0, Math.min(100, completion)),
        vsInfestation: (i.factionDefender || '').toLowerCase().includes('infest')
      };
    });

    const voidTraderEntry = (d.voidtraders?.data || [])[0];
    const voidTrader = voidTraderEntry ? {
      character: voidTraderEntry.name || "Baro Ki'Teer",
      active: !!voidTraderEntry.active,
      location: normaliseNode(voidTraderEntry.location),
      activation: voidTraderEntry.start ? new Date(voidTraderEntry.start * 1000).toISOString() : null,
      expiry: voidTraderEntry.end ? new Date(voidTraderEntry.end * 1000).toISOString() : null,
      startString: voidTraderEntry.start ? etaFrom(new Date(voidTraderEntry.start * 1000).toISOString()) : '',
      endString: voidTraderEntry.end ? etaFrom(new Date(voidTraderEntry.end * 1000).toISOString()) : '',
      inventory: []
    } : null;

    return {
      fetchedAt: new Date().toISOString(),
      source: 'tennotools',
      sourceTimestamp: d.time ? new Date(d.time * 1000).toISOString() : null,
      ...computeCycles(),
      cycles: computeWorldCycles(),
      ...LEERE_ZUSAETZE,
      voidTrader,
      fissures: fissures.sort((a, b) => a.tierNum - b.tierNum || a.node.localeCompare(b.node)),
      sortie: sorties,
      archonHunt: null,
      events: [],
      nightwave: [],
      alerts,
      invasions,
      syndicates: [],
      steelPath: null,
      /* Der Rueckfall liefert nur Risse - fuer die Wochenansicht hat er
         nichts, und ein leeres Geruest waere schlimmer als gar keins. */
      weekly: null
    };
  } catch (err) {
    console.warn('[WorldState] tenno.tools Vollabruf fehlgeschlagen:', err.message);
    return null;
  }
}


/**
 * Baro.
 *
 * ANWESEND WIRD GERECHNET, NICHT ABGESCHRIEBEN.
 *   warframestat.us schickt im voidTrader-Objekt genau neun Felder, und
 *   `active` ist keines davon - nachgemessen am Vollabruf: id, activation,
 *   expiry, character, location, inventory, psId, initialStart, schedule.
 *   `!!vt.active` war damit IMMER false. Baro stand auch dann als "unterwegs"
 *   da, wenn er im Relais stand, und weil `startString` ebenso fehlt, stand
 *   daneben der Notnagel "in a few days" - zwei Wochen lang derselbe Satz.
 *
 *   Die beiden Zeitpunkte hat die Quelle dagegen immer. Aus ihnen ergibt sich
 *   beides von selbst, und zwar ohne dass jemand ein Feld pflegen muesste,
 *   das es nie gab.
 *
 * DIE TEXTE SIND EIN RUECKFALL, KEINE ANZEIGE.
 *   Sie entstehen beim Abruf und altern ab der naechsten Sekunde. Wer sie
 *   dem Nutzer zeigt, rechnet aus activation/expiry selbst - siehe die
 *   tickenden Uhren im Renderer. Hier stehen sie fuer alles, was nur einen
 *   Satz braucht und keinen Zaehler.
 */
export function formatVoidTrader(vt) {
  if (!vt) return null;

  const jetzt = Date.now();
  const start = vt.activation ? new Date(vt.activation).getTime() : NaN;
  const ende  = vt.expiry     ? new Date(vt.expiry).getTime()     : NaN;

  const aktiv = Number.isFinite(start) || Number.isFinite(ende)
    ? (!Number.isFinite(start) || start <= jetzt) && (!Number.isFinite(ende) || ende > jetzt)
    /* Ohne beide Zeitpunkte bleibt nur das Feld, das es vielleicht doch gibt -
       der Rueckfall ueber tenno.tools fuehrt es tatsaechlich. */
    : !!vt.active;

  return {
    character: vt.character || "Baro Ki'Teer",
    active: aktiv,
    location: vt.location || 'Relay',
    activation: vt.activation || null,
    expiry: vt.expiry || null,
    /* Nur die Frist ausweisen, die noch laeuft: waehrend er dasteht, liegt
       seine Ankunft hinter uns, und etaFrom antwortete darauf "expired". */
    startString: vt.startString || (aktiv ? '' : etaFrom(vt.activation)),
    endString: vt.endString || etaFrom(vt.expiry),
    inventory: (vt.inventory || []).map(item => ({
      item: item.item || item.uniqueName || 'Item',
      /* Der Pfad ist die einzige belastbare Kupplung zum Inventar - im Laden
         heisst dieselbe Ware anders als im Schrank ("Prime Revenant Cape"
         gegen "Revenant Prime Cape"). Ohne ihn kann der Einkaufszettel in
         core/baro.js nicht sagen, was man schon hat. */
      uniqueName: item.uniqueName || null,
      ducats: item.ducats || 0,
      credits: item.credits || 0
    }))
  };
}

/** Ist der Eintrag laut Zeitstempel noch gueltig? */
function stillActive(entry) {
  if (entry.expired) return false;          // falls die API das Feld doch schickt
  if (!entry.expiry) return true;           // ohne Ablauf nicht wegwerfen
  return new Date(entry.expiry).getTime() > Date.now();
}

function formatFissures(list) {
  /* Frueher reichte !f.expired. Das Feld schickt die API nicht mehr, wodurch der
     Filter nichts mehr aussortierte und abgelaufene Risse in der Liste standen -
     deshalb ueber expiry pruefen. */
  return list
    .filter(stillActive)
    .map(f => ({
      id: f.id,
      node: f.node || 'Unbekannt',
      missionType: f.missionType || 'Mission',
      enemy: f.enemy || 'Corrupted',
      tier: f.tier || 'Lith',
      tierNum: f.tierNum || 1,
      isHard: !!f.isHard,
      isStorm: !!f.isStorm,
      eta: f.eta || etaFrom(f.expiry),
      expiry: f.expiry || null
    }))
    .sort((a, b) => a.tierNum - b.tierNum || a.node.localeCompare(b.node));
}

function formatSortie(s) {
  if (!s) return null;
  return {
    /* Die Kennung ist dieselbe, unter der das Inventar erledigte Missionen
       ablegt (CompletedSorties: "SolNode127_<id>") - darueber zaehlt der
       Live-Tracker, wie viele der drei schon gelaufen sind. */
    id: s.id || null,
    activation: s.activation || null,
    expiry: s.expiry || null,
    boss: s.boss || 'Boss',
    faction: s.faction || 'Grineer',
    eta: s.eta || etaFrom(s.expiry),
    variants: (s.variants || []).map(v => ({
      node: v.node || '',
      missionType: v.missionType || '',
      modifier: v.modifier || '',
      modifierDescription: v.modifierDescription || ''
    }))
  };
}

function formatArchonHunt(a) {
  if (!a) return null;
  return {
    id: a.id || null,
    activation: a.activation || null,
    expiry: a.expiry || null,
    boss: a.boss || 'Archon',
    faction: a.faction || 'Narmer',
    eta: a.eta || etaFrom(a.expiry),
    missions: (a.missions || []).map(m => ({
      node: m.node || '',
      type: m.type || m.missionType || ''
    }))
  };
}

/* --------------- Weltzustand: Ereignisse, Invasionen, Syndikate --------------- */

/**
 * Restlaufzeit als kurzer Text.
 *
 * Frueher lieferte warframestat.us bei Rissen und Sortie ein fertiges `eta`.
 * Das Feld gibt es dort **nicht mehr** (2026-08-20 nachgeprueft: weder sortie,
 * archonHunt, fissures, voidTrader noch syndicateMissions tragen es). Jede
 * Restzeit wird deshalb aus `expiry` gerechnet; das `x.eta ||` davor bleibt nur
 * stehen, falls die API es wieder mitschickt.
 */
function etaFrom(expiry) {
  if (!expiry) return '';
  const ms = new Date(expiry).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Belohnung einer Invasionsseite als lesbarer Text. */
function rewardText(reward) {
  if (!reward) return '';
  /* Dieselbe Belohnung steht oft ZWEIMAL in der Antwort: einmal gezaehlt
     (countedItems) und einmal als Name (items). Am 2026-10-01 trugen die
     Tenno-United-Alerts beides - "1x Conquera Kuaka Floof, Conquera Kuaka
     Floof". Der Name zaehlt nur, wenn er nicht schon gezaehlt ist, und eine
     Eins vor einem Einzelstueck sagt nichts. */
  const gezaehlt = new Set();
  const parts = (reward.countedItems || []).map(c => {
    const name = c.type || c.key;
    gezaehlt.add(String(name).toLowerCase());
    return c.count > 1 ? `${c.count}x ${name}` : name;
  });
  parts.push(...(reward.items || []).filter(n => !gezaehlt.has(String(n).toLowerCase())));
  if (reward.credits) parts.push(`${reward.credits.toLocaleString('en-GB')} credits`);
  return parts.join(', ');
}

/** Laufende Weltereignisse (Operationen wie Thermia Fractures). */
function formatEvents(list) {
  const now = Date.now();
  return list
    .filter(e => e.expiry && new Date(e.expiry).getTime() > now)
    .map(e => ({
      id: e.id,
      name: e.description || 'Event',
      tooltip: e.tooltip || '',
      node: e.node || '',
      eta: etaFrom(e.expiry),
      expiry: e.expiry || null,
      // Nur Events mit Punktezaehler haben einen sinnvollen Fortschritt.
      progress: e.maximumScore
        ? Math.max(0, Math.min(100, Math.round((e.currentScore / e.maximumScore) * 100)))
        : null,
      rewards: (e.rewards || []).flatMap(r => r.items || []).slice(0, 4)
    }));
}

/**
 * Klassische Alerts. DE hat die weitgehend durch Nightwave ersetzt, das Feld
 * ist meist leer - die Anzeige muss also mit null Eintraegen zurechtkommen.
 */
function formatAlerts(list) {
  return list
    .filter(stillActive)
    .map(a => ({
      id: a.id,
      art: 'alert',
      /* "Tenno United Alert" sagt mehr als "Disruption" - der Missionstyp
         steht ohnehin in der Ortszeile darunter. */
      titel: a.mission?.description || a.mission?.type || 'Alert',
      node: a.mission?.node || '',
      missionType: a.mission?.type || 'Mission',
      faction: a.mission?.faction || '',
      minLevel: a.mission?.minEnemyLevel ?? null,
      maxLevel: a.mission?.maxEnemyLevel ?? null,
      reward: a.mission?.reward?.asString || rewardText(a.mission?.reward),
      eta: a.eta || etaFrom(a.expiry)
    }));
}

/**
 * Kuva-Siphons und Kuva-Fluten.
 *
 * Die API liefert beides in einer Liste; `type` unterscheidet sie ("Kuva Siphon"
 * bzw. "Kuva Flood"). Fluten sind die Stufe-100-Variante und deutlich lohnender,
 * darum werden sie eigens ausgewiesen.
 */
function formatKuva(list) {
  return (list || [])
    .filter(stillActive)
    .map(k => ({
      id: k.id,
      art: (k.type || '').toLowerCase().includes('flood') ? 'kuva-flut' : 'kuva-siphon',
      titel: (k.type || '').toLowerCase().includes('flood') ? 'Kuva-Flut' : 'Kuva-Siphon',
      node: k.node || '',
      missionType: k.missionType || k.type || 'Mission',
      faction: k.enemy || '',
      reward: 'Kuva',
      eta: k.eta || etaFrom(k.expiry)
    }));
}

/** Schlichtung (Arbitration) - eine einzelne Mission, kein Array. */
function formatArbitration(a) {
  if (!a || !stillActive(a)) return [];
  return [{
    id: a.id || 'arbitration',
    art: 'arbitration',
    titel: 'Schlichtung',
    node: a.node || '',
    missionType: a.type || a.missionType || 'Mission',
    faction: a.enemy || '',
    reward: 'Vitus-Essenz',
    eta: a.eta || etaFrom(a.expiry)
  }];
}

/**
 * Nightwave-Aufgaben. Die haben zwar keinen Missionsknoten, laufen aber ebenfalls
 * ab und gehoeren damit auf dieselbe Seite wie die uebrigen Zeitfenster.
 */
function formatNightwave(nw) {
  return (nw?.activeChallenges || [])
    .filter(stillActive)
    .map(c => ({
      id: c.id,
      art: c.isElite ? 'nightwave-elite' : (c.isDaily ? 'nightwave-taeglich' : 'nightwave'),
      titel: c.title || 'Nightwave',
      node: '',
      missionType: c.isElite ? 'Elite act' : (c.isDaily ? 'Daily act' : 'Weekly act'),
      faction: '',
      reward: c.reputation ? `${c.reputation} standing` : '',
      beschreibung: c.desc || '',
      eta: etaFrom(c.expiry)
    }));
}

/**
 * Nur laufende Invasionen - die API liefert abgeschlossene noch mit.
 * completion ist der Frontverlauf in Prozent zugunsten des Angreifers.
 */
function formatInvasions(list) {
  return list
    .filter(i => !i.completed)
    .map(i => ({
      id: i.id,
      node: i.node || '',
      desc: i.desc || '',
      attacker: i.attacker?.faction || '',
      attackerReward: rewardText(i.attacker?.reward),
      defender: i.defender?.faction || '',
      defenderReward: rewardText(i.defender?.reward),
      completion: Math.max(0, Math.min(100, Math.round(i.completion ?? 0))),
      vsInfestation: !!i.vsInfestation
    }));
}

/**
 * Syndikate mit tatsaechlichen Auftraegen.
 * Die API mischt hier Nightwave-Staffeln unter (RadioLegionIntermission...),
 * die weder Jobs noch Nodes haben - die gehoeren nicht in die Anzeige.
 */
function formatSyndicates(list) {
  return list
    .filter(s => (s.jobs || []).length || (s.nodes || []).length)
    .map(s => ({
      id: s.id,
      syndicate: s.syndicate || '',
      jobCount: (s.jobs || []).length,
      nodeCount: (s.nodes || []).length,
      jobs: (s.jobs || []).map(j => ({
        type: j.type || '',
        enemyLevels: j.enemyLevels || [],
        standing: j.standingStages ? j.standingStages.reduce((a, b) => a + b, 0) : null
      })).slice(0, 10),
      nodes: (s.nodes || []).slice(0, 10),
      eta: etaFrom(s.expiry)
    }));
}

/* Eine Woche in ms - Teshins Angebot wechselt im Wochentakt. */
const WOCHE_MS = 7 * 86400000;

/**
 * Steel Path: Teshins Wochenangebot, die Wochen danach und ob die Incursions
 * heute laufen.
 *
 * DIE KOMMENDEN WOCHEN SIND GERECHNET, NICHT GERATEN. `rotation` ist der
 * vollstaendige Kreis seiner Wochenangebote, in der Reihenfolge, in der sie
 * drankommen - der aktuelle Posten steht darin (am 2026-10-01 "Kitgun Riven
 * Mod" an dritter Stelle von acht). Was danach kommt, ist also einfach der
 * naechste Eintrag im Kreis. Steht der aktuelle Posten NICHT im Kreis, wird
 * nichts vorhergesagt - dann hat DE den Kreis umgebaut, und eine Liste ab
 * irgendeiner Stelle waere eine erfundene.
 *
 * `expiry` steht in der Antwort auf Sonntag 23:59:59. Die neue Woche beginnt
 * eine Sekunde spaeter, am Montag 0:00 UTC - deshalb auf die volle Minute
 * aufgerundet.
 */
function formatSteelPath(sp) {
  if (!sp) return null;
  const inc = sp.incursions || null;

  const kreis = (sp.rotation || []).filter(r => r?.name);
  const aktuell = sp.currentReward?.name || '';
  const stelle = kreis.findIndex(r => r.name === aktuell);
  const ende = sp.expiry ? Math.ceil(new Date(sp.expiry).getTime() / 60000) * 60000 : NaN;

  const upcoming = stelle >= 0 && Number.isFinite(ende)
    ? kreis.slice(1).map((_, i) => {
        const r = kreis[(stelle + 1 + i) % kreis.length];
        const ab = ende + i * WOCHE_MS;
        return {
          name: r.name,
          cost: r.cost ?? null,
          activation: new Date(ab).toISOString(),
          expiry: new Date(ab + WOCHE_MS).toISOString()
        };
      })
    : [];

  return {
    rewardName: aktuell,
    rewardCost: sp.currentReward?.cost ?? null,
    remaining: sp.remaining || '',
    activation: sp.activation || null,
    expiry: sp.expiry || null,
    upcoming,
    /* Was jederzeit bei ihm liegt, unabhaengig von der Woche. */
    evergreens: (sp.evergreens || []).filter(r => r?.name).map(r => ({ name: r.name, cost: r.cost ?? null })),
    // Die API liefert zu den Incursions nur einen Zeitraum, keine Missionsliste.
    incursionsActive: !!(inc && inc.expiry && new Date(inc.expiry).getTime() > Date.now()),
    incursionsEta: inc ? etaFrom(inc.expiry) : '',
    incursionsExpiry: inc?.expiry || null
  };
}

/* ------------------------- Ausbau des Live-Trackers ------------------------- */

/**
 * Nightwave als Staffel - die Akte selbst stehen in formatNightwave.
 * Die Staffel laeuft Monate; ihr Ende ist trotzdem eine echte Frist, und wer
 * Creds sparen will, will sie kennen.
 */
function formatNightwaveSeason(nw) {
  if (!nw) return null;
  return {
    season: nw.season ?? null,
    phase: nw.phase ?? null,
    activation: nw.activation || null,
    expiry: nw.expiry || null
  };
}

/**
 * Varzia, Prime Resurgence.
 *
 * Die Preisfelder heissen in der Antwort `ducats` und `credits`, weil
 * warframestat.us denselben Parser wie fuer Baro benutzt - Dukaten oder
 * Credits sind es aber nicht. Welche Waehrung welches Feld traegt, ist am
 * Abzug nicht sicher abzulesen (Pakete und Ausruestung stehen beide unter
 * `ducats`, die Relikte unter `credits`), deshalb gibt Argus die Zahlen
 * unter neutralem Namen weiter und schreibt keine Waehrung daneben, die es
 * nicht belegen kann.
 */
function formatVaultTrader(vt) {
  if (!vt) return null;
  return {
    character: vt.character || 'Varzia',
    location: vt.location || null,
    activation: vt.activation || null,
    expiry: vt.expiry || null,
    items: (vt.inventory || []).map(i => ({
      uniqueName: i.uniqueName || null,
      name: i.item || null,
      price: i.ducats ?? i.credits ?? null
    }))
  };
}

/** Darvos Tagesangebot. Meist genau eines; die Antwort ist trotzdem eine Liste. */
function formatDailyDeals(list) {
  return (list || [])
    .filter(stillActive)
    .map(d => ({
      item: d.item || 'Item',
      uniqueName: d.uniqueName || null,
      originalPrice: d.originalPrice ?? null,
      salePrice: d.salePrice ?? null,
      discount: d.discount ?? null,
      total: d.total ?? null,
      sold: d.sold ?? null,
      activation: d.activation || null,
      expiry: d.expiry || null
    }));
}

/**
 * Was der Circuit diese Woche zur Wahl stellt - nur die Namen. Aufgeloest
 * (Bild, Besitz, Helminth, Incarnon) wird im Hauptprozess, der Katalog und
 * Inventar hat; siehe core/world-view.js.
 */
function formatCircuit(duviri) {
  const auswahl = duviri?.choices || [];
  const holen = k => auswahl.find(c => String(c.category).toLowerCase() === k)?.choices || [];
  const normal = holen('normal');
  const hard = holen('hard');
  if (!normal.length && !hard.length) return null;
  return { normal, hard };
}

/* Die offenen Welten, die Kopfgelder vergeben - in der Reihenfolge, in der
   sie ins Spiel kamen. `zone` ist der Ort, an dem man sie annimmt, `table`
   das Feld in DEs Droptabellen, unter dem ihre Belohnungen stehen. */
const KOPFGELD_SYNDIKATE = [
  { match: /^ostrons?$|cetussyndicate/i,       key: 'ostrons',   name: 'Ostrons',        zone: 'Cetus · Plains of Eidolon',   table: 'cetusBountyRewards',   suffix: 'Cetus Bounty' },
  { match: /^solaris united$|solarissyndicate/i, key: 'solaris',  name: 'Solaris United', zone: 'Fortuna · Orb Vallis',        table: 'solarisBountyRewards', suffix: 'Orb Vallis Bounty' },
  { match: /^entrati$|entratisyndicate/i,      key: 'entrati',   name: 'Entrati',        zone: 'Necralisk · Cambion Drift',   table: 'deimosRewards',        suffix: 'Cambion Drift Bounty' },
  { match: /holdfasts|zarimansyndicate/i,      key: 'holdfasts', name: 'The Holdfasts',  zone: 'Chrysalith · Zariman',        table: 'zarimanRewards',       suffix: 'Zariman Bounty' },
  { match: /^cavia$|entratilabsyndicate/i,     key: 'cavia',     name: 'Cavia',          zone: 'Sanctum Anatomica · Deimos',  table: 'entratiLabRewards',    suffix: 'Entrati Lab Bounty' },
  { match: /^the hex$|hexsyndicate/i,          key: 'hex',       name: 'The Hex',        zone: 'Höllvania · 1999',            table: 'hexRewards',           suffix: 'WF1999 Bounty' }
];

export const BOUNTY_SYNDICATES = KOPFGELD_SYNDIKATE.map(({ match, ...rest }) => rest);

/**
 * Welche Rotation ein Kopfgeld gerade auszahlt, steht im Pfad seiner
 * Belohnungstabelle: .../TierATableARewards ist Stufe A, Rotation A;
 * .../VaultBountyTierBTableCRewards ein Isolation Vault mit Rotation C.
 *
 * Nachgeprueft am 2026-10-01 gegen eine zweite Quelle, die die Rotation als
 * eigenes Feld fuehrt: von 23 Auftraegen der Ostrons, Solaris United und
 * Entrati trugen dort 21 das Feld, und alle 21 stimmten - einschliesslich des
 * einen Entrati-Auftrags, der als einziger auf B stand (TierDTableBRewards).
 * Die zwei uebrigen (Entrati, Stufe 40-60 und 100) fuehrt sie ohne Rotation.
 */
export function bountyRotation(uniqueName) {
  const m = /Table([ABC])Rewards$/.exec(String(uniqueName || ''));
  return m ? m[1] : null;
}

function formatJob(j) {
  const stufen = Array.isArray(j.standingStages) ? j.standingStages : [];
  return {
    id: j.id || null,
    type: j.type || 'Bounty',
    levels: Array.isArray(j.enemyLevels) ? j.enemyLevels.slice(0, 2) : [],
    minMR: j.minMR ?? 0,
    standing: stufen,
    standingTotal: stufen.reduce((s, n) => s + (Number(n) || 0), 0),
    stages: stufen.length,
    rotation: bountyRotation(j.uniqueName),
    uniqueName: j.uniqueName || null,
    isVault: !!j.isVault,
    /* Narmer-Auftraege gibt es nur bei Tag (Cetus) bzw. Nacht (Fortuna). */
    timeBound: j.timeBound || null,
    expiry: j.expiry || null
  };
}

/**
 * Kopfgelder der offenen Welten, je Syndikat.
 *
 * Drei Syndikate fehlen in der Antwort regelmaessig mit leerer Liste: die
 * Holdfasts, Cavia und The Hex. Deren Auftraege wuerfelt der Spielclient
 * selbst aus - veroeffentlicht wird davon nichts. Sie stehen trotzdem hier,
 * mit leerer Liste, damit die Oberflaeche ihre festen Stufen aus den
 * Droptabellen zeigen kann, statt so zu tun, als gaebe es sie nicht.
 *
 * Kopfgelder eines laufenden EVENTS (Ghoul Purge) kommen als eigene Gruppe
 * dazu - sie haengen an der Operation, nicht an einem Syndikat.
 */
function formatBounties(syndicateMissions, events) {
  const out = [];
  for (const def of KOPFGELD_SYNDIKATE) {
    const s = syndicateMissions.find(x => def.match.test(x.syndicateKey || '') || def.match.test(x.syndicate || ''));
    out.push({
      key: def.key,
      syndicate: def.name,
      zone: def.zone,
      table: def.table,
      suffix: def.suffix,
      expiry: s?.expiry || null,
      published: !!(s?.jobs || []).length,
      jobs: (s?.jobs || []).map(formatJob)
    });
  }

  for (const e of events) {
    if (!(e.jobs || []).length || !e.expiry || new Date(e.expiry).getTime() <= Date.now()) continue;
    const ghoul = /ghoul/i.test(e.description || '') || (e.jobs || []).some(j => /Ghoul/i.test(j.uniqueName || ''));
    out.push({
      key: 'event-' + (e.id || e.description),
      syndicate: e.description || 'Operation',
      zone: ghoul ? 'Cetus · Plains of Eidolon' : (e.node || ''),
      table: ghoul ? 'cetusBountyRewards' : null,
      suffix: ghoul ? 'Ghoul Bounty' : null,
      expiry: e.expiry,
      published: true,
      isEvent: true,
      jobs: (e.jobs || []).map(formatJob)
    });
  }
  return out;
}

/**
 * Die klassischen Syndikate (Steel Meridian, Arbiters ...): sie vergeben
 * keine Kopfgelder, sondern markieren taeglich sieben Knoten, auf denen ihre
 * Missionen laufen.
 */
function formatFactionMissions(list) {
  return list
    .filter(s => (s.nodes || []).length && !(s.jobs || []).length)
    .map(s => ({
      syndicate: s.syndicate || s.syndicateKey || 'Syndicate',
      nodes: (s.nodes || []).filter(Boolean),
      expiry: s.expiry || null
    }))
    .sort((a, b) => a.syndicate.localeCompare(b.syndicate, 'en'));
}

/** Simaris' Syntheseziel. */
function formatSimaris(s) {
  if (!s?.target) return null;
  return { target: s.target, active: !!s.isTargetActive };
}

/**
 * Die Sentient-Anomalie im Veil. Die Antwort traegt sie auch dann, wenn
 * ihr Fenster vorbei ist - `active` allein reicht nicht, die Zeit entscheidet.
 */
function formatAnomaly(so, now = Date.now()) {
  if (!so?.mission || !so.active) return null;
  if (so.expiry && new Date(so.expiry).getTime() <= now) return null;
  return {
    node: so.mission.node || null,
    faction: so.mission.faction || null,
    type: so.mission.type || null,
    activation: so.activation || null,
    expiry: so.expiry || null
  };
}

/* Bau der Fomorian und der Razorback-Armada, in Prozent. Ueber 100 heisst:
   fertig gebaut. Wann der Angriff beginnt, steht nicht darin - am 2026-10-01
   meldete die Quelle den Fomorian mit 115,5 %, waehrend als Operation nur die
   Razorback-Armada lief. */
function formatConstruction(cp) {
  if (!cp) return null;
  const zahl = v => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  };
  return { fomorian: zahl(cp.fomorianProgress), razorback: zahl(cp.razorbackProgress) };
}

/** Zaehler fuer die Statusleiste - gleiche Reihenfolge wie im Spiel. */
function countAll(f) {
  return {
    events:     (f.events || []).length,
    nightwave:  (f.nightwave || []).length,
    alerts:     (f.alerts || []).length,
    steelPath:  f.steelPath && f.steelPath.incursionsActive ? 1 : 0,
    invasions:  (f.invasions || []).length,
    syndicates: (f.syndicates || []).length,
    fissures:   (f.fissures || []).length,
    sortie:     f.sortie ? 1 : 0,
    archon:     f.archonHunt ? 1 : 0,
    /* Sortie und Archon-Jagd teilen sich eine Unterseite - der Reiter zeigt,
       wie viele der beiden gerade laufen. */
    missions:   (f.sortie ? 1 : 0) + (f.archonHunt ? 1 : 0),
    /* Veroeffentlichte Auftraege, nicht Syndikate: drei davon wuerfelt das
       Spiel selbst aus, die zaehlen hier nicht mit. */
    bounties:   (f.bounties || []).reduce((s, b) => s + (b.jobs || []).length, 0),
    traders:    (f.voidTrader?.active ? 1 : 0) + (f.vaultTrader ? 1 : 0) + (f.dailyDeals || []).length
  };
}
