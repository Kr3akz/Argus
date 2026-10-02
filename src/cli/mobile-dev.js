#!/usr/bin/env node
/**
 * Die Handy-App zum Ansehen, mit Beispieldaten - ohne Spiel, ohne Konto.
 *
 *   node src/cli/mobile-dev.js [port]        (Standard: 47199)
 *
 * Startet denselben Server, den Argus fuer das Handy oeffnet
 * (core/phone-server.js), aber mit den Beispieldaten aus
 * src/cli/fixtures/mobile-sample.js statt der Kanaele des Hauptprozesses.
 * Die Kopplung liegt in einem eigenen, leeren Datenordner - echte
 * Kopplungen in data/phone.json fasst das hier nicht an.
 *
 * Ausgegeben werden zwei Adressen:
 *   - die App, wie der PC sie zuhause ausliefert (mit allen Reitern)
 *   - die App im Unterwegs-Weg (?mode=web): fragt dann die oeffentlichen
 *     Quellen selbst, braucht also Netz.
 * Im Browser in die Handy-Ansicht schalten (Entwicklerwerkzeuge), dann
 * sieht es aus wie auf dem iPhone.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setDataDir } from '../core/paths.js';
import * as phone from '../core/phone.js';
import { startPhoneServer } from '../core/phone-server.js';
import { slimDashboard, slimFoundry, slimInventory, slimDrops } from '../core/phone-views.js';
import { formatWorldState } from '../core/worldstate.js';
import { buildWorldView } from '../core/world-view.js';
import { parseArbitrationText } from '../core/arbitrations.js';
import { parseIncursionText } from '../core/incursions.js';
import * as sample from './fixtures/mobile-sample.js';

const port = Number(process.argv[2]) || 47199;
setDataDir(await mkdtemp(path.join(tmpdir(), 'argus-mobile-dev-')));

/* Ein paar Knoten mit Namen, damit Arbitration und Incursions etwas zeigen. */
const KNOTEN = {
  SolNode302: { name: 'Tycho (Lua)', type: 'Survival', enemy: 'Corpus' },
  SettlementNode3: { name: 'Stickney (Phobos)', type: 'Survival', enemy: 'Grineer' },
  SolNode64: { name: 'Ophelia (Uranus)', type: 'Survival', enemy: 'Grineer' },
  SolNode1: { name: 'Galatea (Neptune)', type: 'Capture', enemy: 'Corpus' },
  SolNode4: { name: 'Acheron (Pluto)', type: 'Exterminate', enemy: 'Corpus' },
  SolNode10: { name: 'Thebe (Jupiter)', type: 'Sabotage', enemy: 'Corpus' }
};

function welt() {
  const jetzt = Date.now();
  const stunde = Math.floor(jetzt / 3600000) * 3600;
  const tag = Math.floor(jetzt / 86400000) * 86400;
  return buildWorldView(formatWorldState(sample.rawWorldState(jetzt)), {
    arbitrations: parseArbitrationText(
      `${stunde},SolNode302\n${stunde + 3600},SettlementNode3\n${stunde + 7200},SolNode64\n`),
    incursions: parseIncursionText(`${tag};SolNode1,SolNode4,SolNode10,SolNode302,SettlementNode3,SolNode64\n`),
    nodeInfo: id => KNOTEN[id] || null
  });
}

const fx = () => sample.inventory(Date.now());
const api = {
  hello: async device => ({ pc: { name: 'PREVIEW-PC', version: 'preview' }, device: phone.publicDevice(device), appUrl: phone.MOBILE_APP_URL }),
  world: async () => welt(),
  dashboard: async () => slimDashboard(sample.dashboard()),
  foundry: async () => slimFoundry(sample.foundry()),
  inventory: async () => slimInventory(fx().inventory, fx().ducats),
  drops: async (_d, p) => slimDrops(sample.drops(p.q)),
  marketSearch: async (_d, p) => [{ slug: 'serration', name: 'Serration', image: null, maxRank: 10, ducats: null },
                                  { slug: 'primed_serration', name: 'Primed Serration', image: null, maxRank: 10, ducats: null }]
    .filter(i => i.name.toLowerCase().includes(String(p.q || '').toLowerCase())),
  price: async () => ({ min: 8, median: 10, offers: 5, online: true })
};

const server = await startPhoneServer({ port, api, onPush: async () => {}, log: m => console.log('[Vorschau]', m) });
const p = await phone.createPairing({ pcName: 'PREVIEW-PC', baseUrl: `http://localhost:${port}` });
const token = phone.parsePairingCode(p.code).t;

console.log(`Handy-App, wie der PC sie zuhause ausliefert:\n  http://localhost:${port}/#t=${token}\n`);
console.log(`Unterwegs-Weg (fragt warframestat.us selbst):\n  http://localhost:${port}/?mode=web\n`);
console.log(`Unterwegs-Weg, frisch aus dem QR-Code (mit Kopplung):\n  http://localhost:${port}/?mode=web#pair=${p.code}\n`);
console.log('Beenden mit Strg+C.');
process.on('SIGINT', () => { server.close(); process.exit(0); });
