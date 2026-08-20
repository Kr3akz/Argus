/**
 * Warframe World-State Live-Tracker
 * Holt offizielle DE-Echtzeitdaten über die warframestat.us API.
 */

let cachedWorldstate = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 30000; // 30 Sekunden Cache

export async function fetchWorldState({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedWorldstate && (now - lastFetchedAt < CACHE_TTL_MS)) {
    return cachedWorldstate;
  }

  try {
    const res = await fetch('https://api.warframestat.us/pc/', {
      headers: { 'User-Agent': 'Kr3akz-Warframe-Guide/2.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const formatted = {
      fetchedAt: new Date().toISOString(),
      /* Der Zeitstempel der QUELLE, nicht unserer. warframestat.us liefert
         zeitweise stundenalte Staende - ohne diesen Wert kann die Oberflaeche
         eine leere Liste nicht von "Quelle haengt" unterscheiden. */
      sourceTimestamp: data.timestamp || null,
      cetus: formatCetus(data.cetusCycle),
      vallis: formatVallis(data.vallisCycle),
      cambion: formatCambion(data.cambionCycle),
      voidTrader: formatVoidTrader(data.voidTrader),
      fissures: formatFissures(data.fissures || []),
      sortie: formatSortie(data.sortie),
      archonHunt: formatArchonHunt(data.archonHunt),
      events: formatEvents(data.events || []),
      /* Eine gemeinsame Liste aller zeitlich begrenzten Missionen. Kuva, Schlichtung
         und Nightwave kommen aus getrennten Feldern, gehoeren fuer den Spieler aber
         zusammen: "was kann ich gerade machen, bevor es weg ist". */
      alerts: [
        ...formatAlerts(data.alerts || []),
        ...formatKuva(data.kuva),
        ...formatArbitration(data.arbitration),
        ...formatNightwave(data.nightwave)
      ],
      invasions: formatInvasions(data.invasions || []),
      syndicates: formatSyndicates(data.syndicateMissions || []),
      steelPath: formatSteelPath(data.steelPath)
    };

    formatted.counts = countAll(formatted);

    cachedWorldstate = formatted;
    lastFetchedAt = now;
    return formatted;
  } catch (err) {
    /* Ein alter Stand ist besser als gar keiner - aber der Fehler muss mit,
       sonst haelt die Oberflaeche veraltete Daten fuer frisch. */
    if (cachedWorldstate) return { ...cachedWorldstate, error: err.message };
    return {
      error: err.message,
      fetchedAt: new Date().toISOString(),
      sourceTimestamp: null,
      cetus: null, vallis: null, cambion: null,
      voidTrader: null, fissures: [], sortie: null, archonHunt: null,
      events: [], alerts: [], invasions: [], syndicates: [], steelPath: null,
      counts: { events: 0, alerts: 0, steelPath: 0, invasions: 0,
                syndicates: 0, fissures: 0, sortie: 0, archon: 0, missions: 0 }
    };
  }
}

function formatCetus(c) {
  if (!c) return null;
  return {
    state: c.state || (c.isDay ? 'day' : 'night'),
    isDay: !!c.isDay,
    timeLeft: c.timeLeft || '',
    expiry: c.expiry || null,
    shortString: c.shortString || `${c.timeLeft || ''} to ${c.isDay ? 'Night' : 'Day'}`
  };
}

function formatVallis(v) {
  if (!v) return null;
  return {
    state: v.state || (v.isWarm ? 'warm' : 'cold'),
    isWarm: !!v.isWarm,
    timeLeft: v.timeLeft || '',
    expiry: v.expiry || null,
    shortString: v.shortString || `${v.timeLeft || ''} to ${v.isWarm ? 'Cold' : 'Warm'}`
  };
}

function formatCambion(c) {
  if (!c) return null;
  return {
    state: c.state || 'fass', // 'fass' oder 'vome'
    isFass: c.state === 'fass',
    timeLeft: c.timeLeft || '',
    expiry: c.expiry || null
  };
}

function formatVoidTrader(vt) {
  if (!vt) return null;
  return {
    character: vt.character || "Baro Ki'Teer",
    active: !!vt.active,
    location: vt.location || 'Relay',
    activation: vt.activation || null,
    expiry: vt.expiry || null,
    startString: vt.startString || '',
    endString: vt.endString || '',
    inventory: (vt.inventory || []).map(item => ({
      item: item.item || item.uniqueName || 'Item',
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
  if (!Number.isFinite(ms) || ms <= 0) return 'abgelaufen';
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
  const parts = (reward.countedItems || []).map(c => `${c.count}x ${c.type || c.key}`);
  parts.push(...(reward.items || []));
  if (reward.credits) parts.push(`${reward.credits.toLocaleString('de-DE')} Credits`);
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
      titel: a.mission?.type || 'Alert',
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
      missionType: c.isElite ? 'Elite-Aufgabe' : (c.isDaily ? 'Tagesaufgabe' : 'Wochenaufgabe'),
      faction: '',
      reward: c.reputation ? `${c.reputation} Ansehen` : '',
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

/** Steel Path: Teshins Wochenangebot und ob die Incursions heute laufen. */
function formatSteelPath(sp) {
  if (!sp) return null;
  const inc = sp.incursions || null;
  return {
    rewardName: sp.currentReward?.name || '',
    rewardCost: sp.currentReward?.cost ?? null,
    remaining: sp.remaining || '',
    // Die API liefert zu den Incursions nur einen Zeitraum, keine Missionsliste.
    incursionsActive: !!(inc && inc.expiry && new Date(inc.expiry).getTime() > Date.now()),
    incursionsEta: inc ? etaFrom(inc.expiry) : ''
  };
}

/** Zaehler fuer die Statusleiste - gleiche Reihenfolge wie im Spiel. */
function countAll(f) {
  return {
    events:     (f.events || []).length,
    alerts:     (f.alerts || []).length,
    steelPath:  f.steelPath && f.steelPath.incursionsActive ? 1 : 0,
    invasions:  (f.invasions || []).length,
    syndicates: (f.syndicates || []).length,
    fissures:   (f.fissures || []).length,
    sortie:     f.sortie ? 1 : 0,
    archon:     f.archonHunt ? 1 : 0,
    /* Sortie und Archon-Jagd teilen sich eine Unterseite - der Reiter zeigt,
       wie viele der beiden gerade laufen. */
    missions:   (f.sortie ? 1 : 0) + (f.archonHunt ? 1 : 0)
  };
}
