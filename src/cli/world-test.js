#!/usr/bin/env node
/**
 * Prueft den Live-Tracker ohne Electron und ohne Netz.
 *
 * Alles hier haengt an der Uhr oder an festen Listen - und genau das laesst
 * sich mit festen Zeitpunkten pruefen. Die Erwartungen stammen aus dem, was
 * warframestat.us am 2026-10-01 tatsaechlich meldete (Zyklen, Circuit-Woche,
 * Teshins Kreis), und aus den Wiki-Seiten, von denen die Listen stammen.
 *
 * Bricht etwas davon, hat entweder DE den Takt geaendert oder jemand die
 * Rechnung - beides will man wissen, bevor es der Reiter falsch anzeigt.
 */
import { computeWorldCycles } from '../core/cycles.js';
import { formatWorldState, bountyRotation } from '../core/worldstate.js';
import {
  buildWorldView, circuitWeek, vendorRotations, nextDailyReset, nextWeeklyReset,
  CIRCUIT_NORMAL, CIRCUIT_HARD, looseKey
} from '../core/world-view.js';
import { parseArbitrationText, arbitrationWindow } from '../core/arbitrations.js';
import { parseIncursionText, incursionWindow } from '../core/incursions.js';
import { mergeDeWorldState, isDeWorldState, deMs } from '../core/worldstate-de.js';
import { DE, WFS, KNOTEN } from './fixtures/worldstate-de.js';

let fehler = 0;
const ok = (label, cond, extra = '') => {
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
  if (!cond) fehler++;
};
const t = iso => Date.parse(iso);
const zyklus = (now, key) => computeWorldCycles(t(now)).find(c => c.key === key);

console.log('=== Die sechs Uhren ===');
{
  /* Beobachtet am 2026-10-01 (warframestat.us): Erde Nacht 12-16 UTC,
     Cetus Tag ab 12:46, Zariman Corpus 12:46-15:16, Duviri Sorrow 12-14 und
     danach Fear. */
  const e = zyklus('2026-10-01T13:45:09Z', 'earth');
  ok('Erde: Nacht um 13:45 UTC', e.state === 'night');
  ok('Erde: Wechsel um 16:00 UTC', e.expiry === '2026-10-01T16:00:00.000Z', e.expiry);
  ok('Erde: Tag um 17:00 UTC', zyklus('2026-10-01T17:00:00Z', 'earth').state === 'day');

  const c = zyklus('2026-10-01T13:45:09Z', 'cetus');
  ok('Cetus: Tag um 13:45 UTC', c.state === 'day');
  ok('Cetus: Anfang um 12:46 UTC', c.activation.startsWith('2026-10-01T12:46'), c.activation);
  ok('Cetus: Nacht ab 14:26 UTC', c.expiry.startsWith('2026-10-01T14:26'), c.expiry);

  const z = zyklus('2026-10-01T13:45:09Z', 'zariman');
  ok('Zariman: Corpus um 13:45 UTC', z.state === 'corpus');
  ok('Zariman: haelt bis 15:16 UTC', z.expiry.startsWith('2026-10-01T15:16'), z.expiry);
  ok('Zariman: danach Grineer', zyklus('2026-10-01T15:30:00Z', 'zariman').state === 'grineer');

  ok('Duviri: Sorrow um 13:45 UTC', zyklus('2026-10-01T13:45:09Z', 'duviri').state === 'sorrow');
  ok('Duviri: Fear um 14:26 UTC', zyklus('2026-10-01T14:26:31Z', 'duviri').state === 'fear');
  const d = zyklus('2026-10-01T14:26:31Z', 'duviri');
  ok('Duviri: Fear bis 16:00, dann Joy', d.expiry === '2026-10-01T16:00:00.000Z' && d.next === 'Joy', `${d.expiry} ${d.next}`);
  ok('Duviri: Kullervo bei Fear', /Kullervo/.test(d.hint || ''), d.hint);

  /* Jede Uhr: Anfang vor jetzt, Ende nach jetzt - sonst stuende der Balken
     ueber 100 % oder unter 0. */
  const jetzt = Date.now();
  ok('alle sechs: jetzt liegt in der Phase',
     computeWorldCycles(jetzt).every(x => t(x.activation) <= jetzt && jetzt < t(x.expiry)));
}

console.log('\n=== Resets ===');
{
  ok('Tagesreset 0:00 UTC', new Date(nextDailyReset(t('2026-10-01T13:45:00Z'))).toISOString() === '2026-10-02T00:00:00.000Z');
  ok('Wochenreset Montag 0:00 UTC', new Date(nextWeeklyReset(t('2026-10-01T13:45:00Z'))).toISOString() === '2026-10-05T00:00:00.000Z');
  ok('am Montag selbst: der naechste Montag', new Date(nextWeeklyReset(t('2026-10-05T00:00:01Z'))).toISOString() === '2026-10-12T00:00:00.000Z');
}

console.log('\n=== Ergo Glast und Eleanor ===');
{
  const v = vendorRotations(t('2026-10-01T14:00:00Z'));
  ok('Ergo Glast: neuer Bonus am 2. Oktober 0:00 UTC', v.tenet.expiry === '2026-10-02T00:00:00.000Z', v.tenet.expiry);
  /* Das Wiki zeigte an diesem Tag "Current Valence Bonuses (Batch A)". */
  ok('Eleanor: Charge A am 1. Oktober', v.coda.batch === 'A');
  ok('Eleanor: Charge B ab 3. Oktober 0:00 UTC', v.coda.expiry === '2026-10-03T00:00:00.000Z', v.coda.expiry);
  ok('Eleanor: einen Tag nach Ergo Glast versetzt',
     (t(v.coda.expiry) - t(v.tenet.expiry)) % (4 * 86400000) === 86400000);
}

console.log('\n=== The Circuit ===');
{
  ok('11 Wochen Warframes, 9 Wochen Steel Path', CIRCUIT_NORMAL.length === 11 && CIRCUIT_HARD.length === 9);
  ok('Ash, Frost, Nyx ist Woche 3', circuitWeek(CIRCUIT_NORMAL, ['Ash', 'Frost', 'Nyx']) === 2);
  ok('Reihenfolge egal', circuitWeek(CIRCUIT_NORMAL, ['Nyx', 'Ash', 'Frost']) === 2);
  /* So kam es aus der API - interne Namen ohne Leerzeichen. */
  ok('Woche E aus API-Schreibweise', circuitWeek(CIRCUIT_HARD, ['Torid', 'DualToxocyst', 'DualIchor', 'Miter', 'Atomos']) === 4);
  ok('"AckAndBrunt" trifft "Ack & Brunt"', looseKey('AckAndBrunt') === looseKey('Ack & Brunt'));
  ok('unbekannte Woche: -1 statt Raten', circuitWeek(CIRCUIT_NORMAL, ['Ash', 'Frost', 'Wisp']) === -1);
  const alle = CIRCUIT_NORMAL.flat();
  ok('jeder Frame genau einmal', new Set(alle).size === alle.length, `${alle.length} Frames`);
}

console.log('\n=== Kopfgelder ===');
{
  ok('TierATableARewards -> A', bountyRotation('/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierATableARewards') === 'A');
  ok('TierDTableBRewards -> B', bountyRotation('/Lotus/Types/Game/MissionDecks/DeimosMissionRewards/TierDTableBRewards') === 'B');
  ok('VaultBountyTierBTableCRewards -> C', bountyRotation('/Lotus/Types/Game/MissionDecks/DeimosMissionRewards/VaultBountyTierBTableCRewards') === 'C');
  ok('ohne Tabellenpfad -> null', bountyRotation('') === null);
}

console.log('\n=== Weltzustand formatieren ===');
{
  const now = t('2026-10-01T13:45:09Z');
  const raw = {
    timestamp: '2026-10-01T13:45:09.000Z',
    steelPath: {
      currentReward: { name: 'Kitgun Riven Mod', cost: 75 },
      activation: '2026-09-28T00:00:00.000Z', expiry: '2026-10-04T23:59:59.000Z',
      rotation: [{ name: 'Umbra Forma Blueprint', cost: 150 }, { name: '50,000 Kuva', cost: 55 },
                 { name: 'Kitgun Riven Mod', cost: 75 }, { name: '3x Forma', cost: 75 }],
      evergreens: [{ name: 'Veiled Riven Cipher', cost: 20 }]
    },
    alerts: [{
      id: 'a1', activation: '2026-10-01T14:00:00.000Z', expiry: '2099-01-01T00:00:00.000Z',
      mission: { description: 'Tenno United Alert', node: 'Ganymede (Jupiter)', type: 'Disruption',
        reward: { items: ['Conquera Kuaka Floof'], countedItems: [{ type: 'Conquera Kuaka Floof', count: 1 }], credits: 10000 } }
    }],
    syndicateMissions: [
      { syndicate: 'Ostrons', syndicateKey: 'Ostrons', expiry: '2026-10-01T15:16:15.370Z', nodes: [],
        jobs: [{ id: 'j1', type: 'Find the Hidden Artifact', enemyLevels: [5, 15], standingStages: [430, 430, 430], minMR: 0,
                 uniqueName: '/Lotus/Types/Game/MissionDecks/EidolonJobMissionRewards/TierATableARewards' }] },
      { syndicate: 'Steel Meridian', syndicateKey: 'Steel Meridian', expiry: '2026-10-01T15:59:00.000Z',
        nodes: ['Arval (Mars)', 'E Gate (Venus)'], jobs: [] }
    ]
  };
  const ws = formatWorldState(raw, { now });

  const sp = ws.steelPath;
  ok('Teshin: drei Wochen voraus aus dem Kreis', sp.upcoming.length === 3, sp.upcoming.map(u => u.name).join(', '));
  ok('Teshin: naechste Woche 3x Forma', sp.upcoming[0]?.name === '3x Forma');
  ok('Teshin: danach im Kreis von vorn', sp.upcoming[1]?.name === 'Umbra Forma Blueprint');
  ok('Teshin: naechste Woche beginnt Montag 0:00', sp.upcoming[0]?.activation === '2026-10-05T00:00:00.000Z', sp.upcoming[0]?.activation);

  const a = ws.alerts[0];
  ok('Alert: Titel aus der Beschreibung', a?.titel === 'Tenno United Alert', a?.titel);
  ok('Alert: Belohnung nicht doppelt', a?.reward === 'Conquera Kuaka Floof, 10,000 credits', a?.reward);

  const ostrons = ws.bounties.find(b => b.key === 'ostrons');
  ok('Ostrons: veroeffentlicht, ein Auftrag', ostrons?.published && ostrons.jobs.length === 1);
  ok('Ostrons: Standing zusammengezaehlt', ostrons?.jobs[0].standingTotal === 1290);
  const hex = ws.bounties.find(b => b.key === 'hex');
  ok('The Hex: da, aber unveroeffentlicht', hex && !hex.published && !hex.jobs.length);
  ok('Syndikatsmissionen: Steel Meridian mit Knoten', ws.factionMissions.some(s => s.syndicate === 'Steel Meridian' && s.nodes.length === 2));
  ok('sechs Uhren dabei', ws.cycles.length === 6);
}

console.log('\n=== DEs eigener Weltzustand ===');
{
  /* Zwei gleichzeitige Abrufe vom 2026-10-03 - siehe fixtures/worldstate-de.js.
     warframestat.us fuehrte dabei alles, was DE fuehrte; damit laesst sich
     jeder Abschnitt einmal gegen die fertigen Namen pruefen. */
  const now = t('2026-10-03T01:24:23Z');
  const node = id => KNOTEN[id] ? { name: KNOTEN[id].value, type: KNOTEN[id].type, enemy: KNOTEN[id].enemy } : null;
  const gleich = (a, b, keys) => JSON.stringify(keys.map(k => a?.[k])) === JSON.stringify(keys.map(k => b?.[k]));
  const AKT = '/Lotus/Types/Challenges/Seasons/Daily/SeasonDailyKillEnemiesWithFire';

  ok('deMs liest $numberLong', deMs({ $date: { $numberLong: '1790990965284' } }) === 1790990965284);
  ok('Fehlerseite ist kein Weltzustand', !isDeWorldState({ error: 'x' }) && isDeWorldState(DE));

  /* 1. Beide Quellen kennen dieselben Eintraege. */
  const beide = mergeDeWorldState(DE, WFS, { node, now });
  ok('Zeitstempel von DE, nicht von warframestat.us', beide.data.timestamp === '2026-10-03T01:23:50.000Z', beide.data.timestamp);
  ok('gleiche Risse: der fertige Eintrag von warframestat.us',
     beide.data.fissures.length === 7 && beide.data.fissures.every(f => WFS.fissures.includes(f)));
  const inv = beide.data.invasions.find(i => i.id === '6abfb307a0febc86d023bfdf');
  ok('Invasion: Name von warframestat.us, Stand von DE', inv?.desc === 'Corpus Siege' && inv.count === 14382,
     `${inv?.desc} ${inv?.count}`);

  const buch = {};
  for (const [art, k, v] of beide.learned) (buch[art] ||= {})[k] = v;
  ok('gelernt: Kopfgeld-Name', buch.job?.['/Lotus/Types/Gameplay/Eidolon/Jobs/CaptureBountyCapTwo'] === 'Spy Catcher');
  ok('gelernt: Isolation Vault ueber die Kammer', buch.job?.['vault:ChamberB'] === 'Isolation Vault Chamber B');
  ok('gelernt: Sortie-Bedingung', buch.modifier?.SORTIE_MODIFIER_EXIMUS?.modifier === 'Eximus Stronghold');
  ok('gelernt: Missionstyp aus der Sortie', buch.mission?.MT_ASSAULT === 'Assault');
  ok('gelernt: Nightwave-Akt und Standing je Topf', buch.challenge?.[AKT]?.title === 'Arsonist' && buch.standing?.elite === 7000);
  ok('gelernt: jedes Paar nur einmal', new Set(beide.learned.map(([a, k]) => a + '|' + k)).size === beide.learned.length);
  ok('Bekanntes wird nicht neu gelernt', mergeDeWorldState(DE, WFS, { node, names: buch, now }).learned.length === 0);

  /* 2. warframestat.us fehlt: was Argus selbst daraus macht, muss genau das
        sein, was warframestat.us gemeldet hat. */
  const eigen = mergeDeWorldState(DE, null, { node, names: buch, now }).data;
  const RISS = ['id', 'activation', 'expiry', 'node', 'missionType', 'enemy', 'tier', 'tierNum', 'isStorm', 'isHard'];
  ok('Risse und Stuerme: Knoten, Typ, Gegner, Aera wie warframestat.us',
     WFS.fissures.every(f => gleich(eigen.fissures.find(x => x.id === f.id), f, RISS)));
  ok('Sortie: Boss und Bedingungen', gleich(eigen.sortie, WFS.sortie, ['id', 'boss', 'faction', 'expiry'])
     && eigen.sortie.variants.every((v, i) => gleich(v, WFS.sortie.variants[i], ['node', 'missionType', 'modifier', 'modifierDescription'])));
  ok('Archon: Missionen', gleich(eigen.archonHunt, WFS.archonHunt, ['id', 'boss', 'faction', 'expiry'])
     && eigen.archonHunt.missions.every((m, i) => gleich(m, WFS.archonHunt.missions[i], ['node', 'type'])));
  const JOB = ['uniqueName', 'type', 'enemyLevels', 'standingStages', 'minMR'];
  ok('Kopfgelder: Namen, Stufen, Standing',
     ['CetusSyndicate', 'EntratiSyndicate'].every(tag => {
       const w = WFS.syndicateMissions.find(s => s.id.endsWith(tag));
       const e = eigen.syndicateMissions.find(s => s.id === w.id);
       return e && e.syndicate === w.syndicate && w.jobs.every((j, i) => gleich(e.jobs[i], j, JOB));
     }));
  ok('Narmer: in Cetus nur bei Tag',
     eigen.syndicateMissions.find(s => s.syndicateKey === 'CetusSyndicate').jobs[2].timeBound === 'day');
  const arbiter = WFS.syndicateMissions.find(s => s.id.endsWith('ArbitersSyndicate'));
  ok('Syndikatsknoten mit Namen', gleich(eigen.syndicateMissions.find(s => s.id === arbiter.id), arbiter, ['syndicate', 'nodes']));
  ok('Alert: Titel, Ort, Belohnung', gleich(eigen.alerts[0].mission, WFS.alerts[0].mission, ['description', 'node', 'type', 'faction'])
     && gleich(eigen.alerts[0].mission.reward, WFS.alerts[0].mission.reward, ['items', 'credits']));
  ok('Baro: Ort, Zeiten, Waren', gleich(eigen.voidTrader, WFS.voidTrader, ['id', 'activation', 'expiry', 'character', 'location', 'inventory']));
  ok('Darvo', gleich(eigen.dailyDeals[0], WFS.dailyDeals[0], ['id', 'item', 'uniqueName', 'salePrice', 'discount', 'total', 'sold', 'expiry']));
  ok('Nightwave: Akte mit Titel und Standing', WFS.nightwave.activeChallenges.every(c =>
     gleich(eigen.nightwave.activeChallenges.find(x => x.id === c.id), c, ['title', 'desc', 'reputation', 'isDaily', 'isElite', 'expiry'])));

  /* Die Fortschrittsformel - mit den Zaehlerstaenden, die warframestat.us
     selbst meldete, muss genau dessen Prozentzahl herauskommen. */
  ok('Invasion: Fortschritt wie warframestat.us, auch gegen die Infestation', WFS.invasions.every(w => {
    const roh = DE.Invasions.find(i => i._id.$oid === w.id);
    const e = mergeDeWorldState({ ...DE, Invasions: [{ ...roh, Count: w.count }] }, null, { node, now }).data.invasions[0];
    return Math.abs(e.completion - w.completion) < 1e-9;
  }));

  /* 3. warframestat.us haengt: alter Stand in den Abschnitten, die DE fuehrt,
        und dazu, was DE gar nicht fuehrt. */
  const steelPath = { currentReward: { name: 'Kitgun Riven Mod', cost: 75 } };
  const hinterher = { ...WFS, steelPath, sortie: { ...WFS.sortie, id: 'gestern' },
                      fissures: WFS.fissures.slice(0, 2), syndicateMissions: [] };
  const m = mergeDeWorldState(DE, hinterher, { node, names: buch, now }).data;
  ok('Haengt die Quelle: Sortie von heute, mit Namen', m.sortie.id === '6abfd17e1aa7ec1cbc7dffbc' && m.sortie.boss === 'General Sargas Ruk');
  ok('Haengt die Quelle: fehlende Risse kommen von DE', m.fissures.length === 7);
  ok('Haengt die Quelle: Kopfgelder trotzdem da',
     m.syndicateMissions.find(s => s.syndicateKey === 'CetusSyndicate')?.jobs[1].type === 'Spy Catcher');
  ok('Was DE nicht fuehrt, bleibt von warframestat.us', m.steelPath === steelPath);

  /* 4. Ganz ohne Namen: Notnamen aus der Kennung, nichts Erfundenes. */
  const roh = mergeDeWorldState(DE, null, { now }).data;
  ok('ohne Knotentabelle: Kennung bleibt stehen', roh.fissures[0].node === 'SolNode102');
  ok('Kopfgeld ohne Namen: "Bounty"', roh.syndicateMissions.find(s => s.syndicateKey === 'CetusSyndicate').jobs[0].type === 'Bounty');
  ok('Akt ohne Namen: aus dem Pfad, Standing unbekannt',
     roh.nightwave.activeChallenges[0].title === 'Kill Enemies With Fire' && roh.nightwave.activeChallenges[0].reputation === null,
     roh.nightwave.activeChallenges[0].title);
  const ws = formatWorldState(roh, { now, source: 'de' });
  ok('Kopfgelder auch unter "CetusSyndicate" bei den Ostrons',
     ws.bounties.find(b => b.key === 'ostrons')?.jobs.length === 3 && ws.bounties.find(b => b.key === 'entrati')?.jobs.length === 2);
  ok('Syndikatsknoten ohne Namen: Kennungen, aber da', ws.factionMissions.some(s => s.nodes.includes('SolNode113')));
}

console.log('\n=== Arbitrations-Plan ===');
{
  const plan = parseArbitrationText('1790859600,SolNode302\nkaputt\n1790863200,SettlementNode3\r\n1790866800,ClanNode16\n');
  ok('drei gueltige Zeilen, Muell uebersprungen', plan.length === 3);
  const info = id => ({ SolNode302: { name: 'Tycho (Lua)', type: 'Survival', enemy: 'Corpus' } }[id] || null);
  const w = arbitrationWindow(plan, { now: t('2026-10-01T13:30:00Z'), hours: 24, info });
  ok('laufende um 13:30: Tycho', w.current?.name === 'Tycho (Lua)', w.current?.name);
  ok('laufende endet um 14:00', w.current?.expiry === '2026-10-01T14:00:00.000Z');
  ok('zwei kommende', w.upcoming.length === 2);
  ok('unbekannter Knoten behaelt seine Kennung', w.upcoming[0]?.name === 'SettlementNode3');
}

console.log('\n=== Incursions-Plan ===');
{
  const plan = parseIncursionText(
    '1790726400;SolNode1,SolNode2,SolNode3,SolNode4,SolNode5,SolNode6\nkaputt;\n' +
    '1790812800;SettlementNode20,SolNode404,SolNode34,SolNode173,SolNode193,SolNode715\r\n' +
    '1790899200;SettlementNode11,SolNode711,SolNode114,SolNode175,SolNode745,SolNode232\n');
  ok('drei gueltige Tage, Muell uebersprungen', plan.length === 3);
  ok('sechs Knoten je Tag', plan.every(e => e.nodes.length === 6));
  const info = id => ({ SettlementNode20: { name: 'Iliad (Phobos)', type: 'Assassination', enemy: 'Corpus' } }[id] || null);
  const w = incursionWindow(plan, { now: t('2026-10-01T13:30:00Z'), info });
  ok('heute: der Satz ab 0:00 UTC', w.today?.activation === '2026-10-01T00:00:00.000Z', w.today?.activation);
  ok('heute: erster Knoten aufgeloest', w.today?.missions[0]?.name === 'Iliad (Phobos)');
  ok('heute: endet um Mitternacht', w.today?.expiry === '2026-10-02T00:00:00.000Z');
  ok('morgen: der naechste Satz', w.tomorrow?.missions[0]?.node === 'SettlementNode11');
  const spaeter = incursionWindow(plan, { now: t('2026-10-05T10:00:00Z'), info });
  ok('Plan zu Ende: kein alter Satz als heute', spaeter.today === null && spaeter.tomorrow === null);
}

console.log('\n=== Steel Path: Bilder zu Teshins Posten ===');
{
  const items = [
    { name: 'Kuva', uniqueName: '/Lotus/Types/Items/MiscItems/Kuva' },
    { name: 'Forma', uniqueName: '/Lotus/Types/Items/MiscItems/Forma' },
    { name: 'Umbra Forma', uniqueName: '/Lotus/Types/Items/MiscItems/FormaUmbra' }
  ];
  /* Riven-Karten stehen wie im echten Katalog nur im Nachschlage-Topf. */
  const lookup = [{ name: 'Kitgun Riven Mod', uniqueName: '/Lotus/Upgrades/Mods/Randomized/RawModularPistolRandomMod' }];
  const catalog = { items, lookup, byUniqueName: new Map([...items, ...lookup].map(i => [i.uniqueName, i])) };
  const ws = {
    counts: {}, cycles: [], fissures: [], alerts: [],
    steelPath: {
      rewardName: 'Kitgun Riven Mod', rewardCost: 75,
      upcoming: [{ name: '3x Forma' }, { name: 'Umbra Forma Blueprint' }, { name: '50,000 Kuva' },
                 { name: 'Bishamo Cuirass Blueprint' }, { name: '30,000 Endo' }]
    }
  };
  const sp = buildWorldView(ws, { catalog, now: t('2026-10-01T13:30:00Z') }).steelPath;
  const bild = n => sp.upcoming.find(u => u.name === n)?.image || '';
  ok('diese Woche: Riven-Bild', /RawModularPistolRandomMod/.test(sp.rewardImage || ''));
  ok('"3x Forma" -> Forma', /MiscItems\.Forma\.png$/.test(bild('3x Forma')), bild('3x Forma'));
  ok('"Umbra Forma Blueprint" -> Umbra Forma', /FormaUmbra/.test(bild('Umbra Forma Blueprint')));
  ok('"50,000 Kuva" -> Kuva', /MiscItems\.Kuva\.png$/.test(bild('50,000 Kuva')));
  ok('Bishamo Cuirass -> Teshin-Ruestung Body', /TeshinArmourBody/.test(bild('Bishamo Cuirass Blueprint')));
  ok('"30,000 Endo" -> mitgeliefertes Waehrungsbild', bild('30,000 Endo') === 'assets/icons/currency/endo.png', bild('30,000 Endo'));
  ok('ohne Plan: keine Incursion-Liste', sp.incursions.today === null);
}

console.log('\n=== Konto: Circuit und Tageswerte ===');
{
  /* Ein Katalog aus drei Eintraegen und ein Inventar, das genau eine Waffe
     mit eingebautem Incarnon traegt - die Antwort ist also vorher bekannt. */
  const items = [
    { name: 'Torid', uniqueName: '/W/Torid', productCategory: 'LongGuns' },
    { name: 'Miter', uniqueName: '/W/Miter', productCategory: 'LongGuns' },
    { name: 'Dual Ichor', uniqueName: '/W/DualIchor', productCategory: 'Melee' },
    { name: 'Ash', uniqueName: '/P/Ash', productCategory: 'Suits' }
  ];
  const catalog = { items, byUniqueName: new Map(items.map(i => [i.uniqueName, i])) };
  const jetzt = t('2026-10-01T13:45:09Z');
  const hex = Math.floor(jetzt / 1000).toString(16);
  const inventory = {
    LastInventorySync: { $oid: hex + '0000000000000000' },
    LongGuns: [{ ItemType: '/W/Torid', SkillTree: '0' }, { ItemType: '/W/Miter' }],
    Melee: [],
    MiscItems: [{ ItemType: '/Lotus/Types/Items/MiscItems/IncarnonAdapters/Melee/DualIchorIncarnonUnlocker', ItemCount: 1 }],
    Suits: [{ ItemType: '/P/Ash' }],
    DailyAffiliation: 12000, DailyFocus: 150000,
    CompletedSorties: ['SolNode1_s1', 'SolNode2_s1', 'SolNode3_alt']
  };
  const ws = {
    counts: {}, cycles: [], fissures: [], alerts: [],
    circuit: { normal: ['Ash', 'Frost', 'Nyx'], hard: ['Torid', 'DualToxocyst', 'DualIchor', 'Miter', 'Atomos'] },
    sortie: { id: 's1', activation: '2026-09-30T16:00:00.000Z', expiry: '2026-10-01T16:00:00.000Z', boss: 'Phorid', faction: 'Infestation', variants: [{}, {}, {}] }
  };
  const v = buildWorldView(ws, { catalog, inventory, entries: [{ uniqueName: '/P/Ash', status: 'done' }], mr: 30, now: jetzt });
  const h = Object.fromEntries(v.circuit.hard.map(p => [p.name, p.incarnon?.state]));
  ok('Torid: eingebaut (SkillTree)', h.Torid === 'installed');
  ok('Dual Ichor: Adapter im Inventar', h['Dual Ichor'] === 'adapter');
  ok('Miter: Waffe da, Incarnon nicht', h.Miter === 'none' && v.circuit.hard.find(p => p.name === 'Miter').haveVariant === true);
  ok('Circuit: Woche 3 und E erkannt', v.circuit.normalWeek === 3 && v.circuit.hardWeek === 'E');
  ok('Circuit: volle Vorschau (11 Wochen)', v.circuit.normalRotation.length === 11);
  ok('Ash: gemeistert', v.circuit.normal.find(p => p.name === 'Ash').mastery === 'done');

  ok('Heute: Inventar gilt als frisch', v.today.fresh === true);
  ok('Heute: zwei von drei Sortie-Missionen', v.today.sortie.done === 2, String(v.today.sortie.done));
  ok('Heute: Standing-Limit bei MR 30 = 31 000', v.today.standing?.[0]?.cap === 31000);
  ok('Heute: Fokus-Limit bei MR 30 = 400 000', v.today.focus?.cap === 400000);

  const alt = buildWorldView(ws, { catalog, inventory: { ...inventory, LastInventorySync: { $oid: '6abaeba27f475cbf2700dfc7' } }, mr: 30, now: jetzt });
  ok('altes Inventar: keine Tageswerte', alt.today.fresh === false && alt.today.standing === null);
  ok('altes Inventar: Sortie unbekannt statt 0', alt.today.sortie.done === null);

  const ohne = buildWorldView(ws, { catalog, now: jetzt });
  ok('ohne Inventar: kein Incarnon-Status', ohne.circuit.hard.every(p => p.incarnon === null));
}

console.log(`\n=== ${fehler ? fehler + ' Fehler' : 'alles in Ordnung'} ===`);
process.exit(fehler ? 1 : 0);
