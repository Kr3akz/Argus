/**
 * Der Live-Tracker, wie ihn der Reiter zeigt - der Weltzustand plus alles,
 * was erst mit dem eigenen Konto eine Antwort wird.
 *
 * WARUM NICHT IN core/worldstate.js:
 *   Dort steht, was in der Welt passiert, fuer jeden gleich. Hier steht, was
 *   es fuer DICH heisst: hast du den Frame aus dem Circuit schon, steckt das
 *   Incarnon dieser Woche schon in deiner Waffe, wie viel Standing ist heute
 *   noch offen. Dafuer braucht es Katalog, Inventar und Mastery-Stand - die
 *   hat nur der Hauptprozess, und der reicht sie hier herein.
 *
 *   Das Overlay fragt den Weltzustand alle paar Sekunden ab und braucht davon
 *   nichts. Deshalb ein eigener Kanal (world:view), statt den gemeinsamen
 *   aufzublaehen.
 *
 * ALLES HIER IST REIN: keine Datei, kein Netz, keine Uhr ausser `now`. Was
 * fehlt (kein Inventar, kein Plan, keine Droptabelle), macht den jeweiligen
 * Teil leer - nie den ganzen Reiter.
 */
import { imageUrl } from './catalog.js';
import { normalizeStorePath, buildBaroOffer } from './baro.js';
import { arbitrationWindow } from './arbitrations.js';
import { inventarStand } from './weekly.js';

const TAG = 86400000;
const STUNDE = 3600000;

/* ------------------------------------------------------------------------
   Namen -> Katalog
   ------------------------------------------------------------------------ */

const stripGameTag = name => String(name || '').replace(/^<[^>]*>\s*/, '').trim();
/* "DualToxocyst", "Dual Toxocyst" und "Ack & Brunt" / "AckAndBrunt" sollen
   sich treffen: Leerzeichen, Satzzeichen und Gross/klein fallen weg, das
   kaufmaennische Und wird zum Wort. */
export const looseKey = s => stripGameTag(s).replace(/&/g, 'and').replace(/[^a-z0-9]+/gi, '').toLowerCase();

const GEAR = new Set(['Suits', 'LongGuns', 'Pistols', 'Melee', 'Sentinels', 'SentinelWeapons',
                      'KubrowPets', 'SpaceSuits', 'SpaceGuns', 'SpaceMelee', 'MechSuits', 'OperatorAmps']);

/**
 * Ein Name aus dem Weltzustand -> Katalogeintrag.
 *
 * Erst der genaue Name, dann der entschaerfte. Bei Gleichstand gewinnt
 * Ausruestung: "Panzer Vulpaphyla" ist sonst das Haustier statt der Waffe,
 * und im Circuit gibt es nur Ausruestung.
 */
export function itemByName(catalog, name) {
  if (!catalog?.items || !name) return null;
  if (!catalog._byName) {
    catalog._byName = new Map();
    catalog._byLoose = new Map();
    for (const it of catalog.items) {
      if (!it?.name) continue;
      const n = stripGameTag(it.name);
      if (!catalog._byName.has(n) || (GEAR.has(it.productCategory) && !GEAR.has(catalog._byName.get(n).productCategory))) {
        catalog._byName.set(n, it);
      }
      const k = looseKey(n);
      const alt = catalog._byLoose.get(k);
      if (!alt || (GEAR.has(it.productCategory) && !GEAR.has(alt.productCategory))) catalog._byLoose.set(k, it);
    }
  }
  return catalog._byName.get(stripGameTag(name)) || catalog._byLoose.get(looseKey(name)) || null;
}

/* ------------------------------------------------------------------------
   Besitz und Mastery
   ------------------------------------------------------------------------ */

const INV_GEAR = ['Suits', 'LongGuns', 'Pistols', 'Melee', 'Sentinels', 'SentinelWeapons',
                  'KubrowPets', 'SpaceSuits', 'SpaceGuns', 'SpaceMelee', 'MechSuits', 'OperatorAmps'];

/**
 * Was am Konto haengt, einmal je Aufruf zusammengesucht.
 *
 * `mastery` kommt aus dem Profil (immer da, sobald Argus eingerichtet ist),
 * `owned` aus dem Inventar (nur mit Speicherzugriff). Das sind zwei
 * verschiedene Fragen: gemeistert heisst nicht "noch im Arsenal" - wer einen
 * Frame auf 30 gebracht und verkauft hat, hat ihn gemeistert, aber nicht mehr.
 */
function kontoIndex({ inventory, entries, subsumed }) {
  const mastery = new Map();
  for (const e of entries || []) if (e?.uniqueName) mastery.set(e.uniqueName, e.status);

  const owned = inventory ? new Set() : null;
  const gear = [];
  if (inventory) {
    for (const f of INV_GEAR) {
      for (const row of inventory[f] || []) {
        if (!row?.ItemType) continue;
        owned.add(row.ItemType);
        gear.push(row);
      }
    }
  }
  return { mastery, owned, gear, subsumed: subsumed || null, hasInventory: !!inventory };
}

/** Der Stand eines Items, so knapp wie die Oberflaeche ihn braucht. */
function stand(konto, uniqueName) {
  return {
    mastery: konto.mastery.get(uniqueName) || null,         // 'done' | 'partial' | 'missing' | null
    owned: konto.owned ? konto.owned.has(uniqueName) : null,
    subsumed: konto.subsumed ? konto.subsumed.has(uniqueName) : null
  };
}

function bildzeile(catalog, konto, name, fallbackName = name) {
  const it = itemByName(catalog, name);
  if (!it) return { name: fallbackName, uniqueName: null, image: null, mastery: null, owned: null, subsumed: null };
  return {
    name: stripGameTag(it.name),
    uniqueName: it.uniqueName,
    image: imageUrl(it.uniqueName, 128),
    ...stand(konto, it.uniqueName)
  };
}

/* ------------------------------------------------------------------------
   The Circuit
   ------------------------------------------------------------------------

   Die Rotation steht nirgends in einer Antwort - nur die Auswahl DIESER
   Woche. Beide Listen unten sind vom Wiki abgeschrieben (Seite "The
   Circuit", Abschnitte Normal Circuit und The Steel Path Circuit, gelesen am
   2026-10-01) und gegen die laufende Woche geprueft: Ash, Frost, Nyx ist dort
   Woche 3, Torid, Dual Toxocyst, Dual Ichor, Miter, Atomos die Woche E -
   genau das meldete der Weltzustand.

   Die Varianten hinter jedem Incarnon stehen ebenfalls so im Wiki ("Braton /
   Mk1 / Prime / Vandal"). Sie werden gebraucht, um zu sagen, ob das Incarnon
   schon IRGENDWO steckt - ein Adapter passt auf jede Variante seiner Waffe.

   Findet sich die laufende Woche nicht in der Liste, wird nichts
   vorhergesagt: dann hat DE die Rotation umgestellt, und eine Liste ab einer
   geratenen Stelle waere schlimmer als keine. */

export const CIRCUIT_NORMAL = [
  ['Excalibur', 'Trinity', 'Ember'],
  ['Loki', 'Mag', 'Rhino'],
  ['Ash', 'Frost', 'Nyx'],
  ['Saryn', 'Vauban', 'Nova'],
  ['Nekros', 'Valkyr', 'Oberon'],
  ['Hydroid', 'Mirage', 'Limbo'],
  ['Mesa', 'Chroma', 'Atlas'],
  ['Ivara', 'Inaros', 'Titania'],
  ['Nidus', 'Octavia', 'Harrow'],
  ['Gara', 'Khora', 'Revenant'],
  ['Garuda', 'Baruuk', 'Hildryn']
];

export const CIRCUIT_HARD = [
  [['Braton', ['Braton', 'MK1-Braton', 'Braton Prime', 'Braton Vandal']],
   ['Lato', ['Lato', 'Lato Prime', 'Lato Vandal']],
   ['Skana', ['Skana', 'Skana Prime', 'Prisma Skana']],
   ['Paris', ['Paris', 'MK1-Paris', 'Paris Prime']],
   ['Kunai', ['Kunai', 'MK1-Kunai']]],
  [['Boar', ['Boar', 'Boar Prime']],
   ['Gammacor', ['Gammacor', 'Synoid Gammacor']],
   ['Angstrum', ['Angstrum', 'Prisma Angstrum']],
   ['Gorgon', ['Gorgon', 'Gorgon Wraith', 'Prisma Gorgon']],
   ['Anku', ['Anku']]],
  [['Bo', ['Bo', 'MK1-Bo', 'Bo Prime']],
   ['Latron', ['Latron', 'Latron Prime', 'Latron Wraith']],
   ['Furis', ['Furis', 'MK1-Furis']],
   ['Furax', ['Furax', 'MK1-Furax', 'Furax Wraith']],
   ['Strun', ['Strun', 'MK1-Strun', 'Strun Prime', 'Strun Wraith']]],
  [['Lex', ['Lex', 'Lex Prime']],
   ['Magistar', ['Magistar', 'Sancti Magistar']],
   ['Boltor', ['Boltor', 'Boltor Prime', 'Telos Boltor']],
   ['Bronco', ['Bronco', 'Bronco Prime']],
   ['Ceramic Dagger', ['Ceramic Dagger']]],
  [['Torid', ['Torid']],
   ['Dual Toxocyst', ['Dual Toxocyst']],
   ['Dual Ichor', ['Dual Ichor']],
   ['Miter', ['Miter']],
   ['Atomos', ['Atomos']]],
  [['Ack & Brunt', ['Ack & Brunt']],
   ['Soma', ['Soma', 'Soma Prime']],
   ['Vasto', ['Vasto', 'Vasto Prime']],
   ['Nami Solo', ['Nami Solo']],
   ['Burston', ['Burston', 'Burston Prime']]],
  [['Zylok', ['Zylok', 'Zylok Prime']],
   ['Sibear', ['Sibear']],
   ['Dread', ['Dread']],
   ['Despair', ['Despair']],
   ['Hate', ['Hate']]],
  [['Dera', ['Dera', 'Dera Vandal']],
   ['Sybaris', ['Sybaris', 'Dex Sybaris', 'Sybaris Prime']],
   ['Cestra', ['Cestra']],
   ['Sicarus', ['Sicarus', 'Sicarus Prime']],
   ['Okina', ['Okina', 'Okina Prime']]],
  [['Vectis', ['Vectis', 'Vectis Prime']],
   ['Stug', ['Stug']],
   ['Ballistica', ['Ballistica', 'Ballistica Prime', 'Rakta Ballistica']],
   ['Destreza', ['Destreza', 'Destreza Prime']],
   ['Obex', ['Obex', 'Prisma Obex']]]
];

/* Die Buchstaben, unter denen das Wiki die Steel-Path-Wochen fuehrt. */
const HARD_LETTERS = 'ABCDEFGHI';

const gleicheMenge = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/** Welche Woche der Rotation laeuft gerade, oder -1. */
export function circuitWeek(rotation, choices) {
  const ist = (choices || []).map(looseKey);
  if (!ist.length) return -1;
  return rotation.findIndex(w => gleicheMenge(w.map(x => looseKey(Array.isArray(x) ? x[0] : x)), ist));
}

/**
 * Wo das Incarnon einer Circuit-Waffe schon ist.
 *
 * Eingebaut erkennt man es an der Waffe selbst: sie traegt dann einen
 * `SkillTree` (die gewaehlten Evolutionen). Nachgesehen am Inventar vom
 * 2026-09-28 - genau die fuenf Waffen mit eingebautem Adapter (Braton Prime,
 * Boar Prime, Strun Prime, Burston Prime, Sybaris Prime) hatten das Feld,
 * keine andere. Ein noch nicht eingebauter Adapter liegt dagegen als
 * MiscItem herum (.../IncarnonAdapters/<Slot>/<Waffe>IncarnonUnlocker).
 */
function incarnonIndex(inventory, catalog) {
  if (!inventory) return null;
  const installed = new Map();   // looseKey(Variante) -> Name der Variante
  for (const f of ['LongGuns', 'Pistols', 'Melee']) {
    for (const row of inventory[f] || []) {
      if (!row?.SkillTree) continue;
      const it = catalog?.byUniqueName?.get(row.ItemType);
      if (it?.name) installed.set(looseKey(it.name), stripGameTag(it.name));
    }
  }
  const adapters = new Map();     // looseKey(Waffe) -> Anzahl
  for (const row of inventory.MiscItems || []) {
    const m = /IncarnonAdapters\/[^/]+\/(.+?)IncarnonUnlocker$/.exec(row?.ItemType || '');
    if (m && (row.ItemCount ?? 1) > 0) adapters.set(looseKey(m[1]), (adapters.get(looseKey(m[1])) || 0) + (row.ItemCount ?? 1));
  }
  return { installed, adapters };
}

function circuitHardPick(catalog, konto, incarnon, [genesis, varianten]) {
  const zeile = bildzeile(catalog, konto, genesis);
  let status = null;
  if (incarnon) {
    const drin = varianten.map(v => incarnon.installed.get(looseKey(v))).find(Boolean);
    const adapter = incarnon.adapters.get(looseKey(genesis)) || 0;
    status = drin ? { state: 'installed', on: drin }
           : adapter ? { state: 'adapter', count: adapter }
           : { state: 'none' };
  }
  /* Ob man irgendeine Variante besitzt, auf die der Adapter passen wuerde. */
  const varianteDa = konto.owned
    ? varianten.some(v => { const it = itemByName(catalog, v); return it && konto.owned.has(it.uniqueName); })
    : null;
  return { ...zeile, name: genesis, variants: varianten, incarnon: status, haveVariant: varianteDa };
}

/** Montag 0:00 UTC nach `now` - der Wochenreset. */
export function nextWeeklyReset(now = Date.now()) {
  const d = new Date(now);
  const tag = (d.getUTCDay() + 6) % 7;           // Montag = 0
  const heute0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return heute0 + (7 - tag) * TAG;
}

/** 0:00 UTC nach `now` - der Tagesreset. */
export function nextDailyReset(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + TAG;
}

function buildCircuit(ws, catalog, konto, inventory, now) {
  const c = ws.circuit;
  if (!c) return null;
  const incarnon = incarnonIndex(inventory, catalog);

  const normalIdx = circuitWeek(CIRCUIT_NORMAL, c.normal);
  const hardIdx = circuitWeek(CIRCUIT_HARD, c.hard);

  /* Die laufende Woche aus der ANTWORT, nicht aus der Liste - sollte die
     Liste veraltet sein, stimmt wenigstens das, was jetzt gilt. */
  const normal = c.normal.map(n => bildzeile(catalog, konto, n));
  const hard = c.hard.map(n => {
    const eintrag = CIRCUIT_HARD.flat().find(([g]) => looseKey(g) === looseKey(n));
    return circuitHardPick(catalog, konto, incarnon, eintrag || [n, [n]]);
  });

  const reset = nextWeeklyReset(now);
  const wochen = (rotation, idx, bau) => idx < 0 ? [] : rotation.map((_, i) => {
    const w = (idx + i) % rotation.length;
    return {
      week: i,
      index: w,
      activation: new Date(reset + (i - 1) * 7 * TAG).toISOString(),
      picks: rotation[w].map(bau)
    };
  });

  return {
    normal,
    hard,
    normalWeek: normalIdx >= 0 ? normalIdx + 1 : null,
    hardWeek: hardIdx >= 0 ? HARD_LETTERS[hardIdx] : null,
    expiry: new Date(reset).toISOString(),
    normalRotation: wochen(CIRCUIT_NORMAL, normalIdx, n => bildzeile(catalog, konto, n)),
    hardRotation: wochen(CIRCUIT_HARD, hardIdx, e => circuitHardPick(catalog, konto, incarnon, e)),
    hasInventory: konto.hasInventory
  };
}

/* ------------------------------------------------------------------------
   Haendler mit festem Takt: Ergo Glast und Eleanor
   ------------------------------------------------------------------------

   Beide wechseln ihr Angebot alle vier Tage um 0:00 UTC - aber nicht am
   selben Tag. Die Zeiten stehen im Wiki als Countdown mit Anker:
     Ergo Glast (Seite "Ergo Glast"):  ab 3. Dezember 2015, alle 4 Tage
     Eleanor    (Seite "Eleanor"):     ab 18. Maerz 2025, 8 Tage im Kreis -
                                       4 Tage Charge A, dann 4 Tage Charge B
   Die beiden Anker liegen 3 393 Tage auseinander, also nicht auf demselben
   Vierer-Raster: Eleanor wechselt einen Tag nach Ergo Glast.

   Was wechselt, ist bei Ergo Glast nur der Bonus (Element und Prozent) - die
   fuenf Tenet-Waffen hat er immer. Bei Eleanor wechselt die Haelfte des
   Sortiments; welche Waffen zu A und B gehoeren, steht ebenfalls auf ihrer
   Wiki-Seite. Die Boni selbst veroeffentlicht niemand - das Wiki fuehrt sie
   als "player-reported". Argus nennt sie deshalb nicht. */

const TENET_ANKER = Date.UTC(2015, 11, 3);
const CODA_ANKER = Date.UTC(2025, 2, 18);

export const TENET_WAFFEN = ['Tenet Agendus', 'Tenet Exec', 'Tenet Livia', 'Tenet Grigori', 'Tenet Ferrox'];
export const CODA_CHARGEN = {
  A: ['Coda Hema', 'Coda Sporothrix', 'Coda Catabolyst', 'Coda Pox', 'Dual Coda Torxica', 'Coda Mire', 'Coda Motovore'],
  B: ['Coda Bassocyst', 'Coda Bubonico', 'Coda Synapse', 'Coda Tysis', 'Coda Caustacyst', 'Coda Hirudo', 'Coda Pathocyst']
};

export function vendorRotations(now = Date.now()) {
  const tenetN = Math.floor((now - TENET_ANKER) / (4 * TAG));
  const codaN = Math.floor((now - CODA_ANKER) / (4 * TAG));
  const charge = codaN % 2 === 0 ? 'A' : 'B';
  return {
    tenet: {
      activation: new Date(TENET_ANKER + tenetN * 4 * TAG).toISOString(),
      expiry: new Date(TENET_ANKER + (tenetN + 1) * 4 * TAG).toISOString()
    },
    coda: {
      batch: charge,
      nextBatch: charge === 'A' ? 'B' : 'A',
      activation: new Date(CODA_ANKER + codaN * 4 * TAG).toISOString(),
      expiry: new Date(CODA_ANKER + (codaN + 1) * 4 * TAG).toISOString()
    }
  };
}

function buildVendors(catalog, konto, now) {
  const r = vendorRotations(now);
  return {
    tenet: {
      vendor: 'Ergo Glast',
      place: 'Any relay · Corrupted Holokeys',
      ...r.tenet,
      items: TENET_WAFFEN.map(n => bildzeile(catalog, konto, n))
    },
    coda: {
      vendor: 'Eleanor',
      place: 'Höllvania · The Hex',
      ...r.coda,
      items: CODA_CHARGEN[r.coda.batch].map(n => bildzeile(catalog, konto, n)),
      nextItems: CODA_CHARGEN[r.coda.nextBatch].map(n => bildzeile(catalog, konto, n))
    }
  };
}

/* ------------------------------------------------------------------------
   Varzia, Darvo, Baro
   ------------------------------------------------------------------------ */

const RELIC_TIER = { 1: 'Lith', 2: 'Meso', 3: 'Neo', 4: 'Axi', 5: 'Requiem', 6: 'Omnia' };

function buildResurgence(ws, catalog, konto, relicName) {
  const vt = ws.vaultTrader;
  if (!vt) return null;
  const primes = [], relics = [], packs = [], cosmetics = [];
  for (const raw of vt.items || []) {
    const path = normalizeStorePath(raw.uniqueName || '');
    const it = catalog?.byUniqueName?.get(path) || null;
    if (/\/Packages\//.test(path)) {
      packs.push({ name: (raw.name || '').replace(/^M P V\s+/, '').trim(), price: raw.price });
    } else if (/\/Projections\//.test(path)) {
      const t = /Projections\/T(\d)/.exec(path);
      relics.push({
        name: relicName?.(path) || null,
        tier: t ? RELIC_TIER[Number(t[1])] || null : null,
        price: raw.price,
        uniqueName: path
      });
    } else if (it && GEAR.has(it.productCategory)) {
      primes.push({
        name: stripGameTag(it.name),
        uniqueName: path,
        image: imageUrl(path, 128),
        price: raw.price,
        category: it.productCategory,
        ...stand(konto, path)
      });
    } else {
      cosmetics.push({ name: it ? stripGameTag(it.name) : (raw.name || path.split('/').pop()), price: raw.price });
    }
  }
  const order = { Suits: 0, LongGuns: 1, Pistols: 2, Melee: 3, Sentinels: 4, SentinelWeapons: 5 };
  primes.sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9) || a.name.localeCompare(b.name, 'en'));
  return {
    character: vt.character, location: vt.location,
    activation: vt.activation, expiry: vt.expiry,
    primes, relics, packs, cosmetics
  };
}

function buildDarvo(ws, catalog) {
  return (ws.dailyDeals || []).map(d => {
    const path = normalizeStorePath(d.uniqueName || '');
    const it = path ? catalog?.byUniqueName?.get(path) : null;
    return {
      ...d,
      name: it ? stripGameTag(it.name) : d.item,
      image: it ? imageUrl(path, 128) : null,
      soldOut: d.total != null && d.sold != null && d.sold >= d.total
    };
  });
}

function buildBaro(ws, catalog, inventory, xpMap) {
  const vt = ws.voidTrader;
  if (!vt) return null;
  if (!vt.active || !(vt.inventory || []).length) {
    return { active: !!vt.active, character: vt.character, location: vt.location,
             activation: vt.activation, expiry: vt.expiry, items: [], summary: null };
  }
  const offer = buildBaroOffer(vt, { inventory, catalog, xpMap });
  return {
    active: true, character: vt.character, location: vt.location,
    activation: vt.activation, expiry: vt.expiry,
    items: offer.items, stock: offer.stock, cost: offer.cost, summary: offer.summary
  };
}

/* ------------------------------------------------------------------------
   Kopfgelder: Belohnungen aus DEs Droptabellen
   ------------------------------------------------------------------------

   Die Tabellen fuehren je Stufe einen Eintrag ("Level 5 - 15 Cetus Bounty")
   mit drei Rotationen A/B/C, darin jede Belohnung mit ihrer Etappe. Welche
   Rotation ein Auftrag gerade zahlt, steht an ihm selbst (siehe
   bountyRotation in core/worldstate.js). Die Zahl der Leerzeichen in den
   Stufennamen ist nicht einheitlich ("Level  50 - 55 Zariman Bounty") -
   verglichen wird deshalb ohne sie. */

const ohneLeer = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function tabelleFuer(tables, b, job) {
  const liste = tables?.[b.table] || [];
  if (!liste.length || !job?.levels?.length) return null;
  const [a, z] = job.levels;
  const name = job.isVault ? `Level ${a} - ${z} Isolation Vault` : `Level ${a} - ${z} ${b.suffix}`;
  return liste.find(t => ohneLeer(t.bountyLevel) === ohneLeer(name)) || null;
}

/** Belohnungen einer Rotation, nach Etappe gruppiert, in Tabellenreihenfolge. */
function nachEtappe(list) {
  const out = [];
  for (const r of list || []) {
    const stage = r.stage || 'Reward';
    let g = out.find(x => x.stage === stage);
    if (!g) out.push(g = { stage, items: [] });
    g.items.push({ name: r.itemName, rarity: r.rarity || null, chance: r.chance ?? null });
  }
  for (const g of out) g.items.sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
  return out;
}

function buildBounties(ws, tables) {
  return (ws.bounties || []).map(b => {
    const jobs = (b.jobs || []).map(j => {
      const t = tabelleFuer(tables, b, j);
      /* Fuehrt die Tabelle nur EINE Rotation, gilt diese - unabhaengig vom
         Buchstaben am Auftrag. So bei den Ghoul-Kopfgeldern: dort meint
         "GhoulBountyTableBRewards" die zweite Stufe, nicht Rotation B, und
         DEs Tabelle hat je Stufe nur A gefuellt. */
      const gefuellt = t ? ['A', 'B', 'C'].filter(k => (t.rewards?.[k] || []).length) : [];
      const rot = j.rotation && gefuellt.includes(j.rotation) ? j.rotation
                : gefuellt.length === 1 ? gefuellt[0] : null;
      return { ...j, rewards: t && rot ? nachEtappe(t.rewards[rot]) : null, rewardRotation: rot };
    });

    /* Unveroeffentlichte Syndikate: ihre festen Stufen aus den Tabellen. Sie
       zahlen nur am Ende aus (eine Etappe), und nur Rotation C ist gefuellt. */
    let tiers = null;
    if (!b.published && b.table) {
      tiers = (tables?.[b.table] || []).map(t => {
        const m = /Level\s+(\d+)\s*-\s*(\d+)/i.exec(t.bountyLevel || '');
        const rot = ['A', 'B', 'C'].find(k => (t.rewards?.[k] || []).length);
        return m && rot ? { levels: [Number(m[1]), Number(m[2])], rewards: nachEtappe(t.rewards[rot]) } : null;
      }).filter(Boolean);
    }
    return { ...b, jobs, tiers };
  });
}

/* ------------------------------------------------------------------------
   Heute: was taeglich zuruecksetzt, und was davon schon erledigt ist
   ------------------------------------------------------------------------ */

/* Die Felder, in denen das Inventar das HEUTE NOCH OFFENE Standing fuehrt.
   Sie zaehlen herunter: am Tagesanfang steht dort das volle Limit
   (16 000 + 500 je Mastery-Rang, Wiki "Standing"), und jedes verdiente
   Standing geht davon ab. Bei MR 30 sind das 31 000 - genau der Wert, auf
   dem alle unangetasteten Felder im Inventar vom 2026-09-28 standen. */
const STANDING_FELDER = [
  ['DailyAffiliation',          'Faction syndicates'],
  ['DailyAffiliationCetus',     'Ostrons'],
  ['DailyAffiliationSolaris',   'Solaris United'],
  ['DailyAffiliationEntrati',   'Entrati'],
  ['DailyAffiliationZariman',   'The Holdfasts'],
  ['DailyAffiliationCavia',     'Cavia'],
  ['DailyAffiliationHex',       'The Hex'],
  ['DailyAffiliationKahl',      "Kahl's Garrison"],
  ['DailyAffiliationLibrary',   'Cephalon Simaris'],
  ['DailyAffiliationQuills',    'The Quills'],
  ['DailyAffiliationVox',       'Vox Solaris'],
  ['DailyAffiliationVentkids',  'Ventkids'],
  ['DailyAffiliationNecraloid', 'Necraloid'],
  ['DailyAffiliationPvp',       'Conclave']
];

function buildToday(ws, { inventory, mr, now }) {
  const dailyReset = nextDailyReset(now);
  const tagStart = dailyReset - TAG;
  const gelesen = inventory ? inventarStand(inventory) : null;
  /* Ein Inventar von VOR dem letzten Tagesreset sagt ueber heute nichts -
     die Zaehler sind seitdem wieder voll, oder man hat gespielt und es nicht
     neu gelesen. Beides ist "unbekannt", nicht "voll". */
  const heute = gelesen != null && gelesen >= tagStart;

  const s = ws.sortie;
  let sortie = null;
  if (s) {
    /* Die Sortie wechselt um 16:00 UTC, nicht um Mitternacht - verglichen
       wird deshalb mit IHREM Beginn. Jede erledigte Mission steht im
       Inventar als "<Knoten>_<Sortie-Kennung>". */
    let done = null;
    if (inventory && s.id && s.activation && gelesen != null && gelesen >= new Date(s.activation).getTime()) {
      done = (inventory.CompletedSorties || []).filter(x => String(x).endsWith('_' + s.id)).length;
    }
    sortie = { boss: s.boss, faction: s.faction, expiry: s.expiry, missions: (s.variants || []).length || 3, done };
  }

  const cap = Number.isFinite(mr) ? 16000 + 500 * mr : null;
  const standing = heute
    ? STANDING_FELDER
        .filter(([f]) => typeof inventory[f] === 'number')
        .map(([f, label]) => ({ key: f, label, left: inventory[f], cap }))
    : null;

  const focusCap = Number.isFinite(mr) ? 250000 + 5000 * mr : null;
  const focus = heute && typeof inventory.DailyFocus === 'number'
    ? { left: inventory.DailyFocus, cap: focusCap }
    : null;

  return {
    dailyReset: new Date(dailyReset).toISOString(),
    weeklyReset: new Date(nextWeeklyReset(now)).toISOString(),
    inventoryAt: gelesen != null ? new Date(gelesen).toISOString() : null,
    fresh: heute,
    sortie,
    standing,
    focus,
    simaris: ws.simaris || null,
    incursions: ws.steelPath
      ? { active: ws.steelPath.incursionsActive, expiry: ws.steelPath.incursionsExpiry }
      : null
  };
}

/* ------------------------------------------------------------------------
   Zusammenbau
   ------------------------------------------------------------------------ */

/**
 * @param ws   formatierter Weltzustand (core/worldstate.js)
 * @param ctx  { catalog, inventory, entries, subsumed, xpMap, mr,
 *               bountyTables, arbitrations, nodeInfo, relicName, now }
 */
export function buildWorldView(ws, ctx = {}) {
  const now = ctx.now ?? Date.now();
  const { catalog = null, inventory = null } = ctx;
  const konto = kontoIndex({ inventory, entries: ctx.entries, subsumed: ctx.subsumed });

  const arbitration = arbitrationWindow(ctx.arbitrations, { now, hours: 24, info: ctx.nodeInfo || (() => null) });
  const bounties = buildBounties(ws, ctx.bountyTables || null);
  const traders = {
    baro: buildBaro(ws, catalog, inventory, ctx.xpMap || null),
    resurgence: buildResurgence(ws, catalog, konto, ctx.relicName || null),
    darvo: buildDarvo(ws, catalog),
    vendors: buildVendors(catalog, konto, now)
  };

  const view = {
    ...ws,
    /* Die Wochenansicht hat ihren eigenen Reiter und Kanal - hier braucht sie
       niemand, und sie ist der groesste Brocken der Antwort. */
    weekly: undefined,
    circuit: buildCircuit(ws, catalog, konto, inventory, now),
    traders,
    bounties,
    arbitration,
    today: buildToday(ws, { inventory, mr: ctx.mr, now }),
    hasInventory: konto.hasInventory
  };

  /* Zahlen an den Reitern. "missions" umfasst jetzt auch die Arbitration und
     die Alerts - sie stehen auf derselben Unterseite. */
  view.counts = {
    ...ws.counts,
    missions: (ws.sortie ? 1 : 0) + (ws.archonHunt ? 1 : 0) + (arbitration.current ? 1 : 0) + (ws.alerts || []).length,
    traders: (traders.baro?.active ? 1 : 0) + (traders.resurgence ? 1 : 0) + traders.darvo.length + 2
  };
  return view;
}
