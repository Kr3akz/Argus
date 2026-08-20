/**
 * Prueft den EE.log-Beobachter samt Aufloesung und Preis.
 *
 *   node src/cli/log-test.js            spielt die vorhandene EE.log ab
 *   node src/cli/log-test.js --live     wartet auf die naechste Riss-Mission
 *
 * Der Abspielmodus zeigt, ob das Muster auf echten Zeilen greift; der
 * Live-Modus, ob die Meldung im Spielbetrieb rechtzeitig ankommt.
 */
import { LogWatcher, DEFAULT_LOG_PATH } from '../core/logwatch.js';
import { loadCatalog } from '../core/catalog.js';
import { loadMarketItems, findMarketItem, getPrice } from '../core/market.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const live = process.argv.includes('--live');
const file = DEFAULT_LOG_PATH();

if (!existsSync(file)) {
  console.error('Keine EE.log gefunden unter', file);
  process.exit(1);
}

console.log('Log:', file);
console.log('Katalog und Marktliste laden …');
const catalog = await loadCatalog();
const market = await loadMarketItems();
console.log(`  ${catalog.items.length} Items im Katalog, ${market.list.length} am Markt\n`);

/**
 * Log-Pfad -> Anzeige.
 * Das Log schreibt Belohnungen unter /Lotus/StoreItems/..., der Katalog fuehrt
 * dieselbe Sache ohne diesen Abschnitt.
 */
async function describe(uniqueName) {
  if (!uniqueName) return { name: '(kein eigener Fund im Log)', };
  const clean = uniqueName.replace('/StoreItems', '');
  const item = catalog.byUniqueName.get(clean);
  const name = item?.name || clean.split('/').pop();

  const market_ = findMarketItem(market, { uniqueName: clean, name });
  if (!market_) return { name, note: 'nicht am Markt' };

  const price = await getPrice(market_.slug);
  return {
    name,
    ducats: market_.ducats,
    price: price ? `${price.min}p (Median ${price.median})${price.online ? '' : ' [niemand im Spiel]'}` : 'kein Angebot'
  };
}

function show(ev) {
  const stamp = new Date().toLocaleTimeString('de-DE');
  describe(ev.uniqueName).then(d => {
    console.log(`[${stamp}] Relikt-Auswahl offen, ${ev.seconds}s`);
    console.log(`          Dein Fund: ${d.name}`);
    if (d.price)  console.log(`          Platin   : ${d.price}`);
    if (d.ducats) console.log(`          Dukaten  : ${d.ducats}`);
    if (d.note)   console.log(`          Hinweis  : ${d.note}`);
    console.log('');
  });
}

const watcher = new LogWatcher(file);
watcher.on('relic-reward', show);
watcher.on('relic-closed', () => console.log('          Auswahlbildschirm geschlossen\n'));

if (live) {
  await watcher.start();
  console.log('Warte auf die naechste Relikt-Belohnung … (Strg+C beendet)\n');
} else {
  /* Abspielmodus: dieselben Muster, aber gegen die bereits geschriebene Datei.
     Geht ueber handleLine, damit genau der Code laeuft, der auch live greift. */
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let events = 0;
  watcher.on('relic-reward', () => events++);

  for (const line of lines) watcher.handleLine(line);

  console.log(`${lines.length} Zeilen abgespielt, ${events} Relikt-Auswahl(en) erkannt.`);
  if (!events) {
    console.log('Nichts gefunden - in dieser Log-Datei wurde kein Relikt geoeffnet.');
    console.log('Mit --live laufen lassen und eine Riss-Mission spielen.');
  }
  /* Den Preisabfragen Zeit lassen, bevor der Prozess endet. */
  setTimeout(() => process.exit(0), 3000);
}
