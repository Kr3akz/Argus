/**
 * Riven-Fingerprints zu EINER Waffe aus dem Speicher des laufenden Spiels.
 *
 * WOZU:
 *   Fuer das Overlay auf dem Umwandeln-Bildschirm. Der neue Wurf kommt vom
 *   Server und steht in keinem Inventar, das Argus schon hat - aber das Spiel
 *   haelt ihn im Speicher, im selben Format wie jeden anderen Riven. Von dort
 *   gelesen sind die Werte exakt, egal in welcher Sprache, Aufloesung oder
 *   UI-Groesse das Spiel laeuft.
 *
 * GEMESSEN am 2026-09-29 an Kaans laufendem Client:
 *   - Jeder Riven steht mehrfach im Heap: als Text in einem JSON-String im
 *     Inventar-Dokument ({\"compat\":\"...), und daneben als eigenes
 *     JSON-Objekt ({"compat":"...). Beide Formen werden gesucht.
 *   - Nach dem Umwandeln der Nataruk stand der neue Wurf mit rerolls 1 im
 *     Speicher (vorher 0) - "Mantinok" statt "Igni-armanok". Kaan hat den
 *     alten behalten; der steht danach ebenfalls mit rerolls 1 da.
 *   - Die gezielte Suche las 1446 MB in 1,0 bis 1,7 Sekunden.
 *   - Die einzelnen Eintraege lagen in Bloecken von 64 bis 192 KB, der neue
 *     Wurf in einem von 128 KB. Bloecke bis 256 KB machen 1,4 GB von 8 GB
 *     Heap aus; nur die werden gelesen (RIVEN_REGION_MAX).
 *
 * NUR LESEN. Dieselbe Zusage wie beim Inventar: kein Schreiben, keine
 * Injektion, keine Zugangsdaten.
 */
import { findGameProcessIds, runInWorker } from './accountid.js';

export const RIVEN_REGION_MAX = 256n * 1024n;

/* Hinter dem Anfang des Objekts: so viel wird gelesen. Ein Riven-Fingerprint
   ist gemessen 200 bis 400 Zeichen lang, als Text mit Backslashes etwas mehr. */
const WINDOW = 1024;

/** Das Objekt, das an `text` beginnt, bis zu seiner schliessenden Klammer. */
function cutObject(text) {
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(0, i + 1);
  }
  return null;
}

/* Riven-foermig: Kuva-Waffen und Railjack-Teile tragen auch compat und buffs,
   aber weder pol noch lvlReq. */
const isRiven = fp => fp && typeof fp.compat === 'string' && Array.isArray(fp.buffs)
  && (fp.pol != null || fp.lvlReq != null);

const keyOf = fp => JSON.stringify([fp.buffs, fp.curses || [], fp.rerolls || 0, fp.lvl || 0]);

/**
 * Sucht alle Riven-Fingerprints mit diesem compat. BLOCKIERT (rund anderthalb
 * Sekunden) und gehoert deshalb in einen Worker - siehe scan-worker.js.
 *
 * @returns {{ ok: true, fingerprints: [{ fp, copies }], stats }
 *          | { ok: false, code, message }}
 */
export async function findRivenFingerprints(compat, { maxSeconds = 20 } = {}) {
  if (!compat || !compat.startsWith('/Lotus/')) {
    return { ok: false, code: 'bad_request', message: 'No weapon path given.' };
  }
  const procmem = await import('./procmem.js').catch(() => null);
  if (!procmem) return { ok: false, code: 'koffi_missing', message: 'The memory module could not be loaded.' };
  if (!procmem.isSupported()) return { ok: false, code: 'unsupported', message: 'Needs Windows (64 bit).' };

  const pids = await findGameProcessIds();
  if (!pids.length) return { ok: false, code: 'no_process', message: 'Warframe is not running.' };

  const plain = `{"compat":"${compat}"`;
  const escaped = `{\\"compat\\":\\"${compat}\\"`;

  const handle = procmem.openProcess(pids[0]);
  try {
    const hits = [];
    const scan = procmem.findAllPattern(handle, [plain, escaped], {
      limit: 400, maxSeconds, maxRegion: RIVEN_REGION_MAX,
      onHit: (address, name) => { hits.push({ address, escaped: name === escaped }); return false; },
    });

    const found = new Map();
    for (const hit of hits) {
      const buf = procmem.readAt(handle, hit.address, WINDOW);
      if (!buf) continue;
      let text = buf.toString('latin1');
      buf.fill(0);
      if (hit.escaped) text = text.replace(/\\"/g, '"');
      const obj = cutObject(text);
      if (!obj) continue;
      let fp;
      try { fp = JSON.parse(obj); } catch { continue; }
      if (!isRiven(fp) || fp.compat !== compat) continue;
      const k = keyOf(fp);
      const e = found.get(k) || { fp, copies: 0, plainCopies: 0 };
      e.copies++;
      if (!hit.escaped) e.plainCopies++;
      found.set(k, e);
    }

    return {
      ok: true,
      fingerprints: [...found.values()],
      stats: {
        hits: hits.length,
        regions: scan.regions,
        megabytes: Math.round(scan.bytes / 1048576),
        seconds: Number(scan.seconds.toFixed(1)),
        timedOut: scan.timedOut,
      },
    };
  } finally {
    procmem.closeHandle(handle);
  }
}

/** Wie findRivenFingerprints, aber im Worker-Thread - fuer den Hauptprozess. */
export function scanRivenInWorker(compat, { timeoutMs = 30000 } = {}) {
  return runInWorker({ job: 'riven', options: { compat } }, timeoutMs);
}

/**
 * Der Stand, der gerade gilt: der mit den meisten Umwandlungen. Ein alter
 * Stand aus einem frueheren Inventar-Dokument hat hoechstens gleich viele.
 *
 * GLEICHSTAND gibt es nach jeder Wahl: gemessen nach Kaans Nataruk-Umwandlung
 * (alter Wurf behalten) lagen ZWEI Staende mit rerolls 1 im Speicher - der
 * behaltene mit einer eigenen Kopie, der abgelehnte nur als Text in der
 * Serverantwort. Die eigene Kopie ist das Objekt, mit dem das Spiel
 * arbeitet, also entscheidet sie; erst danach die Zahl der Kopien.
 *
 * WELCHER RIVEN, wenn zwei dasselbe compat haben (zwei Scourge-Rivens):
 * `lim` bleibt ueber alle Wuerfe gleich - gemessen an der Nataruk (alter,
 * behaltener und abgelehnter Stand: 316580948) und an Scourge (Puratak und
 * Zetidra: 97754726). Mit `lim` zaehlt nur dieser eine Riven.
 */
export function pickCurrent(list, { lim = null } = {}) {
  return [...(list || [])]
    .filter(e => lim == null || e.fp.lim === lim)
    .sort((a, b) =>
      (b.fp.rerolls || 0) - (a.fp.rerolls || 0)
      || (b.plainCopies || 0) - (a.plainCopies || 0)
      || b.copies - a.copies)[0]?.fp || null;
}

/**
 * Der neue Wurf zu einem bekannten Stand: eine Umwandlung mehr und andere
 * Werte. null, solange er noch nicht im Speicher angekommen ist.
 */
export function pickNewRoll(list, current) {
  if (!current) return null;
  const want = (current.rerolls || 0) + 1;
  const same = fp => JSON.stringify([fp.buffs, fp.curses || []])
    === JSON.stringify([current.buffs, current.curses || []]);
  return [...(list || [])]
    .filter(e => current.lim == null || e.fp.lim === current.lim)
    .filter(e => (e.fp.rerolls || 0) === want && !same(e.fp))
    .sort((a, b) => b.copies - a.copies)[0]?.fp || null;
}
