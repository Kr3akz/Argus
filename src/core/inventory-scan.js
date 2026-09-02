/**
 * Liest das Inventar aus dem laufenden Spielprozess - ohne einen einzigen
 * Netzwerkaufruf an Digital Extremes.
 *
 * WARUM DIESER WEG:
 *   Der bisherige Abruf lieh sich den Session-nonce aus dem Speicher und rief
 *   damit api.warframe.com/api/inventory.php auf. Genau das ist der Punkt, an
 *   dem Argus die Client-Kommunikation gegenueber DEs eigener API nachahmt -
 *   und der einzige, den DE serverseitig sieht (er hat schon eine IP-Drosselung
 *   ausgeloest). Der Client haelt sein Inventar aber ohnehin im Klartext im
 *   Heap. Von dort gelesen entfaellt der Aufruf, der nonce und die Drosselung.
 *
 * WAS GEMESSEN WURDE (2026-09-02, laufender Client):
 *   Im Heap liegen MEHRERE Ausschnitte desselben Dokuments gleichzeitig. Die
 *   meisten sind an beiden Enden mitten im Token abgeschnitten (100-700 KB,
 *   4 bis 13 der gesuchten Felder). Daneben liegt eine vollstaendige Kopie von
 *   rund 1128 KB mit allen 24 Feldern, ueber fuenf Scanlaeufe hinweg stabil.
 *
 *   ZWEI FALLEN, beide real hineingetappt:
 *     - Die vollstaendige Kopie lag an der HOECHSTEN Adresse. Wer beim ersten
 *       Treffer aufhoert, erwischt systematisch die Reste. Deshalb sammelt
 *       findAllPattern alles ein und die Auswahl faellt hier.
 *     - Ein Scan mit Adressobergrenze schneidet sie weg. Kein Bereichsfilter.
 *
 * ANKER:
 *   '"InfestedFoundry"' mit Anfuehrungszeichen. Rund zehn Treffer im ganzen
 *   Heap - "RawUpgrades" hat Dutzende, "ItemCount" ueber 2500, und die kosten
 *   nur Zeit. Ohne Anfuehrungszeichen traefe man DEs key=value-Konfiguration
 *   (InventoryBins={SuitBin={...}}), die nur Slot-Limits enthaelt.
 *
 * VORAUSSETZUNG:
 *   Ein Zonenwechsel muss stattgefunden haben - Dojo oder Relais und zurueck
 *   aufs Schiff, oder ein frischer Login. Vorher liegt gar kein Inventar im
 *   Heap. Dieselbe Einschraenkung dokumentiert AlecaFrame fuer sich selbst.
 *
 * KEINE ZUGANGSDATEN:
 *   Dieses Modul fasst weder accountId noch nonce an. Es liest ein Dokument,
 *   keine Anmeldedaten. Aus accountid.js kommen nur die Prozesssuche und der
 *   Worker-Start, nichts Vertrauliches.
 */
import { findGameProcessIds, runInWorker } from './accountid.js';

/* Der Anker. Siehe Kopf - Anfuehrungszeichen sind Teil des Musters. */
const ANCHOR = '"InfestedFoundry"';

/* Die Felder, die Argus aus dem Inventar liest. Zugleich der Vollstaendigkeits-
   nachweis: eine Scheibe mit allen 24 ist das ganze Dokument. Quelle ist die
   Feldliste aus inventory-items.js und den Verbrauchern drumherum. */
export const REQUIRED_FIELDS = [
  'Suits', 'LongGuns', 'Pistols', 'Melee', 'Sentinels', 'SentinelWeapons',
  'SpaceSuits', 'SpaceGuns', 'SpecialItems', 'MechSuits', 'Hoverboards',
  'OperatorAmps', 'Recipes', 'MiscItems', 'RawUpgrades', 'Upgrades',
  'PendingRecipes', 'RegularCredits', 'PremiumCredits', 'FusionPoints',
  'QuestKeys', 'InfestedFoundry', 'Boosters', 'PlayerLevel'
];

/* Haeppchengroesse beim Abschreiten des Textlaufs. KLEIN, und zwar mit Grund:
   ragt ein Lesefenster ueber das Ende der gemappten Region hinaus, kopiert
   Windows gar nichts statt teilweise. Mit 64 KB kostet das den ganzen Rest des
   Laufs - gemessen als Scheiben, die faelschlich 0 Byte lang schienen. Mit
   4 KB kostet eine nicht gemappte Seite nur diese Seite. */
const CHUNK = 4096;

/* Obergrenze je Richtung. Das Dokument misst rund 1 MB; 32 MB sind reichlich
   Luft und verhindern zugleich, dass ein Fehlgriff den Speicher flutet. */
const MAX_SPAN = 32 * 1024 * 1024;

/* Ein Byte gehoert zum Text, wenn es kein Steuerzeichen ist. Bytes >= 128
   zaehlen ausdruecklich dazu: Umlaute in Clan-, Riven- und Spielernamen sind
   Inhalt. Wer nur 32..126 zulaesst, misst bis zum ersten Sonderzeichen. */
const isText = b => b >= 32 || b === 9 || b === 10 || b === 13;

function fail(code, message, extra) {
  return { ok: false, code, message, ...extra };
}

/**
 * Liest den zusammenhaengenden Textlauf um eine Adresse herum.
 *
 * Laeuft ueber Regionsgrenzen hinweg - die Grenzen sind eine Eigenheit der
 * Speicherverwaltung, keine Grenze des Dokuments. Der Lauf endet am ersten
 * Steuerzeichen oder am ersten nicht lesbaren Haeppchen.
 */
function readSpan(procmem, handle, address) {
  const after = [];
  let forward = 0;
  for (let at = address; forward < MAX_SPAN; ) {
    const buf = procmem.readAt(handle, at, CHUNK);
    if (!buf) break;
    let cut = -1;
    for (let i = 0; i < buf.length; i++) {
      if (!isText(buf[i])) { cut = i; break; }
    }
    if (cut >= 0) { after.push(buf.subarray(0, cut)); forward += cut; break; }
    after.push(buf);
    forward += buf.length;
    at += BigInt(buf.length);
    if (buf.length < CHUNK) break;
  }

  const before = [];
  let backward = 0;
  for (let at = address; backward < MAX_SPAN; ) {
    const start = at - BigInt(CHUNK);
    if (start < 0n) break;
    const buf = procmem.readAt(handle, start, CHUNK);
    if (!buf) break;
    let cut = -1;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (!isText(buf[i])) { cut = i; break; }
    }
    if (cut >= 0) {
      const tail = buf.subarray(cut + 1);
      before.unshift(tail);
      backward += tail.length;
      break;
    }
    before.unshift(buf);
    backward += buf.length;
    at = start;
    if (buf.length < CHUNK) break;
  }

  return {
    text: Buffer.concat([...before, ...after]).toString('latin1'),
    start: address - BigInt(backward),
    backward,
    forward
  };
}

/**
 * Ein Durchgang durch den Text: auf welcher Klammertiefe stehen die gesuchten
 * Felder, und wo liegen dort die Kommas?
 *
 * WARUM DIE TIEFE GEMESSEN UND NICHT ANGENOMMEN WIRD:
 *   Ist der Anfang abgeschnitten, fehlen die oeffnenden Klammern und der
 *   Zaehler startet mitten im Dokument - die oberste Ebene liegt dann bei einer
 *   negativen Tiefe, deren Wert vom Schnittpunkt abhaengt. Statt zu raten,
 *   messen wir, auf welcher Tiefe die bekannten Feldnamen stehen; die haeufigste
 *   ist die oberste Ebene.
 *
 * Zeichenketten werden uebersprungen, sonst zaehlt eine Klammer in einem
 * Item-Pfad mit.
 */
function analyseDepth(text, fields) {
  /* Erst die Fundstellen der Feldnamen sammeln, damit der Durchgang nur
     nachschlagen muss statt 24 Vergleiche je Zeichen anzustellen. */
  const marks = new Map();
  for (const field of fields) {
    const needle = `"${field}":`;
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
      marks.set(i, field);
    }
  }

  const depthCount = new Map();     // Tiefe -> wie viele Feldnamen dort stehen
  const commas = new Map();         // Tiefe -> { first, last }
  let depth = 0, inStr = false, esc = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (esc) { esc = false; continue; }
    if (c === '\\') { if (inStr) esc = true; continue; }

    if (c === '"') {
      /* Der Feldname beginnt AM Anfuehrungszeichen - die Tiefe hier ist die,
         auf der das Feld steht. */
      if (!inStr && marks.has(i)) {
        depthCount.set(depth, (depthCount.get(depth) || 0) + 1);
      }
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;

    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ',') {
      const seen = commas.get(depth);
      if (seen) seen.last = i;
      else commas.set(depth, { first: i, last: i });
    }
  }

  let topDepth = null, best = 0;
  for (const [d, n] of depthCount) {
    if (n > best) { best = n; topDepth = d; }
  }
  return { topDepth, fieldsAtTop: best, commas };
}

/**
 * Macht aus dem Textlauf ein parsbares Objekt.
 *
 * Der Normalfall ist ein an beiden Enden angeschnittenes Dokument. Repariert
 * wird, indem vom ersten bis zum letzten Komma der obersten Ebene geschnitten
 * und in Klammern gefasst wird: dazwischen stehen ausschliesslich vollstaendige
 * Felder. Verloren geht hoechstens das angeschnittene erste und letzte - und ob
 * darunter ein gebrauchtes war, sagt die Vollstaendigkeitspruefung danach.
 */
function parseSpan(text, fields) {
  if (text.startsWith('{')) {
    try {
      return { data: JSON.parse(text), repaired: false, note: 'complete' };
    } catch {
      /* Vorne heil, hinten abgeschnitten - unten weiterreparieren. */
    }
  }

  const { topDepth, fieldsAtTop, commas } = analyseDepth(text, fields);
  if (topDepth === null) {
    return { data: null, repaired: false, note: 'no field found in span' };
  }
  const bounds = commas.get(topDepth);
  if (!bounds || bounds.first >= bounds.last) {
    return { data: null, repaired: false, note: `no usable commas at depth ${topDepth}` };
  }

  const candidate = '{' + text.slice(bounds.first + 1, bounds.last) + '}';
  try {
    return {
      data: JSON.parse(candidate),
      repaired: true,
      note: `repaired at depth ${topDepth} (${fieldsAtTop} fields), `
          + `dropped ${bounds.first + 1} bytes head, ${text.length - bounds.last} bytes tail`
    };
  } catch (e) {
    return { data: null, repaired: true, note: 'repair did not parse: ' + e.message };
  }
}

/** Wie viele der gesuchten Felder stehen als Schluessel im Text? */
function countFields(text, fields) {
  const found = [];
  for (const field of fields) {
    if (text.includes(`"${field}":`)) found.push(field);
  }
  return found;
}

/**
 * Wie scanInventory(), aber in einem Worker-Thread.
 *
 * Der Scan laeuft rund zehn Sekunden am Stueck und wuerde das Fenster genauso
 * lange einfrieren. Aus dem Hauptprozess IMMER diesen Weg nehmen.
 */
export function scanInventoryInWorker({ maxSeconds = 180, timeoutMs = 240000 } = {}) {
  return runInWorker({ job: 'inventory', options: { maxSeconds } }, timeoutMs);
}

/**
 * Sucht das Inventar im laufenden Spiel und liefert es geparst.
 *
 * BLOCKIERT mehrere Sekunden - aus dem Hauptprozess ueber
 * scanInventoryInWorker() aufrufen, nicht direkt.
 */
export async function scanInventory({ maxSeconds = 120, keepText = false } = {}) {
  const procmem = await import('./procmem.js').catch(() => null);
  if (!procmem) return fail('koffi_missing', 'The memory module could not be loaded.');
  if (!procmem.isSupported()) {
    return fail('unsupported', 'Reading the inventory needs Windows (64 bit).');
  }

  const pids = await findGameProcessIds();
  if (!pids.length) {
    return fail('no_process', 'Warframe is not running. Start the game and log in.');
  }

  const started = Date.now();
  let lastError = null;

  for (const pid of pids) {
    let handle = null;
    try {
      handle = procmem.openProcess(pid);

      /* Jede Fundstelle wird SOFORT ausgemessen und bewertet, nicht erst nach
         dem Scan. Zusammen mit descending bricht der Durchgang ab, sobald eine
         Scheibe alle Felder traegt - der Rest des Heaps wird gar nicht mehr
         gelesen. Ohne das kostet ein Lauf rund eine halbe Minute, und er laeuft
         bei jeder Rueckkehr aufs Schiff an.

         Groesse allein taugt uebrigens nicht als Mass: eine lange Scheibe kann
         mitten im Dokument liegen und die Haelfte der Felder verfehlen. */
      const candidates = [];
      let complete = null;

      const scan = procmem.findAllPattern(handle, ANCHOR, {
        limit: 64, maxSeconds, descending: true,
        onHit: address => {
          const span = readSpan(procmem, handle, address);
          if (!span.text.length) return false;
          const fields = countFields(span.text, REQUIRED_FIELDS);
          const candidate = {
            address, fields,
            bytes: span.text.length,
            backward: span.backward,
            forward: span.forward,
            text: span.text
          };
          candidates.push(candidate);
          if (fields.length === REQUIRED_FIELDS.length) {
            complete = candidate;
            return true;                   // gefunden - Suche beenden
          }
          return false;
        }
      });

      if (!scan.addresses.length) {
        lastError = fail('not_found',
          'No inventory found in memory. Travel to a relay or your dojo and back to your ship, then try again.',
          { stats: { regions: scan.regions, megabytes: Math.round(scan.bytes / 1048576),
                     seconds: Number(scan.seconds.toFixed(1)) } });
        continue;
      }
      if (!candidates.length) {
        lastError = fail('not_found', 'Anchor found, but no readable span around it.');
        continue;
      }

      candidates.sort((a, b) =>
        b.fields.length - a.fields.length || b.bytes - a.bytes);
      const best = complete || candidates[0];

      const parsed = parseSpan(best.text, REQUIRED_FIELDS);
      const stats = {
        candidates: candidates.map(c => ({
          address: '0x' + c.address.toString(16).toUpperCase(),
          kilobytes: Math.round(c.bytes / 1024),
          fields: c.fields.length
        })),
        chosen: {
          address: '0x' + best.address.toString(16).toUpperCase(),
          kilobytes: Math.round(best.bytes / 1024),
          backward: best.backward,
          forward: best.forward,
          startsWithBrace: best.text.startsWith('{')
        },
        fieldsInSpan: best.fields.length,
        repaired: parsed.repaired,
        note: parsed.note,
        stoppedEarly: Boolean(scan.stopped),
        regions: scan.regions,
        megabytes: Math.round(scan.bytes / 1048576),
        seconds: Number(((Date.now() - started) / 1000).toFixed(1))
      };

      if (!parsed.data) {
        lastError = fail('unparsable', 'The inventory span could not be parsed.',
                         { stats, text: keepText ? best.text : undefined });
        continue;
      }

      /* Vollstaendigkeit gegen die geparsten Schluessel pruefen, nicht gegen den
         Rohtext: ein Feldname kann im Text stehen und beim Reparieren trotzdem
         weggefallen sein. Ein halbes Inventar ist schlechter als keins - der
         Aufrufer soll dann den Zwischenspeicher behalten. */
      const missing = REQUIRED_FIELDS.filter(f => !(f in parsed.data));
      stats.missing = missing;

      if (missing.length) {
        lastError = fail('incomplete',
          `Inventory is missing ${missing.length} field(s): ${missing.join(', ')}`,
          { stats, inventory: parsed.data });
        continue;
      }

      return { ok: true, inventory: parsed.data, stats, text: keepText ? best.text : undefined };
    } catch (e) {
      lastError = fail(e.code || 'scan_failed', e.message, { detail: e.detail });
    } finally {
      if (handle) procmem.closeHandle(handle);
    }
  }

  return lastError || fail('not_found', 'No inventory found in memory.');
}
