/**
 * Fundorte fuer Mods und Arcanes - die Antwort auf "wo bekomme ich das?".
 *
 * ZWEI QUELLEN, bewusst in dieser Reihenfolge:
 *
 *   1. DEs Droptabellen (drops.warframestat.us/data/all.json). Dieselbe Quelle,
 *      aus der schon die Relikttabellen kommen - offizielle Zahlen. Vor allem
 *      aber STRUKTURIERT: Planet, Knoten, Rotation, Gegner und Chance stehen
 *      als eigene Felder da und lassen sich sauber beschriften.
 *
 *   2. Die Item-API von warframestat.us. Sie kennt, was DE gar nicht als "Drop"
 *      veroeffentlicht - allen voran die SYNDIKATS-AUGMENTE: "Despoil" gibt es
 *      bei Red Veil und der Perrin Sequence, in DEs Tabellen kommt der Name
 *      nirgends vor. Kommt nur zum Zug, wenn 1. nichts hergibt.
 *
 * Was auch dann leer bleibt, sind Karten, die man SCHLICHT NICHT ERFARMT:
 * Baro-Ware, Arbitrations-Ehrenmarken, die Lua-Pruefungsraeume, Precepts, die
 * mit dem Begleiter kommen. Dafuer steht unten eine kleine Regeltabelle. Sie
 * raet nicht, sondern liest den Pfad, in den DE die Karte einsortiert hat.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DE_URL = 'https://drops.warframestat.us/data/all.json';
const WF_URL = 'https://api.warframestat.us/mods/?only=uniqueName,name,drops';
const CACHE  = dir => path.join(dir, 'drop-sources.json');
const USER_AGENT = 'Cephalon-Argus/0.1 (persoenlicher Mastery-Planer)';

/* Droptabellen aendern sich nur zu Updates und Prime-Access-Wechseln. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/* Hochzaehlen, wenn sich der Aufbau der Cache-Datei aendert. */
const CACHE_VERSION = 1;

/**
 * Arten von Fundorten, in der Reihenfolge, in der ein Spieler sie abklappert:
 * was sich KAUFEN laesst, steht vor dem, was fallen muss.
 */
export const SOURCE_KINDS = [
  { key: 'vendor',    label: 'Bezugsquelle' },
  { key: 'syndicate', label: 'Syndikat' },
  { key: 'bounty',    label: 'Kopfgeld' },
  { key: 'special',   label: 'Sondermission' },
  { key: 'mission',   label: 'Mission' },
  { key: 'enemy',     label: 'Gegner' },
  { key: 'relic',     label: 'Relikt' },
  { key: 'key',       label: 'Quests & Schlüsselmissionen' },
  { key: 'sortie',    label: 'Sortie' },
  { key: 'other',     label: 'Fundorte' }
];

const KIND_ORDER = new Map(SOURCE_KINDS.map((k, i) => [k.key, i]));

/* ------------------------------------------------------------------ */
/*  Laden                                                             */
/* ------------------------------------------------------------------ */

let index = null;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Die Mod-Liste der Item-API bringt Patchnotes und Wiki-Felder mit - zusammen
 * 7 MB, von denen wir drei Felder brauchen. Deshalb wird vor dem Speichern
 * alles bis auf Name, Pfad und Fundorte weggeworfen.
 */
function trimWfMods(list) {
  const out = [];
  for (const m of list || []) {
    if (!m?.name || !m.drops?.length) continue;
    out.push({
      uniqueName: m.uniqueName,
      name: m.name,
      drops: m.drops.map(d => ({
        location: d.location,
        chance: d.chance ?? null,
        rarity: d.rarity || null
      }))
    });
  }
  return out;
}

/**
 * Laedt beide Tabellen, mit Cache auf Platte.
 *
 * Die zweite Quelle ist ERGAENZUNG, kein Muss: faellt sie aus, arbeitet der
 * Rest mit DEs Zahlen weiter, statt den ganzen Aufruf scheitern zu lassen.
 */
export async function loadDropTables({ dataDir = 'data', refresh = false } = {}) {
  if (index && !refresh) return index;

  let cached = null;
  if (existsSync(CACHE(dataDir))) {
    try { cached = JSON.parse(await readFile(CACHE(dataDir), 'utf8')); } catch { cached = null; }
  }
  if (cached?.version !== CACHE_VERSION) cached = null;

  const fresh = cached && (Date.now() - cached.fetchedAt < TTL_MS);
  if (cached && fresh && !refresh) {
    index = build(cached);
    return index;
  }

  try {
    const de = await fetchJson(DE_URL);
    if (!de?.relics?.length) throw new Error('leere Droptabelle');

    const wf = await fetchJson(WF_URL).then(trimWfMods).catch(() => cached?.wf || []);

    const payload = { version: CACHE_VERSION, fetchedAt: Date.now(), de, wf };
    await mkdir(dataDir, { recursive: true });
    /* Jede einzelne Belohnung traegt eine 32-stellige _id mit sich, die hier
       niemand liest - sie macht rund ein Viertel der Datei aus. */
    await writeFile(CACHE(dataDir), JSON.stringify(payload, (k, v) => (k === '_id' ? undefined : v)));
    index = build(payload);
  } catch (err) {
    if (!cached) throw err;
    index = build(cached);
    index.stale = err.message;
  }
  return index;
}

/* ------------------------------------------------------------------ */
/*  Index                                                             */
/* ------------------------------------------------------------------ */

const key = name => String(name || '').toLowerCase().trim();

/**
 * Baut aus beiden Tabellen ein Verzeichnis "Name -> Fundorte".
 *
 * Gesucht wird ueber den NAMEN, nicht ueber den Pfad: DEs Droptabellen kennen
 * gar keine Pfade, sie nennen nur "Serration". Beide Seiten stammen aus
 * demselben englischen Export, die Namen decken sich also.
 */
function build({ de, wf, fetchedAt }) {
  const byName = new Map();
  const add = (name, entry) => {
    if (!name || !entry.place) return;
    const k = key(name);
    const list = byName.get(k);
    if (list) list.push(entry);
    else byName.set(k, [entry]);
  };

  /* --- Missionen: Planet -> Knoten -> Rotation --- */
  for (const [planet, nodes] of Object.entries(de?.missionRewards || {})) {
    for (const [node, info] of Object.entries(nodes || {})) {
      const mode = info?.gameMode || null;
      const push = (r, rotation) => add(r.itemName, {
        kind: 'mission',
        place: `${node} · ${planet}`,
        detail: [mode, rotation ? `Rotation ${rotation}` : null].filter(Boolean).join(' · ') || null,
        chance: r.chance ?? null,
        rarity: r.rarity || null
      });

      /* Endlos-Missionen liefern ein Objekt mit Rotationen, einmalige eine
         flache Liste. Beides kommt vor, im selben Feld. */
      if (Array.isArray(info?.rewards)) info.rewards.forEach(r => push(r, null));
      else for (const [rot, list] of Object.entries(info?.rewards || {})) {
        (list || []).forEach(r => push(r, rot));
      }
    }
  }

  /* --- Kopfgelder der offenen Zonen --- */
  const BOUNTIES = [
    ['cetusBountyRewards',  'Cetus'],
    ['solarisBountyRewards', 'Fortuna'],
    ['deimosRewards',        'Deimos'],
    ['zarimanRewards',       'Zariman'],
    ['entratiLabRewards',    'Entrati-Labor'],
    ['hexRewards',           'Höllvania']
  ];
  for (const [field, zone] of BOUNTIES) {
    for (const b of de?.[field] || []) {
      for (const [rot, list] of Object.entries(b.rewards || {})) {
        for (const r of list || []) {
          add(r.itemName, {
            kind: 'bounty',
            place: `${b.bountyLevel} · ${zone}`,
            detail: [`Rotation ${rot}`, r.stage || null].filter(Boolean).join(' · '),
            chance: r.chance ?? null,
            rarity: r.rarity || null
          });
        }
      }
    }
  }

  /* --- Sonderziele: Arbitrations, Eidolon-Jagd, Duviri ... --- */
  for (const t of de?.transientRewards || []) {
    for (const r of t.rewards || []) {
      add(r.itemName, {
        kind: 'special',
        place: t.objectiveName,
        detail: r.rotation ? `Rotation ${r.rotation}` : null,
        chance: r.chance ?? null,
        rarity: r.rarity || null
      });
    }
  }

  /* --- Gegner, die Mods fallen lassen ---
     ZWEI Chancen hintereinander: erst muss der Gegner ueberhaupt eine Mod
     fallen lassen (enemyModDropChance), dann muss es diese sein (chance).
     Angezeigt wird das Produkt - alles andere verspricht zu viel. */
  for (const m of de?.modLocations || []) {
    for (const e of m.enemies || []) {
      const table = e.enemyModDropChance ?? 100;
      add(m.modName, {
        kind: 'enemy',
        place: e.enemyName,
        detail: `Mod-Drop ${fmtPct(table)} × Tabelle ${fmtPct(e.chance)}`,
        chance: (e.chance ?? 0) * table / 100,
        rarity: e.rarity || null
      });
    }
  }

  /* --- Gegner, die das Item direkt fallen lassen (Eidolons, Void-Engel) --- */
  for (const field of ['resourceByAvatar', 'additionalItemByAvatar']) {
    for (const s of de?.[field] || []) {
      for (const i of s.items || []) {
        add(i.item, {
          kind: 'enemy',
          place: s.source,
          detail: null,
          chance: i.chance ?? null,
          rarity: i.rarity || null
        });
      }
    }
  }

  /* --- Syndikatsangebote: hier zaehlt das Ansehen, nicht die Chance --- */
  for (const [syndicate, offers] of Object.entries(de?.syndicates || {})) {
    for (const o of offers || []) {
      /* `place` wiederholt den Syndikatsnamen und haengt Haendler und Rang an:
         "The Holdfasts (Cavalero), Angel". Der Name steht schon links, hier
         bleibt nur, was er nicht sagt. */
      const where = (o.place || '')
        .replace(new RegExp('^' + syndicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '')
        .replace(/^[\s,]+/, '');

      add(o.item, {
        kind: 'syndicate',
        place: syndicate,
        detail: [
          where || null,
          o.standing ? `${o.standing.toLocaleString('de-DE')} Ansehen` : null
        ].filter(Boolean).join(' · ') || null,
        chance: null,
        rarity: o.rarity || null
      });
    }
  }

  /* --- Schluessel und Gewoelbe --- */
  for (const k of de?.keyRewards || []) {
    for (const [rot, list] of Object.entries(k.rewards || {})) {
      for (const r of list || []) {
        add(r.itemName, {
          kind: 'key',
          place: k.keyName,
          detail: rot === 'null' ? null : `Rotation ${rot}`,
          chance: r.chance ?? null,
          rarity: r.rarity || null
        });
      }
    }
  }

  /* --- Relikte --- */
  for (const r of de?.relics || []) {
    if (r.state !== 'Intact') continue;   // gleiche Belohnungen, andere Chancen
    for (const x of r.rewards || []) {
      add(x.itemName, {
        kind: 'relic',
        place: `${r.tier} ${r.relicName}`,
        detail: 'intakt',
        chance: x.chance ?? null,
        rarity: x.rarity || null
      });
    }
  }

  for (const s of de?.sortieRewards || []) {
    add(s.itemName, {
      kind: 'sortie',
      place: 'Sortie',
      detail: 'Tagesbelohnung',
      chance: s.chance ?? null,
      rarity: s.rarity || null
    });
  }

  /* --- Ergaenzung: was DE nicht als Drop fuehrt --- */
  const wfByName = new Map();
  const wfByPath = new Map();
  for (const m of wf || []) {
    const entries = m.drops.map(d => ({
      kind: 'other',
      place: d.location,
      detail: null,
      /* 100 % heisst in dieser Quelle fast immer "im Angebot fuer Ansehen",
         nicht "faellt garantiert". Eine Prozentzahl daneben liest sich wie
         eine Wuerfelprobe - dass es sicher ist, sagt die fehlende Zahl
         deutlicher, genau wie bei den Syndikatsangeboten oben. */
      chance: d.chance === 100 ? null : (d.chance ?? null),
      rarity: d.rarity || null
    }));
    if (!wfByName.has(key(m.name))) wfByName.set(key(m.name), entries);
    if (m.uniqueName) wfByPath.set(m.uniqueName, entries);
  }

  return { byName, wfByName, wfByPath, fetchedAt, stale: null };
}

const fmtPct = v => `${Number(v ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

/* ------------------------------------------------------------------ */
/*  Regeln fuer Karten ohne Droptabelle                               */
/* ------------------------------------------------------------------ */

/**
 * Karten, die nirgends fallen.
 *
 * Erkannt wird am PFAD, nicht am Namen - der Pfad ist DEs eigene Einsortierung
 * und aendert sich nicht, wenn eine Karte umbenannt wird. Reihenfolge zaehlt:
 * "Primed" schlaegt alles, sonst landet "Primed Fury" bei den Waffenmods.
 */
const VENDOR_RULES = [
  {
    test: (u, n) => /^Primed /i.test(n),
    place: "Baro Ki'Teer",
    detail: 'Void-Händler · alle zwei Wochen für Dukaten und Credits im Relais'
  },
  {
    test: (u, n) => /^Galvanized /i.test(n),
    place: 'Arbitration Honors',
    detail: 'Ehrenhändler im Arbitrations-Relais · Vitus-Essenz'
  },
  {
    test: u => /\/Upgrades\/Mods\/OrokinChallenge\//i.test(u),
    place: 'Lua · Halls of Ascension',
    detail: 'Belohnung der Prüfungsräume auf dem Orokin-Mond'
  },
  {
    test: u => /\/Upgrades\/Mods\/Nightwave\//i.test(u),
    place: 'Nightwave',
    detail: 'Cred-Angebote im Nightwave-Menü'
  },
  {
    test: u => /\/Upgrades\/Mods\/Syndicate\//i.test(u),
    place: 'Syndikats-Angebot',
    detail: 'Waffenmod für Ansehen · bei jedem der sechs Hauptsyndikate ab Rang 3'
  },
  {
    test: u => /AugmentCard$/i.test(u) || /\/Augment/i.test(u),
    place: 'Syndikats-Augment',
    detail: 'Für Ansehen bei den Syndikaten, die den Warframe führen · oder im Handel'
  },
  {
    test: u => /SentinelPrecepts|PetPrecept|\/BeastWeapons\//i.test(u),
    place: 'Kommt mit dem Begleiter',
    detail: 'Precept-Karte · liegt der Blaupause des Wächters oder Tieres bei'
  },
  {
    test: u => /\/Mods\/.*\/Event\//i.test(u),
    place: 'Event-Belohnung',
    detail: 'Aus einer zeitlich begrenzten Operation · heute nur noch im Handel'
  },
  {
    test: u => /\/Upgrades\/Mods\/Conclave\//i.test(u),
    place: 'Konklave · Teshin',
    detail: 'PvP-Mod für Konklave-Ansehen'
  }
];

/* ------------------------------------------------------------------ */
/*  Abfrage                                                           */
/* ------------------------------------------------------------------ */

const MAX_PER_KIND = 8;

/**
 * Fundorte einer Karte, nach Art gruppiert.
 *
 * Reihenfolge der Quellen ist Absicht: erst DEs Tabellen, weil sie Chance und
 * Rotation mitbringen; nur wenn dort NICHTS steht, die Ergaenzung und zuletzt
 * die Regeltabelle. So mischen sich nie zwei Schreibweisen in einer Liste.
 */
export function sourcesFor(idx, { name, uniqueName } = {}) {
  if (!idx) return { groups: [], origin: null, note: null };

  let entries = idx.byName.get(key(name)) || [];
  let origin = 'de';

  if (!entries.length) {
    entries = idx.wfByPath.get(uniqueName) || idx.wfByName.get(key(name)) || [];
    origin = entries.length ? 'warframestat' : null;
  }

  if (!entries.length) {
    const rule = VENDOR_RULES.find(r => r.test(uniqueName || '', name || ''));
    if (!rule) return { groups: [], origin: null, note: null };
    entries = [{ kind: 'vendor', place: rule.place, detail: rule.detail, chance: null, rarity: null }];
    origin = 'rule';
  }

  const byKind = new Map();
  for (const e of entries) {
    const list = byKind.get(e.kind);
    if (list) list.push(e); else byKind.set(e.kind, [e]);
  }

  const groups = [...byKind.entries()]
    .sort((a, b) => (KIND_ORDER.get(a[0]) ?? 99) - (KIND_ORDER.get(b[0]) ?? 99))
    .map(([kind, list]) => {
      /* Beste Chance zuerst - danach entscheidet der Name, damit die Liste
         zwischen zwei Aufrufen nicht springt. */
      const sorted = list.sort((a, b) =>
        (b.chance ?? -1) - (a.chance ?? -1) || String(a.place).localeCompare(String(b.place), 'de'));
      return {
        kind,
        label: SOURCE_KINDS.find(k => k.key === kind)?.label || kind,
        entries: sorted.slice(0, MAX_PER_KIND).map(e => ({
          ...e,
          chanceText: e.chance == null ? null : fmtPct(e.chance)
        })),
        hidden: Math.max(0, sorted.length - MAX_PER_KIND)
      };
    });

  return { groups, origin, total: entries.length };
}
