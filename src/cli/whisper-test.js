#!/usr/bin/env node
/**
 * Prueft die Fluester-Meldung: Logzeile, Speicherzeile, warframe.market-Filter.
 *
 *   node src/cli/whisper-test.js               feste Faelle
 *   node src/cli/whisper-test.js --live Name   zusaetzlich im laufenden Spiel
 *                                              nach Nachrichten von Name suchen
 *
 * Der Live-Lauf geht ueber den Worker, genau wie die App. Unter Electron:
 *   npx electron src/cli/app-test.cjs whisper-test --live Name
 */
import { LogWatcher } from '../core/logwatch.js';
import { parseWhisperAt, isMarketWhisper, chatTime,
         readWhisperInWorker } from '../core/whispers.js';

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`  ${ok ? 'ok  ' : 'FEHL'}  ${name}${ok ? '' : `\n        ist  ${JSON.stringify(ist)}\n        soll ${JSON.stringify(soll)}`}`);
};

/* ----- Logzeilen ----- */
console.log('Logzeilen');
const w = new LogWatcher('nicht-vorhanden.log');
const gemeldet = [];
w.on('whisper', ev => gemeldet.push(ev.from));
const zeilen = [
  /* Echt, vom 26.09.2026. Die Kanal-Reiter beim Login sind keine Fluestern. */
  '22.238 Net [Info]: IRC connected: TLSv1.3 TLS_AES_128_GCM_SHA256',
  '22.947 Script [Info]: ChatRedux.lua: ChatRedux::AddTab: Adding tab with channel name: C55a2f49708c56f5b9418b76e to index 1',
  '22.949 Script [Info]: ChatRedux.lua: ChatRedux::AddTab: Adding tab with channel name: Q_EN_EU to index 3',
  /* Ausgedacht: ein Fluesterreiter, der beim Login wiederkommt. */
  '23.100 Script [Info]: ChatRedux.lua: ChatRedux::AddTab: Adding tab with channel name: FAlterFreund to index 6',
  /* Echt. */
  '814.893 Script [Info]: ChatRedux.lua: ChatRedux::AddTab: Adding tab with channel name: FiFlynn to index 7',
  '831.957 Script [Info]: ChatRedux.lua: Chat: Filters for FiFlynn:',
  /* Echt, mit Plattform-Symbol hinter dem Namen - daran ist der erste
     Versuch gescheitert. */
  '3831.600 Script [Info]: ChatRedux.lua: ChatRedux::AddTab: Adding tab with channel name: FTharun.tco\u{E000} to index 7',
  '3835.242 Script [Info]: ChatRedux.lua: Chat: Filters for FTharun.tco\u{E000}:'
];
for (const z of zeilen) w.handleLine(z);
pruefe('neue Unterhaltungen, nicht der Login-Reiter', gemeldet, ['iFlynn', 'Tharun.tco']);

/* Der Debugkanal liefert dieselbe Zeile - falls er sie als latin1 dekodiert,
   wird aus dem Symbol "\xEE\x80\x80". Auch das darf den Namen nicht aendern. */
gemeldet.length = 0;
w.handleLine('3900.000 Script [Info]: ChatRedux.lua: ChatRedux::AddTab: Adding tab with channel name: FTharun.tco\xEE\x80\x80 to index 8');
pruefe('Symbol als latin1', gemeldet, ['Tharun.tco']);

/* ----- Speicherzeile ----- */
console.log('\nSpeicherzeile');
const SYMBOL = '\u{E000}';
const roh = s => Buffer.from(s, 'utf8');
/* Die Ausschnitte beginnen wie im Scan EIN Byte vor dem Namen. */
pruefe('IRC mit Plattform-Symbol (so gemessen)',
  parseWhisperAt(roh(`:iFlynn${SYMBOL}!55c24db338463299409d2cfd_0@net.x.ip PRIVMSG Kr3aKz${SYMBOL} :yo\r\n\0\0`), 'iFlynn'),
  { from: 'iFlynn', text: 'yo' });
pruefe('IRC ohne Symbol',
  parseWhisperAt(roh(':iFlynn!x@y PRIVMSG Kr3aKz :hallo du\0'), 'iFlynn'),
  { from: 'iFlynn', text: 'hallo du' });
pruefe('IRC: Kanalnachricht zaehlt nicht',
  parseWhisperAt(roh(':iFlynn!x@y PRIVMSG #clan :nein\0'), 'iFlynn'), null);
pruefe('Klartext-Verlauf (so gemessen)',
  parseWhisperAt(roh(` Tharun.tco${SYMBOL}: askim baby girl\0\0\0`), 'Tharun.tco'),
  { from: 'Tharun.tco', text: 'askim baby girl' });
pruefe('HTML-Verlauf (so gemessen)',
  parseWhisperAt(roh(` Tharun.tco${SYMBOL}</a><font color="#EFEFEF">: test<br><a color="#F585BC" href="#x">[21:00] Tharun.tco${SYMBOL}</a>\0`), 'Tharun.tco'),
  { from: 'Tharun.tco', text: 'test' });
pruefe('HTML: Entitaeten und Schluss-Tags',
  parseWhisperAt(roh(` Kaeufer${SYMBOL}</a><font color="#EFEFEF">: Hi! I want to buy: &quot;Serration&quot; for 12 platinum. (warframe.market)</font></font></p>\0`), 'Kaeufer'),
  { from: 'Kaeufer', text: 'Hi! I want to buy: "Serration" for 12 platinum. (warframe.market)' });
pruefe('Link-Ziel zaehlt nicht',
  parseWhisperAt(roh(` Tharun.tco${SYMBOL}|1">[21:00]`), 'Tharun.tco'), null);
pruefe('laengerer Name mit demselben Anfang zaehlt nicht',
  parseWhisperAt(roh(`:iFlynnX!x@y PRIVMSG Kr3aKz :nein\0`), 'iFlynn'), null);
pruefe('Name als Ende eines laengeren zaehlt nicht',
  parseWhisperAt(roh(`xiFlynn${SYMBOL}: nein\0`), 'iFlynn'), null);
pruefe('"Name: " ohne Symbol ist keine Chatzeile',
  parseWhisperAt(roh(` iFlynn: irgendwas\0`), 'iFlynn'), null);
pruefe('Kopie ohne Abschluss zaehlt nicht (so gemessen)',
  parseWhisperAt(Buffer.concat([roh(` Tharun.tco${SYMBOL}: testP`), Buffer.from([0xa0, 0x79, 0xc3, 0x00])]), 'Tharun.tco'), null);
pruefe('HTML ohne Schluss-Tag zaehlt nicht',
  parseWhisperAt(roh(` Tharun.tco${SYMBOL}</a><font color="#EFEFEF">: tes\0`), 'Tharun.tco'), null);
pruefe('Umlaute bleiben heil',
  parseWhisperAt(roh(` Tharun.tco${SYMBOL}: später valo?\0`), 'Tharun.tco'),
  { from: 'Tharun.tco', text: 'später valo?' });

/* ----- warframe.market ----- */
console.log('\nwarframe.market');
const kauf = 'Hi! I want to buy: "Nidus Prime Blueprint" for 50 platinum. (warframe.market)';
pruefe('Kaufnachricht erkannt', isMarketWhisper(kauf), true);
pruefe('gewoehnliche Nachricht nicht', isMarketWhisper('yo, got a sec?'), false);

/* ----- Uhrzeit ----- */
console.log('\nUhrzeit');
pruefe('"[21:00] " vor dem Namen', chatTime(Buffer.from('[21:00] ')), '21:00');
pruefe('Link-Rest davor ist keine Uhrzeit', chatTime(Buffer.from('ssed:@[2')), null);

/* ----- Live ----- */
const i = process.argv.indexOf('--live');
if (i > 0) {
  const name = process.argv[i + 1];
  console.log(`\nLive: Nachrichten von ${name}`);
  const t = Date.now();
  const res = await readWhisperInWorker(name);
  console.log(`  ${Date.now() - t} ms`, res.ok ? `${res.texts.length} Text(e)` : `Fehler ${res.code}`);
  for (const { text, time } of res.messages || []) {
    console.log(`    [${time ?? '--:--'}] ${isMarketWhisper(text) ? '[Markt] ' : ''}${text}`);
  }
}

console.log(fehler ? `\n${fehler} Fehler` : '\nalles gruen');
process.exit(fehler ? 1 : 0);
