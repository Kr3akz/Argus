#!/usr/bin/env node
/**
 * Prueft den Void-Riss-Filter ohne Electron.
 *
 * Zeigt erst feste Faelle (die Zariman-Verwechslung von frueher ist einer davon),
 * danach die aktuell laufenden Risse mit den gespeicherten Einstellungen - so
 * laesst sich nachsehen, wofuer die App gerade einen Toast schicken wuerde,
 * ohne auf den naechsten passenden Riss zu warten.
 *
 *   node src/cli/notif-test.js
 */
import { matchesFissureFilter, canonicalMissionType } from '../core/fissure-filter.js';
import { fetchWorldState } from '../core/worldstate.js';
import * as store from '../core/store.js';

const einstellungen = (missionTypes, extra = {}) => ({
  enabled: true,
  fissures: {
    enabled: true,
    allMissionTypes: false,
    missionTypes,
    tiers: [],
    steelPathOnly: false,
    includeSteelPath: true,
    includeStorms: true,
    ...extra
  }
});

const riss = (missionType, node, extra = {}) => ({
  id: 'test', tier: 'Omnia', missionType, node, enemy: 'Crossfire',
  isHard: false, isStorm: false, eta: '30m', ...extra
});

/* Auswahl, Riss, erwartete Antwort. Die ersten drei Zeilen sind der Grund fuer
   diese Datei: "Void Cascade" durfte nie fuer den ganzen Zariman gelten. */
const FAELLE = [
  ['Kaskade gewaehlt, Kaskade kommt',
    einstellungen(['Void Cascade']), riss('Void Cascade', 'Tuvul Commons (Zariman)'), true],
  ['Kaskade gewaehlt, Flut kommt',
    einstellungen(['Void Cascade']), riss('Void Flood', 'Everview Arc (Zariman)'), false],
  ['Kaskade gewaehlt, Armageddon kommt',
    einstellungen(['Void Cascade']), riss('Void Armageddon', 'The Greenway (Zariman)'), false],
  ['Kaskade gewaehlt, Ueberleben auf dem Zariman kommt',
    einstellungen(['Void Cascade']), riss('Survival', 'Halako Perimeter (Zariman)'), false],
  ['Verteidigung gewaehlt, Mobile Verteidigung kommt',
    einstellungen(['Defense']), riss('Mobile Defense', 'Charybdis (Sedna)'), false],
  ['Mobile Verteidigung gewaehlt, Verteidigung kommt',
    einstellungen(['Mobile Defense']), riss('Defense', 'Belenus (Void)'), false],
  ['Mobile Verteidigung gewaehlt, Mobile Verteidigung kommt',
    einstellungen(['Mobile Defense']), riss('Mobile Defense', 'Aten (Void)'), true],
  ['Alt gespeicherter deutscher Name passt weiter',
    einstellungen(['Void-Flut']), riss('Void Flood', 'Everview Arc (Zariman)'), true],
  ['Nichts ausgewaehlt heisst nichts',
    einstellungen([]), riss('Void Cascade', 'Tuvul Commons (Zariman)'), false],
  ['allMissionTypes nimmt alles',
    einstellungen([], { allMissionTypes: true }), riss('Spy', 'Peregrine Axis (Pluto)'), true],
  ['Stuerme abgeschaltet',
    einstellungen(['Skirmish'], { includeStorms: false }),
    riss('Skirmish', 'Ogal Cluster (Earth)', { isStorm: true }), false],
  ['Nur Steel Path, normaler Riss kommt',
    einstellungen(['Void Cascade'], { steelPathOnly: true }),
    riss('Void Cascade', 'Tuvul Commons (Zariman)'), false],
  ['Stufe nicht angehakt',
    einstellungen(['Void Cascade'], { tiers: ['Lith', 'Meso'] }),
    riss('Void Cascade', 'Tuvul Commons (Zariman)'), false],
  ['Benachrichtigungen ganz aus',
    { enabled: false, fissures: { enabled: true, missionTypes: ['Void Cascade'] } },
    riss('Void Cascade', 'Tuvul Commons (Zariman)'), false]
];

console.log('=== Feste Faelle ===');
let fehler = 0;
for (const [name, cfg, f, erwartet] of FAELLE) {
  const ist = matchesFissureFilter(f, cfg);
  const ok = ist === erwartet;
  if (!ok) fehler++;
  console.log(`  ${ok ? 'OK    ' : 'FEHLER'}  ${name.padEnd(46)} ${ist ? 'Toast' : 'still'}`);
}
console.log(`  ${FAELLE.length - fehler}/${FAELLE.length} bestanden`);

console.log('\n=== Namen, die zusammenfallen sollen ===');
for (const name of ['Void Cascade', 'void-kaskade', 'Kaskade', 'Void Flood', 'Void-Flut', 'Mobile Defense']) {
  console.log(`  ${name.padEnd(16)} -> ${canonicalMissionType(name)}`);
}

const st = await store.load();
const cfg = st.notifications;
const gewaehlt = cfg?.fissures?.allMissionTypes
  ? ['alle']
  : (cfg?.fissures?.missionTypes || []);

console.log('\n=== Gespeicherte Einstellungen ===');
console.log(`  Benachrichtigungen  ${cfg?.enabled === false ? 'aus' : 'an'}`);
console.log(`  Missionstypen       ${gewaehlt.length ? gewaehlt.join(', ') : '(keine)'}`);
console.log(`  Stufen              ${(cfg?.fissures?.tiers || []).join(', ') || '(alle)'}`);
console.log(`  Steel Path          ${cfg?.fissures?.steelPathOnly ? 'nur Steel Path'
  : cfg?.fissures?.includeSteelPath === false ? 'ohne Steel Path' : 'egal'}`);
console.log(`  Stuerme             ${cfg?.fissures?.includeStorms === false ? 'aus' : 'ein'}`);

console.log('\n=== Laufende Risse ===');
const ws = await fetchWorldState({ force: true });
if (ws.error) {
  console.log(`  Worldstate nicht erreichbar: ${ws.error}`);
} else {
  const treffer = [];
  for (const f of ws.fissures) {
    const passt = matchesFissureFilter(f, cfg);
    if (passt) treffer.push(f);
    console.log(`  ${passt ? 'TOAST ' : '      '}  ${String(f.tier).padEnd(8)}` +
                `${String(f.missionType).padEnd(17)} ${f.node}` +
                `${f.isHard ? ' [SP]' : ''}${f.isStorm ? ' [Sturm]' : ''}`);
  }
  console.log(`\n  ${treffer.length} von ${ws.fissures.length} Rissen wuerden gerade melden.`);
}

/* exitCode statt process.exit(): der Abruf haelt noch eine Verbindung offen,
   und ein harter Ausstieg laesst libuv unter Windows mit einer Assertion
   abstuerzen - der Exitcode waere dann wertlos. */
process.exitCode = fehler ? 1 : 0;
