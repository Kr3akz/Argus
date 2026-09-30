#!/usr/bin/env node
/**
 * Prueft die Droptabellen-Suche ohne Electron.
 *
 * Gegen den ECHTEN Abzug in data/drop-sources.json, nicht gegen eine kleine
 * Attrappe: die Fehler, um die es hier geht, stecken in DEs Daten selbst -
 * falsch beschriftete Relikt-Commons, doppelte Zeilen, eine Gegner-Tabelle
 * ohne den ersten Wurf. Eine selbstgebaute Attrappe haette sie nicht.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDropTables, loadDropRows } from '../core/droptables.js';
import { searchDrops, buildDropRows, diffDropRows, indexRows } from '../core/drop-search.js';
import { dataDir } from '../core/paths.js';

const ok = (label, cond, extra = '') =>
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);

const idx = await loadDropTables({});
const t0 = Date.now();
const rows = await loadDropRows(idx);
console.log(`${rows.length} Zeilen in ${Date.now() - t0} ms\n`);

console.log('=== Relikte ===');
{
  const intact = rows.filter(r => r.kind === 'relic' && r.refinement === 'Intact');
  const top = intact.filter(r => r.chance === 25.33);
  ok('die drei haeufigsten Teile heissen Common', top.length > 0 && top.every(r => r.rarity === 'Common'),
     `${top.filter(r => r.rarity !== 'Common').length} von ${top.length} anders`);

  /* Bei Radiant liegt Common UNTER Uncommon - die Stufe muss vom Intact-
     Relikt kommen, nicht aus der Reihenfolge der Chancen. */
  const rad = rows.filter(r => r.kind === 'relic' && r.refinement === 'Radiant' && r.place === 'Axi A1 Relic');
  const c = rad.filter(r => r.rarity === 'Common').map(r => r.chance);
  ok('Radiant-Commons behalten 16,67 %', c.length === 3 && c.every(v => v === 16.67), c.join(', '));

  const a1 = searchDrops(rows, { q: 'axi a1', mode: 'place' });
  ok('"axi a1" bringt A1 vor A10', a1.rows[0]?.place === 'Axi A1 Relic', a1.rows[0]?.place);
  ok('Standard ist nur Intact', a1.rows.every(r => r.refinement === 'Intact'));

  const all = searchDrops(rows, { q: 'axi a1 relic', mode: 'place', refinement: 'all' });
  ok('mit "all" alle vier Veredelungen', new Set(all.rows.map(r => r.refinement)).size === 4);

  const vaulted = rows.filter(r => r.kind === 'relic' && r.vaulted).length;
  const live = rows.filter(r => r.kind === 'relic' && r.vaulted === false).length;
  ok('Vault-Stand bekannt', vaulted > 0 && live > 0, `${live} farmbar, ${vaulted} gevaultet`);
  const farm = searchDrops(rows, { q: 'prime', kinds: ['relic'], farmable: true });
  ok('"Farmable now" blendet Gevaultetes aus', farm.rows.every(r => !r.vaulted), `${farm.total} Treffer`);
}

console.log('\n=== Gegner ===');
{
  const dread = searchDrops(rows, { q: 'Dread Blueprint', mode: 'item' }).rows.filter(r => r.place === 'Stalker');
  ok('Dread beim Stalker genau einmal', dread.length === 1, dread.map(r => r.chance).join(', '));
  ok('mit beiden Wuerfen (50 % × 64,8 %)', dread[0]?.chance === 32.4, String(dread[0]?.chance));

  const st = searchDrops(rows, { q: 'stalker', mode: 'enemy' });
  ok('Gegnersuche liefert nur Gegner', st.total > 0 && st.rows.every(r => r.kind === 'enemy'), `${st.total} Treffer`);
}

console.log('\n=== Orte ===');
{
  const ap = searchDrops(rows, { q: 'apollodorus', mode: 'place' });
  const rots = ap.rows.map(r => r.rotation).join('');
  ok('Knoten nach Rotation geordnet', /^A+B+C+$/.test(rots), rots);
  ok('Planet und Modus als eigene Felder', ap.rows[0]?.region === 'Mercury' && ap.rows[0]?.mode === 'Survival');

  const cetus = searchDrops(rows, { q: 'cetus', mode: 'place', kinds: ['bounty'] });
  ok('Kopfgeldstufe ohne Zonennamen', cetus.rows.every(r => !/Cetus Bounty/.test(r.place)), cetus.rows[0]?.place);
  const ghoul = rows.find(r => r.kind === 'bounty' && /Ghoul/.test(r.place));
  ok('Ghoul-Kopfgeld behaelt seinen Namen', !!ghoul, ghoul?.place);

  const synd = rows.filter(r => r.kind === 'syndicate');
  ok('Syndikate ohne Chance', synd.every(r => r.chance === null), `${synd.length} Angebote`);
  ok('Rang nicht als Region', synd.every(r => r.region === null));
}

console.log('\n=== Filter ===');
{
  ok('ohne Suchtext und Filter leer', searchDrops(rows, {}).total === 0);
  const browse = searchDrops(rows, { rotations: ['C'], gameMode: 'Survival' });
  ok('nur mit Filtern stoebern', browse.total > 0 && browse.rows.every(r => r.rotation === 'C' && r.mode === 'Survival'),
     `${browse.total} Treffer`);

  const plain = searchDrops(rows, { q: 'serration' });
  const narrowed = searchDrops(rows, { q: 'serration', kinds: ['enemy'] });
  ok('Chip-Zaehler unabhaengig vom Art-Filter',
     JSON.stringify(plain.facets.kinds) === JSON.stringify(narrowed.facets.kinds));
  ok('Mindestchance greift',
     searchDrops(rows, { q: 'serration', minChance: 10 }).rows.every(r => r.chance >= 10));

  const t = Date.now();
  for (let i = 0; i < 20; i++) searchDrops(rows, { q: 'prime', mode: 'item' });
  const ms = (Date.now() - t) / 20;
  ok('eine Suche unter 50 ms', ms < 50, `${ms.toFixed(1)} ms`);
}

console.log('\n=== Aenderungen seit dem letzten Update ===');
{
  /* Ein kuenstlicher alter Stand aus dem aktuellen: eine Chance verschoben,
     ein Drop mehr, einer weniger. Dann muss der Vergleich genau diese drei
     finden - und bei zwei gleichen Staenden gar nichts. */
  const payload = JSON.parse(await readFile(path.join(dataDir(), 'drop-sources.json'), 'utf8'));
  const old = structuredClone(payload.de);
  const suisei = old.missionRewards.Mercury.Suisei.rewards.C;
  suisei.find(r => r.itemName === 'Serration').chance = 5;
  suisei.push({ itemName: 'Old Forgotten Mod', rarity: 'Rare', chance: 3 });
  const dropped = old.missionRewards.Mercury.Apollodorus.rewards.C.shift();

  const oldRows = buildDropRows(old, { wf: payload.wf });
  const same = diffDropRows(rows, rows);
  ok('gleicher Stand, keine Aenderung', same.counts.added + same.counts.changed + same.counts.removed === 0);

  const diff = diffDropRows(oldRows, rows);
  ok('genau ein Drop neu', diff.counts.added === 1, `${diff.counts.added} (${dropped.itemName})`);
  ok('genau eine Chance geaendert', diff.counts.changed === 1 && diff.changed[0].before === 5,
     JSON.stringify(diff.changed[0]));
  ok('genau einer entfernt', diff.counts.removed === 1 && diff.removed[0].item === 'Old Forgotten Mod');

  const changes = {
    addedKeys: new Set(diff.added),
    changedMap: new Map(diff.changed.map(c => [c.key, c.before])),
    removed: indexRows(diff.removed)
  };
  const view = searchDrops(rows, { q: 'suisei', mode: 'place', changes: 'any' }, changes);
  const marks = view.rows.map(r => `${r.item}:${r.change}`).sort().join(', ');
  ok('Filter zeigt nur die Aenderungen am Knoten', view.total === 2, marks);
  const serr = searchDrops(rows, { q: 'serration' }, changes).rows.find(r => r.place === 'Suisei');
  ok('auch ohne Filter markiert, mit alter Chance', serr?.change === 'changed' && serr.before === 5);
}

console.log('\nAlles durchgelaufen.');
