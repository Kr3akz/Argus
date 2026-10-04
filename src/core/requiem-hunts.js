/**
 * Das Stichbuch: welche Requiems an welchem Lich schon probiert wurden.
 * Reine lokale JSON-Datei (data/requiem.json) - nichts davon verlaesst den
 * Rechner.
 *
 * WARUM EINE EIGENE DATEI und nicht goals.json: store.js schreibt bei jeder
 * Aenderung den ganzen Zustand zurueck, Voreinstellungen eingeschlossen (siehe
 * dort). Die Stiche haben mit Zielen und Notizen nichts zu tun, und ein
 * Fehler hier soll dort nichts mitreissen.
 *
 * EIN ZUG JE GEGNER. Kommt der Gegner aus dem Inventar, ist seine Kennung der
 * Zeitpunkt seiner Entstehung ("n1787091747127", siehe readNemesis) - so
 * findet die Geschichte spaeter die Stiche zu einem besiegten Lich wieder.
 * Wer ohne Inventar spielt (Konsole, Spiel aus), legt einen Zug von Hand an
 * ("m" + Zeitpunkt).
 *
 * Geschrieben wird ueber eine Warteschlange und eine Zwischendatei: zwei
 * schnelle Klicks sollen sich nicht gegenseitig einen Stich ueberschreiben,
 * und ein Absturz mitten im Schreiben soll das Buch nicht leeren.
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dataDir, dataFile } from './paths.js';
import { checkStab, cleanHunt, NEMESIS_KINDS } from './requiem.js';

const FILE = () => dataFile('requiem.json');
const VERSION = 1;

const DEFAULT_PREFS = () => ({ allowOull: true });

const empty = () => ({ version: VERSION, hunts: {}, prefs: DEFAULT_PREFS() });

/** Ein Zug, wie er gespeichert wird - alles Unbekannte faellt weg. */
function normalize(id, raw) {
  const { hints, stabs } = cleanHunt(raw);
  const kind = NEMESIS_KINDS[raw?.kind]?.requiems ? raw.kind : 'lich';
  return {
    id,
    source: raw?.source === 'manual' ? 'manual' : 'inventory',
    kind,
    createdAt: Number(raw?.createdAt) || null,
    startedAt: Number(raw?.startedAt) || null,
    finishedAt: Number(raw?.finishedAt) || null,
    /* Der Name, den das Spiel dem Lich gegeben hat - aus dem Log, siehe
       RE_SQUAD_NEMESIS in logwatch.js. */
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : null,
    hints,
    stabs
  };
}

export async function loadHunts() {
  if (!existsSync(FILE())) return empty();
  try {
    const parsed = JSON.parse(await readFile(FILE(), 'utf8'));
    const hunts = {};
    for (const [id, raw] of Object.entries(parsed?.hunts || {})) {
      if (typeof id === 'string' && /^[nm]\d+$/.test(id)) hunts[id] = normalize(id, raw);
    }
    return {
      version: VERSION,
      hunts,
      prefs: { ...DEFAULT_PREFS(), ...(parsed?.prefs || {}), allowOull: parsed?.prefs?.allowOull !== false }
    };
  } catch {
    return empty();   // beschaedigte Datei blockiert den Reiter nicht
  }
}

async function save(state) {
  await mkdir(dataDir(), { recursive: true });
  const tmp = FILE() + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, FILE());
  return state;
}

/* Eine Aenderung nach der anderen. */
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Fehler, deren Text die Oberflaeche zeigt. */
class HuntError extends Error {}
export const isHuntError = err => err instanceof HuntError;

/**
 * Einen Zug aendern. Gibt es ihn noch nicht, entsteht er aus `template`
 * ({ source, kind, createdAt }) - ein Gegner aus dem Inventar bekommt seinen
 * Zug also erst mit dem ersten Eintrag, nicht schon beim Hinsehen.
 */
function change(id, template, fn) {
  return serial(async () => {
    const s = await loadHunts();
    let hunt = s.hunts[id];
    if (!hunt) {
      if (!template) throw new HuntError('This hunt no longer exists.');
      hunt = normalize(id, { ...template, startedAt: Date.now() });
    }
    fn(hunt);
    s.hunts[id] = normalize(id, hunt);
    return save(s);
  });
}

export function recordStab(id, template, stab) {
  const err = checkStab(stab);
  if (err) return Promise.reject(new HuntError(err));
  return change(id, template, hunt => {
    if (hunt.stabs.some(s => s.result === 3)) throw new HuntError('This hunt is already over - the sequence worked.');
    hunt.stabs.push({ mods: [...stab.mods], result: stab.result, at: Date.now() });
  });
}

export function removeStab(id, index) {
  return change(id, null, hunt => {
    if (!Number.isInteger(index) || index < 0 || index >= hunt.stabs.length) throw new HuntError('That stab is not in the log.');
    hunt.stabs.splice(index, 1);
  });
}

export function setHints(id, template, hints) {
  return change(id, template, hunt => {
    const clean = cleanHunt({ hints }).hints;
    if (Array.isArray(hints) && hints.length > 3) throw new HuntError('A sequence has only three requiems.');
    hunt.hints = clean;
  });
}

/** Ein Zug von Hand - fuer alle, deren Gegner nicht im Inventar steht. */
export function startManual(kind) {
  const id = 'm' + Date.now();
  return change(id, { source: 'manual', kind: NEMESIS_KINDS[kind]?.requiems ? kind : 'lich' }, () => {});
}

/** Den Namen merken, sobald das Log ihn nennt. Gleicher Name: nichts tun. */
export async function setName(id, template, name) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) return loadHunts();
  const s = await loadHunts();
  if (s.hunts[id]?.name === clean) return s;
  return change(id, template, hunt => { hunt.name = clean; });
}

export function finishHunt(id) {
  return change(id, null, hunt => { hunt.finishedAt = Date.now(); });
}

export function deleteHunt(id) {
  return serial(async () => {
    const s = await loadHunts();
    delete s.hunts[id];
    return save(s);
  });
}

export function setPrefs(patch) {
  return serial(async () => {
    const s = await loadHunts();
    if (typeof patch?.allowOull === 'boolean') s.prefs.allowOull = patch.allowOull;
    return save(s);
  });
}
