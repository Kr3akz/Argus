#!/usr/bin/env node
/**
 * Prueft Baros Einkaufszettel ohne Electron.
 *
 * DAS PROBLEM MIT DIESEM TEST: Baro steht zwei von vierzehn Tagen im Relais.
 * An den anderen zwoelf liefert die Quelle eine leere Liste - ein Test, der
 * nur dann etwas prueft, wenn er zufaellig am richtigen Tag laeuft, prueft
 * nichts.
 *
 * Deshalb zwei Teile:
 *   1. Ein Angebot, das aus dem EIGENEN Inventar zusammengesetzt ist - Dinge,
 *      die man nachweislich hat, und Dinge, die man nachweislich nicht hat,
 *      beide in die Schreibweise des Ladens gebracht. Damit ist die Antwort
 *      vorher bekannt, und der Abgleich laesst sich wirklich pruefen.
 *   2. Der LIVE-Abruf, der zeigt, dass die Form der Quelle noch stimmt: traegt
 *      jeder Posten einen uniqueName? Ohne den gibt es keinen Abgleich.
 *      Ist Baro unterwegs, springt Varzia ein - dieselbe Datenform, dieselbe
 *      Kupplung, und sie steht fast immer.
 */
import { loadCatalog } from '../core/catalog.js';
import { loadInventory } from '../core/inventory.js';
import { buildBaroOffer, normalizeStorePath, ownedIndex } from '../core/baro.js';
import { inventoryXP } from '../core/craftchains.js';

const ok = (label, cond, extra = '') =>
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);

const catalog = await loadCatalog();

let inventory = null;
try {
  ({ inventory } = await loadInventory({ refresh: false }));
} catch {
  console.log('Kein Inventarabzug vorhanden - der Abgleich wird uebersprungen.\n');
}

console.log('=== Pfade: Laden gegen Schrank ===');
{
  /* Die eine Stelle, an der ein Abgleich ueber Pfade scheitern kann. Das
     Segment steckt je nach Warengruppe an anderer Stelle. */
  ok('Praefixform', normalizeStorePath('/Lotus/StoreItems/Upgrades/Mods/Melee/PrimedFever')
     === '/Lotus/Upgrades/Mods/Melee/PrimedFever');
  ok('eingebettete Form', normalizeStorePath('/Lotus/Types/StoreItems/AvatarImages/X')
     === '/Lotus/Types/AvatarImages/X');
  ok('Pfad ohne StoreItems bleibt', normalizeStorePath('/Lotus/Weapons/Tenno/Rifle/Braton')
     === '/Lotus/Weapons/Tenno/Rifle/Braton');
  /* Kein blindes Ersetzen: ein Ordner, der zufaellig so HEISST, ist keiner. */
  ok('nur ganze Segmente', normalizeStorePath('/Lotus/StoreItemsExtra/Foo')
     === '/Lotus/StoreItemsExtra/Foo');
}

if (inventory) {
  console.log('\n=== Abgleich mit bekannter Antwort ===');

  const store = u => u.replace('/Lotus/', '/Lotus/StoreItems/');
  const besitz = new Set([...(inventory.RawUpgrades || []), ...(inventory.Upgrades || [])]
    .map(r => r.ItemType));

  const habeMods = [...besitz].slice(0, 3);
  const habeNichtMods = catalog.lookup
    .filter(l => l.uniqueName.includes('/Upgrades/Mods/') && !besitz.has(l.uniqueName))
    .map(l => l.uniqueName).slice(0, 3);

  const habeWaffe = (inventory.LongGuns || [])[0]?.ItemType;
  const habeWaffen = new Set((inventory.LongGuns || []).map(r => r.ItemType));
  const habeNichtWaffe = catalog.items
    .filter(i => i.productCategory === 'LongGuns' && !habeWaffen.has(i.uniqueName))
    .map(i => i.uniqueName)
    .find(u => !(inventory.XPInfo || []).some(x => x.ItemType === u));

  const angebot = {
    character: "Baro Ki'Teer", active: true, location: 'Strata Relay (Earth)',
    inventory: [
      ...habeMods.map(u => ({ uniqueName: store(u), item: 'Mod', ducats: 300, credits: 200000 })),
      ...habeNichtMods.map(u => ({ uniqueName: store(u), item: 'Mod', ducats: 350, credits: 210000 })),
      habeWaffe ? { uniqueName: store(habeWaffe), item: 'Waffe', ducats: 500, credits: 300000 } : null,
      habeNichtWaffe ? { uniqueName: store(habeNichtWaffe), item: 'Waffe', ducats: 550, credits: 325000 } : null
    ].filter(Boolean)
  };

  const offer = buildBaroOffer(angebot, { inventory, catalog, xpMap: inventoryXP(inventory) });

  ok('Abgleich moeglich', offer.matched);
  ok('Besessenes erkannt',
     habeMods.every(u => offer.items.find(i => i.uniqueName === u)?.owned === true),
     `${habeMods.length} Mods`);
  ok('Fehlendes erkannt',
     habeNichtMods.every(u => offer.items.find(i => i.uniqueName === u)?.owned === false),
     `${habeNichtMods.length} Mods`);
  if (habeWaffe) ok('gebaute Waffe erkannt',
     offer.items.find(i => i.uniqueName === habeWaffe)?.owned === true);

  ok('Mods sind Mods', offer.items.filter(i => i.kind === 'mod').length >= 6);
  /* Ein Primed Mod gibt KEINE Mastery. Der Vermerk darf nur an Dingen
     haengen, die welche geben - sonst verspricht der Zettel Punkte, die es
     nicht gibt. */
  ok('keine Mastery von Mods', offer.items.every(i => !(i.kind === 'mod' && i.newMastery)));
  if (habeNichtWaffe) ok('neue Waffe zaehlt als Mastery',
     offer.items.find(i => i.uniqueName === habeNichtWaffe)?.newMastery === true,
     catalog.byUniqueName.get(habeNichtWaffe)?.name);

  ok('Namen aus dem Katalog', offer.items.filter(i => i.resolved).every(i => !i.name.includes('/')));

  console.log('\n=== Beutel und Rechnung ===');
  const summe = offer.items.filter(i => i.owned === false)
    .reduce((s, i) => s + i.ducats, 0);
  ok('Dukatenbestand gelesen', typeof offer.stock.ducats === 'number', offer.stock.ducats + ' Dukaten');
  ok('Credits gelesen', typeof offer.stock.credits === 'number', offer.stock.credits + ' Credits');
  ok('Kosten nur fuer Fehlendes', offer.cost.ducats === summe, summe + ' Dukaten');
  ok('Fehlbetrag stimmt',
     offer.summary.shortDucats === Math.max(0, offer.cost.ducats - offer.stock.ducats));
  ok('Fehlendes steht oben',
     offer.items.every((i, n) => n === 0 || i.owned !== false || offer.items[n - 1].owned === false));

  console.log('\n=== Ohne Inventar ===');
  const blind = buildBaroOffer(angebot, { catalog });
  ok('kein Urteil ohne Daten', blind.matched === false && blind.items.every(i => i.owned === null),
     'null statt "fehlt"');
  ok('Beutel bleibt leer', blind.stock.ducats === null && blind.stock.credits === null);
}

console.log('\n=== Live: Form der Quelle ===');
try {
  const opts = { headers: { 'User-Agent': 'Argus/2.0' }, signal: AbortSignal.timeout(8000) };
  const baro = await (await fetch('https://api.warframestat.us/pc/voidTrader/', opts)).json();
  ok('Baro abgerufen', !!baro?.character, baro.character);
  ok('Zeiten vorhanden', !!baro.activation && !!baro.expiry,
     baro.inventory?.length ? 'er steht im Relais' : 'unterwegs bis ' + baro.activation);

  /* Steht er da, ist SEINE Liste der Pruefstein. Sonst Varzia: dieselbe
     Datenform aus derselben Quelle, und die steht fast immer. */
  const quelle = baro.inventory?.length
    ? { name: 'Baro', data: baro }
    : { name: 'Varzia (Baro unterwegs)',
        data: await (await fetch('https://api.warframestat.us/pc/vaultTrader/', opts)).json() };

  const posten = quelle.data?.inventory || [];
  ok('Angebot vorhanden', posten.length > 0, `${quelle.name}: ${posten.length} Posten`);
  /* OHNE DIESES FELD GIBT ES KEINEN ABGLEICH. Namen taugen nicht: DE schreibt
     dieselbe Ware im Laden anders als im Schrank. */
  ok('jeder Posten traegt einen Pfad', posten.every(i => typeof i.uniqueName === 'string' && i.uniqueName),
     posten[0]?.uniqueName || '');
  ok('Pfade sind Ladenpfade', posten.some(i => /\/StoreItems\//.test(i.uniqueName)),
     'sonst waere die Normalisierung ueberfluessig geworden');

  if (inventory && posten.length) {
    const live = buildBaroOffer({ ...quelle.data, active: true }, { inventory, catalog });
    ok('Live-Abgleich laeuft', live.matched,
       `${live.summary.owned} vorhanden, ${live.summary.missing} fehlen`);
    ok('Warengruppen erkannt', live.items.every(i => !!i.kind),
       [...new Set(live.items.map(i => i.kind))].join(', '));
  }
} catch (err) {
  console.log('  uebersprungen - Quelle nicht erreichbar:', err.message);
}

console.log('\nAlles durchgelaufen.');
