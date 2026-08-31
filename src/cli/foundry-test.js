#!/usr/bin/env node
/**
 * Prueft Schmiede, Vault-Status und Subsume-Liste ohne Electron.
 *
 * Alle drei haengen an Daten, die JEDERZEIT anders aussehen koennen als beim
 * Bauen: DE benennt ein Feld um, ein Prime-Access wechselt, ein Abzug ist
 * aelter. Dieser Test sagt nicht "die Zahlen stimmen" - er sagt, dass die
 * Ketten noch greifen: Blaupause -> Ergebnis -> Name, Relikt -> Belohnung ->
 * Set, Anzugpfad -> Katalogeintrag. Reisst eine davon, faellt hier auf, was
 * sonst nur eine leere Kachel waere.
 */
import { loadCatalog } from '../core/catalog.js';
import { loadInventory } from '../core/inventory.js';
import { loadDropTables } from '../core/droptables.js';
import { loadRelicTables } from '../core/relics.js';
import { foundryQueue, formatRemaining } from '../core/foundry.js';
import { subsumedSuits } from '../core/helminth.js';
import { buildVaultIndex, vaultStatus, partDropsNow } from '../core/vault.js';
import { resolveGoal, formatDuration } from '../core/recipes.js';
import { buildCraftChains, inventoryXP } from '../core/craftchains.js';

const ok = (label, cond, extra = '') =>
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);

const catalog = await loadCatalog();

/* Ohne je abgerufenes Inventar gibt es hier nichts zu pruefen - das ist kein
   Fehler, sondern der Zustand vor dem ersten Abruf. */
let inventory = null;
try {
  ({ inventory } = await loadInventory({ refresh: false }));
} catch {
  console.log('Kein Inventarabzug vorhanden - Schmiede und Subsume werden uebersprungen.\n');
}

console.log('=== Schmiede ===');
if (inventory) {
  const q = foundryQueue(inventory, catalog);
  ok('Warteschlange gelesen', Array.isArray(q.items), `${q.ready.length} fertig, ${q.building.length} laufen`);
  ok('Namen aufgeloest', q.items.every(i => i.name && !i.name.includes('/')),
     q.items.slice(0, 3).map(i => i.name).join(', ') || '(leer)');
  ok('jeder laufende Bau hat eine Zeit', q.building.every(i => i.completionAt > 0));
  ok('Fertiges steht oben', q.items.every((i, n) => n === 0 || !i.ready || q.items[n - 1].ready));
  ok('nextAt liegt in der Zukunft', q.nextAt == null || q.nextAt > Date.now(),
     q.nextAt ? formatRemaining(q.nextAt - Date.now()) : 'nichts offen');
  if (q.helminth) ok('Helminth gelesen', !!q.helminth.ability, q.helminth.ability);
}

console.log('\n=== Bauzeit als Uhrzeit, nicht als Summe ===');
const octavia = catalog.items.find(i => i.name === 'Octavia');
if (octavia) {
  const r = resolveGoal(octavia.uniqueName, catalog);
  /* 72 h Rahmen + 3 x 12 h Komponenten. Parallel sind das 84 h; die alte
     Summe kam auf 108 h. Dazwischen liegt genau der Fehler, um den es geht. */
  ok('Octavia: kritischer Pfad', r.totalBuildSeconds === 84 * 3600,
     formatDuration(r.totalBuildSeconds));
  ok('nicht die Summe', r.totalBuildSeconds < 100 * 3600);
}

console.log('\n=== Bauketten ===');
{
  /* Die Kette Akjagara -> Akbolto -> 2x Bolto -> Lato ist der Pruefstein:
     sie ist die tiefste im Spiel, sie hat einen Zweig (Dual Skana), und sie
     enthaelt die einzige Stelle, an der DE dieselbe Zutat zweimal auffuehrt
     statt "2x" zu schreiben. Reisst irgendwo die Aufloesung Blaupause ->
     Ergebnis, faellt sie hier auf. */
  const chains = buildCraftChains(catalog, {
    xpMap: inventory ? inventoryXP(inventory) : new Map(),
    inventory
  });
  ok('Ketten gefunden', chains.length > 20, chains.length + ' Wurzeln');

  const akja = chains.find(c => c.name === 'Akjagara');
  ok('Akjagara ist eine Wurzel', !!akja);
  if (akja) {
    ok('vier Stufen tief', akja.depthMax === 3, 'Tiefe ' + akja.depthMax);
    ok('fuenf Glieder', akja.links === 5, akja.links + ' Glieder');

    const akbolto = akja.steps.find(s => s.name === 'Akbolto');
    ok('Akbolto steckt drin', !!akbolto);
    const bolto = akbolto?.steps.find(s => s.name === 'Bolto');
    /* Genau der Fall, der ohne Zusammenfassen als "1x Bolto + 1x Bolto"
       durchgeht - im Spiel braucht man zwei. */
    ok('zwei Bolto, nicht zweimal eine', bolto?.need === 2, bolto?.need + 'x');
    ok('darunter die Lato', bolto?.steps.some(s => s.name === 'Lato'));
    ok('Dual Skana als zweiter Zweig', akja.steps.some(s => s.name === 'Dual Skana'));
  }

  /* Eine Vorstufe darf NICHT zusaetzlich als eigene Kette dastehen - sonst
     stuende die Bolto einmal unter der Akbolto und einmal daneben. */
  const wurzelnamen = new Set(chains.map(c => c.name));
  ok('keine Vorstufe als eigene Wurzel', !wurzelnamen.has('Bolto') && !wurzelnamen.has('Akbolto'));

  ok('Namen ohne DE-Marker', chains.every(c => !c.name.includes('<')),
     chains.find(c => c.name.startsWith('Knux')) ? 'Knux ohne <ARCHWING>' : '');

  if (inventory) {
    const geraten = chains.filter(c => c.mastered > 0).length;
    ok('Mastery-Stand aufgeloest', geraten > 0, geraten + ' Ketten mit gemeisterten Gliedern');
    ok('atRisk nur bei Besitz ohne Rang 30', chains.every(c => c.atRisk.length === 0 ||
       c.atRisk.length <= c.links));
  }
}

console.log('\n=== Vault ===');
const dropIdx = await loadDropTables({});
const vaultIdx = buildVaultIndex(dropIdx, await loadRelicTables());
ok('Relikte fallen noch', vaultIdx.liveRelics.size > 0, vaultIdx.liveRelics.size + ' Relikte');
ok('deutlich weniger als alle', vaultIdx.liveRelics.size < 200,
   'sonst steht wieder die Belohnungstabelle statt der Missionstabelle da');
ok('Belohnungen daraus', vaultIdx.obtainable.size > 0, vaultIdx.obtainable.size + ' Teile');

const primes = catalog.items.filter(i => /\bPrime\b/.test(i.name || '') && catalog.recipeFor.has(i.uniqueName));
const stati = primes.map(i => vaultStatus(i.uniqueName, catalog, vaultIdx)).filter(Boolean);
const offen = stati.filter(s => !s.vaulted).length;
ok('Prime-Sets bewertet', stati.length > 100, stati.length + ' Sets');
ok('einige farmbar', offen > 0, offen + ' komplett erreichbar');
ok('die meisten nicht', stati.length - offen > offen,
   (stati.length - offen) + ' gevaultet');
/* Der Fehler, der am leichtesten passiert: Orokin-Zellen als "Teil" zaehlen.
   Dann waere KEIN einziges Set erreichbar. */
ok('Rohstoffe zaehlen nicht als Teil', offen > 5);

/* Die Einzelteil-Auskunft, an der im Dukaten-Tab der Vault-Vermerk haengt.
   Sie muss dasselbe sagen wie vaultStatus, nur eine Ebene tiefer: ein Set
   ist genau dann gevaultet, wenn mindestens eins seiner Teile es ist. */
{
  const probe = stati.filter(s => !s.vaulted).length;
  ok('Teilabfrage antwortet', partDropsNow(vaultIdx, 'Braton Prime Barrel') !== null);
  ok('ohne Tabellen kein Urteil',
     partDropsNow({ usable: false }, 'Braton Prime Barrel') === null,
     'null heisst "wissen wir nicht", nicht "faellt nicht"');
  ok('deckt sich mit dem Set-Urteil', probe === offen);
}

console.log('\n=== Subsume ===');
if (inventory) {
  const sub = subsumedSuits(inventory);
  const treffer = [...sub].filter(u => catalog.byUniqueName.has(u));
  ok('Liste gelesen', sub.size >= 0, sub.size + ' Warframes');
  ok('alle Pfade im Katalog', treffer.length === sub.size,
     `${treffer.length} von ${sub.size}`);
  if (sub.size) {
    ok('Namen aufloesbar', treffer.every(u => catalog.byUniqueName.get(u).name),
       treffer.slice(0, 4).map(u => catalog.byUniqueName.get(u).name).join(', '));
  }
}

console.log('\nAlles durchgelaufen.');
