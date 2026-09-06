#!/usr/bin/env node
/**
 * Prueft die Haendler-Angebote ohne Electron.
 *
 * DIE SCHWACHE STELLE IST DIE KUPPLUNG UEBER NAMEN. Anders als bei Baro, wo
 * die Quelle uniqueNames mitliefert, stammt die Warenliste aus dem Wiki - und
 * das kennt DEs Pfade nicht. Ein Posten haengt also an seinem Namen, und der
 * Katalog schreibt ihn manchmal anders: "Keratinos Blades" gegen "Keratinos
 * Blade". Solche Faelle sind nicht selten genug, um sie beim Tippen zu
 * bemerken - deshalb steht der Test hier und nicht im Kopf.
 *
 * Geprueft wird:
 *   1. Loest sich JEDER Posten im Katalog auf? Ein unaufloesbarer Name kann
 *      keinen Besitz melden und stuende in der Oberflaeche fuer immer auf "-".
 *   2. Stimmen die Grunddaten je Laden - Waehrung, Ort, Aufhaenger-Bild?
 *   3. Baut der Abgleich gegen den echten Inventarabzug durch, und ist das
 *      Ergebnis plausibel (kein Laden, in dem alles oder nichts fehlt)?
 *
 * Was hier NICHT geprueft wird, sind die Preise selbst - dafuer muesste das
 * Wiki abgerufen werden. Das macht tools/check-vendor-wares.mjs.
 */
import { loadCatalog } from '../core/catalog.js';
import { loadInventory } from '../core/inventory.js';
import { loadProfile } from '../core/profile.js';
import { analyze } from '../core/analyze.js';
import { SHOPS, buildVendorOffers } from '../core/vendors.js';
import { loadConfig } from '../core/config.js';

const ok = (label, cond, extra = '') =>
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);

const catalog = await loadCatalog();

let inventory = null;
try {
  ({ inventory } = await loadInventory({ refresh: false }));
} catch {
  console.log('Kein Inventarabzug vorhanden - der Besitzabgleich wird uebersprungen.\n');
}

let entries = [];
try {
  const cfg = await loadConfig();
  const { profile } = await loadProfile(cfg.accountId, cfg.platform || 'pc');
  entries = analyze(profile, catalog).entries;
} catch {
  console.log('Kein Profil vorhanden - Mastery-Stand bleibt leer.\n');
}

console.log('=== Namen im Katalog ===');
{
  const byName = new Map();
  for (const it of catalog.items) if (it.name) byName.set(it.name.toLowerCase(), it.uniqueName);
  for (const it of catalog.lookup || []) if (it.name && !byName.has(it.name.toLowerCase())) byName.set(it.name.toLowerCase(), it.uniqueName);

  const fehlend = [];
  let posten = 0;
  for (const shop of SHOPS) {
    for (const w of shop.wares) {
      posten++;
      const name = w.part ? `${w.item} ${w.part}` : w.item;
      if (!byName.has(name.toLowerCase())) fehlend.push(`${shop.key}: ${name}`);
    }
  }
  ok(`${posten} Posten in ${SHOPS.length} Laeden aufgeloest`, fehlend.length === 0,
     fehlend.slice(0, 6).join(', '));
}

console.log('\n=== Grunddaten je Laden ===');
{
  const keys = new Set();
  let doppelt = null, ohneWaehrung = null, ohneOrt = null;
  for (const shop of SHOPS) {
    if (keys.has(shop.key)) doppelt = shop.key;
    keys.add(shop.key);
    if (!shop.currency) ohneWaehrung = shop.key;
    if (!shop.location || !shop.vendor) ohneOrt = shop.key;
  }
  ok('Schluessel eindeutig', !doppelt, doppelt || '');
  ok('jeder Laden hat eine Waehrung', !ohneWaehrung, ohneWaehrung || '');
  ok('jeder Laden hat Haendler und Ort', !ohneOrt, ohneOrt || '');
}

console.log('\n=== Abgleich ===');
const offers = buildVendorOffers({ inventory, catalog, entries });

{
  const ohneBild = offers.filter(o => !o.heroImage).map(o => o.key);
  ok('jede Kachel hat ein Bild', ohneBild.length === 0, ohneBild.join(', '));

  const leer = offers.filter(o => !o.goods.length).map(o => o.key);
  ok('jeder Laden hat Ware', leer.length === 0, leer.join(', '));

  /* Ohne Symbol steht an jedem Preis nur eine nackte Zahl - der Name ist an
     den Zeilen ja weggelassen. Ressourcen holen es aus dem Bilderspiegel,
     Ansehen aus der Syndikatsflagge; faellt eins von beiden aus, faellt es
     hier auf und nicht erst in der Oberflaeche. */
  const ohneMuenze = offers
    .filter(o => (o.currencyImages || []).some(u => !u))
    .map(o => `${o.key} (${o.currencies.join(', ')})`);
  ok('jede Waehrung hat ein Symbol', ohneMuenze.length === 0, ohneMuenze.join(', '));

  const unaufgeloest = offers.flatMap(o => o.goods.flatMap(g => g.lines))
    .filter(l => !l.resolved).length;
  ok('kein Posten ohne Katalogtreffer', unaufgeloest === 0, String(unaufgeloest));

  /* Der Beutel haengt an denselben Namen wie die Ware - eine Waehrung, die
     der Katalog nicht kennt, zeigt still gar nichts an. Mit Inventar muss
     JEDE Waehrung eine Zahl haben, sonst stimmt der Name oder der
     Syndikats-Tag nicht. */
  if (inventory) {
    const ohneBestand = offers
      .filter(o => (o.summary.stock || []).some(s => s === null))
      .map(o => `${o.key} (${o.currencies.join(', ')})`);
    ok('jede Waehrung hat einen Bestand', ohneBestand.length === 0, ohneBestand.join(', '));

    const ohneMaterial = offers.flatMap(o => o.goods)
      .filter(g => g.owned === false && g.uniqueName && !g.materials.length).map(g => g.item);
    ok('fehlende Items tragen ihren Bauzettel', ohneMaterial.length === 0,
       ohneMaterial.slice(0, 6).join(', '));
  }
}

console.log('');
for (const o of offers) {
  /* "either" fuehrt denselben Betrag zweimal - beide zu addieren waere doppelt
     so teuer wie die Wahrheit. */
  const preis = o.pay === 'either'
    ? `${o.summary.cost[0].toLocaleString('de-DE')} ${o.currencies.join(' oder ')}`
    : o.summary.cost.map((c, i) => `${c.toLocaleString('de-DE')} ${o.currencies[i]}`).join(' + ');
  const stand = o.matched
    ? `${o.summary.goods - o.summary.done}/${o.summary.goods} offen, ${o.summary.openLines} Posten`
    : `${o.summary.goods} Posten, kein Abgleich`;
  console.log(`  ${o.title.padEnd(26)} ${o.vendor.padEnd(18)} ${stand.padEnd(28)} ${o.summary.openLines ? preis : '-'}`);
}

/* Ein Laden, in dem NICHTS fehlt, ist moeglich; einer, in dem bei vorhandenem
   Inventar ueberall alles fehlt, deutet auf eine kaputte Kupplung hin. */
if (inventory) {
  console.log('');
  const alles = offers.every(o => o.summary.openLines === o.goods.reduce((s, g) => s + g.lines.length, 0));
  ok('nicht in jedem Laden fehlt jeder Posten', !alles,
     alles ? 'Verdacht: der Besitzabgleich greift nicht' : '');
}
