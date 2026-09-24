#!/usr/bin/env node
/**
 * Prueft, wie aus einer Angebotsliste ein Preis wird (summarise in market.js).
 *
 * WARUM DAS EINEN EIGENEN DURCHLAUF BRAUCHT:
 *   Der Abruf holt die fuenf billigsten Angebote. Bei einem eingefuehrten Teil
 *   liegen die dicht beieinander und das billigste IST der Kurs. Bei einem
 *   frischen Teil sind fuenf Angebote alles, was es gibt - und ein einziges
 *   verrutschtes darunter bestimmt dann allein das Ergebnis.
 *
 *   Nachgemessen am 24.09., einen Tag nach dem Erscheinen: Corufell Prime
 *   Receiver stand bei rund 45 Platin und wurde mit 5 angezeigt.
 *
 *   Die Gegenregel darf aber nicht zu scharf sein, sonst verschwindet jedes
 *   echte Schnaeppchen. Genau diese Grenze wird hier abgesteckt.
 *
 *   node src/cli/preis-test.js
 */
import { summariseForTest as summarise } from '../core/market.js';

console.log('=== Vom Angebot zum Preis ===\n');

let fehler = 0;
const pruefe = (was, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'}  ${was}${!ok && hinweis ? ' - ' + hinweis : ''}`);
  if (!ok) fehler++;
};

/** Angebote von Verkaeufern im Spiel. */
const ingame = (...platin) =>
  ({ sell: platin.map(p => ({ type: 'sell', platinum: p, user: { status: 'ingame' } })) });

console.log('1. Der gemessene Fall: Corufell Prime Receiver');
/* Fuenf Angebote, eines davon offensichtlich daneben. */
const c = summarise(ingame(5, 45, 50, 52, 55));
pruefe('Preis ist nicht der Ausreisser', c.min !== 5, `min=${c.min}`);
pruefe('Preis ist das billigste ernst gemeinte (45)', c.min === 45, `min=${c.min}`);
pruefe('Median unveraendert bei 50', c.median === 50, `median=${c.median}`);
pruefe('der Ausreisser ist vermerkt', c.verworfen === 1 && c.tiefstes === 5,
       JSON.stringify(c));

console.log('\n2. Ein eingefuehrtes Teil bleibt unangetastet');
/* Nikana Prime Blueprint, nachgemessen: min 7, median 8. */
const n = summarise(ingame(7, 8, 8, 9, 10));
pruefe('billigstes Angebot gilt weiterhin', n.min === 7, `min=${n.min}`);
pruefe('nichts verworfen', n.verworfen === undefined, JSON.stringify(n));

console.log('\n3. Ein echtes Schnaeppchen ueberlebt');
/* 35 % unter dem Median - guenstig, aber kein Unsinn. */
const s = summarise(ingame(32, 48, 50, 51, 53));
pruefe('32 bei Median 50 bleibt stehen', s.min === 32, `min=${s.min}`);

console.log('\n4. Billige Teile bleiben in Ruhe');
/* Aus dem echten Zwischenspeicher. Das Verhaeltnis allein wuerde hier
   zuschlagen, obwohl zwei Platin Unterschied niemanden interessieren. */
const q = summarise(ingame(1, 3, 3, 4, 5));
pruefe('Quassus Prime Blueprint: 1 bei Median 3 bleibt', q.min === 1,
       `min=${q.min}, verworfen=${q.verworfen}`);

const h = summarise(ingame(4, 9, 10, 11, 12));
pruefe('Hikou Prime Pouch: 4 bei Median 10 bleibt', h.min === 4,
       `min=${h.min}, verworfen=${h.verworfen}`);

const a = summarise(ingame(2, 7, 8, 9, 10));
pruefe('Ayatan Amber Star: 2 bei Median 8 bleibt', a.min === 2,
       `min=${a.min}, verworfen=${a.verworfen}`);

console.log('\n5. Teure Teile werden geschuetzt');
/* Hier tut derselbe Fehler weh - 30 Platin Unterschied bei einem Mod. */
const mod = summarise(ingame(25, 52, 55, 58, 60));
pruefe('25 bei Median 55 faellt weg', mod.min === 52, `min=${mod.min}`);

console.log('\n6. Grenzfaelle');
const eins = summarise(ingame(42));
pruefe('ein einziges Angebot ueberlebt sich selbst', eins.min === 42, JSON.stringify(eins));

const zwei = summarise(ingame(5, 50));
pruefe('bei zwei Angeboten faellt der Ausreisser', zwei.min === 50, JSON.stringify(zwei));

const gleich = summarise(ingame(20, 20, 20));
pruefe('lauter gleiche Angebote', gleich.min === 20 && gleich.verworfen === undefined,
       JSON.stringify(gleich));

pruefe('keine Angebote ergeben keinen Preis', summarise({ sell: [] }) === null);

console.log('\n7. Verkaeufer im Spiel haben Vorrang');
const gemischt = {
  sell: [
    { type: 'sell', platinum: 3, user: { status: 'offline' } },
    { type: 'sell', platinum: 44, user: { status: 'ingame' } },
    { type: 'sell', platinum: 46, user: { status: 'ingame' } }
  ]
};
const g = summarise(gemischt);
pruefe('das Angebot eines Offline-Verkaeufers zaehlt nicht', g.min === 44, `min=${g.min}`);
pruefe('online ist gesetzt', g.online === true);

const nurOffline = summarise({
  sell: [{ type: 'sell', platinum: 44, user: { status: 'offline' } }]
});
pruefe('ohne jemanden im Spiel wird trotzdem ein Preis genannt', nurOffline.min === 44);
pruefe('und als offline gekennzeichnet', nurOffline.online === false);

console.log(`\n=== ${fehler ? fehler + ' Fehler' : 'alles in Ordnung'} ===`);
process.exit(fehler ? 1 : 0);
