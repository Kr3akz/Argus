#!/usr/bin/env node
/**
 * Prueft die Relikt-Empfehlung auf dem Auswahlbildschirm.
 *
 *   node src/cli/relic-pick-test.js
 *
 * Teil 1  Die Missionszeilen des Logs. Wortlaut aus Kaans EE.log vom
 *         28.09.2026, nicht ausgedacht.
 * Teil 2  Der Ablauf im LogWatcher: Riss setzen, beim Start der Mission
 *         verlieren, beim Laden zurueckholen - und die Uhr der Auswahl
 *         zwischen zwei Runden.
 * Teil 3  Welche Relikte das Feld zeigt (buildRelicPick).
 * Teil 4  Die Aera vom Bildschirm (eraFromScreen), an gebauten Lesungen -
 *         ein echtes Bild der Auswahl gibt es noch nicht.
 * Teil 5  Liegt eine EE.log da, jede Auswahl darin: woher sie kam und welchen
 *         Riss Argus in dem Moment aus dem Log kannte.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { LogWatcher, readMission, DEFAULT_LOG_PATH } from '../core/logwatch.js';
import { buildRelicPick, eraFromScreen, PICK_ROWS, PICK_PER_ERA } from '../core/relic-pick.js';

let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------------
   Teil 1: die Missionszeilen
   ------------------------------------------------------------------------ */
console.log('=== Teil 1: Missionszeilen ===\n');

const MISSIONS = [
  ['Omnia-Riss (Ziel)', '{"difficulty":"","voidTier":"VoidT6","quest":"","name":"SolNode232_ActiveMission"}',
    { node: 'SolNode232', name: 'SolNode232_ActiveMission', tier: 'Omnia' }],
  ['Axi-Riss (Ziel)', '{"difficulty":"","voidTier":"VoidT4","quest":"","name":"SolNode195_ActiveMission"}',
    { node: 'SolNode195', name: 'SolNode195_ActiveMission', tier: 'Axi' }],
  ['Hub', '{"difficulty":0.5,"name":"IceBladeHUB_HUB"}',
    { node: null, name: 'IceBladeHUB_HUB', tier: null }],
  ['aeltere Form ohne voidTier', '{"name":"SolNode854","difficulty":0}',
    { node: 'SolNode854', name: 'SolNode854', tier: null }],
  ['Railjack-Praefix', '{"voidTier":"VoidT2","name":"CrewBattleNode515_ActiveMission"}',
    { node: 'CrewBattleNode515', name: 'CrewBattleNode515_ActiveMission', tier: 'Meso' }],
  ['unbekannte Stufe', '{"voidTier":"VoidT9","name":"SolNode1_ActiveMission"}',
    { node: 'SolNode1', name: 'SolNode1_ActiveMission', tier: null }]
];
for (const [label, json, want] of MISSIONS) {
  const got = readMission(json);
  ok(label, same(got, want), same(got, want) ? '' : JSON.stringify(got));
}

/* ------------------------------------------------------------------------
   Teil 2: der Ablauf im LogWatcher
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 2: Ablauf im LogWatcher ===\n');

/* `event` und nicht `name`: das Missionsereignis traegt selbst ein Feld
   `name` (die Kennung aus dem Log) und wuerde es sonst ueberschreiben. */
function watcher() {
  const w = new LogWatcher('nicht-vorhanden.log');
  const events = [];
  for (const event of ['squad-mission', 'relic-select-open', 'relic-select-ready', 'relic-select-closed', 'game-focus']) {
    w.on(event, ev => events.push({ ...ev, event }));
  }
  return { w, events };
}

{
  /* Vordergrund: die beiden Zeilen aus der offenen Auswahl im Schiff. Die
     Auswahl selbst bleibt dabei offen - nur das Feld geht mit dem Spiel. */
  const { w, events } = watcher();
  w.handleLine('19924.973 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid');
  w.handleLine('19941.344 Sys [Info]: WM_ACTIVATEAPP 0');
  w.handleLine('19949.453 Sys [Info]: WM_ACTIVATEAPP 1');
  const focus = events.filter(e => e.event === 'game-focus').map(e => e.active);
  ok('Spiel hinten, dann wieder vorn', same(focus, [false, true]), JSON.stringify(focus));
  ok('die Auswahl bleibt dabei offen', w.relicSelectActive && !events.some(e => e.event === 'relic-select-closed'));
  w.stop();
}

{
  /* Eine Void-Cascade-Runde, Zeile fuer Zeile wie im Log (gekuerzt auf die
     Zeilen, auf die es ankommt). */
  const { w, events } = watcher();
  const feed = [
    '662.779 Net [Info]: Set squad mission: {"difficulty":"","voidTier":"VoidT6","quest":"","name":"SolNode232_ActiveMission"}',
    '665.668 Net [Info]: MatchingService::LeaveSquad',
    '671.339 Sys [Info]: Client loaded {"difficulty":"","voidTier":"VoidT6","quest":"","name":"SolNode232_ActiveMission"} with MissionInfo:',
    '871.579 Script [Info]: ProjectionsCountdown.lua: Initialize timer nil\t15',
    '886.580 Script [Info]: ProjectionRewardChoice.lua: Relic reward screen shut down',
    '886.640 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid',
    '886.641 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid'
  ];
  for (const line of feed) w.handleLine(line);

  const squads = events.filter(e => e.event === 'squad-mission');
  ok('Ziel der Gruppe: Omnia auf SolNode232',
     squads[0]?.tier === 'Omnia' && squads[0]?.node === 'SolNode232' && squads[0]?.loaded === false);
  ok('Start der Mission verliert den Riss', squads[1] && squads[1].tier === null && !squads[1].name);
  ok('geladene Mission holt ihn zurueck', squads[2]?.tier === 'Omnia' && squads[2]?.loaded === true);
  ok('Auswahl geht genau einmal auf (doppelte Zeile)',
     events.filter(e => e.event === 'relic-select-open').length === 1);

  const vorher = w.selectGuard;
  w.handleLine('886.712 Script [Info]: ProjectionsCountdown.lua: Initialize timer nil\t20');
  ok('Uhr der Auswahl (+72 ms) ersetzt die Fuenf-Minuten-Bremse', w.selectGuard && w.selectGuard !== vorher);

  w.handleLine('889.429 Sys [Info]: Created /Lotus/Interface/Dialog.swf');
  ok('Sicherheitsfrage schliesst die Auswahl',
     events.filter(e => e.event === 'relic-select-closed').length === 1 && !w.selectGuard);

  w.handleLine('1802.003 Script [Info]: ThemedSquadOverlay.lua: Host loading {"difficulty":0.5,"name":"IceBladeHUB_HUB"} with MissionInfo: ');
  const hub = events.filter(e => e.event === 'squad-mission').at(-1);
  ok('Hub geladen: kein Riss mehr', hub?.tier === null && hub?.loaded === true && hub?.node === null);
  w.stop();
}

{
  /* Eine Zeitangabe, die nicht zur Auswahl gehoert, darf die Bremse nicht
     umstellen - etwa die eines Belohnungsbildschirms Sekunden spaeter. */
  const { w } = watcher();
  w.handleLine('100.000 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid');
  const vorher = w.selectGuard;
  w.handleLine('103.000 Script [Info]: ProjectionsCountdown.lua: Initialize timer nil\t15');
  ok('Zeitangabe 3 s nach dem Aufgehen gehoert nicht zur Auswahl', w.selectGuard === vorher);
  w.stop();
}

{
  /* Die Sternenkarte: das Ziel steht erst NACH der Wahl im Log. Der Riss darf
     also bei der Auswahl noch nicht bekannt sein - und eine Mission ohne
     Knoten und Stufe meldet gar nichts. */
  const { w, events } = watcher();
  w.handleLine('5427.096 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid');
  const offen = events.length;
  w.handleLine('5429.020 Sys [Info]: Created /Lotus/Interface/Dialog.swf');
  w.handleLine('5429.897 Net [Info]: Set squad mission: {"difficulty":"","voidTier":"VoidT4","quest":"","name":"SolNode195_ActiveMission"}');
  w.handleLine('1797.094 Net [Info]: Set squad mission: {"difficulty":0.5,"name":"IceBladeHUB_HUB"}');
  const squads = events.filter(e => e.event === 'squad-mission');
  ok('Sternenkarte: beim Aufgehen noch kein Riss', !events.slice(0, offen).some(e => e.event === 'squad-mission'));
  ok('Axi steht erst nach der Wahl fest', squads.length === 1 && squads[0].tier === 'Axi');
  w.stop();
}

{
  /* Woher die Auswahl kam - an den Zeilen aus Kaans Log, je Weg eine. */
  const via = feed => {
    const { w, events } = watcher();
    for (const line of feed) w.handleLine(line);
    w.stop();
    return events.find(e => e.event === 'relic-select-open')?.via ?? 'nicht aufgegangen';
  };
  ok('Konsole im Schiff', via([
    '22627.127 Sys [Info]: UIConsoleTrigger::Open() /Layer255/Layer1/Layer31/UIConsoleTrigger3',
    '22627.168 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid'
  ]) === 'console');
  ok('zwischen zwei Runden', via([
    '886.580 Script [Info]: ProjectionRewardChoice.lua: Relic reward screen shut down',
    '886.640 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid'
  ]) === 'round');
  ok('von der Sternenkarte', via([
    '22682.355 Input [Info]: InitMapping for all devices with bindings /Configs/EE.cfg/LotusWindows_KeyBindings and filter /EE/Types/Input/MapReduxInputFilter',
    '22684.598 Script [Info]: MapRedux.lua: MapRedux::NodeRollOver TradeHUB1 - MAROO\'S BAZAAR',
    '22685.227 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid'
  ]) === 'map');
  ok('eine alte Konsole zaehlt nicht mehr', via([
    '22627.127 Sys [Info]: UIConsoleTrigger::Open() /Layer255/Layer1/Layer30/UIConsoleTrigger1',
    '22682.355 Input [Info]: InitMapping for all devices with bindings /Configs/EE.cfg/LotusWindows_KeyBindings and filter /EE/Types/Input/MapReduxInputFilter',
    '22685.227 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid'
  ]) === 'map');
}

{
  /* Fertig aufgebaut: einmal gemeldet, mit dem Abstand in Spielzeit - auch
     wenn die Zeile zwischen zwei Runden doppelt kommt. */
  const { w, events } = watcher();
  w.handleLine('22627.168 Script [Info]: ThemedProjectionManager.lua: PopulateInventoryGrid');
  w.handleLine('22627.535 Script [Info]: ThemedProjectionManager.lua: LoadingCompleteEnd');
  w.handleLine('22627.536 Script [Info]: ThemedProjectionManager.lua: LoadingCompleteEnd');
  const ready = events.filter(e => e.event === 'relic-select-ready');
  ok('Bildschirm fertig: einmal, nach 367 ms', ready.length === 1 && ready[0].after === 367,
     JSON.stringify(ready.map(r => r.after)));
  w.stop();
}

/* ------------------------------------------------------------------------
   Teil 3: was das Feld zeigt
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 3: Auswahl fuer das Feld ===\n');

const R = (id, tier, expPlat, extra = {}) => ({
  id, key: id.split('|')[0], tier, name: id.split('|')[0].split(' ')[1],
  state: id.split('|')[1], count: 1, expPlat, expDucats: 10, pricedShare: 1,
  bestPlat: { name: 'Teil', plat: 20 }, ...extra
});
const RELICS = [
  R('Lith G14|Radiant', 'Lith', 12.4, { count: 3 }),
  R('Lith L8|Radiant', 'Lith', 9),
  R('Lith A1|Intact', 'Lith', 3),
  R('Axi A21|Exceptional', 'Axi', 20, { pricedShare: 0.5 }),
  R('Axi S13|Intact', 'Axi', 0, { pricedShare: 0, bestPlat: null }),
  R('Neo N20|Intact', 'Neo', 15),
  R('Requiem X1|Intact', 'Requiem', 5),
  R('Meso F3|Intact', 'Meso', 7),
  R('Meso F4|Intact', 'Meso', 7, { expDucats: 45 })
];
const ids = v => v.rows.map(r => r.id);

{
  const v = buildRelicPick(RELICS, { tier: 'Lith', traces: 1234 });
  ok('Lith-Riss: nur Lith, nach Wert', v.mode === 'era' && same(ids(v), ['Lith G14|Radiant', 'Lith L8|Radiant', 'Lith A1|Intact']),
     ids(v).join(', '));
  ok('nur die erste Zeile ist die Empfehlung', same(v.rows.map(r => r.top), [true, false, false]));
  ok('Bestand und Spuren stehen dabei', v.total === 3 && v.owned === RELICS.length && v.traces === 1234);
  ok('Anzahl kommt mit', v.rows[0].count === 3);
}
{
  const v = buildRelicPick(RELICS, { tier: 'Axi' });
  ok('duenne Preise: Untergrenze markiert', v.rows[0].thin === true && v.rows[0].unpriced === false);
  ok('gar kein Preis: keine Zahl', v.rows[1].unpriced === true && v.rows[1].thin === false && v.rows[1].best === null);
}
{
  const v = buildRelicPick(RELICS, { tier: 'Omnia' });
  ok(`Omnia: eine Liste ueber alle Aeren, hoechstens ${PICK_ROWS}`,
     v.mode === 'any' && v.rows.length === PICK_ROWS && v.rows[0].id === 'Axi A21|Exceptional' && v.total === RELICS.length,
     ids(v).join(', '));
  ok('Gleichstand beim Platin: Dukaten entscheiden', ids(v).indexOf('Meso F4|Intact') < ids(v).indexOf('Meso F3|Intact'));
}
{
  const v = buildRelicPick(RELICS, { tier: null });
  const tiers = v.rows.map(r => r.tier);
  ok('Riss unbekannt: die besten jeder Aera, in Aera-Reihenfolge',
     v.mode === 'unknown' && same(tiers, ['Lith', 'Lith', 'Meso', 'Meso', 'Neo', 'Axi', 'Axi', 'Requiem']),
     tiers.join(', '));
  ok(`hoechstens ${PICK_PER_ERA} je Aera`, v.rows.filter(r => r.tier === 'Lith').length === PICK_PER_ERA);
  ok('je Aera ist die beste markiert', same(v.rows.filter(r => r.top).map(r => r.id),
     ['Lith G14|Radiant', 'Meso F4|Intact', 'Neo N20|Intact', 'Axi A21|Exceptional', 'Requiem X1|Intact']));
}
{
  const leer = buildRelicPick([], { tier: 'Lith' });
  ok('ohne Bestand: leer, und das Feld weiss warum', leer.rows.length === 0 && leer.owned === 0);
  const keine = buildRelicPick(RELICS.filter(r => r.tier !== 'Neo'), { tier: 'Neo' });
  ok('Riss ohne passende Relikte: leer, aber mit Bestand', keine.rows.length === 0 && keine.total === 0 && keine.owned > 0);
}
{
  const alle = buildRelicPick(RELICS, { tier: 'all' });
  ok('"All" von Hand: eine Liste ueber alle Aeren', alle.mode === 'any' && alle.rows[0].id === 'Axi A21|Exceptional');
  const gemerkt = buildRelicPick(RELICS.map(r => ({ ...r, tracked: r.tier === 'Meso' })), { tier: 'tracked' });
  ok('"Starred": nur die gemerkten, nach Wert', gemerkt.mode === 'tracked'
     && same(ids(gemerkt), ['Meso F4|Intact', 'Meso F3|Intact']) && gemerkt.total === 2, ids(gemerkt).join(', '));
}

/* ------------------------------------------------------------------------
   Teil 4: die Aera vom Bildschirm

   Die ersten drei Faelle sind ECHTE Lesungen: Kaans drei Aufnahmen der
   Auswahl von der Sternenkarte (29.09.2026, 2560x1440, data/diag/auswahl-*),
   mit der Texterkennung im Ausschnitt RELIC_PICK_ERA_CROP gelesen - Woerter
   samt Rahmen, wie recognise() sie liefert, Verleser eingeschlossen. Die
   erste zeigt den fertigen Bildschirm, die beiden anderen den Moment beim
   Einblenden, in dem die Aera-Zeile noch nicht lesbar war.
   Die uebrigen sind gebaut und pruefen die Regeln, fuer die es noch kein
   Bild gibt (Omnia) oder die gegen Verleser schuetzen.
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 4: Aera vom Bildschirm ===\n');

/* [[Wort, x, y, w, h], ...] je Zeile -> Form von recognise(). */
const echt = zeilen => ({
  ok: true,
  region: { x: 0, y: 0, w: 1408, h: 576 },
  lines: zeilen.map(ws => ({
    text: ws.map(w => w[0]).join(' '),
    words: ws.map(([text, x, y, w, h]) => ({ text, x, y, w, h }))
  }))
});

const FERTIG_LITH = echt([
  [['RELICS/REFINEMENT', 434, 63, 597, 53]],
  [['COLLECTED', 1020, 165, 162, 23], ['75/202', 1192, 166, 96, 24]],
  [['RADIA', 1321, 165, 84, 23]],
  [['LITH', 129, 156, 62, 22], ['ERA', 202, 156, 53, 22]],
  [['No', 194, 458, 31, 22], ['Relic', 234, 457, 56, 23]],
  [['Liti', 448, 414, 43, 38], ['GI', 500, 430, 26, 22], ['4', 533, 430, 14, 23], ['Relic', 554, 427, 58, 27]],
  [['[Radiant]', 478, 455, 103, 31]],
  [['L8', 798, 430, 27, 22], ['Relic', 832, 428, 59, 24]],
  [['[Radiant]', 766, 455, 103, 31]],
  [['REFINEMENT', 895, 210, 179, 22]],
  [['v', 1167, 212, 21, 17]],
  [['Lfth', 1031, 417, 42, 35], ['Q3', 1084, 430, 31, 23], ['Relic', 1125, 428, 55, 24]],
  [['[Radiant]', 1054, 455, 103, 31]],
  [['SEARCH...', 1234, 210, 130, 22]],
  [['LITH', 1255, 280, 68, 24], ['Q3', 1335, 280, 39, 26], ['RI', 1386, 280, 22, 24]],
  [['An', 1253, 421, 35, 23], ['artifact', 1298, 420, 96, 24]],
  [['It', 1255, 458, 15, 22], ['can', 1281, 463, 46, 17], ['only', 1338, 456, 55, 30]],
  [['power', 1254, 500, 83, 23], ['of', 1346, 493, 26, 24], ['th', 1379, 493, 26, 24]]
]);

const BLASS_LITH = echt([
  [['COLLECTED', 1020, 165, 162, 23], ['75/202', 1192, 166, 95, 23], ['RADIA', 1322, 166, 83, 22]],
  [['No', 194, 459, 30, 21], ['Relic', 234, 457, 56, 23]],
  [['RELICS/', 434, 63, 228, 53]],
  [['Lith', 448, 417, 43, 35], ['GI', 501, 430, 25, 22]],
  [['[Radiaht]', 478, 455, 102, 30]],
  [['REFINEMENT', 895, 210, 179, 22]],
  [['v', 1168, 213, 20, 16], ['SEARCH...', 1234, 210, 130, 22]],
  [['Lit%', 745, 417, 42, 35], ['LRReIic', 798, 428, 92, 24]],
  [['[Radiaht]', 766, 455, 103, 31]],
  [['Liii', 1032, 417, 41, 35], ['Q3.Refic', 1084, 428, 96, 25]],
  [['[Radiaht]', 1054, 455, 103, 31]]
]);

const BLASS_NEO = echt([
  [['RELICS/RffU', 434, 63, 389, 53]],
  [['COLLECTED', 1020, 166, 162, 22], ['62/196', 1193, 165, 94, 24], ['RADIA', 1322, 166, 83, 21]],
  [['No', 194, 459, 30, 21], ['Relic', 234, 457, 56, 23]],
  [['Neo', 456, 459, 44, 21], ['A2', 508, 459, 31, 21]],
  [['Neo', 744, 459, 44, 21], ['A3', 796, 459, 31, 21]],
  [['REFINEMENT', 896, 211, 178, 21]],
  [['Neo', 1024, 459, 44, 21], ['Al', 1077, 459, 25, 21], ['I', 1111, 459, 7, 21], ["'Relic", 1124, 452, 64, 28]],
  [['SEARCH..', 1234, 210, 122, 22]],
  [['Neo', 1312, 459, 44, 21]]
]);

{
  const r = eraFromScreen(FERTIG_LITH);
  ok('echt, fertig: die Zeile "LITH ERA"', r.tier === 'Lith' && r.why === '"LITH ERA"', r.why);
}
{
  const r = eraFromScreen(BLASS_LITH);
  ok('echt, beim Einblenden: Lith aus Karten und Zaehler 202', r.tier === 'Lith' && r.count === 202, `${r.why} | ${r.cards}`);
}
{
  const r = eraFromScreen(BLASS_NEO);
  ok('echt, beim Einblenden: Neo aus Karten und Zaehler 196', r.tier === 'Neo' && r.count === 196, `${r.why} | ${r.cards}`);
}

/* Gebaut: eine Zeile mit Woertern nebeneinander ab x, je 60 px breit. */
const zeile = (text, x, y) => ({
  text,
  words: text.split(' ').map((t, i) => ({ text: t, x: x + i * 70, y, w: 60, h: 24 }))
});
const lesung = (lines, region = { x: 0, y: 0, w: 1408, h: 576 }) => ({ ok: true, region, lines });

{
  /* Dieselben blassen Karten ohne Zaehler: sie koennten die erste Reihe
     eines Omnia-Rasters sein - also noch keine Aussage. */
  const ohneZaehler = { ...BLASS_LITH, lines: BLASS_LITH.lines.filter(l => !/COLLECTED/.test(l.text)) };
  const r = eraFromScreen(ohneZaehler);
  ok('Karten einer Aera ohne Zaehler: noch keine Aussage', r.tier === null, r.why);
}
{
  const r = eraFromScreen(lesung([zeile('COLLECTED 301/796', 1020, 165), zeile('Lith G14 Relic', 448, 417),
                                  zeile('Lith L8 Relic', 745, 417)]));
  ok('Zaehler ueber alle Relikte: Omnia, auch bei lauter Lith-Karten', r.tier === 'Omnia', r.why);
}
{
  const r = eraFromScreen(lesung([zeile('COLLECTED 75/2020', 1020, 165), zeile('Lith G14 Relic', 448, 417),
                                  zeile('Lith L8 Relic', 745, 417)]));
  ok('verlesener Zaehler ("75/2020") zaehlt nicht', r.tier === null && r.count === null, r.why);
}
{
  const r = eraFromScreen(lesung([zeile('Lith G14 Relic', 448, 417), zeile('Lith L8 Relic', 745, 417),
                                  zeile('Neo A2 Relic', 448, 700), zeile('Neo B3 Relic', 745, 700)]));
  ok('Karten zweier Aeren: Omnia', r.tier === 'Omnia', r.why);
}
{
  const r = eraFromScreen(lesung([zeile('ALL ERA', 129, 156), zeile('Lith G14 Relic', 448, 417)]));
  ok('Zeile "ALL ERA": Omnia', r.tier === 'Omnia', r.why);
}
{
  const r = eraFromScreen(lesung([zeile('REQUIEM ERA', 129, 156), zeile('COLLECTED 3/6', 1020, 165)]));
  ok('Zeile "REQUIEM ERA"', r.tier === 'Requiem', r.why);
}
{
  const r = eraFromScreen(lesung([zeile('COLLECTED 10/197', 1020, 165), zeile('AX1 A21 Relic', 448, 417),
                                  zeile('Axi S3 Relic', 745, 417)]));
  ok('"AX1" gelesen ist Axi', r.tier === 'Axi', r.why);
}
{
  /* Ein Satz, der mit "With" anfaengt, ist keine Lith-Karte - ein Buchstabe
     daneben gilt nur bei gleichem ersten. */
  const r = eraFromScreen(lesung([zeile('COLLECTED 75/202', 1020, 165), zeile('With care', 448, 417),
                                  zeile('Lith G14 Relic', 745, 417)]));
  ok('"With ..." zaehlt nicht als Lith-Karte', r.tier === null && same(r.cards, ['Lith×1']), `${r.why} | ${r.cards}`);
}
{
  /* Das eigene Feld nennt Aeren (im Modus "unbekannt" sogar alle) und darf
     sich nicht selbst vorlesen. Ausschnitt ab x=1000 - die Rahmen der Woerter
     sind relativ dazu, das ausgesparte Rechteck in Bildschirmpixeln. */
  const r = eraFromScreen(
    lesung([zeile('NEO ERA', 150, 30), zeile('MESO ERA', 150, 120)], { x: 1000, y: 0, w: 560, h: 432 }),
    { exclude: [{ x: 1140, y: 20, w: 400, h: 60 }] });
  ok('Woerter im eigenen Feld zaehlen nicht', r.tier === 'Meso', r.why);
}
{
  const r = eraFromScreen({ ok: true, lines: [] });
  ok('leere Lesung: keine Aussage', r.tier === null && r.why === 'undecided');
}

/* ------------------------------------------------------------------------
   Teil 5: die echte EE.log, falls vorhanden
   ------------------------------------------------------------------------ */
const file = DEFAULT_LOG_PATH();
if (existsSync(file)) {
  console.log(`\n=== Teil 5: ${file} ===\n`);
  const text = await readFile(file, 'utf8');
  const w = new LogWatcher(file);
  let riss = null, aktuelleZeile = '';
  const sec = l => /^(\d+\.\d+)/.exec(l)?.[1] ?? '?';
  w.on('squad-mission', ev => {
    /* Nur, was das Log selbst hergibt - ohne Weltzustand, wie beim Start
       ohne Netz. */
    riss = ev.tier || null;
  });
  w.on('relic-select-open', ev => {
    console.log(`  ${sec(aktuelleZeile).padStart(10)}  Auswahl auf   via ${String(ev.via).padEnd(7)} Riss: ${riss || 'unbekannt'}`);
  });
  w.on('relic-select-closed', () => {
    console.log(`  ${sec(aktuelleZeile).padStart(10)}  Auswahl zu    ${aktuelleZeile.replace(/^\S+\s+/, '').slice(0, 70)}`);
  });
  for (const line of text.split(/\r?\n/)) { aktuelleZeile = line; w.handleLine(line); }
  w.stop();
} else {
  console.log('\n(Teil 5 uebersprungen - keine EE.log gefunden)');
}

console.log(failures ? `\n${failures} FEHLER` : '\nAlles gruen.');
process.exitCode = failures ? 1 : 0;
