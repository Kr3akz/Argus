#!/usr/bin/env node
/**
 * Prueft die MR-XP-Rechnung: Knoten, Steel Path, Junctions und welche Items
 * zaehlen.
 *
 * WARUM:
 *   Bis 1.24.1 lag Argus bei Kaan 30.438 MR-XP unter dem Spiel - "147.500 to
 *   go until MR 31", waehrend das Spiel 128.762 sagte. Der Steel Path fehlte,
 *   jeder Knoten zaehlte pauschal 100, sieben Items fielen durch classify.js,
 *   und der Mausolon zaehlte dreifach. Jede dieser Ursachen hat hier einen
 *   eigenen Fall.
 *
 * TEIL 1 laeuft ohne Netz mit einer kleinen, ausgedachten Knotentabelle.
 * TEIL 2 rechnet mit den echten Daten unter data/, falls vorhanden: Profil,
 *   Katalog und Knotentabelle (fehlt sie, wird sie geholt). Geprueft werden
 *   dort keine festen Zahlen - das Profil aendert sich mit jedem Spielabend -,
 *   sondern was immer gelten muss: jeder XPInfo-Eintrag zaehlt, und die Summe
 *   faellt nicht unter die Schwelle des Rangs, den das Spiel meldet.
 *
 *   node src/cli/mastery-test.js
 */
import { existsSync, readdirSync } from 'node:fs';
import { classify } from '../core/classify.js';
import { starChartXP, progressForMR, mrToXP } from '../core/mastery.js';
import { parseRegions } from '../core/node-mastery.js';
import { dataDir } from '../core/paths.js';

let fehler = 0;
const pruefe = (was, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'}  ${was}${!ok && hinweis ? ' - ' + hinweis : ''}`);
  if (!ok) fehler++;
};
const n = x => x.toLocaleString('de-DE');

console.log('=== MR-XP-Rechnung ===\n');

console.log('1. Welche Items zaehlen, und wie viel');
/* Je Fall: Kennung, productCategory aus dem Export, erwartete XP je Rang
   (0 = zaehlt nicht). Die Kennungen sind die echten aus DEs Export; das
   Plexus steht dort nicht, seine Kennung kommt aus XPInfo. */
const FAELLE = [
  ['Raplak Prism',   '/Lotus/Weapons/Sentients/OperatorAmplifiers/Set1/Barrel/SentAmpSet1BarrelPartA', 'Pistols', 100],
  ['Mote Prism',     '/Lotus/Weapons/Sentients/OperatorAmplifiers/SentTrainingAmplifier/SentAmpTrainingBarrel', 'Pistols', 100],
  ['Pencha Scaffold', '/Lotus/Weapons/Sentients/OperatorAmplifiers/Set1/Chassis/SentAmpSet1ChassisPartA', 'Pistols', 0],
  ['Clapkra Brace',  '/Lotus/Weapons/Sentients/OperatorAmplifiers/Set1/Grip/SentAmpSet1GripPartA', 'Pistols', 0],
  ['Sirocco',        '/Lotus/Weapons/Operator/Pistols/DrifterPistol/DrifterPistolPlayerWeapon', 'OperatorAmps', 100],
  ['Para Moa',       '/Lotus/Types/Friendly/Pets/MoaPets/MoaPetParts/MoaPetHeadPara', 'Pistols', 200],
  ['Dorma Hound',    '/Lotus/Types/Friendly/Pets/ZanukaPets/ZanukaPetParts/ZanukaPetPartHeadA', 'Pistols', 200],
  ['Multron',        '/Lotus/Types/Friendly/Pets/MoaPets/MoaPetComponents/HextraWeapon', 'SentinelWeapons', 100],
  ['Akaten',         '/Lotus/Types/Friendly/Pets/ZanukaPets/ZanukaPetMeleeWeaponPS', 'SentinelWeapons', 100],
  ['Tian Bracket',   '/Lotus/Types/Friendly/Pets/MoaPets/MoaPetParts/MoaPetLegB', 'Pistols', 0],
  ['Adlet Core',     '/Lotus/Types/Friendly/Pets/ZanukaPets/ZanukaPetParts/ZanukaPetPartBodyA', 'Pistols', 0],
  ['Vizier Predasite', '/Lotus/Types/Friendly/Pets/CreaturePets/VizierPredatorKubrowPetPowerSuit', 'KubrowPets', 200],
  ['Virox Antigen',  '/Lotus/Types/Friendly/Pets/CreaturePets/CreaturePetParts/Deimos/InfestedCritterAntigenA', 'Pistols', 0],
  ['verwundete Predasite', '/Lotus/Types/Items/Deimos/WoundedInfestedPredatorCommonRewardItem', 'Pistols', 0],
  ['Venari',         '/Lotus/Powersuits/Khora/Kavat/KhoraKavatPowerSuit', 'SpecialItems', 200],
  ['Venari Prime',   '/Lotus/Powersuits/Khora/Kavat/KhoraPrimeKavatPowerSuit', 'SpecialItems', 200],
  ['Whipclaw',       '/Lotus/Powersuits/Khora/KhoraWhipclawWeapon', 'SpecialItems', 0],
  ['Bad Baby (Board)', '/Lotus/Types/Vehicles/Hoverboard/HoverboardParts/PartComponents/HoverboardSolarisA/HoverboardSolarisADeck', 'Pistols', 200],
  ['Coldfusor (Antrieb)', '/Lotus/Types/Vehicles/Hoverboard/HoverboardParts/PartComponents/HoverboardSolarisA/HoverboardSolarisAEngine', 'Pistols', 0],
  ['Plexus',         '/Lotus/Types/Game/CrewShip/RailJack/DefaultHarness', undefined, 200],
  ['Braton',         '/Lotus/Weapons/Tenno/Rifle/Rifle', 'LongGuns', 100],
  ['Excalibur',      '/Lotus/Powersuits/Excalibur/Excalibur', 'Suits', 200]
];
for (const [name, uniqueName, productCategory, erwartet] of FAELLE) {
  const c = classify({ uniqueName, productCategory });
  const ist = c.countsForMastery ? c.xpPerRank : 0;
  pruefe(`${name}: ${erwartet ? erwartet + ' je Rang' : 'zaehlt nicht'}`, ist === erwartet, `ist ${ist} (${c.category})`);
}

console.log('\n2. Knotentabelle einlesen');
/* Ausgedacht, aber in der Form der Quelle: ein Objekt je Kennung. */
const quelle = {};
for (let i = 1; i <= 120; i++) quelle[`SolNode${i}`] = { missionType: 'MT_EXTERMINATION', masteryExp: i <= 60 ? 0 : 24 };
for (let i = 1; i <= 12; i++) quelle[`Planet${i}Junction`] = { missionType: 'MT_JUNCTION', masteryExp: 0 };
quelle.SolNode200 = { missionType: 'MT_RAILJACK' };   // ohne masteryExp - wird uebersprungen
const gelesen = parseRegions(quelle);
pruefe('nur Knoten mit Mastery landen in der Tabelle', Object.keys(gelesen.nodes).length === 60);
pruefe('Junctions werden erkannt', gelesen.junctions.length === 12);
let geworfen = false;
try { parseRegions({ SolNode1: { missionType: 'MT_DEFENSE', masteryExp: 5 } }); } catch { geworfen = true; }
pruefe('eine abgeschnittene Datei wird abgelehnt', geworfen);
geworfen = false;
try { parseRegions([1, 2, 3]); } catch { geworfen = true; }
pruefe('etwas ganz anderes wird abgelehnt', geworfen);

console.log('\n3. Sternenkarte: normal, Steel Path, Junctions');
const table = {
  nodes: new Map([['SolNode27', 51], ['SolNode89', 279], ['SolNode63', 3]]),
  junctions: new Set(['EarthToVenusJunction', 'ErisToSednaJunction'])
};
const missions = [
  { Tag: 'SolNode27', Completes: 16, Tier: 1 },      // normal + Steel Path
  { Tag: 'SolNode89', Completes: 134 },              // nur normal
  { Tag: 'SolNode63', Completes: 0 },                // nie abgeschlossen
  { Tag: 'SolNode253', Completes: 6, Tier: 5 },      // Descent: Tier 5 ist kein Steel Path
  { Tag: 'EventNode2', Completes: 4, Tier: 1 },      // unbekannt: 0
  { Tag: 'EarthToVenusJunction', Completes: 3, Tier: 1 },
  { Tag: 'ErisToSednaJunction', Completes: 1 }
];
const sc = starChartXP(missions, table);
pruefe('Knoten normal: 51 + 279', sc.nodes === 330, `ist ${sc.nodes}`);
pruefe('Knoten Steel Path: nur der mit Tier 1', sc.steelPathNodes === 51, `ist ${sc.steelPathNodes}`);
pruefe('Junctions normal: 2 x 1.000', sc.junctions === 2000, `ist ${sc.junctions}`);
pruefe('Junctions Steel Path: 1 x 1.000', sc.steelPathJunctions === 1000, `ist ${sc.steelPathJunctions}`);
const ohne = starChartXP(missions, null);
pruefe('ohne Tabelle: Knoten 0, aber als unbekannt markiert', ohne.nodes === 0 && !ohne.nodesKnown);
pruefe('ohne Tabelle: Junctions zaehlen trotzdem', ohne.junctions === 2000 && ohne.steelPathJunctions === 1000);

console.log('\n4. Fortschritt bis zum naechsten Rang');
/* Kaans Stand vom 05.10.2026: MR 30, 128.762 bis MR 31. */
const p = progressForMR(2268738, 30);
pruefe('128.762 to go until MR 31', p.remaining === 128762, `ist ${p.remaining}`);
pruefe('noch nicht bereit fuer den Test', p.ready === false);
const bereit = progressForMR(mrToXP(31) + 500, 30);
pruefe('ueber der Schwelle: 0 uebrig und bereit fuer den Test', bereit.remaining === 0 && bereit.ready);
const drunter = progressForMR(2238300, 30);
pruefe('unter der eigenen Schwelle: auf die Schwelle angehoben', drunter.current === mrToXP(30));

console.log('\n5. Echte Daten unter data/');
const dir = dataDir();
const profilDatei = existsSync(dir) && readdirSync(dir).find(f => /^profile-[0-9a-f]{24}\.json$/i.test(f));
if (!profilDatei || !existsSync(`${dir}/catalog.json`)) {
  console.log('  (kein Profil oder Katalog unter data/ - uebersprungen)');
} else {
  const { loadCatalog } = await import('../core/catalog.js');
  const { loadProfile } = await import('../core/profile.js');
  const { analyze } = await import('../core/analyze.js');
  const { loadNodeMastery } = await import('../core/node-mastery.js');
  const accountId = profilDatei.slice(8, 32);
  const catalog = await loadCatalog();
  const { profile } = await loadProfile(accountId);
  const nodeTable = await loadNodeMastery();
  const s = analyze(profile, catalog, nodeTable).summary;
  console.log(`  MR ${s.mr}, ${n(s.totalXP)} MR-XP (Items ${n(s.breakdown.items)}, Intrinsics ${n(s.breakdown.intrinsics)},`
            + ` Junctions ${n(s.breakdown.junctions)}, Knoten ${n(s.breakdown.nodes)})`);
  const dubletten = catalog.items.length - new Set(catalog.items.map(i => i.uniqueName)).size;
  pruefe('jede Kennung steht nur einmal im Katalog', dubletten === 0, `${dubletten} doppelt`);
  pruefe('Knotentabelle geladen', !!nodeTable && s.nodesKnown);
  pruefe('jeder XPInfo-Eintrag zaehlt', s.uncounted.length === 0, s.uncounted.join(', '));
  pruefe(`Summe erreicht die Schwelle von MR ${s.mr}`, s.totalXP >= mrToXP(s.mr),
         `${n(mrToXP(s.mr) - s.totalXP)} fehlen`);
}

console.log(`\n=== ${fehler ? fehler + ' Fehler' : 'alles in Ordnung'} ===`);
process.exit(fehler ? 1 : 0);
