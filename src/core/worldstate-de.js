/**
 * DEs eigener Weltzustand - die Rohform, die auch das Spiel liest - in der
 * Form, mit der core/worldstate.js rechnet.
 *
 * WARUM:
 *   warframestat.us haengt zeitweise eine Stunde und mehr hinterher. Die
 *   Rohform kommt dagegen vom CDN des Spiels: am 2026-10-03 lag ihr `Time`
 *   16 Sekunden hinter der Uhr, der Abruf antwortete mit Cache-Control
 *   max-age=27. Was gerade laeuft und wann es endet, steht deshalb ab jetzt
 *   HIER fest - Risse, Kopfgelder, Sortie, Archon, Invasionen, Alerts, Baro,
 *   Darvo und die Nightwave-Akte.
 *
 * WAS DIE ROHFORM NICHT HAT: lesbare Namen. Statt "Spy Catcher" steht dort
 *   .../Eidolon/Jobs/CaptureBountyCapTwo, statt "Eximus Stronghold"
 *   SORTIE_MODIFIER_EXIMUS, statt "Oceanum (Pluto)" SolNode102. Die Namen
 *   kommen deshalb in drei Stufen:
 *     1. Fuehrt warframestat.us DENSELBEN Eintrag (gleiche Kennung, gleicher
 *        Ablauf), wird dessen fertiger Eintrag genommen - und aus dem Paar
 *        gelernt, was welche Kennung heisst.
 *     2. Sonst aus der Knotentabelle, dem Katalog und dem Gelernten
 *        (core/world-names.js).
 *     3. Sonst eine Notloesung aus der Kennung selbst. Nie ein erfundener Name.
 *   Haengt warframestat.us, sieht man also trotzdem die richtigen Eintraege -
 *   und fast immer auch ihre richtigen Namen, weil die Kopfgelder, Sortie-
 *   Bedingungen und Nightwave-Akte aus einem festen Topf kommen.
 *
 * WAS BLEIBT, WIE ES IST: was DE gar nicht oder nur roh fuehrt und sich
 *   langsam aendert - Teshins Kreis, Ereignisse, Varzia, Circuit, Archimedea,
 *   Kuva, Simaris, Anomalie, Bau. Das kommt weiter von warframestat.us; eine
 *   Stunde Rueckstand ist dort ohne Belang.
 *
 * REIN: kein Netz, keine Datei, keine Uhr ausser `now` - laeuft so auch in
 * den Tests und im Browser des Handys.
 */

export const DE_WORLDSTATE_URL = 'https://api.warframe.com/cdn/worldState.php';

/* Die Relikt-Aera steht als Stufe in der Antwort: VoidT1 ist Lith. */
const AERA = {
  VoidT1: ['Lith', 1], VoidT2: ['Meso', 2], VoidT3: ['Neo', 3],
  VoidT4: ['Axi', 4], VoidT5: ['Requiem', 5], VoidT6: ['Omnia', 6]
};

/** Zeitpunkt in ms aus DEs Schreibweise ({ $date: { $numberLong: "..." } }), oder null. */
export function deMs(d) {
  const v = d?.$date?.$numberLong ?? d?.$date ?? (d?.sec != null ? d.sec * 1000 : d);
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : null;
}

const iso = ms => (ms == null ? null : new Date(ms).toISOString());
const kennung = x => x?._id?.$oid || x?._id?.$id || null;
const letzterTeil = p => String(p || '').split('/').pop();

/** Wann DE diesen Stand geschrieben hat - `Time` steht in Sekunden. */
export function deTimestamp(de) {
  return Number.isFinite(de?.Time) ? new Date(de.Time * 1000).toISOString() : null;
}

/** Sieht die Antwort aus wie DEs Weltzustand? Eine Fehlerseite tut es nicht. */
export function isDeWorldState(de) {
  return !!de && Number.isFinite(de.Time) && Array.isArray(de.ActiveMissions);
}

/* ------------------------------------------------------------------------
   Notnamen - nur, wenn weder warframestat.us noch das Gelernte weiterhilft
   ------------------------------------------------------------------------ */

/** "MT_MOBILE_DEFENSE" -> "Mobile Defense", "SORTIE_BOSS_RUK" -> "Ruk". */
function ausKennung(code, praefix) {
  return String(code || '').replace(praefix, '').toLowerCase().split('_').filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** "ZylokExilisSkin" -> "Zylok Exilis Skin". */
const ausCamel = s => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim();

/* "SeasonWeeklyPermanentKillEximus8" -> "Kill Eximus 8". Die Vorsilbe sagt
   nur, in welchem Topf der Akt liegt - das steht ohnehin daneben. */
const aktAusPfad = p => ausCamel(letzterTeil(p).replace(/^Season(DailyHard|Daily|WeeklyHard|Weekly)(Permanent)?/, '')
  .replace(/(\D)(\d+)$/, '$1 $2'));

/* "CetusSyndicate" -> "Cetus". Fuer Syndikate, deren Namen noch nie gelernt wurde. */
const syndikatAusTag = t => ausCamel(String(t || '').replace(/Syndicate$/, '')) || String(t || '');

/* ------------------------------------------------------------------------
   Namen nachschlagen und lernen
   ------------------------------------------------------------------------ */

/**
 * Die Werkzeuge eines Durchgangs: Nachschlagen in Knotentabelle, Katalog und
 * dem Gelernten - und das Sammeln neuer Paare. Gesammelt wird nur, was sich
 * vom bekannten Stand unterscheidet; gespeichert wird woanders.
 */
function werkzeug(ctx) {
  const buch = ctx.names || {};
  const learned = [];
  const schonDa = new Set();   // MT_INTEL kommt in einem Durchgang ein Dutzend Mal vorbei
  const known = (art, key) => (key != null ? buch[art]?.[key] ?? null : null);
  const learn = (art, key, value) => {
    if (key == null || key === '' || value == null || value === '') return;
    if (schonDa.has(art + '\u0000' + key)) return;
    schonDa.add(art + '\u0000' + key);
    if (JSON.stringify(known(art, key)) === JSON.stringify(value)) return;
    learned.push([art, key, value]);
  };
  const node = id => (id && ctx.node?.(id)) || null;
  return {
    now: ctx.now ?? Date.now(),
    learned, known, learn, node,
    nodeName: id => node(id)?.name || id || '',
    /* Fuer Sortie, Archon und Alerts NICHT den Typ des Knotens nehmen: die
       Sortie vom 2026-10-03 lief Assault auf Taveuni, und die Knotentabelle
       fuehrt Taveuni als Survival. */
    missionType: code => known('mission', code) || ausKennung(code, /^MT_/),
    faction: code => known('faction', code) || ausKennung(code, /^FC_/),
    item: path => (path && ctx.item?.(path)) || known('item', path) || ausCamel(letzterTeil(path))
  };
}

/** Der Eintrag, der gerade laeuft - sonst der erste. */
function laufend(list, now) {
  const l = Array.isArray(list) ? list : [];
  return l.find(x => (deMs(x.Activation) ?? -Infinity) <= now && now < (deMs(x.Expiry) ?? Infinity)) || l[0] || null;
}

/** Belohnung einer Invasionsseite oder eines Alerts, in warframestat-Form. */
function belohnung(r, h) {
  if (!r || Array.isArray(r)) return { items: [], countedItems: [], credits: 0 };
  return {
    items: (r.items || []).map(p => h.item(p)),
    countedItems: (r.countedItems || []).map(c => ({ uniqueName: c.ItemType, type: h.item(c.ItemType), count: c.ItemCount ?? 1 })),
    credits: r.credits || 0
  };
}

/**
 * Aus einem Paar gleicher Belohnungen die Item-Namen lernen. warframestat.us
 * fuehrt auch die ungezaehlten Items (DEs `items`) unter countedItems, mit
 * Pfad - ueber den Pfad finden beide zusammen.
 */
function belohnungLernen(r, w, h) {
  if (!r || Array.isArray(r) || !w) return;
  const namen = new Map((w.countedItems || []).map(c => [c.uniqueName, c.type]));
  for (const p of [...(r.countedItems || []).map(c => c.ItemType), ...(r.items || [])]) {
    if (namen.has(p)) h.learn('item', p, namen.get(p));
  }
}

/* ------------------------------------------------------------------------
   Die Abschnitte
   ------------------------------------------------------------------------ */

/**
 * Risse und Void-Stuerme.
 *
 * Knoten, Missionstyp und Gegner kommen aus der Knotentabelle. Nachgemessen
 * am 2026-10-03 an allen 32 offenen Rissen und Stuermen: warframestat.us
 * meldete fuer jeden genau den Namen, Typ und Gegner, den die Tabelle fuer
 * seinen Knoten fuehrt. Stuerme tragen gar keinen Missionstyp - fuer sie ist
 * die Tabelle die einzige Quelle.
 */
function risse(de, wfs, h) {
  const alt = new Map((wfs?.fissures || []).map(f => [f.id, f]));
  const out = [];

  const eintrag = (m, stufe, sturm) => {
    const id = kennung(m);
    const w = alt.get(id);
    if (w) {
      if (!sturm) h.learn('mission', m.MissionType, w.missionType);
      return w;
    }
    const n = h.node(m.Node);
    const [tier, tierNum] = AERA[stufe] || [stufe, 9];
    return {
      id,
      activation: iso(deMs(m.Activation)),
      expiry: iso(deMs(m.Expiry)),
      node: n?.name || m.Node || '',
      missionType: (!sturm && h.known('mission', m.MissionType)) || n?.type
                   || (sturm ? 'Mission' : ausKennung(m.MissionType, /^MT_/)),
      enemy: n?.enemy || '',
      tier,
      tierNum,
      isStorm: sturm,
      isHard: !!m.Hard
    };
  };

  /* Ein Eintrag ohne Stufe ist kein Riss - was DE dort sonst noch ablegt,
     gehoert nicht in die Liste. */
  for (const m of de.ActiveMissions || []) if (m?.Modifier) out.push(eintrag(m, m.Modifier, false));
  for (const s of de.VoidStorms || []) if (s?.ActiveMissionTier) out.push(eintrag(s, s.ActiveMissionTier, true));
  return out;
}

/** Sortie: drei Missionen mit Bedingung, ein Boss. */
function sortie(de, wfs, h) {
  const s = laufend(de.Sorties, h.now);
  if (!s) return null;
  const id = kennung(s);
  const w = wfs?.sortie;

  if (w && w.id === id) {
    h.learn('boss', s.Boss, { boss: w.boss, faction: w.faction });
    (s.Variants || []).forEach((v, i) => {
      const wv = w.variants?.[i];
      /* Gepaart wird ueber die Reihenfolge - aber nur, wenn der Knoten
         bestaetigt, dass es dieselbe Mission ist. */
      if (!wv || h.node(v.node)?.name !== wv.node) return;
      h.learn('mission', v.missionType, wv.missionType);
      h.learn('modifier', v.modifierType, { modifier: wv.modifier, modifierDescription: wv.modifierDescription || '' });
    });
    return w;
  }

  const boss = h.known('boss', s.Boss);
  return {
    id,
    activation: iso(deMs(s.Activation)),
    expiry: iso(deMs(s.Expiry)),
    boss: boss?.boss || ausKennung(s.Boss, /^SORTIE_BOSS_/),
    faction: boss?.faction || '',
    variants: (s.Variants || []).map(v => {
      const b = h.known('modifier', v.modifierType);
      return {
        node: h.nodeName(v.node),
        missionType: h.missionType(v.missionType),
        modifier: b?.modifier || ausKennung(v.modifierType, /^SORTIE_MODIFIER_/),
        modifierDescription: b?.modifierDescription || ''
      };
    })
  };
}

/** Archon-Jagd: dieselbe Form wie die Sortie, nur ohne Bedingungen. */
function archon(de, wfs, h) {
  const a = laufend(de.LiteSorties, h.now);
  if (!a) return null;
  const id = kennung(a);
  const w = wfs?.archonHunt;

  if (w && w.id === id) {
    h.learn('boss', a.Boss, { boss: w.boss, faction: w.faction });
    (a.Missions || []).forEach((m, i) => {
      const wm = w.missions?.[i];
      if (wm && h.node(m.node)?.name === wm.node) h.learn('mission', m.missionType, wm.type);
    });
    return w;
  }

  const boss = h.known('boss', a.Boss);
  return {
    id,
    activation: iso(deMs(a.Activation)),
    expiry: iso(deMs(a.Expiry)),
    boss: boss?.boss || ausKennung(a.Boss, /^SORTIE_BOSS_/),
    faction: boss?.faction || '',
    missions: (a.Missions || []).map(m => ({ node: h.nodeName(m.node), type: h.missionType(m.missionType) }))
  };
}

/**
 * Syndikate: Kopfgelder der offenen Welten und die sieben Knoten der
 * klassischen Syndikate.
 *
 * Die Kennung bei warframestat.us ist Ablauf in ms plus Tag
 * ("1790993759617CetusSyndicate", beobachtet am 2026-10-03) - stimmt sie,
 * ist es dieselbe Rotation. Sonst haengt die Quelle, und die Auftraege kommen
 * von hier.
 *
 * `syndicateKey` traegt dann den Tag selbst: die Zuordnung in
 * core/worldstate.js (KOPFGELD_SYNDIKATE) erkennt "CetusSyndicate" ebenso wie
 * "Ostrons".
 */
function syndikate(de, wfs, h) {
  const alt = new Map((wfs?.syndicateMissions || []).map(s => [s.id, s]));

  return (de.SyndicateMissions || []).map(s => {
    const ablauf = deMs(s.Expiry);
    const id = `${ablauf}${s.Tag}`;
    const w = alt.get(id);
    const jobs = s.Jobs || [];

    if (w) {
      if (w.syndicate && w.syndicate !== s.Tag) h.learn('syndicate', s.Tag, w.syndicate);
      jobs.forEach((j, i) => {
        const wj = w.jobs?.[i];
        if (wj && wj.uniqueName === j.rewards) h.learn('job', auftragsArt(j), wj.type);
      });
      return w;
    }

    const name = h.known('syndicate', s.Tag) || syndikatAusTag(s.Tag);
    return {
      id,
      activation: iso(deMs(s.Activation)),
      expiry: iso(ablauf),
      syndicate: name,
      syndicateKey: s.Tag,
      nodes: (s.Nodes || []).map(h.nodeName),
      jobs: jobs.map(j => auftrag(j, s.Tag, ablauf, h))
    };
  });
}

/* Woran ein Auftrag seinen Namen haengt. Isolation Vaults haben keinen
   jobType, nur ihre Kammer ("ChamberB"). */
const auftragsArt = j => j.jobType || (j.isVault ? `vault:${j.locationTag || ''}` : null);

function auftrag(j, tag, ablauf, h) {
  const art = auftragsArt(j);
  const name = h.known('job', art)
    || (j.isVault ? `Isolation Vault ${ausCamel(j.locationTag || '')}`.trim() : 'Bounty');
  /* Narmer-Auftraege gibt es in Cetus nur bei Tag, in Fortuna nur bei Nacht -
     so meldete es warframestat.us am 2026-10-03 fuer beide. */
  const narmer = /\/Narmer\//.test(j.jobType || '');
  return {
    id: `${letzterTeil(j.jobType)}${j.locationTag || ''}${ablauf}`,
    expiry: iso(ablauf),
    uniqueName: j.rewards || null,
    type: name,
    enemyLevels: [j.minEnemyLevel, j.maxEnemyLevel].filter(n => Number.isFinite(n)),
    standingStages: Array.isArray(j.xpAmounts) ? j.xpAmounts : [],
    minMR: j.masteryReq ?? 0,
    isVault: !!j.isVault,
    locationTag: j.locationTag || null,
    timeBound: narmer ? (tag === 'CetusSyndicate' ? 'day' : tag === 'SolarisSyndicate' ? 'night' : null) : null
  };
}

/**
 * Invasionen.
 *
 * Eine Invasion laeuft tagelang unter derselben Kennung, ihr Fortschritt
 * aendert sich aber laufend. Selbst wenn warframestat.us sie kennt, kommt der
 * Stand deshalb von hier - nur die Namen von dort.
 *
 * DER FORTSCHRITT, nachgemessen am 2026-10-03 an allen sieben Invasionen:
 * `Count` laeuft von -Goal bis +Goal. Gegen die Infestation kaempft nur die
 * verteidigende Seite, die Leiste reicht deshalb nur bis zur Mitte -
 *   (1 + Count/Goal) * 50   sonst
 *   (1 + Count/Goal) * 100  gegen die Infestation
 * Beide Formeln trafen warframestat.us auf die dritte Nachkommastelle.
 */
function invasionen(de, wfs, h) {
  const alt = new Map((wfs?.invasions || []).map(i => [i.id, i]));

  return (de.Invasions || []).map(i => {
    const id = kennung(i);
    const vsInf = i.Faction === 'FC_INFESTATION';
    const goal = Number(i.Goal) || 0;
    const stand = {
      count: i.Count ?? null,
      requiredRuns: goal || null,
      completion: goal ? (1 + (Number(i.Count) || 0) / goal) * (vsInf ? 100 : 50) : null,
      completed: !!i.Completed
    };

    const w = alt.get(id);
    if (w) {
      h.learn('text', i.LocTag, w.desc);
      h.learn('faction', i.Faction, w.attacker?.faction);
      h.learn('faction', i.DefenderFaction, w.defender?.faction);
      belohnungLernen(i.AttackerReward, w.attacker?.reward, h);
      belohnungLernen(i.DefenderReward, w.defender?.reward, h);
      return { ...w, ...stand, completion: stand.completion ?? w.completion };
    }

    const angreifer = h.faction(i.Faction);
    const verteidiger = h.faction(i.DefenderFaction);
    return {
      id,
      activation: iso(deMs(i.Activation)),
      node: h.nodeName(i.Node),
      desc: h.known('text', i.LocTag) || `${angreifer} vs ${verteidiger}`,
      attacker: { faction: angreifer, reward: belohnung(i.AttackerReward, h) },
      defender: { faction: verteidiger, reward: belohnung(i.DefenderReward, h) },
      vsInfestation: vsInf,
      ...stand,
      completion: stand.completion ?? 0
    };
  });
}

/** Alerts - selten, aber wenn, dann mit begehrter Belohnung. */
function alerts(de, wfs, h) {
  const alt = new Map((wfs?.alerts || []).map(a => [a.id, a]));

  return (de.Alerts || []).map(a => {
    const id = kennung(a);
    const mi = a.MissionInfo || {};
    const w = alt.get(id);
    if (w) {
      h.learn('text', mi.descText, w.mission?.description);
      h.learn('mission', mi.missionType, w.mission?.type);
      h.learn('faction', mi.faction, w.mission?.faction);
      belohnungLernen(mi.missionReward, w.mission?.reward, h);
      return w;
    }
    return {
      id,
      activation: iso(deMs(a.Activation)),
      expiry: iso(deMs(a.Expiry)),
      mission: {
        description: h.known('text', mi.descText) || null,
        node: h.nodeName(mi.location),
        type: h.missionType(mi.missionType),
        faction: h.faction(mi.faction),
        minEnemyLevel: mi.minEnemyLevel ?? null,
        maxEnemyLevel: mi.maxEnemyLevel ?? null,
        reward: belohnung(mi.missionReward, h)
      },
      tag: a.Tag || null
    };
  });
}

/**
 * Baro. Seine Kennung bleibt von Besuch zu Besuch dieselbe - derselbe Besuch
 * ist es nur, wenn auch die Ankunft stimmt.
 */
function baro(de, wfs, h) {
  const v = Array.isArray(de.VoidTraders) ? de.VoidTraders[0] : null;
  if (!v) return null;
  const ankunft = deMs(v.Activation);
  const w = wfs?.voidTrader;

  if (w && w.id === kennung(v) && Date.parse(w.activation) === ankunft) {
    /* DE schreibt ihn intern "Baro'Ki Teel" - das gehoert nicht auf den Schirm. */
    h.learn('text', v.Character, w.character);
    (v.Manifest || []).forEach((m, i) => {
      const wi = w.inventory?.[i];
      if (wi && wi.uniqueName === m.ItemType) h.learn('item', m.ItemType, wi.item);
    });
    return w;
  }

  return {
    id: kennung(v),
    activation: iso(ankunft),
    expiry: iso(deMs(v.Expiry)),
    character: h.known('text', v.Character) || null,
    location: h.nodeName(v.Node),
    inventory: (v.Manifest || []).map(m => ({
      uniqueName: m.ItemType,
      item: h.item(m.ItemType),
      ducats: m.PrimePrice ?? 0,
      credits: m.RegularPrice ?? 0
    }))
  };
}

/** Darvo. Wie viele schon weg sind, aendert sich laufend - der Stand von hier. */
function darvo(de, wfs, h) {
  return (de.DailyDeals || []).map(d => {
    const ablauf = deMs(d.Expiry);
    const stand = { total: d.AmountTotal ?? null, sold: d.AmountSold ?? null };
    const w = (wfs?.dailyDeals || []).find(x => x.uniqueName === d.StoreItem && Date.parse(x.expiry) === ablauf);
    if (w) {
      h.learn('item', d.StoreItem, w.item);
      return { ...w, ...stand };
    }
    return {
      id: `${letzterTeil(d.StoreItem)}${ablauf}`,
      activation: iso(deMs(d.Activation)),
      expiry: iso(ablauf),
      item: h.item(d.StoreItem),
      uniqueName: d.StoreItem,
      originalPrice: d.OriginalPrice ?? null,
      salePrice: d.SalePrice ?? null,
      discount: d.Discount ?? null,
      ...stand
    };
  });
}

/**
 * Nightwave. Die Kennung eines Akts bei warframestat.us ist Ablauf in ms
 * plus der kleingeschriebene Dateiname ("1791072000000seasondailykillenemies",
 * beobachtet am 2026-10-03).
 *
 * Elite ist, was unter /WeeklyHard/ liegt. Das Standing haengt am Topf:
 * gelernt wird es je Topf, damit auch ein noch unbekannter Akt seine Zahl
 * bekommt - am 2026-10-03 waren es 1000 (taeglich), 4500 und 7000 (Elite).
 */
function nightwave(de, wfs, h) {
  const si = de.SeasonInfo;
  if (!si) return wfs?.nightwave ?? null;
  const w = wfs?.nightwave || null;
  const alt = new Map((w?.activeChallenges || []).map(c => [c.id, c]));

  const akte = (si.ActiveChallenges || []).map(c => {
    const ablauf = deMs(c.Expiry);
    const id = `${ablauf}${letzterTeil(c.Challenge).toLowerCase()}`;
    const topf = /\/WeeklyHard\//.test(c.Challenge) ? 'elite' : c.Daily ? 'daily' : 'weekly';
    const wc = alt.get(id);
    if (wc) {
      h.learn('challenge', c.Challenge, { title: wc.title, desc: wc.desc || '', reputation: wc.reputation ?? null });
      h.learn('standing', topf, wc.reputation);
      return wc;
    }
    const k = h.known('challenge', c.Challenge);
    return {
      id,
      activation: iso(deMs(c.Activation)),
      expiry: iso(ablauf),
      isDaily: !!c.Daily,
      isElite: topf === 'elite',
      title: k?.title || aktAusPfad(c.Challenge),
      desc: k?.desc || '',
      reputation: k?.reputation ?? h.known('standing', topf)
    };
  });

  return {
    ...(w || {}),
    activation: iso(deMs(si.Activation)),
    expiry: iso(deMs(si.Expiry)),
    season: si.Season ?? w?.season ?? null,
    phase: si.Phase ?? w?.phase ?? null,
    activeChallenges: akte
  };
}

/* ------------------------------------------------------------------------
   Zusammenbau
   ------------------------------------------------------------------------ */

/* Abschnitt der warframestat-Form <- Feld in DEs Antwort, das ihn traegt.
   Fehlt das Feld in DEs Antwort ganz, bleibt der Abschnitt von
   warframestat.us stehen - ein umbenanntes Feld bei DE soll keine Liste
   leeren, die die andere Quelle noch richtig fuehrt. */
const ABSCHNITTE = [
  ['fissures',          'ActiveMissions',    risse],
  ['sortie',            'Sorties',           sortie],
  ['archonHunt',        'LiteSorties',       archon],
  ['syndicateMissions', 'SyndicateMissions', syndikate],
  ['invasions',         'Invasions',         invasionen],
  ['alerts',            'Alerts',            alerts],
  ['voidTrader',        'VoidTraders',       baro],
  ['dailyDeals',        'DailyDeals',        darvo],
  ['nightwave',         'SeasonInfo',        nightwave]
];

/**
 * DEs Rohform und die Antwort von warframestat.us zu EINER Antwort in
 * warframestat-Form.
 *
 * @param de    DEs Rohform (api.warframe.com/cdn/worldState.php)
 * @param wfs   die Antwort von warframestat.us, oder null
 * @param ctx   { node(id) -> { name, type, enemy } | null,
 *                item(path) -> Name | null,
 *                names: das Gelernte ({ art: { kennung: wert } }),
 *                now }
 * @returns { data, learned } - `learned` sind neue Paare [art, kennung, wert]
 */
export function mergeDeWorldState(de, wfs = null, ctx = {}) {
  const h = werkzeug(ctx);
  const data = { ...(wfs || {}), timestamp: deTimestamp(de) };

  for (const [feld, deFeld, bau] of ABSCHNITTE) {
    if (de?.[deFeld] == null) continue;
    data[feld] = bau(de, wfs, h);
  }
  return { data, learned: h.learned };
}
