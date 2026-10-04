/**
 * Requiem-Helfer: Kuva Liches und Sisters of Parvos.
 *
 * DAS RAETSEL:
 *   Jeder Lich und jede Sister traegt eine geheime Folge aus DREI
 *   verschiedenen der acht Requiem-Mods, in fester Reihenfolge - 8 * 7 * 6 =
 *   336 Moeglichkeiten. Man steckt drei Requiems in den Parazon und sticht zu.
 *   Das Spiel prueft von links nach rechts und bricht am ERSTEN falschen Platz
 *   ab. Ein Stich sagt also genau eines von vier Dingen: Platz 1 falsch;
 *   Platz 1 richtig und Platz 2 falsch; 1 und 2 richtig, 3 falsch; alles
 *   richtig. Was hinter dem ersten falschen Platz steckt, bleibt ungeprueft.
 *
 *   Oull passt auf jeden Platz - er besteht immer, verraet aber nicht, welches
 *   Requiem dort hingehoert. Murmurs (von Thralls und Hounds) nennen die
 *   Requiems der Folge, aber nicht ihren Platz.
 *
 *   Quelle der Regeln ist das Spielwiki; nachpruefen laesst sich davon an
 *   Kaans Daten nur die Ladungsrechnung (unten). Dass Murmurs keinen Platz
 *   verraten, nimmt die Rechnung als gegeben - jede Folge, die zu allem
 *   Gesehenen passt, gilt als gleich wahrscheinlich.
 *
 * LADUNGEN (an Kaans Inventar nachgerechnet, 2026-10-04):
 *   Ein frisches Requiem hat Rang 0 und drei Ladungen. Erst ein ERFOLGREICHER
 *   Stich kostet etwas - jedes der drei eingesteckten Mods steigt um einen
 *   Rang. Bei Rang 3 ist es "Defiled" und laesst sich nicht mehr einstecken.
 *   Fehlstiche kosten keine Ladung (wohl aber Zeit: der Lich steigt auf und
 *   verschwindet).
 *
 *   Im Inventar liegen unbenutzte Requiems als Stapel in RawUpgrades, jedes
 *   einmal eingesteckte als Einzelstueck in Upgrades mit {"lvl": Rang}. Die
 *   Probe: Kaan hat fuenf Kuva Liches besiegt, und die Raenge seiner Requiems
 *   (Oull mitgezaehlt) summieren sich auf genau 15 - drei je Lich.
 *
 * DIE EMPFEHLUNG:
 *   Gesucht ist der Stich, der am wahrscheinlichsten sofort durchgeht. Unter
 *   gleich wahrscheinlichen gewinnt der, der im Fehlschlag am meisten
 *   verraet (kleinste erwartete Restmenge). Daraus folgt von selbst, was man
 *   sonst als Faustregel lernt: Bekannte Requiems zuerst auf ihre Plaetze
 *   pruefen, und Oull auf den ersten offenen Platz - dann prueft ein Stich
 *   den Platz dahinter, ohne den davor kennen zu muessen.
 *   Unter sonst gleichen Stichen gewinnt der ohne Oull (Oull verliert beim
 *   Erfolg eine Ladung wie jedes andere) und der mit eigenen Mods.
 *
 *   Dieselbe Regel, Stich fuer Stich gegen jede noch moegliche Folge
 *   durchgespielt, ergibt einen Entscheidungsbaum - daraus kommen "hoechstens
 *   N Stiche" und "im Mittel M". Ganz unten im Baum steht immer ein Stich, der
 *   durchgeht; er zaehlt mit.
 *
 * Kein Electron, kein DOM, kein Dateizugriff - die Ablage der Stiche steht in
 * requiem-hunts.js.
 */

/* ------------------------------------------------------------------------
   Die Mods
   ------------------------------------------------------------------------ */

const IMMORTAL = '/Lotus/Upgrades/Mods/Immortal/';

/**
 * Die acht Requiems in der Reihenfolge des Gedichts (Lohk ... Khra) - die
 * Reihenfolge, in der auch DEs Pfade zaehlen (ImmortalOneMod = Lohk). Der
 * Schluessel ist der Name in Kleinbuchstaben; unter ihm stehen die Stiche in
 * requiem.json, er darf sich also nie aendern.
 *
 * Die Namen hier sind nur der Rueckfall - angezeigt wird, was DEs Export
 * sagt (siehe modName).
 */
export const REQUIEMS = [
  { key: 'lohk',  path: IMMORTAL + 'ImmortalOneMod',   name: 'Lohk'  },
  { key: 'xata',  path: IMMORTAL + 'ImmortalTwoMod',   name: 'Xata'  },
  { key: 'jahu',  path: IMMORTAL + 'ImmortalThreeMod', name: 'Jahu'  },
  { key: 'vome',  path: IMMORTAL + 'ImmortalFourMod',  name: 'Vome'  },
  { key: 'ris',   path: IMMORTAL + 'ImmortalFiveMod',  name: 'Ris'   },
  { key: 'fass',  path: IMMORTAL + 'ImmortalSixMod',   name: 'Fass'  },
  { key: 'netra', path: IMMORTAL + 'ImmortalSevenMod', name: 'Netra' },
  { key: 'khra',  path: IMMORTAL + 'ImmortalEightMod', name: 'Khra'  }
];

export const OULL = { key: 'oull', path: IMMORTAL + 'ImmortalWildcardMod', name: 'Oull' };

/**
 * Die Antivirus-Mods der Technocyte Coda. Gleiche Mod-Art wie die Requiems
 * (Parazon, Hoechstrang 3, derselbe Ordner) und im Inventar genauso abgelegt.
 * Die Ladungen werden deshalb gleich gelesen; zwei besiegte Codas und zwei
 * Raenge in Kaans Bestand passen dazu, mehr ist daran nicht gemessen. Ein
 * Raetsel wie bei den Requiems gibt es fuer die Coda nicht - sie stehen nur
 * im Bestand.
 */
export const ANTIVIRUS = [
  { key: 'byteryte',      path: IMMORTAL + 'AntivirusOneMod',   name: 'ByteRyte' },
  { key: 'worm-away',     path: IMMORTAL + 'AntivirusTwoMod',   name: 'Worm Away' },
  { key: 'trojan-tracker',path: IMMORTAL + 'AntivirusThreeMod', name: 'Trojan Tracker' },
  { key: 'keep-clean',    path: IMMORTAL + 'AntivirusFourMod',  name: 'Keep-Clean' },
  { key: 'drive-duster',  path: IMMORTAL + 'AntivirusFiveMod',  name: 'Drive-Duster' },
  { key: 'soft-safe',     path: IMMORTAL + 'AntivirusSixMod',   name: 'Soft Safe' },
  { key: 'anti-v',        path: IMMORTAL + 'AntivirusSevenMod', name: 'Anti-V' },
  { key: 'computer-cop',  path: IMMORTAL + 'AntivirusEightMod', name: 'Computer Cop' }
];

/** Ladungen eines frischen Requiems (Rang 0). Bei Rang 3 ist es Defiled. */
export const MAX_CHARGES = 3;

/** Wie viele beliebige Requiems die Transmutation fuer ein frisches nimmt. */
export const TRANSMUTE_COUNT = 4;

const N = REQUIEMS.length;          // 8
const OULL_IDX = N;                 // Oull als neunter Wert im Rechenteil
const KEY_TO_IDX = new Map(REQUIEMS.map((r, i) => [r.key, i]));
KEY_TO_IDX.set(OULL.key, OULL_IDX);
const IDX_TO_KEY = [...REQUIEMS.map(r => r.key), OULL.key];

export const isRequiemKey = k => KEY_TO_IDX.has(k);

/** Anzeigename aus DEs Export, sonst der feste Name oben. */
export function modName(entry, catalog) {
  const hit = catalog?.byUniqueName?.get(entry.path);
  const name = typeof hit?.name === 'string' ? hit.name.trim() : '';
  return name || entry.name;
}

/* ------------------------------------------------------------------------
   Bestand und Ladungen
   ------------------------------------------------------------------------ */

/** Rang eines Einzelstuecks aus Upgrades. Fehlt lvl, ist es Rang 0. */
function rankOf(row) {
  if (!row?.UpgradeFingerprint) return 0;
  try {
    const lvl = JSON.parse(row.UpgradeFingerprint).lvl;
    return Number.isInteger(lvl) && lvl > 0 ? lvl : 0;
  } catch {
    return 0;
  }
}

const chargesAt = rank => Math.max(0, MAX_CHARGES - rank);

/**
 * Der Bestand an einer Liste von Mods, Exemplar fuer Exemplar.
 *
 * Je Mod: frische Exemplare (Stapel, je drei Ladungen), die einzeln
 * gefuehrten mit ihren Ladungen, die Summe, und wie viele davon sich ueberhaupt
 * noch einstecken lassen. Defiled-Exemplare zaehlen als Exemplar, aber mit
 * null Ladungen - sie taugen nur noch fuer die Transmutation.
 *
 * Ohne Inventar null: "nicht bekannt" ist etwas anderes als "keins".
 */
export function modStock(inventory, entries) {
  if (!inventory) return null;
  const fresh = new Map();
  const ranked = new Map();
  for (const row of inventory.RawUpgrades || []) {
    if (!row?.ItemType) continue;
    fresh.set(row.ItemType, (fresh.get(row.ItemType) || 0) + (row.ItemCount || 0));
  }
  for (const row of inventory.Upgrades || []) {
    if (!row?.ItemType) continue;
    if (!ranked.has(row.ItemType)) ranked.set(row.ItemType, []);
    ranked.get(row.ItemType).push(rankOf(row));
  }

  return entries.map(entry => {
    const freshCount = Math.max(0, fresh.get(entry.path) || 0);
    /* Fuer die Anzeige: volle zuerst, Defiled zuletzt - so liest sich die
       Reihe wie ein Tankstand. */
    const copies = [
      ...Array.from({ length: freshCount }, () => MAX_CHARGES),
      ...(ranked.get(entry.path) || []).map(chargesAt)
    ].sort((a, b) => b - a);
    const charges = copies.reduce((s, c) => s + c, 0);
    const usable = copies.filter(c => c > 0);
    return {
      key: entry.key,
      path: entry.path,
      copies,
      charges,
      usable: usable.length,
      defiled: copies.length - usable.length,
      /* Das Exemplar, das man beim entscheidenden Stich einsteckt: das mit
         den WENIGSTEN Ladungen, die noch reichen. So brennen angebrauchte
         Stuecke zuerst ab, und volle bleiben voll - die handeln sich am Markt
         als Rang 0 am besten. */
      spendFirst: usable.length ? Math.min(...usable) : 0
    };
  });
}

/**
 * Wie viele Liches der Bestand mindestens noch schafft - egal, welche Folge
 * sie tragen.
 *
 * Der schlimmste Fall ist, dass jeder Lich die drei Requiems mit den wenigsten
 * Ladungen will: Verteilen entlastet nur. Oull springt fuer hoechstens EIN
 * Requiem je Lich ein (nur ein Exemplar je Mod im Parazon) und kostet dabei
 * selbst eine Ladung. n Liches gehen also, solange der Fehlbetrag an den drei
 * schwaechsten weder Oulls Ladungen noch n uebersteigt.
 */
export function guaranteedLiches(charges, oullCharges = 0) {
  const weakest = [...charges].sort((a, b) => a - b).slice(0, 3);
  if (weakest.length < 3) return 0;
  let n = 0;
  for (;;) {
    const next = n + 1;
    const short = weakest.reduce((s, c) => s + Math.max(0, next - c), 0);
    if (short > Math.min(next, oullCharges)) return n;
    n = next;
    if (n > 999) return n;   // reine Absicherung, so viele Ladungen hat niemand
  }
}

/** Requiems, Oull und Antivirus-Mods in einem Durchgang, mit Namen. */
export function requiemStock(inventory, catalog = null) {
  const req = modStock(inventory, [...REQUIEMS, OULL]);
  if (!req) return null;
  const av = modStock(inventory, ANTIVIRUS);
  const named = (rows, list) => rows.map((row, i) => ({ ...row, name: modName(list[i], catalog) }));

  const requiems = named(req.slice(0, N), REQUIEMS);
  const oull = named([req[N]], [OULL])[0];
  const defiled = requiems.reduce((s, r) => s + r.defiled, 0) + oull.defiled;
  return {
    requiems,
    oull,
    antivirus: named(av, ANTIVIRUS),
    defiled,
    guaranteed: guaranteedLiches(requiems.map(r => r.charges), oull.charges)
  };
}

/* ------------------------------------------------------------------------
   Der Gegner im Inventar
   ------------------------------------------------------------------------ */

/**
 * Was das Spiel ueber einen Nemesis fuehrt und was davon hier gelesen wird.
 * Alles, was NICHT in dieser Liste steht, meldet readNemesis unter `extra` -
 * so faellt auf, wenn das Spiel neue Felder mitschickt. Genau so kamen
 * GuessHistory und HintProgress heraus (Kaans erster Stich, 2026-10-04); wie
 * das Spiel die von Murmurs genannten Requiems fuehrt, ist noch offen.
 */
const KNOWN_NEMESIS_FIELDS = new Set([
  'fp', 'manifest', 'KillingSuit', 'killingDamageType', 'ShoulderHelmet',
  'WeaponIdx', 'AgentIdx', 'BirthNode', 'Faction', 'Rank', 'k', 'Traded', 'd',
  'InfNodes', 'PrevOwners', 'HenchmenKilled', 'MissionCount', 'SecondInCommand',
  'Weakened', 'pendingWeaken', 'GuessHistory', 'HintProgress'
]);

/**
 * Ein Stich, wie das Spiel ihn in GuessHistory ablegt.
 *
 * GEMESSEN an Kaans erstem Stich (2026-10-04): Lohk, Xata, Oull eingesteckt,
 * am ersten Platz gescheitert (im Lich-Profil abgelesen), im Inventar danach
 * GuessHistory = [6160]. 6160 = 0x1810, von unten in Vierergruppen gelesen:
 * 0, 1, 8 - Lohk (ImmortalOneMod), Xata (ImmortalTwoMod), Oull (Wildcard),
 * genau in der Reihenfolge der Plaetze - und darueber eine 1.
 *
 * Die oberste Gruppe sagt, wie der Stich ausging. Gemessen ist nur die 1
 * (gescheitert am ersten Platz). Drei Lesarten passen dazu: die Nummer des
 * gescheiterten Platzes, ein Bit je falschem Platz, oder die Zahl der
 * geprueften Plaetze. Alle drei meinen mit 2 "gescheitert am zweiten", und
 * eine 0 kann nur "durch" heissen (oder kommt gar nicht vor). Bei 3 und 4
 * gehen sie auseinander - dritter Platz oder Erfolg. Das entscheidet
 * resolveGuesses ueber die Markierung des Lichs (siehe dort).
 */
const GUESS_OUTCOMES = { 0: 3, 1: 0, 2: 1 };   // Code -> wie weit der Stich kam

export function decodeGuess(code) {
  if (!Number.isInteger(code) || code < 0) return null;
  const idx = [code & 15, (code >> 4) & 15, (code >> 8) & 15];
  if (idx.some(i => i > OULL_IDX) || new Set(idx).size !== 3) return null;
  const outcome = Math.floor(code / 4096);
  const result = Object.hasOwn(GUESS_OUTCOMES, outcome) ? GUESS_OUTCOMES[outcome] : null;
  const mods = idx.map(i => IDX_TO_KEY[i]);
  /* Oull besteht immer - scheitert ein Stich laut Code an Oull, ist die
     Lesart falsch, nicht der Stich. */
  const valid = result == null || result === 3 || mods[result] !== OULL.key;
  return { mods, result: valid ? result : null, code, outcome };
}

/**
 * Die Codes 3 und 4 und der Erfolg - ueber die Markierung des Lichs.
 *
 * Jeder Gegner, den Kaan seit Ende 2020 besiegt hat, steht in NemesisHistory
 * mit Weakened und pendingWeaken - auch die Codas, deren "Schwaechung" das
 * volle Antivirus-Band ist. Geschwaecht heisst also: die Unsterblichkeit ist
 * gebrochen, die richtige Folge ist drin. Am aktiven Lich ist das noch nicht
 * gesehen worden (Kaans laufender Lich hatte erst einen Fehlstich); das erste
 * Mal schreibt main.js ins Protokoll.
 *
 *   - Geschwaecht: der LETZTE Stich ging durch, egal welcher Code - es sei
 *     denn, sein Code sagt klar "gescheitert" (1, 2). Dann fuehrt das Spiel
 *     den gelungenen Stich gar nicht in GuessHistory, und die Jagd ist trotzdem
 *     vorbei (`weakened` an der Rechnung, siehe solveRequiem).
 *   - Nicht geschwaecht: ein Erfolg kann es nicht gewesen sein, also heissen
 *     3 und 4 "gescheitert am dritten" - in jeder der drei Lesarten, in der
 *     sie ueberhaupt vorkommen.
 */
export function resolveGuesses(guesses, weakened = false) {
  return guesses.map((g, i) => {
    const last = i === guesses.length - 1;
    if (weakened && last && (g.result === 3 || g.result == null)) return { ...g, result: 3 };
    if (!weakened && g.result == null && (g.outcome === 3 || g.outcome === 4) && g.mods[2] !== OULL.key) {
      return { ...g, result: 2 };
    }
    return g;
  });
}

/** Die drei Arten, mit dem, was die Oberflaeche zu ihnen sagt. */
export const NEMESIS_KINDS = {
  lich:   { label: 'Kuva Lich',        faction: 'Grineer',   minions: 'Thralls', requiems: true },
  sister: { label: 'Sister of Parvos', faction: 'Corpus',    minions: 'Hounds',  requiems: true },
  coda:   { label: 'Technocyte Coda',  faction: 'Infested',  minions: null,      requiems: false }
};

/**
 * Lich, Sister oder Coda. Zuerst ueber die Fraktion - die fehlt aber an den
 * alten Eintraegen (Kaans Liches von 2020 haben keine), dann ueber den Pfad
 * der Vorlage: KuvaLich, InfestedLich; die Sisters heissen intern "Lawyer".
 */
export function nemesisKind(raw) {
  const fac = raw?.Faction;
  if (fac === 'FC_GRINEER') return 'lich';
  if (fac === 'FC_CORPUS') return 'sister';
  if (fac === 'FC_INFESTATION') return 'coda';
  const m = String(raw?.manifest || '');
  if (/InfestedLich/i.test(m)) return 'coda';
  if (/Lawyer|Corpus/i.test(m)) return 'sister';
  if (/KuvaLich/i.test(m)) return 'lich';
  return null;
}

/** MongoDB-Datum, wie es im Inventar steht ({$date:{$numberLong:"..."}}). */
function mongoDate(d) {
  const v = d?.$date?.$numberLong ?? d?.$date ?? d;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Ein Nemesis-Eintrag (aktiv oder aus der Geschichte) in Argus' Form.
 *
 * Die Kennung ist der Zeitpunkt der Entstehung: eindeutig je Konto, und
 * dieselbe im aktiven Eintrag wie spaeter in NemesisHistory. Der
 * Fingerabdruck `fp` taugt dafuer nicht - eine 64-Bit-Zahl, die JSON.parse
 * schon beim Einlesen rundet.
 *
 * `level` ist Rank + 1: das Spiel zaehlt ab Level 1, das Inventar ab 0 - ein
 * Lich auf Rang 0 haelt Knoten auf der Erde, und die Erde ist Level 1.
 */
export function readNemesis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const createdAt = mongoDate(raw.d);
  const weakened = raw.Weakened === true || raw.pendingWeaken === true;
  return {
    id: createdAt ? `n${createdAt}` : null,
    kind: nemesisKind(raw),
    createdAt,
    progenitor: typeof raw.KillingSuit === 'string' ? raw.KillingSuit : null,
    level: Number.isInteger(raw.Rank) ? raw.Rank + 1 : null,
    birthNode: typeof raw.BirthNode === 'string' ? raw.BirthNode : null,
    influence: Array.isArray(raw.InfNodes)
      ? raw.InfNodes.filter(n => n && typeof n.Node === 'string')
          .map(n => ({ node: n.Node, influence: Number(n.Influence) || 0 }))
      : [],
    minionsKilled: Number.isFinite(raw.HenchmenKilled) ? raw.HenchmenKilled : null,
    /* Die Stiche, wie das Spiel sie fuehrt (aelteste zuerst). Ein Stich mit
       unbekanntem Ausgang bleibt mit result: null drin - wegwerfen hiesse,
       ihn zu unterschlagen. */
    guesses: Array.isArray(raw.GuessHistory)
      ? resolveGuesses(raw.GuessHistory.map(decodeGuess).filter(Boolean), weakened)
      : [],
    /* Die Folge ist drin - siehe resolveGuesses. */
    weakened,
    /* Murmur-Fortschritt, roh. Gemessen: 6 nach einer Mission mit Thralls, 27
       nach dem ersten Stich, 34 spaeter - die Skala ist noch nicht bekannt,
       deshalb steht die Zahl nirgends in der Oberflaeche. */
    murmurProgress: Number.isFinite(raw.HintProgress) ? raw.HintProgress : null,
    finished: raw.k === true,
    traded: raw.Traded === true,
    prevOwners: Number(raw.PrevOwners) || 0,
    extra: Object.keys(raw).filter(k => !KNOWN_NEMESIS_FIELDS.has(k))
  };
}

/** Der aktive Gegner und die besiegten, neueste zuerst. */
export function nemesisFromInventory(inventory) {
  if (!inventory) return { active: null, history: [] };
  const active = readNemesis(inventory.Nemesis);
  const history = (Array.isArray(inventory.NemesisHistory) ? inventory.NemesisHistory : [])
    .map(readNemesis)
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { active: active && !active.finished ? active : null, history };
}

/* ------------------------------------------------------------------------
   Die Stiche
   ------------------------------------------------------------------------ */

/**
 * Ein Stich, wie er gespeichert wird: { mods: [k, k, k], result }.
 * result 0-2 = an diesem Platz gescheitert (0 = der erste), 3 = durch.
 *
 * Gibt einen Fehlertext zurueck oder null. Die Texte landen in der
 * Oberflaeche - deshalb Englisch.
 */
export function checkStab(stab) {
  const mods = Array.isArray(stab?.mods) ? stab.mods : null;
  if (!mods || mods.length !== 3) return 'A stab needs three requiems.';
  if (!mods.every(isRequiemKey)) return 'Unknown requiem in this stab.';
  if (new Set(mods).size !== 3) return 'Each requiem can only be equipped once.';
  const r = stab.result;
  if (!Number.isInteger(r) || r < 0 || r > 3) return 'Pick how far the stab got.';
  if (r < 3 && mods[r] === OULL.key) return 'Oull never fails - it fits every slot. Check which slot broke.';
  return null;
}

/* Alle 336 Folgen, einmal ausgerechnet. */
const SEQUENCES = (() => {
  const out = [];
  for (let a = 0; a < N; a++)
    for (let b = 0; b < N; b++) if (b !== a)
      for (let c = 0; c < N; c++) if (c !== a && c !== b) out.push([a, b, c]);
  return out;
})();

export const SEQUENCE_COUNT = SEQUENCES.length;

/** Wie weit ein Stich `guess` bei der Folge `seq` kommt: 0-2 scheitert dort, 3 = durch. */
function outcome(seq, guess) {
  for (let i = 0; i < 3; i++) {
    const g = guess[i];
    if (g !== OULL_IDX && g !== seq[i]) return i;
  }
  return 3;
}

/** Dasselbe mit Schluesseln - fuer Tests und den Rueckweg aus der Oberflaeche. */
export function stabOutcome(sequence, mods) {
  return outcome(sequence.map(k => KEY_TO_IDX.get(k)), mods.map(k => KEY_TO_IDX.get(k)));
}

const toIdx = mods => mods.map(k => KEY_TO_IDX.get(k));
const toKeys = idx => idx.map(i => IDX_TO_KEY[i]);

function filterCandidates(hints, stabs) {
  return SEQUENCES.filter(seq =>
    hints.every(h => seq.includes(h)) &&
    stabs.every(s => outcome(seq, s.mods) === s.result));
}

/**
 * Welche Eintraege sich widersprechen, wenn keine Folge mehr passt: jeder,
 * ohne den es wieder eine gibt. Meist ist es ein einziger Vertipper.
 */
function findSuspects(hints, stabs) {
  const stabsBad = [];
  stabs.forEach((_, i) => {
    if (filterCandidates(hints, stabs.filter((__, j) => j !== i)).length) stabsBad.push(i);
  });
  const hintsBad = [];
  hints.forEach((h, i) => {
    if (filterCandidates(hints.filter((__, j) => j !== i), stabs).length) hintsBad.push(IDX_TO_KEY[h]);
  });
  return { stabs: stabsBad, hints: hintsBad };
}

/* ---------------- Wahl des naechsten Stichs ---------------- */

/**
 * Jeder sinnvolle Stich fuer diese Restmenge.
 *
 * Je Platz nur Werte, die dort noch moeglich sind (plus Oull): ein Requiem,
 * das an einem Platz schon ausgeschlossen ist, scheitert dort sicher und
 * verraet nichts, was ein moegliches nicht auch verraten wuerde.
 *
 * ANDERS mit `only` (nur der eigene Bestand): dann darf auf einen Platz auch
 * ein sicher falsches Requiem als Fueller. Fehlt einem etwa Jahu, den jede
 * verbliebene Folge braucht, geht kein Stich mehr durch - [Lohk, Xata, Fueller]
 * verraet aber immer noch, ob Lohk und Xata vorne stehen.
 */
function* stabsFor(cands, { allowOull, only }) {
  let opts;
  if (only) {
    const own = [...only].filter(v => v !== OULL_IDX || allowOull).sort((x, y) => x - y);
    opts = [own, own, own];
  } else {
    const plaus = [new Set(), new Set(), new Set()];
    for (const s of cands) for (let i = 0; i < 3; i++) plaus[i].add(s[i]);
    opts = plaus.map(p => {
      const a = [...p].sort((x, y) => x - y);
      if (allowOull) a.push(OULL_IDX);
      return a;
    });
  }
  for (const a of opts[0])
    for (const b of opts[1]) {
      if (b === a) continue;
      for (const c of opts[2]) {
        if (c === a || c === b) continue;
        yield [a, b, c];
      }
    }
}

/**
 * Bewertung eines Stichs gegen die Restmenge. Alles ganzzahlig, damit beim
 * Vergleich kein Rundungsrauschen ueber die Reihenfolge entscheidet:
 * `hits` = so viele Folgen geht er durch, `spread` = Summe der Quadrate der
 * Fehlschlag-Gruppen (kleiner = er verraet mehr).
 */
function rate(cands, g, usable) {
  const counts = [0, 0, 0, 0];
  for (const s of cands) counts[outcome(s, g)]++;
  return {
    g,
    counts,
    hits: counts[3],
    spread: counts[0] * counts[0] + counts[1] * counts[1] + counts[2] * counts[2],
    oull: g.includes(OULL_IDX) ? 1 : 0,
    missing: usable ? g.filter(v => !usable.has(v)).length : 0
  };
}

function better(a, b) {
  if (a.hits !== b.hits) return a.hits > b.hits;
  if (a.spread !== b.spread) return a.spread < b.spread;
  if (a.oull !== b.oull) return a.oull < b.oull;
  if (a.missing !== b.missing) return a.missing < b.missing;
  for (let i = 0; i < 3; i++) if (a.g[i] !== b.g[i]) return a.g[i] < b.g[i];
  return false;
}

function bestStab(cands, opts) {
  let best = null;
  for (const g of stabsFor(cands, opts)) {
    const r = rate(cands, g, opts.usable);
    if (!best || better(r, best)) best = r;
  }
  return best;
}

/**
 * Der Entscheidungsbaum unter der Regel oben: wie viele Stiche es von hier im
 * Mittel und hoechstens noch braucht, den durchgehenden eingeschlossen.
 *
 * Endet immer: der gewaehlte Stich trifft mindestens eine Folge (jede
 * moegliche Folge ist selbst ein erlaubter Stich), jede Fehlschlag-Gruppe ist
 * also echt kleiner als die Menge davor.
 */
function playOut(cands, opts, depth = 0) {
  if (!cands.length) return { expected: 0, worst: 0 };
  const pick = bestStab(cands, opts);
  if (!pick || depth > 60) return { expected: Infinity, worst: Infinity };
  const parts = [[], [], []];
  for (const s of cands) {
    const r = outcome(s, pick.g);
    if (r < 3) parts[r].push(s);
  }
  let expected = 1;
  let worst = 1;
  for (const part of parts) {
    if (!part.length) continue;
    const sub = playOut(part, opts, depth + 1);
    expected += (part.length / cands.length) * sub.expected;
    worst = Math.max(worst, 1 + sub.worst);
  }
  return { expected, worst };
}

/** Ein Stich fuer die Oberflaeche. */
function describe(r, n) {
  return {
    mods: toKeys(r.g),
    chance: r.hits / n,
    usesOull: r.oull === 1,
    /* Wie der Stich im Fehlschlag ausgeht, als Anteile: was er auch dann
       noch verraet. */
    outcomes: r.counts.map(c => c / n)
  };
}

/**
 * Normalisiert einen gespeicherten Zug: nur bekannte Schluessel, nur gueltige
 * Stiche, Murmurs ohne Doppelte und ohne Oull.
 */
export function cleanHunt(hunt) {
  const hints = [...new Set((hunt?.hints || []).filter(k => KEY_TO_IDX.has(k) && k !== OULL.key))].slice(0, 3);
  const stabs = (hunt?.stabs || []).filter(s => !checkStab(s))
    .map(s => ({ mods: [...s.mods], result: s.result, at: Number(s.at) || null }));
  return { hints, stabs };
}

const sameMods = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * Die Stiche des Spiels und die von Hand zu EINER Liste.
 *
 * Das Spiel weiss es besser - GuessHistory ist, was im Lich-Profil steht.
 * Von Hand eingetragen wird trotzdem, denn das Inventar kommt erst mit der
 * Rueckkehr aufs Schiff (oder einem Abruf); bis dahin steht der Stich nur
 * im Stichbuch. Zusammengefuehrt wird ueber die Requiems:
 *
 *   - Jeder Spielstich holt sich den ersten noch freien Handeintrag mit
 *     denselben drei Requiems. Der Ausgang kommt vom Spiel, wo der Code
 *     lesbar ist, sonst vom Handeintrag (Codes 3 und 4, siehe decodeGuess).
 *     Ohne beides steht der Stich als "noch nicht lesbar" da und zaehlt
 *     nicht mit.
 *   - Handeintraege, die kein Spielstich geholt hat, zaehlen, wenn sie NACH
 *     dem Inventarstand eingetragen wurden: die kennt das Spiel noch nicht.
 *   - Aeltere ohne Gegenstueck kennt das Spiel nicht, obwohl es sie kennen
 *     muesste - meist ein Vertipper bei den Requiems. Sie zaehlen nicht und
 *     stehen ausgegraut zum Loeschen da (`stale`).
 *
 * Ohne Spielstiche (alte Inventare, Konsole, Zug von Hand) bleibt alles, wie
 * es von Hand eingetragen ist.
 *
 * @param game       readNemesis(...).guesses, oder [] / null
 * @param manual     Stiche aus dem Stichbuch ({ mods, result, at })
 * @param snapshotAt Stand des Inventars in ms (LastInventorySync), oder null
 * @returns { stabs, stale } - stabs mit source 'game' | 'manual', bookIndex
 *          fuer alles, was im Stichbuch steht (zum Loeschen)
 */
export function mergeStabs(game, manual, snapshotAt = null) {
  const book = (manual || []).map((s, bookIndex) => ({ ...s, bookIndex }));
  if (!game || !game.length) {
    return { stabs: book.map(s => ({ ...s, source: 'manual' })), stale: [] };
  }

  const used = new Set();
  const stabs = [];
  for (const g of game) {
    const m = book.find(b => !used.has(b.bookIndex) && sameMods(b.mods, g.mods));
    if (m) used.add(m.bookIndex);
    const result = g.result ?? m?.result ?? null;
    stabs.push({
      mods: [...g.mods],
      result,
      source: 'game',
      at: m?.at ?? null,
      bookIndex: m ? m.bookIndex : null,
      /* Gab es einen Handeintrag mit anderem Ausgang, gilt das Spiel. */
      corrected: !!(m && g.result != null && m.result !== g.result),
      unread: result == null,
      code: g.code
    });
  }

  const stale = [];
  for (const b of book) {
    if (used.has(b.bookIndex)) continue;
    if (snapshotAt != null && b.at != null && b.at > snapshotAt) stabs.push({ ...b, source: 'manual' });
    else stale.push({ ...b, source: 'manual' });
  }
  return { stabs, stale };
}

/**
 * Das Ergebnis fuer einen Zug: was noch moeglich ist, wie wahrscheinlich jedes
 * Requiem auf jedem Platz steht, und welcher Stich als naechster.
 *
 * @param hunt   { hints: [keys], stabs: [{ mods, result }] }
 * @param opts.allowOull  Oull in Vorschlaegen erlauben
 * @param opts.usable     Set der Schluessel mit mindestens einer Ladung, oder
 *                        null (Bestand unbekannt - dann gilt alles als da)
 * @param opts.outlook    false spart den Entscheidungsbaum (nur der Test
 *                        braucht das, er spielt Hunderte Jagden durch)
 * @param opts.weakened   das Spiel fuehrt den Lich als geschwaecht - die Folge
 *                        ist drin, auch wenn kein Stich mit "durch" vorliegt
 *                        (siehe resolveGuesses)
 */
export function solveRequiem(hunt, { allowOull = true, usable = null, outlook: wantOutlook = true, weakened = false } = {}) {
  const { hints: hintKeys, stabs: stabKeys } = cleanHunt(hunt);
  const hints = hintKeys.map(k => KEY_TO_IDX.get(k));
  const stabs = stabKeys.map(s => ({ mods: toIdx(s.mods), result: s.result }));
  const usableIdx = usable ? new Set([...usable].filter(k => KEY_TO_IDX.has(k)).map(k => KEY_TO_IDX.get(k))) : null;

  const cands = filterCandidates(hints, stabs);
  const n = cands.length;
  const success = stabKeys.find(s => s.result === 3) || null;

  const base = {
    total: SEQUENCE_COUNT,
    count: n,
    hints: hintKeys,
    stabs: stabKeys,
    done: !!success || weakened,
    finalMods: success ? success.mods : null,
    /* Vorbei, aber ohne den Stich, der es geschafft hat - dann sagt die
       Oberflaeche nur, DASS es geklappt hat. */
    weakened: weakened && !success
  };

  if (!n) {
    /* Ist der Lich geschwaecht, ist die Jagd vorbei - ein Widerspruch im
       Verlauf aendert daran nichts mehr. */
    return {
      ...base,
      contradiction: !weakened,
      suspects: weakened ? null : findSuspects(hints, stabs),
      slots: [{}, {}, {}], inSequence: {}, known: [null, null, null],
      best: null, bestOwned: null, outlook: null, oullOutlook: null
    };
  }

  /* Je Platz und je Requiem: Anteil der passenden Folgen. */
  const slotCounts = [new Array(N).fill(0), new Array(N).fill(0), new Array(N).fill(0)];
  const inSeq = new Array(N).fill(0);
  for (const s of cands) {
    for (let i = 0; i < 3; i++) slotCounts[i][s[i]]++;
    inSeq[s[0]]++; inSeq[s[1]]++; inSeq[s[2]]++;
  }
  const slots = slotCounts.map(row => Object.fromEntries(
    row.map((c, i) => [IDX_TO_KEY[i], c / n]).filter(([, p]) => p > 0)));
  const inSequence = Object.fromEntries(inSeq.map((c, i) => [IDX_TO_KEY[i], c / n]));
  const known = slotCounts.map(row => {
    const i = row.findIndex(c => c === n);
    return i >= 0 ? IDX_TO_KEY[i] : null;
  });

  if (success || weakened) {
    return {
      ...base,
      /* Steht die Folge ohne gelungenen Stich trotzdem fest, ist sie die. */
      finalMods: base.finalMods || (known.every(Boolean) ? known : null),
      contradiction: false, suspects: null,
      slots, inSequence, known,
      best: null, bestOwned: null, outlook: null, oullOutlook: null
    };
  }

  /* Oull nur, wenn er erlaubt ist UND man einen einsetzbaren hat. Ist der
     Bestand unbekannt, entscheidet allein der Schalter. */
  const haveOull = !usableIdx || usableIdx.has(OULL_IDX);
  const opts = { allowOull: allowOull && haveOull, usable: usableIdx };

  const pick = bestStab(cands, opts);
  const best = pick ? describe(pick, n) : null;
  if (best) best.missing = usableIdx ? best.mods.filter(k => !usableIdx.has(KEY_TO_IDX.get(k))) : [];

  /* Fehlt fuer den besten Stich etwas, der beste mit eigenem Bestand. */
  let bestOwned = null;
  if (best?.missing.length && usableIdx) {
    const own = bestStab(cands, { ...opts, only: usableIdx });
    if (own) bestOwned = { ...describe(own, n), missing: [] };
  }

  const outlook = wantOutlook ? playOut(cands, opts) : null;

  /* Haette ein Oull geholfen? Nur fragen, wenn er gerade nicht mitrechnet -
     und nur melden, wenn er im Mittel mindestens einen halben Stich spart. */
  let oullOutlook = null;
  if (wantOutlook && !opts.allowOull) {
    const withOull = playOut(cands, { ...opts, allowOull: true });
    if (outlook.expected - withOull.expected >= 0.5) oullOutlook = withOull;
  }

  return {
    ...base,
    contradiction: false,
    suspects: null,
    slots, inSequence, known,
    best, bestOwned,
    outlook,
    oullOutlook
  };
}

/* ------------------------------------------------------------------------
   Nur fuer den Test
   ------------------------------------------------------------------------ */

/**
 * Spielt die Empfehlung gegen eine bekannte Folge durch, bis sie trifft, und
 * gibt die Zahl der Stiche zurueck. Murmurs werden vorab als bekannt gesetzt.
 */
export function simulateHunt(secret, { hints = [], allowOull = false } = {}) {
  const hunt = { hints: [...hints], stabs: [] };
  for (let i = 0; i < 40; i++) {
    const res = solveRequiem(hunt, { allowOull, outlook: false });
    if (!res.best) return Infinity;
    const result = stabOutcome(secret, res.best.mods);
    hunt.stabs.push({ mods: res.best.mods, result });
    if (result === 3) return hunt.stabs.length;
  }
  return Infinity;
}
