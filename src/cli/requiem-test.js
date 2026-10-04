#!/usr/bin/env node
/**
 * Prueft den Requiem-Helfer.
 *
 *   node src/cli/requiem-test.js
 *
 * Teil 1  Ladungen: frische Stapel, einzeln gefuehrte Exemplare, Defiled, und
 *         wie viele Liches ein Bestand sicher schafft.
 * Teil 2  Der Gegner aus dem Inventar - Felder wie in Kaans Inventar vom
 *         01.10.2026 (aktiver Kuva Lich, alte Liches ohne Fraktion, Codas).
 * Teil 3  Stiche: was gueltig ist, und wie weit ein Stich kommt.
 * Teil 4  Die Rechnung: Restmengen, sichere Plaetze, Widersprueche.
 * Teil 5  Die Empfehlung gegen jede der 336 Folgen durchgespielt. Die
 *         Obergrenzen des Spielwikis (18/13/8/3 Fehlstiche bei 0-3 bekannten
 *         Requiems) muessen halten, und der Entscheidungsbaum muss genau das
 *         Mittel der Durchlaeufe treffen.
 * Teil 6  Das Stichbuch in einem Wegwerf-Ordner: anlegen, Stiche, Murmurs,
 *         Fehleingaben, zwei Klicks gleichzeitig.
 * Teil 7  Welche Logzeilen als Lich-Zeilen ins Protokoll gehen - Wortlaut aus
 *         Kaans EE.log, die Ladezeilen bleiben draussen.
 * Teil 8  Liegt data/inventory.json da: der echte Bestand, und die Probe, dass
 *         jeder besiegte Lich drei Ladungen gekostet hat.
 */
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REQUIEMS, OULL, ANTIVIRUS, MAX_CHARGES, modStock, guaranteedLiches, requiemStock,
  nemesisKind, readNemesis, nemesisFromInventory, checkStab, stabOutcome,
  solveRequiem, simulateHunt, SEQUENCE_COUNT, cleanHunt, decodeGuess, mergeStabs, resolveGuesses
} from '../core/requiem.js';
import { dataFile } from '../core/paths.js';

let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const KEYS = REQUIEMS.map(r => r.key);
const pathOf = key => [...REQUIEMS, OULL].find(r => r.key === key).path;
const up = (key, lvl) => ({
  ItemType: pathOf(key),
  ItemId: { $oid: 'x' },
  ...(lvl == null ? {} : { UpgradeFingerprint: JSON.stringify({ lvl }) })
});

/* ------------------------------------------------------------------------
   Teil 1: Ladungen
   ------------------------------------------------------------------------ */
console.log('=== Teil 1: Ladungen ===\n');
{
  const inv = {
    RawUpgrades: [
      { ItemType: pathOf('jahu'), ItemCount: 2 },
      { ItemType: '/Lotus/Upgrades/Mods/Rifle/Serration', ItemCount: 9 }
    ],
    Upgrades: [
      up('xata', 3), up('xata', 2), up('lohk', 1), up('lohk'), up('oull', 1)
    ]
  };
  const [lohk, xata, jahu] = modStock(inv, REQUIEMS);
  const [oull] = modStock(inv, [OULL]);
  ok('Stapel: zwei frische Jahu = 6 Ladungen', jahu.charges === 6 && same(jahu.copies, [3, 3]), JSON.stringify(jahu));
  ok('Rang 3 ist Defiled, Rang 2 hat noch eine', xata.charges === 1 && xata.defiled === 1 && xata.usable === 1, JSON.stringify(xata));
  ok('ohne lvl ist Rang 0', same(lohk.copies, [3, 2]) && lohk.charges === 5);
  ok('zuerst das angebrauchte Exemplar einsetzen', lohk.spendFirst === 2 && jahu.spendFirst === 3 && xata.spendFirst === 1);
  ok('Oull wie jedes Requiem', oull.charges === 2 && oull.usable === 1);
  ok('ohne Inventar unbekannt, nicht leer', modStock(null, REQUIEMS) === null && requiemStock(null) === null);
  ok('Rangsprung im Fingerabdruck kaputt -> Rang 0', modStock({ Upgrades: [{ ItemType: pathOf('ris'), UpgradeFingerprint: '{kaputt' }] }, REQUIEMS)[4].charges === 3);

  const st = requiemStock(inv);
  ok('Defiled ueber alle gezaehlt', st.defiled === 1, String(st.defiled));
  ok('Antivirus-Mods stehen mit drin', st.antivirus.length === ANTIVIRUS.length);

  /* Sicher geschaffte Liches: die drei schwaechsten zaehlen, Oull hilft einmal je Lich. */
  ok('alles voll (3 je Requiem) -> 3 Liches', guaranteedLiches(new Array(8).fill(3), 0) === 3);
  ok('ein leeres Requiem -> 0 ohne Oull', guaranteedLiches([0, 3, 3, 3, 3, 3, 3, 3], 0) === 0);
  ok('... mit einem Oull wenigstens 1', guaranteedLiches([0, 3, 3, 3, 3, 3, 3, 3], 1) === 1);
  ok('... mit drei Oull-Ladungen 3', guaranteedLiches([0, 3, 3, 3, 3, 3, 3, 3], 3) === 3);
  ok('zwei leere: Oull deckt nur eines je Lich', guaranteedLiches([0, 0, 3, 3, 3, 3, 3, 3], 3) === 0);
  ok('Kaans Stand (0,1,1,1,1,2,2,2 + Oull 2) -> 1', guaranteedLiches([2, 1, 0, 1, 1, 1, 2, 2], 2) === 1);
}

/* ------------------------------------------------------------------------
   Teil 2: der Gegner
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 2: Gegner aus dem Inventar ===\n');
{
  /* Wortgleich aus Kaans Inventar (01.10.2026), nur gekuerzt. */
  const aktiv = {
    fp: -3805170182739049000,
    manifest: '/Lotus/Types/Game/Nemesis/KuvaLich/KuvaLichManifestVersionSeven',
    KillingSuit: '/Lotus/Powersuits/Fairy/TitaniaPrime',
    killingDamageType: 11, WeaponIdx: 15, AgentIdx: 0, BirthNode: 'SolNode300',
    Faction: 'FC_GRINEER', Rank: 0, k: false, Traded: false,
    d: { $date: { $numberLong: '1787091747127' } },
    InfNodes: [{ Node: 'SolNode39', Influence: 1 }, { Node: 'ClanNode2', Influence: 1 }],
    PrevOwners: 0, HenchmenKilled: 0, MissionCount: 17, SecondInCommand: false
  };
  const alt2020 = {
    fp: -5355253839307869000,
    manifest: '/Lotus/Types/Game/Nemesis/KuvaLich/KuvaLichManifestVersionThree',
    KillingSuit: '/Lotus/Powersuits/Loki/LokiPrime', killingDamageType: 22, AgentIdx: 0,
    BirthNode: 'SolNode300', Rank: 4, k: true, Traded: false,
    d: { $date: { $numberLong: '1594315108893' } }, PrevOwners: 0
  };
  const coda = {
    manifest: '/Lotus/Types/Enemies/InfestedLich/InfestedLichManifest', Faction: 'FC_INFESTATION',
    Rank: 0, k: true, d: { $date: { $numberLong: '1786227880394' } }, Weakened: true, pendingWeaken: true
  };

  const n = readNemesis(aktiv);
  ok('aktiver Kuva Lich erkannt', n.kind === 'lich' && n.id === 'n1787091747127' && !n.finished);
  ok('Rang 0 ist Level 1', n.level === 1);
  ok('Einflussknoten gelesen', same(n.influence.map(x => x.node), ['SolNode39', 'ClanNode2']));
  ok('Thralls aus HenchmenKilled', n.minionsKilled === 0);
  ok('keine unbekannten Felder', n.extra.length === 0, n.extra.join(','));
  ok('alter Lich ohne Fraktion ueber die Vorlage', nemesisKind(alt2020) === 'lich' && readNemesis(alt2020).level === 5);
  ok('Coda ueber die Fraktion', nemesisKind(coda) === 'coda');
  ok('Sister ueber die Fraktion', nemesisKind({ Faction: 'FC_CORPUS' }) === 'sister');
  ok('Sister ueber die Vorlage', nemesisKind({ manifest: '/Lotus/Types/Enemies/Corpus/Lawyers/LawyerManifest' }) === 'sister');
  ok('neues Feld faellt auf', same(readNemesis({ ...aktiv, SomethingNew: [0] }).extra, ['SomethingNew']));
  /* Gemessen: nach Kaans erstem Murmur stand Hints: [5] im Inventar, und das
     Spiel hatte Fass genannt. */
  ok('Murmur aus dem Inventar: 5 = Fass', same(readNemesis({ ...aktiv, Hints: [5] }).hints, ['fass']));
  ok('unbrauchbare Murmur-Indizes fallen weg', same(readNemesis({ ...aktiv, Hints: [5, 5, 8, -1, 'x'] }).hints, ['fass']));

  const { active, history } = nemesisFromInventory({ Nemesis: aktiv, NemesisHistory: [alt2020, coda] });
  ok('aktiv und Geschichte, neueste zuerst', active?.id === 'n1787091747127' && same(history.map(h => h.kind), ['coda', 'lich']));
  ok('ein besiegter Eintrag in Nemesis zaehlt nicht als aktiv', nemesisFromInventory({ Nemesis: { ...aktiv, k: true } }).active === null);
  ok('ohne Inventar leer', same(nemesisFromInventory(null), { active: null, history: [] }));
}

/* ------------------------------------------------------------------------
   Teil 3: Stiche
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 3: Stiche ===\n');
{
  ok('gueltiger Stich', checkStab({ mods: ['lohk', 'xata', 'jahu'], result: 1 }) === null);
  ok('doppeltes Requiem abgelehnt', !!checkStab({ mods: ['lohk', 'lohk', 'jahu'], result: 0 }));
  ok('Oull am gescheiterten Platz abgelehnt', !!checkStab({ mods: ['oull', 'xata', 'jahu'], result: 0 }));
  ok('Oull vor dem Fehlschlag erlaubt', checkStab({ mods: ['oull', 'xata', 'jahu'], result: 1 }) === null);
  ok('unbekannter Name abgelehnt', !!checkStab({ mods: ['lohk', 'xata', 'foo'], result: 3 }));
  ok('Ergebnis ausserhalb abgelehnt', !!checkStab({ mods: ['lohk', 'xata', 'jahu'], result: 4 }));

  ok('Stich bricht am ersten falschen Platz ab', stabOutcome(['lohk', 'xata', 'jahu'], ['lohk', 'jahu', 'xata']) === 1);
  ok('alles richtig = 3', stabOutcome(['lohk', 'xata', 'jahu'], ['lohk', 'xata', 'jahu']) === 3);
  ok('Oull passt ueberall', stabOutcome(['lohk', 'xata', 'jahu'], ['oull', 'xata', 'jahu']) === 3);
  ok('hinter dem Fehler wird nichts geprueft', stabOutcome(['lohk', 'xata', 'jahu'], ['vome', 'xata', 'jahu']) === 0);

  const clean = cleanHunt({ hints: ['lohk', 'lohk', 'oull', 'foo'], stabs: [{ mods: ['lohk'], result: 0 }] });
  ok('Murmurs ohne Doppelte, ohne Oull, ohne Unbekanntes', same(clean, { hints: ['lohk'], stabs: [] }));
}

/* ------------------------------------------------------------------------
   Teil 4: die Rechnung
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 4: Rechnung ===\n');
{
  ok('336 Folgen ohne Wissen', SEQUENCE_COUNT === 336 && solveRequiem({}).count === 336);
  /* Die Zahlen aus dem Spielwiki: 1 in 126, 1 in 36, 1 in 6. */
  ok('ein Murmur -> 126', solveRequiem({ hints: ['lohk'] }).count === 126);
  ok('zwei Murmurs -> 36', solveRequiem({ hints: ['lohk', 'xata'] }).count === 36);
  ok('drei Murmurs -> 6', solveRequiem({ hints: ['lohk', 'xata', 'jahu'] }).count === 6);

  const r = solveRequiem({ hints: ['lohk', 'xata', 'jahu'], stabs: [{ mods: ['lohk', 'xata', 'jahu'], result: 1 }] });
  ok('drei bekannt, Platz 2 falsch -> nur noch eine Folge', r.count === 1 && same(r.known, ['lohk', 'jahu', 'xata']));
  ok('... und genau die wird vorgeschlagen', same(r.best.mods, ['lohk', 'jahu', 'xata']) && r.best.chance === 1);

  const w = solveRequiem({ hints: ['lohk'] });
  ok('Wahrscheinlichkeit je Platz summiert sich zu 1', [0, 1, 2].every(i =>
    Math.abs(Object.values(w.slots[i]).reduce((s, p) => s + p, 0) - 1) < 1e-9));
  ok('ein Murmur steht sicher in der Folge', w.inSequence.lohk === 1);

  const c = solveRequiem({ stabs: [
    { mods: ['lohk', 'xata', 'jahu'], result: 1 },
    { mods: ['xata', 'lohk', 'jahu'], result: 1 }
  ] });
  ok('Widerspruch erkannt', c.contradiction && c.count === 0);
  ok('... und beide Stiche verdaechtig', same(c.suspects.stabs, [0, 1]));

  const done = solveRequiem({ stabs: [{ mods: ['oull', 'xata', 'jahu'], result: 3 }] });
  ok('durchgegangener Stich beendet den Zug', done.done && same(done.finalMods, ['oull', 'xata', 'jahu']) && !done.best);

  /* Bekannte zuerst auf ihre Plaetze: die Faustregel aus dem Wiki muss von
     selbst herauskommen. */
  const two = solveRequiem({ hints: ['netra', 'khra'] }, { allowOull: false });
  ok('zwei bekannt -> beide vorne pruefen', same(two.best.mods.slice(0, 2).sort(), ['khra', 'netra']), two.best.mods.join(','));

  /* Ohne Jahu: der beste Stich braucht ihn, ein eigener prueft trotzdem was. */
  const usable = new Set(KEYS.filter(k => k !== 'jahu'));
  const miss = solveRequiem({ hints: ['lohk', 'xata', 'jahu'] }, { allowOull: false, usable });
  ok('fehlendes Requiem wird genannt', same(miss.best.missing, ['jahu']), JSON.stringify(miss.best));
  ok('Ersatzstich nur mit eigenen Mods', miss.bestOwned && !miss.bestOwned.mods.includes('jahu'), JSON.stringify(miss.bestOwned));
  ok('... der nicht durchgehen kann, aber die vorderen prueft', miss.bestOwned?.chance === 0 &&
    same(miss.bestOwned.mods.slice(0, 2).sort(), ['lohk', 'xata']), miss.bestOwned?.mods.join(','));

  const noOull = solveRequiem({}, { allowOull: true, usable: new Set(KEYS) });
  ok('ohne eigenen Oull kein Oull im Vorschlag', !noOull.best.usesOull);
  ok('... aber der Hinweis, was einer sparen wuerde', noOull.oullOutlook && noOull.oullOutlook.expected < noOull.outlook.expected);
}

/* ------------------------------------------------------------------------
   Teil 5: die Empfehlung gegen jede Folge
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 5: Durchgespielt ===\n');
{
  const all = [];
  for (const a of KEYS) for (const b of KEYS) if (b !== a) for (const c of KEYS) if (c !== a && c !== b) all.push([a, b, c]);
  const subsets = (arr, k) => k === 0 ? [[]] : arr.flatMap((x, i) => subsets(arr.slice(i + 1), k - 1).map(s => [x, ...s]));

  /* Obergrenze = Fehlstiche laut Wiki + der eine, der durchgeht. */
  const WIKI = [19, 14, 9, 4];
  for (const allowOull of [false, true]) {
    for (let nh = 0; nh <= 3; nh++) {
      let worst = 0, sum = 0, cnt = 0;
      /* Ohne Murmurs reicht jede Folge einmal; mit Murmurs jede Teilmenge
         der Folge, denn welche Requiems ein Murmur zuerst nennt, ist Zufall. */
      for (const secret of all) for (const hints of subsets(secret, nh)) {
        const n = simulateHunt(secret, { hints, allowOull });
        worst = Math.max(worst, n); sum += n; cnt++;
      }
      const tree = solveRequiem({ hints: KEYS.slice(0, nh) }, { allowOull }).outlook;
      const avg = sum / cnt;
      const label = `${nh} bekannt${allowOull ? ', mit Oull' : ''}`;
      ok(`${label}: hoechstens ${worst} Stiche, im Mittel ${avg.toFixed(2)}`, worst <= WIKI[nh]);
      ok(`${label}: Baum trifft die Durchlaeufe`, Math.abs(tree.expected - avg) < 1e-9 && tree.worst === worst,
        `Baum ${tree.expected.toFixed(4)}/${tree.worst}`);
    }
  }

  const t0 = performance.now();
  solveRequiem({}, { allowOull: true, usable: new Set([...KEYS, 'oull']) });
  const ms = performance.now() - t0;
  ok(`ganze Rechnung ohne Wissen in ${ms.toFixed(1)} ms`, ms < 250);
}

/* ------------------------------------------------------------------------
   Teil 6: das Stichbuch
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 6: Stichbuch ===\n');
{
  const dir = await mkdtemp(path.join(os.tmpdir(), 'argus-requiem-'));
  const before = process.env.ARGUS_DATA_DIR;
  process.env.ARGUS_DATA_DIR = dir;
  try {
    const hunts = await import('../core/requiem-hunts.js');
    const id = 'n1787091747127';
    const template = { source: 'inventory', kind: 'lich', createdAt: 1787091747127 };

    ok('leeres Buch', same(Object.keys((await hunts.loadHunts()).hunts), []));
    await hunts.setHints(id, template, ['lohk', 'xata']);
    let s = await hunts.loadHunts();
    ok('Zug entsteht mit dem ersten Eintrag', s.hunts[id]?.source === 'inventory' && same(s.hunts[id].hints, ['lohk', 'xata']));

    /* Zwei Klicks gleichzeitig - beide muessen ankommen. */
    await Promise.all([
      hunts.recordStab(id, template, { mods: ['lohk', 'xata', 'jahu'], result: 0 }),
      hunts.recordStab(id, template, { mods: ['xata', 'lohk', 'jahu'], result: 1 })
    ]);
    s = await hunts.loadHunts();
    ok('zwei gleichzeitige Stiche, beide gespeichert', s.hunts[id].stabs.length === 2, String(s.hunts[id].stabs.length));

    let err = null;
    try { await hunts.recordStab(id, template, { mods: ['oull', 'xata', 'jahu'], result: 0 }); } catch (e) { err = e; }
    ok('Fehleingabe kommt als lesbarer Fehler zurueck', err && hunts.isHuntError(err), err?.message);

    await hunts.removeStab(id, 0);
    s = await hunts.loadHunts();
    ok('Stich loeschen', s.hunts[id].stabs.length === 1 && s.hunts[id].stabs[0].result === 1);

    await hunts.recordStab(id, template, { mods: ['xata', 'lohk', 'netra'], result: 3 });
    err = null;
    try { await hunts.recordStab(id, template, { mods: ['lohk', 'xata', 'jahu'], result: 0 }); } catch (e) { err = e; }
    ok('nach dem Erfolg keine weiteren Stiche', err && hunts.isHuntError(err));

    err = null;
    try { await hunts.removeStab('n123', 0); } catch (e) { err = e; }
    ok('unbekannter Zug ohne Vorlage wird nicht angelegt', err && hunts.isHuntError(err) && !(await hunts.loadHunts()).hunts.n123);

    await hunts.startManual('sister');
    s = await hunts.loadHunts();
    const manual = Object.values(s.hunts).find(h => h.source === 'manual');
    ok('Zug von Hand', manual?.kind === 'sister' && /^m\d+$/.test(manual.id));
    await hunts.finishHunt(manual.id);
    ok('beenden', !!(await hunts.loadHunts()).hunts[manual.id].finishedAt);
    await hunts.deleteHunt(manual.id);
    ok('loeschen', !(await hunts.loadHunts()).hunts[manual.id]);

    await hunts.setName(id, template, '  Caku Imorr  ');
    ok('Name gemerkt (ohne Leerraum)', (await hunts.loadHunts()).hunts[id].name === 'Caku Imorr');

    await hunts.setPrefs({ allowOull: false });
    ok('Oull abschalten bleibt gespeichert', (await hunts.loadHunts()).prefs.allowOull === false);
    ok('Datei liegt im Wegwerf-Ordner', existsSync(dataFile('requiem.json')) && dataFile('requiem.json').startsWith(dir));
  } finally {
    if (before === undefined) delete process.env.ARGUS_DATA_DIR;
    else process.env.ARGUS_DATA_DIR = before;
    await rm(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------------
   Teil 6b: Stiche aus dem Spiel (GuessHistory)
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 6b: Stiche aus dem Inventar ===\n');
{
  /* Gemessen: Kaans erster Stich, Lohk · Xata · Oull, am 1. Platz gescheitert
     (im Lich-Profil abgelesen) - im Inventar danach GuessHistory = [6160]. */
  const g = decodeGuess(6160);
  ok('6160 = Lohk · Xata · Oull, gescheitert am 1.', same(g?.mods, ['lohk', 'xata', 'oull']) && g.result === 0, JSON.stringify(g));
  const code = (a, b, c, o) => a | (b << 4) | (c << 8) | (o << 12);
  ok('Code 2 = am 2. gescheitert', decodeGuess(code(7, 6, 5, 2)).result === 1);
  ok('Code 0 = durch', decodeGuess(code(7, 6, 5, 0)).result === 3);
  ok('Codes 3 und 4 allein nicht lesbar', decodeGuess(code(7, 6, 5, 3)).result === null && decodeGuess(code(7, 6, 5, 4)).result === null);
  ok('Oull am gescheiterten Platz -> ungelesen', decodeGuess(code(8, 6, 5, 1)).result === null);
  ok('doppeltes Requiem -> kein Stich', decodeGuess(code(1, 1, 5, 1)) === null);
  ok('Index ueber Oull -> kein Stich', decodeGuess(code(9, 1, 5, 1)) === null);

  const nem = readNemesis({ Rank: 1, d: { $date: { $numberLong: '1' } }, GuessHistory: [6160], HintProgress: 27 });
  ok('readNemesis liest die Stiche und kennt die Felder', nem.guesses.length === 1 && nem.murmurProgress === 27 && !nem.extra.length, JSON.stringify(nem.extra));

  const SNAP = 1000;
  const game = [decodeGuess(6160)];
  const hand = { mods: ['lohk', 'xata', 'oull'], result: 0, at: 900 };

  let m = mergeStabs(game, [hand], SNAP);
  ok('Handeintrag und Spielstich werden einer', m.stabs.length === 1 && m.stabs[0].source === 'game' && m.stabs[0].bookIndex === 0 && !m.stale.length);

  m = mergeStabs(game, [{ ...hand, result: 1 }], SNAP);
  ok('anderer Ausgang von Hand -> das Spiel gilt', m.stabs[0].result === 0 && m.stabs[0].corrected);

  const later = { mods: ['oull', 'lohk', 'xata'], result: 1, at: 1100 };
  m = mergeStabs(game, [hand, later], SNAP);
  ok('neuer Stich nach dem Inventarstand zaehlt von Hand', m.stabs.length === 2 && m.stabs[1].source === 'manual' && m.stabs[1].bookIndex === 1);

  const typo = { mods: ['lohk', 'vome', 'oull'], result: 0, at: 800 };
  m = mergeStabs(game, [typo], SNAP);
  ok('aelterer Eintrag ohne Gegenstueck -> ausgegraut', m.stabs.length === 1 && m.stabs[0].source === 'game' && m.stale.length === 1 && m.stale[0].bookIndex === 0);

  const unread = [decodeGuess(code(0, 1, 8, 3))];
  m = mergeStabs(unread, [], SNAP);
  ok('ungelesener Spielstich ohne Handeintrag zaehlt nicht', m.stabs[0].unread && m.stabs[0].result === null);
  m = mergeStabs(unread, [{ mods: ['lohk', 'xata', 'oull'], result: 3, at: 900 }], SNAP);
  ok('... mit Handeintrag gilt dessen Ausgang', !m.stabs[0].unread && m.stabs[0].result === 3);

  m = mergeStabs(null, [hand, later], SNAP);
  ok('ohne Spielstiche bleibt alles von Hand', m.stabs.length === 2 && m.stabs.every(s => s.source === 'manual') && !m.stale.length);

  /* Geschwaecht = die Folge ist drin. Dann geht der letzte Stich durch, und
     ohne Schwaechung heissen 3 und 4 "am dritten gescheitert". */
  const c3 = decodeGuess(code(0, 1, 2, 3)), c4 = decodeGuess(code(0, 1, 2, 4)), c0 = decodeGuess(code(0, 1, 2, 0));
  ok('nicht geschwaecht: Code 3 und 4 = am 3. gescheitert', same(resolveGuesses([c3, c4], false).map(g => g.result), [2, 2]));
  ok('geschwaecht: letzter Stich mit Code 3 = durch', same(resolveGuesses([game[0], c3], true).map(g => g.result), [0, 3]));
  ok('geschwaecht: Code 0 bleibt durch', resolveGuesses([c0], true)[0].result === 3);
  ok('geschwaecht, letzter Code klar gescheitert -> bleibt gescheitert', resolveGuesses([game[0]], true)[0].result === 0);
  ok('Oull auf Platz 3 kann nicht am 3. scheitern', resolveGuesses([decodeGuess(code(0, 1, 8, 3))], false)[0].result === null);
  ok('readNemesis liest die Schwaechung (auch pendingWeaken)',
    readNemesis({ d: { $date: { $numberLong: '1' } }, pendingWeaken: true, GuessHistory: [code(0, 1, 2, 4)] }).guesses[0].result === 3);

  const weak = solveRequiem({ stabs: [{ mods: ['lohk', 'xata', 'oull'], result: 0 }] }, { weakened: true });
  ok('geschwaecht ohne gelungenen Stich: Jagd vorbei, kein Vorschlag', weak.done && weak.weakened && !weak.best && weak.finalMods === null);
  const weakKnown = solveRequiem({ hints: ['lohk', 'xata', 'jahu'], stabs: [{ mods: ['lohk', 'xata', 'jahu'], result: 1 }] }, { weakened: true });
  ok('... steht die Folge fest, wird sie genannt', same(weakKnown.finalMods, ['lohk', 'jahu', 'xata']));

  /* Kaans Stand vom Abend: Lohk per Murmur bekannt, der erste Stich aus dem
     Spiel - die Rechnung muss dasselbe sagen wie mit dem Handeintrag. */
  const r = solveRequiem({ hints: ['lohk'], stabs: mergeStabs(game, [], SNAP).stabs }, { allowOull: true });
  ok('Rechnung mit dem Spielstich: 84 Folgen uebrig', r.count === 84, String(r.count));
}

/* ------------------------------------------------------------------------
   Teil 7: Mitschnitt aus dem Log
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 7: Lich-Zeilen im Log ===\n');
{
  const { LogWatcher } = await import('../core/logwatch.js');
  const w = new LogWatcher('nicht-vorhanden.log');
  const seen = [];
  w.on('nemesis-line', ev => seen.push(ev.line));
  /* Wortlaut aus Kaans EE.log vom 04.10.2026. */
  const KEEP = [
    '21.050 Script [Info]: CheckNemesisKilled.lua: [NEMESIS] Checking for nemesis of faction 1',
    '187.159 Script [Info]: SetupNemesis.lua: setting up nemesis KuvaLichTransmissionAvatar15',
    /* Der erste echte Stich - die Zeile, die das erste Muster verpasst hat. */
    '7998.591 Script [Info]: NemesisBait.lua: NemesisBait activated for Kr3aKz',
    '8006.603 Game [Info]: FinisherAction::SetExplicitFinisher TennoFinisherAction finisher /Lotus/Types/Enemies/Grineer/Vip/KuvaLich/KuvaLichHackFailA mAttacker /NONE mVictim /NONE mFinisherIndex 4294967295 mFinisher /NONE',
    '8011.796 Script [Info]: KuvaLichFinisher.lua: KuvaLichFinisher ending encounter for wrong stab'
  ];
  const DROP = [
    '19.023 Sys [Info]: Spot-loading /Lotus/Weapons/Infested/InfestedLich/LongGuns/1999InfShotgun/1999InfShotgun.lua during batch loading!',
    '21.611 Script [Info]: Background.lua: NemesisGenerator generating profile',
    '18.871 Sys [Error]: Unknown property: NemesisHistory[3].pendingWeaken',
    '24.076 Sys [Info]: Spot-building /Lotus/Sounds/Lotus/TransmissionSets/Kingpins/KuvaLichA',
    '8041.712 Sys [Info]: Consumable slot 17 - /Lotus/Types/Restoratives/Consumable/NemesisBait: 3',
    '7845.799 Game [Info]: /Lotus/Types/Restoratives/Consumable/NemesisBait',
    /* Die doppelte Zeile zum selben Finisher, ein Thrall, ein Erscheinungswurf. */
    '8006.603 Game [Info]: FinisherAction::Execute for explicit finisher /Lotus/Types/Enemies/Grineer/Vip/KuvaLich/KuvaLichHackFailA',
    '2604.596 Game [Info]: FinisherAction::SetExplicitFinisher TennoFinisherAction finisher /Lotus/Types/Enemies/Grineer/Vip/KuvaLich/KuvaLichFinisherMarineBackD mAttacker /NONE mVictim /NONE',
    '2607.907 Script [Info]: NemesisMission.lua: nemesis roll: 0.706524670124054'
  ];
  const names = [];
  w.on('nemesis-name', ev => names.push(ev.name));
  for (const l of [...KEEP, ...DROP]) w.handleLine(l);
  /* Der Name des Lichs aus der Missionszeile - Wortlaut vom 04.10.2026. Der
     Knoten muss dabei weiter stimmen. */
  const missions = [];
  w.on('squad-mission', ev => missions.push(ev.node));
  w.handleLine('2574.284 Net [Info]: Set squad mission: {"difficulty":0.42500001192093,"name":"SolNode45_Nemesis","nemesis":{"faction":0,"name":"Caku Imorr","rank":1}}');
  w.handleLine('2600.000 Net [Info]: Set squad mission: {"difficulty":0.5,"name":"SolNode45"}');
  w.stop();
  ok('Lich-Zeilen werden mitgeschrieben', same(seen.slice(0, KEEP.length), KEEP), JSON.stringify(seen));
  ok('Name des Lichs aus der Missionszeile', same(names, ['Caku Imorr']), JSON.stringify(names));
  ok('... und der Knoten stimmt weiter', same(missions, ['SolNode45', 'SolNode45']), JSON.stringify(missions));
}

/* ------------------------------------------------------------------------
   Teil 8: der echte Bestand
   ------------------------------------------------------------------------ */
const invFile = dataFile('inventory.json');
if (existsSync(invFile)) {
  console.log(`\n=== Teil 8: ${invFile} ===\n`);
  const inv = JSON.parse(await readFile(invFile, 'utf8')).inventory;
  const st = requiemStock(inv);
  for (const r of [...st.requiems, st.oull]) {
    const pips = r.copies.map(c => '●'.repeat(c) + '○'.repeat(MAX_CHARGES - c)).join(' ') || '-';
    console.log(`  ${r.name.padEnd(6)} ${String(r.charges).padStart(2)} Ladungen  ${pips}`);
  }
  console.log(`  Defiled: ${st.defiled} · sicher fuer ${st.guaranteed} Lich(es)`);

  const { active, history } = nemesisFromInventory(inv);
  if (active) console.log(`  Aktiv: ${active.kind}, Level ${active.level}, ${active.influence.length} Knoten, unbekannte Felder: ${active.extra.join(',') || 'keine'}`);
  /* Die Probe aus dem Kopf von requiem.js: jeder besiegte Lich und jede
     Sister kostet drei Ladungen. Gilt nur, solange nie ein angebrauchtes
     Requiem gehandelt oder transmutiert wurde - deshalb nur als Auskunft. */
  const used = [...(inv.Upgrades || [])]
    .filter(u => /\/Immortal\/Immortal/.test(u.ItemType))
    .reduce((s, u) => s + (JSON.parse(u.UpgradeFingerprint || '{}').lvl || 0), 0);
  const beaten = history.filter(h => h.kind === 'lich' || h.kind === 'sister').length;
  console.log(`  Probe: ${used} verbrauchte Ladungen, ${beaten} besiegte Liches/Sisters x 3 = ${beaten * 3}`
    + (used === beaten * 3 ? '  (passt)' : '  (weicht ab - gehandelt oder transmutiert?)'));
} else {
  console.log('\n(Teil 8 uebersprungen - keine data/inventory.json)');
}

console.log(failures ? `\n${failures} FEHLER` : '\nAlles gruen.');
process.exitCode = failures ? 1 : 0;
