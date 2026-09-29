/**
 * Fluesternachrichten im Spiel: wer schreibt, und was.
 *
 * WAS DAS LOG HERGIBT (nachgemessen am 26.09.2026, eine echte Nachricht):
 *   Script [Info]: ChatRedux.lua: ChatRedux::AddTab: Adding tab with
 *                  channel name: FiFlynn to index 7
 * Ein neuer Chat-Reiter, "F" + Name des Absenders. Den TEXT schreibt das Log
 * nicht mit, und auch keine zweite Nachricht im schon offenen Reiter - eine
 * Zeile gibt es nur, wenn eine Unterhaltung neu aufgeht. Das Erkennen liegt
 * deshalb in logwatch.js, hier steht nur das Lesen.
 *
 * WO DER TEXT STEHT: im Speicher des Spiels, in drei Formen. Hinter dem Namen
 * haengt jedes Mal das Plattform-Symbol, drei Bytes UTF-8 (U+E000 und
 * folgende) - wer nach "Name!" oder "Name:" sucht, findet deshalb nichts.
 *
 *   1. Die rohe IRC-Zeile, wie sie vom Chatserver kam:
 *        :iFlynn<Symbol>!<kennung>@<host> PRIVMSG Kr3aKz<Symbol> :yo
 *      NUR EIN NETZWERKPUFFER. Bei iFlynn lag sie Minuten spaeter noch da,
 *      bei Tharun.tco eine Viertelstunde spaeter nicht mehr - an ihrer Stelle
 *      standen Zeilen aus dem Handelschat. Wer sich allein auf sie verlaesst,
 *      liest bei jeder belebten Region ins Leere; genau daran ist der zweite
 *      Test gescheitert.
 *   2. Der Verlauf als Klartext, dauerhaft, mehrfach:
 *        [21:00] Tharun.tco<Symbol>: askim baby girl
 *   3. Der Verlauf als HTML fuer das Chatfenster, ebenso dauerhaft:
 *        [21:00] Tharun.tco<Symbol></a><font color="#EFEFEF">: test<br>...
 *
 * 2 und 3 enthalten auch, was der Absender in Handels- oder Regionschat
 * schreibt - fuer die Frage "kam eine Nachricht von warframe.market?" ist das
 * ein vertretbarer Fehler, denn wer die Vorlage in den Handelschat kopiert,
 * ist ohnehin am Handeln.
 *
 * WAS ES KOSTET: alle drei Formen lagen in Regionen unter 1 MB. Nur diese zu
 * lesen waren 1,3-1,5 GB in 1,2-1,4 s; der ganze Heap waren 4,5 GB in 22 s.
 * Gelesen wird einmal je NEUER Unterhaltung, nicht laufend.
 *
 * WAS NICHT HINAUSGEHT: der Host-Teil der IRC-Zeile (Kennung, Adresse) wird
 * hier verworfen. Nach aussen gehen nur Absender und Text.
 */

/* Nur kleine Regionen - siehe Kopfkommentar. Die grossen sind Assets, meist
   ausgelagert, und sie zu lesen druecke dem laufenden Spiel Speicher rein. */
const MAX_REGION = 1n << 20n;

/* Der Verlauf steht vielfach im Heap (gemessen: 30 Fundstellen fuer fuenf
   Nachrichten). Die Grenze ist grosszuegig, weil jede Fundstelle nur 1 KB
   Lesen kostet. */
const MAX_HITS = 400;

/* So schreibt warframe.market die Nachricht, die es in die Zwischenablage
   legt (siehe renderer/whisper.js, dieselbe Vorlage):
     Hi! I want to buy: "Nidus Prime Blueprint" for 50 platinum. (warframe.market)
   Der Hinweis in Klammern ist das Merkmal - der Rest wird beim Einfuegen gern
   umformuliert, die Klammer bleibt fast immer stehen. */
const MARKET_KEYWORD = /warframe\.market/i;

/** Stammt die Nachricht von warframe.market? */
export function isMarketWhisper(text) {
  return MARKET_KEYWORD.test(text || '');
}

/* Was zu einem Spielernamen gehoert. Steht davor eines dieser Zeichen, ist der
   Treffer nur das Ende eines laengeren Namens ("xiFlynn"). */
const isNameByte = b => (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) ||
  (b >= 0x61 && b <= 0x7a) || b === 0x5f || b === 0x2e || b === 0x2d;

const HTML_TAIL = Buffer.from('</a><font color="#EFEFEF">: ');

const decodeHtml = s => s
  .replace(/<br\s*\/?>[\s\S]*$/i, '')
  .replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Text bis zum ersten Steuerzeichen - aber nur, wenn es ein ECHTER Abschluss
 * ist (Null oder Zeilenende). Gemessen lag neben den sauberen Kopien eine
 * ohne Abschluss, deren Text nahtlos in Binaerdaten ueberging: "testP�y".
 * Solche Kopien zaehlen nicht; es gibt genug saubere daneben.
 */
function untilControl(buf) {
  const end = buf.findIndex(b => b < 0x20 && b !== 0x09);
  if (end < 0 || (buf[end] !== 0 && buf[end] !== 10 && buf[end] !== 13)) return null;
  const text = buf.subarray(0, end).toString('utf8');
  return text.includes('�') ? null : text;
}

/**
 * Zieht aus einem Speicherausschnitt die Nachricht von `sender`, oder null.
 *
 * `buf` beginnt EIN Byte vor dem Namen - an diesem Byte haengt, ob der Name
 * vollstaendig ist und ob es die IRC-Zeile ist (":"). Geprueft wird streng,
 * weil der Ausschnitt aus einem fremden Heap kommt und dort Reste aller Art
 * liegen. Was nicht zu einer der drei Formen im Kopfkommentar passt, zaehlt
 * nicht - etwa "@[21:00] Tharun.tco<Symbol>|1" aus einem Link.
 */
export function parseWhisperAt(buf, sender) {
  const name = Buffer.from(sender, 'utf8');
  if (!buf || buf.length <= name.length + 1) return null;
  if (!buf.subarray(1, 1 + name.length).equals(name)) return null;
  if (isNameByte(buf[0])) return null;

  let i = 1 + name.length;
  if (i < buf.length && isNameByte(buf[i])) return null;
  /* Das Plattform-Symbol: bis zu vier Bytes ueber 0x7F. */
  let symbol = 0;
  while (i < buf.length && buf[i] >= 0x80 && symbol < 4) { i++; symbol++; }
  const rest = buf.subarray(i);

  let text = null;
  if (buf[0] === 0x3a /* : */ && rest[0] === 0x21 /* ! */) {
    /* 1. IRC. Ein Ziel mit "#" ist ein Kanal, kein Fluestern. */
    const m = /^!\S* PRIVMSG ([^\s#]\S*) :(.+)$/.exec(untilControl(rest) ?? '');
    text = m ? m[2] : null;
  } else if (rest.subarray(0, HTML_TAIL.length).equals(HTML_TAIL)) {
    /* 3. HTML. Der Text endet an der naechsten Zeile oder am Schluss-Tag -
       einer von beiden muss dastehen, sonst ist der Ausschnitt abgeschnitten. */
    const html = untilControl(rest.subarray(HTML_TAIL.length));
    text = html && /<br|<\/font>/i.test(html) ? decodeHtml(html) : null;
  } else if (rest[0] === 0x3a && rest[1] === 0x20 && symbol > 0) {
    /* 2. Klartext. NUR MIT SYMBOL: ohne es waere "Name: " jede beliebige
       Aufzaehlung, mit ihm ist es die Chatzeile. */
    text = untilControl(rest.subarray(2));
  }

  text = text?.trim();
  return text ? { from: sender, text } : null;
}

/**
 * Sucht die Nachrichten von `sender` im laufenden Spiel.
 *
 * BLOCKIERT ueber eine Sekunde - aus dem Hauptprozess ueber
 * readWhisperInWorker() aufrufen, nicht direkt.
 *
 * Liefert ALLE gefundenen Texte, entdoppelt, die neueste zuerst.
 *
 * WELCHE DIE NEUESTE IST, sagt die Adresse nicht. Der Verlauf sagt es: vor
 * jedem Namen steht die Uhrzeit, in beiden Formen, "[21:00] Tharun.tco...".
 * Ein Text bekommt die spaeteste Uhrzeit aller seiner Kopien. Ohne Uhrzeit
 * (nur als IRC-Zeile gesehen) rutscht er ans Ende - der Verlauf ist die
 * verlaessliche Quelle, der Netzpuffer kann von vor Stunden sein.
 */
export async function readWhisper(sender, { maxSeconds = 10 } = {}) {
  if (!sender || !/^[\w.\-]+$/.test(sender)) return { ok: false, code: 'bad_sender' };

  const procmem = await import('./procmem.js').catch(() => null);
  if (!procmem) return { ok: false, code: 'koffi_missing' };
  if (!procmem.isSupported()) return { ok: false, code: 'unsupported' };

  const { findGameProcessIds } = await import('./accountid.js');
  const pids = await findGameProcessIds();
  if (!pids.length) return { ok: false, code: 'no_process' };

  const times = new Map();   // Text -> spaeteste Uhrzeit "HH:MM" oder ''
  for (const pid of pids) {
    let handle = null;
    try {
      handle = procmem.openProcess(pid);
      const res = procmem.findAllPattern(handle, sender,
        { limit: MAX_HITS, maxSeconds, maxRegion: MAX_REGION });
      for (const address of res.addresses) {
        /* Liegt der Treffer so nah am Anfang einer Region, dass die acht Bytes
           davor nicht lesbar sind, dann eben ohne Uhrzeit. Ein Leerzeichen
           davor gedacht - die IRC-Form braucht ihren ":" und faellt dann weg. */
        const buf = procmem.readAt(handle, BigInt(address) - BigInt(TIME_PREFIX), 1024) ??
          Buffer.concat([Buffer.from(' '.repeat(TIME_PREFIX)),
                         procmem.readAt(handle, address, 1024) ?? Buffer.alloc(0)]);
        if (buf.length <= TIME_PREFIX) continue;
        const hit = parseWhisperAt(buf.subarray(TIME_PREFIX - 1), sender);
        if (!hit) continue;
        const time = chatTime(buf.subarray(0, TIME_PREFIX)) ?? '';
        if (!times.has(hit.text) || time > times.get(hit.text)) times.set(hit.text, time);
      }
    } catch {
      /* Prozess weg oder Zugriff verweigert - der naechste versucht es. */
    } finally {
      if (handle) procmem.closeHandle(handle);
    }
  }

  const messages = [...times]
    .map(([text, time]) => ({ text, time: time || null }))
    .sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
  return { ok: true, from: sender, messages, texts: messages.map(m => m.text) };
}

/* "[21:00] " - acht Bytes, das Leerzeichen am Ende ist das Byte, das
   parseWhisperAt vor dem Namen erwartet. */
const TIME_PREFIX = 8;

/** Die Uhrzeit aus "[HH:MM] ", oder null. */
export function chatTime(buf) {
  const m = /^\[(\d\d:\d\d)\] $/.exec(buf?.toString('latin1') ?? '');
  return m ? m[1] : null;
}

/** Wie readWhisper(), aber in einem Worker-Thread. */
export async function readWhisperInWorker(sender, { timeoutMs = 20000 } = {}) {
  const { runInWorker } = await import('./accountid.js');
  return runInWorker({ job: 'whisper', options: { sender } }, timeoutMs);
}
