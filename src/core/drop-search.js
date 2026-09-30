/**
 * Durchsuchbare Droptabellen - der Unterbau fuer den Reiter "Drop tables".
 *
 * WARUM NICHT EINFACH DER INDEX AUS droptables.js:
 *   Der beantwortet genau eine Frage - "wo faellt X?" - und legt dafuer alles
 *   unter dem Itemnamen ab. Ort, Modus und Rotation stehen dort zu einem
 *   Anzeigetext verklebt ("Survival · Rotation C"), weil sie nur gelesen und
 *   nie gefiltert werden. Fuer eine Suche mit Filtern muss jedes davon ein
 *   EIGENES Feld sein: "alles aus Rotation C auf Survival-Knoten" laesst sich
 *   aus einem zusammengesetzten Text nicht mehr sauber herausholen.
 *
 *   Deshalb eine zweite, flache Sicht auf dieselbe Datei. Eine Zeile je
 *   "Item faellt an Ort", jedes Merkmal ein Feld. Die Suche geht dann in beide
 *   Richtungen: nach dem Item, nach dem Ort, nach dem Gegner.
 *
 * WAS ANDERS IST ALS IM FUNDORT-INDEX:
 *   - Relikte in ALLEN vier Veredelungen. Die Chancen unterscheiden sich, und
 *     wer "lohnt sich Radiant?" fragt, braucht genau diesen Unterschied.
 *   - Jede Reliktzeile weiss, ob das Relikt gerade faellt (liveRelics).
 *   - Die Seltenheit der Reliktbelohnungen wird neu bestimmt, siehe unten.
 */

/* Die Arten, in der Reihenfolge der Filterleiste. `key` und `other` sind
   selten, stehen deshalb hinten. */
export const DROP_KINDS = [
  { key: 'mission',   label: 'Missions' },
  { key: 'special',   label: 'Special' },
  { key: 'bounty',    label: 'Bounties' },
  { key: 'enemy',     label: 'Enemies' },
  { key: 'relic',     label: 'Relics' },
  { key: 'syndicate', label: 'Syndicates' },
  { key: 'key',       label: 'Keys & vaults' },
  { key: 'sortie',    label: 'Sortie' },
  { key: 'other',     label: 'Other' }
];

export const REFINEMENTS = ['Intact', 'Exceptional', 'Flawless', 'Radiant'];

/* Die Kopfgeldtabellen tragen keinen Zonennamen - nur ihr Feldname sagt, wo
   sie hingehoeren. */
const BOUNTY_ZONES = [
  ['cetusBountyRewards',   'Cetus'],
  ['solarisBountyRewards', 'Orb Vallis'],
  ['deimosRewards',        'Cambion Drift'],
  ['zarimanRewards',       'Zariman'],
  ['entratiLabRewards',    'Sanctum Anatomica'],
  ['hexRewards',           'Höllvania']
];

const lc = s => String(s ?? '').toLowerCase();
const num = v => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = v => (v == null ? null : Math.round(v * 1000) / 1000);
const pct = v => `${Number(v ?? 0).toLocaleString('en-GB', { maximumFractionDigits: 2 })} %`;

/**
 * Die wahre Seltenheit der Reliktbelohnungen.
 *
 * NACHGEMESSEN am Abzug vom 30.09.2026: DE beschriftet in allen 799
 * Intact-Relikten auch die drei haeufigsten Belohnungen (25,33 %) als
 * "Uncommon" - im Spiel sind das die Bronze-Teile. Wer nach "Common" filtert,
 * bekaeme gar nichts, und die Farbmarke waere bei drei von sechs Zeilen falsch.
 *
 * Hergeleitet wird ohne feste Prozentwerte: In einem Intact-Relikt gibt es
 * genau drei Chancenstufen, und die hoechste ist Common, die mittlere
 * Uncommon, die niedrigste Rare. Bei Radiant stimmt diese Ordnung NICHT mehr
 * (Common 16,67 % liegt unter Uncommon 20 %) - deshalb wird die Stufe am
 * Intact-Relikt bestimmt und fuer die Veredelungen am Itemnamen nachgeschlagen.
 * Relikte, die nicht in drei Stufen zerfallen (Requiem: acht Belohnungen zu
 * je 9,5 %), behalten DEs Beschriftung.
 */
function relicRarities(relics) {
  const byRelic = new Map();
  for (const r of relics || []) {
    if (r.state !== 'Intact') continue;
    const tiers = [...new Set((r.rewards || []).map(x => num(x.chance)).filter(v => v != null))]
      .sort((a, b) => b - a);
    if (tiers.length !== 3) continue;
    const names = ['Common', 'Uncommon', 'Rare'];
    const map = new Map();
    for (const x of r.rewards) map.set(x.itemName, names[tiers.indexOf(num(x.chance))]);
    byRelic.set(`${r.tier} ${r.relicName}`, map);
  }
  return byRelic;
}

/**
 * Baut die flache Zeilenliste. `live` ist die Menge der Relikte, die gerade
 * irgendwo als Belohnung auftauchen (siehe liveRelics in droptables.js).
 * `wf` ist die Ergaenzungsquelle - sie kommt nur fuer Items zum Zug, die in
 * DEs Tabellen gar nicht vorkommen, genau wie beim Fundort-Index.
 */
export function buildDropRows(de, { live = null, wf = [] } = {}) {
  const rows = [];
  const add = (row) => {
    if (!row.item || !row.place) return;
    rows.push({
      item: String(row.item).trim(),
      kind: row.kind,
      place: String(row.place).trim(),
      region: row.region || null,
      mode: row.mode || null,
      rotation: row.rotation || null,
      stage: row.stage || null,
      refinement: row.refinement || null,
      vaulted: row.vaulted ?? null,
      chance: round(num(row.chance)),
      rarity: row.rarity || null,
      note: row.note || null,
      standing: row.standing ?? null
    });
  };

  /* --- Sternenkarte: Planet -> Knoten -> (Rotation) -> Belohnung --- */
  for (const [planet, nodes] of Object.entries(de?.missionRewards || {})) {
    for (const [node, info] of Object.entries(nodes || {})) {
      const base = { kind: 'mission', place: node, region: planet, mode: info?.gameMode };
      if (Array.isArray(info?.rewards)) {
        for (const r of info.rewards) add({ ...base, item: r.itemName, chance: r.chance, rarity: r.rarity });
      } else {
        for (const [rot, list] of Object.entries(info?.rewards || {})) {
          for (const r of list || []) {
            add({ ...base, item: r.itemName, rotation: rot, chance: r.chance, rarity: r.rarity });
          }
        }
      }
    }
  }

  /* --- Sonderziele: Arbitrations, Void Storms, Duviri, Archimedea ... ---
     Hier steht die Rotation an der einzelnen Belohnung, nicht als Gruppe. */
  for (const t of de?.transientRewards || []) {
    for (const r of t.rewards || []) {
      add({ kind: 'special', item: r.itemName, place: t.objectiveName, rotation: r.rotation,
            chance: r.chance, rarity: r.rarity });
    }
  }

  /* --- Kopfgelder. "Level 5 - 15 Cetus Bounty" wird zerlegt: die Zone als
     Region (dafuer gibt es einen Filter), die Stufe bleibt der Ort. --- */
  for (const [field, zone] of BOUNTY_ZONES) {
    for (const b of de?.[field] || []) {
      /* Nur der Zonenname faellt weg - "Ghoul Bounty", "Plague Star" und die
         Isolation Vaults sind eigene Auftraege und behalten ihren Namen. */
      const level = String(b.bountyLevel || '').replace(/\s+/g, ' ')
        .replace(/ (Cetus|Orb Vallis|Cambion Drift|Zariman|Entrati Lab|WF1999) Bounty$/i, '').trim();
      for (const [rot, list] of Object.entries(b.rewards || {})) {
        for (const r of list || []) {
          add({ kind: 'bounty', item: r.itemName, place: level || b.bountyLevel, region: zone,
                rotation: rot, stage: r.stage, chance: r.chance, rarity: r.rarity });
        }
      }
    }
  }

  /* --- Gegner: Mods und Bauplaene ---
     Zwei Wuerfe hintereinander - laesst der Gegner ueberhaupt etwas aus
     dieser Tabelle fallen, und ist es dann dieses Item. Gezeigt wird das
     Produkt, die beiden Faktoren stehen als Notiz daneben. */
  for (const m of de?.modLocations || []) {
    for (const e of m.enemies || []) {
      const table = num(e.enemyModDropChance) ?? 100;
      add({ kind: 'enemy', item: m.modName, place: e.enemyName, mode: 'Mod',
            chance: (num(e.chance) ?? 0) * table / 100, rarity: e.rarity,
            note: `Mod drop ${pct(table)} × table ${pct(e.chance)}` });
    }
  }
  const bpSeen = new Set();
  for (const b of de?.blueprintLocations || []) {
    for (const e of b.enemies || []) {
      bpSeen.add(lc(`${b.blueprintName || b.itemName}|${e.enemyName}`));
      bpSeen.add(lc(`${b.itemName}|${e.enemyName}`));
      const table = num(e.enemyBlueprintDropChance) ?? num(e.enemyItemDropChance) ?? 100;
      add({ kind: 'enemy', item: b.blueprintName || b.itemName, place: e.enemyName, mode: 'Blueprint',
            chance: (num(e.chance) ?? 0) * table / 100, rarity: e.rarity,
            note: `Item drop ${pct(table)} × table ${pct(e.chance)}` });
    }
  }
  /* Die Gegner-Tabellen nach Bauplaenen wiederholen blueprintLocations und
     bringen dazu, was dort fehlt (Steel Essence bei den Acolytes). Was schon
     oben steht, faellt hier weg: diese Tabelle kennt nur die ZWEITE Chance,
     nicht den Wurf davor - beim Stalker stuende "Dread Blueprint" sonst mit
     64,8 % neben den richtigen 32,4 %. Die Mod-Tabellen je Gegner bringen
     nichts Neues - nachgezaehlt: jede Karte daraus steht auch in modLocations. */
  for (const t of de?.enemyBlueprintTables || []) {
    const table = num(t.blueprintDropChance) ?? num(t.enemyItemDropChance) ?? 100;
    for (const i of t.items || []) {
      if (bpSeen.has(lc(`${i.itemName}|${t.enemyName}`))) continue;
      add({ kind: 'enemy', item: i.itemName, place: t.enemyName, mode: 'Item',
            chance: (num(i.chance) ?? 0) * table / 100, rarity: i.rarity });
    }
  }
  /* Ressourcen, Siegel und Beigaben je Gegner - hier stehen auch Behaelter
     und Lagerstaetten, weil DE sie wie Gegner fuehrt. */
  for (const [field, mode] of [['resourceByAvatar', 'Resource'], ['sigilByAvatar', 'Sigil'],
                               ['additionalItemByAvatar', 'Extra']]) {
    for (const s of de?.[field] || []) {
      for (const i of s.items || []) {
        add({ kind: 'enemy', item: i.item || i.itemName, place: s.source, mode,
              chance: i.chance, rarity: i.rarity });
      }
    }
  }

  /* --- Relikte, alle vier Veredelungen --- */
  const rarities = relicRarities(de?.relics);
  for (const r of de?.relics || []) {
    const name = `${r.tier} ${r.relicName}`;
    const fixed = rarities.get(name);
    for (const x of r.rewards || []) {
      add({ kind: 'relic', item: x.itemName, place: `${name} Relic`, region: r.tier,
            refinement: r.state, vaulted: live ? !live.has(name) : null,
            chance: x.chance, rarity: fixed?.get(x.itemName) || x.rarity });
    }
  }

  /* --- Schluessel und Gewoelbe --- */
  for (const k of de?.keyRewards || []) {
    for (const [rot, list] of Object.entries(k.rewards || {})) {
      for (const r of list || []) {
        add({ kind: 'key', item: r.itemName, place: k.keyName,
              rotation: rot === 'null' ? null : rot, chance: r.chance, rarity: r.rarity });
      }
    }
  }

  for (const s of de?.sortieRewards || []) {
    add({ kind: 'sortie', item: s.itemName, place: 'Sortie', chance: s.chance, rarity: s.rarity });
  }

  /* --- Syndikate: hier wird nicht gewuerfelt, hier wird gekauft ---
     `place` wiederholt den Syndikatsnamen und haengt Haendler und Rang an.
     Der Name wird der Ort, der Rang die Notiz - NICHT die Region: sonst
     stuenden "Neutral", "Exalted" und 60 weitere Raenge zwischen den Planeten
     in der Auswahlliste. Die 100 % der Quelle heissen
     "im Angebot", nicht "faellt sicher" - deshalb keine Chance. */
  for (const [syndicate, offers] of Object.entries(de?.syndicates || {})) {
    for (const o of offers || []) {
      const rest = String(o.place || '').startsWith(syndicate)
        ? String(o.place).slice(syndicate.length).replace(/^[\s,]+/, '')
        : '';
      add({ kind: 'syndicate', item: o.item, place: syndicate, note: rest || null,
            chance: null, rarity: o.rarity, standing: num(o.standing) });
    }
  }

  /* --- Entdoppeln ---
     DEs Tabellen fuehren manche Belohnung zweimal in derselben Rotation
     ("Fast Deflection" im Orokin-Archiv). Zwei gleiche Zeilen sagen nichts,
     was eine nicht sagt. */
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = [r.item, r.kind, r.place, r.region, r.rotation, r.stage, r.refinement, r.chance, r.mode].join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }

  /* --- Ergaenzung: nur Items, die DE gar nicht kennt ---
     Vor allem Syndikats-Augmente. Stuende die zweite Quelle auch bei Items,
     die DE fuehrt, mischten sich zwei Schreibweisen desselben Orts. */
  const known = new Set(out.map(r => lc(r.item)));
  for (const m of wf || []) {
    if (known.has(lc(m.name))) continue;
    for (const d of m.drops || []) {
      out.push({
        item: m.name, kind: 'other', place: d.location, region: null, mode: null,
        rotation: null, stage: null, refinement: null, vaulted: null,
        chance: d.chance === 100 ? null : round(num(d.chance)),
        rarity: d.rarity || null, note: null, standing: null
      });
    }
  }

  return indexRows(out);
}

/**
 * Suchschluessel einmal vorrechnen - die Suche laeuft bei jedem Tastendruck
 * ueber alle Zeilen. Nicht aufzaehlbar, damit sie weder ueber IPC noch in
 * eine Datei gehen.
 *
 * `_dkey` ist die Identitaet einer Zeile ueber zwei Staende hinweg: alles
 * ausser der Chance. Steht dasselbe Item zweimal mit verschiedenen Chancen am
 * selben Ort (kommt in Schluesseltabellen vor), zaehlt ein Suffix die
 * Wiederholungen durch - die Reihenfolge der Quelle ist stabil.
 */
export function indexRows(rows) {
  const seen = new Map();
  for (const r of rows) {
    const base = [r.item, r.kind, r.place, r.region, r.rotation, r.stage, r.refinement, r.mode].join('|');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    Object.defineProperty(r, '_item', { value: lc(r.item) });
    Object.defineProperty(r, '_place', {
      value: lc([r.place, r.region, r.mode].filter(Boolean).join(' '))
    });
    Object.defineProperty(r, '_dkey', { value: n ? `${base}#${n}` : base });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Vergleich zweier Staende                                          */
/* ------------------------------------------------------------------ */

/**
 * Was ein Update an den Tabellen geaendert hat: neue Zeilen, weggefallene,
 * und solche, deren Chance sich verschoben hat.
 *
 * Zwei Dinge bleiben draussen:
 *   - Relikte ausser Intact. Die vier Veredelungen aendern sich immer
 *     gemeinsam; jede Aenderung stuende sonst viermal da.
 *   - Die Ergaenzungsquelle ("other"). Sie wird nicht mit DEs Tabellen
 *     aktualisiert, ihre Schwankungen waeren kein Update von DE.
 *
 * Die Vault-Marke vergleicht auch nicht mit: ob ein Relikt faellt, sagen die
 * Zeilen an den Knoten selbst, und relicsIn/relicsOut in droptables.js.
 */
export function diffDropRows(oldRows, newRows) {
  const counted = r => r.kind !== 'other' && (r.kind !== 'relic' || r.refinement === 'Intact');
  const before = new Map();
  for (const r of oldRows) if (counted(r)) before.set(r._dkey, r);

  const added = [];
  const changed = [];
  const now = new Set();
  for (const r of newRows) {
    if (!counted(r)) continue;
    now.add(r._dkey);
    const old = before.get(r._dkey);
    if (!old) added.push(r._dkey);
    else if (Math.abs((old.chance ?? -1) - (r.chance ?? -1)) > 0.005) {
      changed.push({ key: r._dkey, before: old.chance });
    }
  }
  const removed = [];
  for (const [k, r] of before) if (!now.has(k)) removed.push({ ...r, vaulted: null, change: 'removed' });

  return { added, changed, removed, counts: { added: added.length, changed: changed.length, removed: removed.length } };
}

/* ------------------------------------------------------------------ */
/*  Suche                                                             */
/* ------------------------------------------------------------------ */

/**
 * Wie gut passt ein Suchtext auf ein Feld? Kleiner ist besser, null heisst
 * gar nicht. Ganzer Text zuerst (genau, am Anfang, am Wortanfang, irgendwo),
 * erst danach die Woerter einzeln - so findet "cetus 40" die Stufe
 * "Level 40 - 60" in Cetus, ohne dass "Serration" hinter "Amalgam Serration"
 * zurueckfaellt.
 */
function score(field, q, words) {
  if (field === q) return 0;
  const i = field.indexOf(q);
  if (i >= 0) {
    /* Endet der Treffer an einer Wortgrenze, zaehlt er mehr: "axi a1" soll
       das A1 vor A10 bis A19 bringen, nicht nur irgendwo dazwischen. */
    const cut = /[a-z0-9]/.test(field[i + q.length] || '') ? 0.5 : 0;
    if (i === 0) return 1 + cut;
    return (/[\s(\-·,]/.test(field[i - 1]) ? 2 : 3) + cut;
  }
  if (words.length > 1 && words.every(w => field.includes(w))) return 4;
  return null;
}

export const SEARCH_LIMIT = 400;

const ROT_ORDER = { A: 1, B: 2, C: 3 };
const RARITY_ORDER = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };
const byChance = (a, b) => (b.chance ?? -1) - (a.chance ?? -1);

/**
 * "Beste Treffer" bei der Orts- und Gegnersuche: erst der Ort, darin die
 * Rotationen der Reihe nach - so liest sich ein Knoten wie seine Tabelle im
 * Spiel. Relikte nach Seltenheit, dann Teil, dann Veredelung: mit "All four"
 * stehen die vier Chancen eines Teils so untereinander, statt dass sich die
 * Intact-Commons zwischen die Exceptional-Commons mischen.
 */
function byPlace(a, b) {
  return a.place.localeCompare(b.place, 'en')
    || String(a.region ?? '').localeCompare(String(b.region ?? ''), 'en')
    || (ROT_ORDER[a.rotation] || 0) - (ROT_ORDER[b.rotation] || 0)
    || String(a.stage ?? '').localeCompare(String(b.stage ?? ''), 'en')
    || (a.kind === 'relic' && b.kind === 'relic'
      ? (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9)
        || a.item.localeCompare(b.item, 'en')
        || REFINEMENTS.indexOf(a.refinement) - REFINEMENTS.indexOf(b.refinement)
      : 0)
    || byChance(a, b)
    || a.item.localeCompare(b.item, 'en');
}

const SORTS = {
  match:  (a, b) => a.s - b.s || byChance(a.r, b.r) || a.r.place.localeCompare(b.r.place, 'en'),
  matchPlace: (a, b) => a.s - b.s || byPlace(a.r, b.r),
  chance: (a, b) => (b.r.chance ?? -1) - (a.r.chance ?? -1) || a.s - b.s,
  item:   (a, b) => a.r.item.localeCompare(b.r.item, 'en') || (b.r.chance ?? -1) - (a.r.chance ?? -1),
  place:  (a, b) => a.r.place.localeCompare(b.r.place, 'en') || (b.r.chance ?? -1) - (a.r.chance ?? -1)
};

/**
 * Sucht in den Zeilen.
 *
 * opts:
 *   q            Suchtext
 *   mode         'item' | 'place' | 'enemy' - worin gesucht wird
 *   kinds        Arten (leer = alle)
 *   rarities     Seltenheiten (leer = alle)
 *   rotations    'A' | 'B' | 'C' (leer = alle; Zeilen ohne Rotation fallen
 *                raus, sobald eine gewaehlt ist)
 *   region       Planet, Zone oder Aera
 *   gameMode     Missionsmodus ("Survival")
 *   refinement   eine Veredelung oder 'all' - Standard Intact, sonst stuende
 *                jedes Reliktteil viermal da
 *   minChance    Mindestchance in Prozent
 *   farmable     gevaultete Relikte ausblenden
 *   sort         'match' | 'chance' | 'item' | 'place'
 *   changes      'any' | 'added' | 'changed' | 'removed' - nur was das
 *                letzte Update geaendert hat (braucht `changes`, siehe
 *                loadDropChanges in droptables.js)
 *
 * Mit `changes` traegt jede Trefferzeile ein Feld `change` ('added',
 * 'changed', 'removed') und bei 'changed' die alte Chance in `before` -
 * auch ohne den Filter, damit die Liste neue Drops immer als neu zeigt.
 *
 * Die Zaehler der Filterleiste (facets) werden VOR den Filtern gezaehlt,
 * nur nach Suchtext und Veredelung. Sonst verschwaende ein Chip, sobald man
 * einen anderen anklickt, und man kaeme nicht mehr zurueck.
 */
export function searchDrops(rows, opts = {}, changes = null) {
  const q = lc(opts.q).trim().replace(/\s+/g, ' ');
  const words = q.split(' ').filter(Boolean);
  const mode = ['item', 'place', 'enemy'].includes(opts.mode) ? opts.mode : 'item';
  const kinds = new Set(opts.kinds || []);
  const rarities = new Set(opts.rarities || []);
  const rotations = new Set(opts.rotations || []);
  const refinement = opts.refinement || 'Intact';
  const minChance = num(opts.minChance) || 0;
  const region = opts.region || null;
  const gameMode = opts.gameMode || null;

  /* Ohne Suchtext nur dann Treffer, wenn ein Filter die Menge eingrenzt -
     sonst kaemen 100 000 Zeilen, und die ersten 400 davon waeren Zufall. */
  const only = changes && ['any', 'added', 'changed', 'removed'].includes(opts.changes) ? opts.changes : null;
  const narrowed = kinds.size || rotations.size || region || gameMode || rarities.size || only;
  const empty = { rows: [], total: 0, facets: null, query: q };
  if (!q && !narrowed) return empty;

  /* Was das Update mit einer Zeile gemacht hat. Entfernte Zeilen stehen nicht
     mehr in `rows` - sie kommen nur dazu, wenn nach ihnen gefragt ist. */
  const changeOf = r => (!changes ? null
    : r.change === 'removed' ? 'removed'
    : changes.addedKeys.has(r._dkey) ? 'added'
    : changes.changedMap.has(r._dkey) ? 'changed' : null);
  const pool = only === 'removed' ? changes.removed
    : only === 'any' ? rows.concat(changes.removed)
    : rows;

  const facets = { kinds: {}, rarities: {}, rotations: {}, regions: {}, modes: {} };
  const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };

  const hits = [];
  for (const r of pool) {
    if (mode === 'enemy' && r.kind !== 'enemy') continue;
    if (only && only !== 'removed') {
      const c = changeOf(r);
      if (!c || (only !== 'any' && c !== only)) continue;
    }
    if (r.kind === 'relic' && refinement !== 'all' && r.refinement !== refinement) continue;

    let s = 5;
    if (q) {
      s = score(mode === 'item' ? r._item : r._place, q, words);
      if (s == null) continue;
    }

    bump(facets.kinds, r.kind);
    bump(facets.rarities, r.rarity);
    bump(facets.rotations, r.rotation);
    bump(facets.regions, r.region);
    bump(facets.modes, r.kind === 'mission' ? r.mode : null);

    if (kinds.size && !kinds.has(r.kind)) continue;
    if (rarities.size && !rarities.has(r.rarity)) continue;
    if (rotations.size && !rotations.has(r.rotation)) continue;
    if (region && r.region !== region) continue;
    if (gameMode && r.mode !== gameMode) continue;
    if (minChance && !(r.chance != null && r.chance >= minChance)) continue;
    if (opts.farmable && r.vaulted) continue;

    hits.push({ r, s });
  }

  const sort = (!opts.sort || opts.sort === 'match') && mode !== 'item' ? 'matchPlace' : opts.sort;
  hits.sort(SORTS[sort] || SORTS.match);
  return {
    rows: hits.slice(0, SEARCH_LIMIT).map(({ r }) => {
      const change = changeOf(r);
      return change
        ? { ...r, change, before: change === 'changed' ? changes.changedMap.get(r._dkey) : null }
        : r;
    }),
    total: hits.length,
    facets,
    query: q
  };
}
