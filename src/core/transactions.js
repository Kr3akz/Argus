/**
 * Handelsbuch - was tatsaechlich den Besitzer gewechselt hat.
 *
 * WARUM LOKAL, OBWOHL warframe.market EINE HISTORIE FUEHRT:
 *   Es sind zwei verschiedene Buecher, und keines ersetzt das andere.
 *   warframe.market verzeichnet, was ueber deren Bestaetigung lief. Das hier
 *   verzeichnet, was du im Tab abgehakt oder von Hand nachgetragen hast -
 *   also auch den Handel, der im Spiel stattfand und den niemand auf der
 *   Webseite quittiert hat. Der Hauptprozess fuehrt beide zusammen und
 *   zaehlt Doppelte einmal; siehe mergeTransactions() in main.js.
 *
 *   Der zweite Grund ist Unabhaengigkeit: dieses Buch bleibt lesbar, wenn
 *   die Anmeldung abgelaufen ist oder warframe.market nicht erreichbar.
 *
 * EIGENE DATEI, NICHT goals.json:
 *   Ziele, Notizen und Builds sind ein paar Dutzend Zeilen und werden bei
 *   jeder Aenderung komplett neu geschrieben. Das Handelsbuch waechst
 *   dauerhaft - nach einem Jahr Handeln stehen da Tausende Zeilen, die
 *   niemand bei jedem Zielklick mitschreiben will.
 *
 * PLATIN JE STUECK, NICHT JE ZEILE:
 *   Gespeichert wird der Stueckpreis; die Summe wird gerechnet. Andersherum
 *   liesse sich "drei Stueck zu 12p" nicht mehr von "eins zu 36p"
 *   unterscheiden, und genau das ist beim Nachschlagen die Frage.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dataDir, dataFile } from './paths.js';

const FILE = () => dataFile('transactions.json');

let cache = null;

async function load() {
  if (cache) return cache;
  if (!existsSync(FILE())) return (cache = { entries: [] });
  try {
    const parsed = JSON.parse(await readFile(FILE(), 'utf8'));
    cache = { entries: Array.isArray(parsed?.entries) ? parsed.entries : [] };
  } catch {
    cache = { entries: [] };    // beschaedigte Datei blockiert den Tab nicht
  }
  return cache;
}

async function save() {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(FILE(), JSON.stringify(cache, null, 2));
  return cache;
}

/** Eine Zeile in die Form bringen, in der sie gespeichert und gezeigt wird. */
function normalise(input = {}) {
  const quantity = Math.max(1, Math.round(Number(input.quantity) || 1));
  const platinum = Math.max(0, Math.round(Number(input.platinum) || 0));
  return {
    id: input.id || randomUUID(),
    at: Number(input.at) || Date.now(),
    /* 'sold' oder 'bought' - die Richtung entscheidet ueber das Vorzeichen
       in jeder Summe, deshalb wird sie hier hart auf zwei Werte gezogen. */
    direction: input.direction === 'bought' ? 'bought' : 'sold',
    /* 'order' = normales Item, 'contract' = Riven-/Lich-/Sister-Auktion. */
    kind: input.kind === 'contract' ? 'contract' : 'order',
    slug: input.slug || null,
    itemId: input.itemId || null,
    name: input.name || 'Unknown item',
    image: input.image || null,
    platinum,
    quantity,
    total: platinum * quantity,
    partner: (input.partner || '').trim() || null,
    note: (input.note || '').trim() || null,
    /* Woher der Eintrag kam - damit sich spaeter unterscheiden laesst, was
       automatisch abfiel und was jemand von Hand nachtrug. */
    source: input.source || 'manual',
    orderId: input.orderId || null,
    auctionId: input.auctionId || null
  };
}

/* ---------------------------- Schreiben ---------------------------- */

export async function addTransaction(entry) {
  const s = await load();
  const row = normalise(entry);
  /* Neueste zuerst: so muss weder das Lesen noch die Oberflaeche sortieren. */
  s.entries.unshift(row);
  await save();
  return row;
}

export async function updateTransaction(id, patch = {}) {
  const s = await load();
  const i = s.entries.findIndex(e => e.id === id);
  if (i < 0) return null;
  /* Ueber normalise, damit total mitwandert, wenn Preis oder Menge sich
     aendern - sonst steht dort eine Summe, die nicht mehr zu den Zahlen
     daneben passt. */
  s.entries[i] = normalise({ ...s.entries[i], ...patch, id });
  await save();
  return s.entries[i];
}

export async function removeTransaction(id) {
  const s = await load();
  const before = s.entries.length;
  s.entries = s.entries.filter(e => e.id !== id);
  if (s.entries.length !== before) await save();
  return { ok: true, removed: before - s.entries.length };
}

/* ----------------------------- Lesen ----------------------------- */

/**
 * Gefilterte Sicht auf das Handelsbuch.
 *
 * @param direction 'sold' | 'bought' | 'all'
 * @param kind      'order' | 'contract' | 'all'
 * @param days      nur die letzten n Tage; null = alles
 * @param query     Freitext ueber Itemname und Handelspartner
 */
export async function listTransactions(opts = {}) {
  const s = await load();
  return selectTransactions(s.entries, opts);
}

/** Alle lokalen Zeilen, ungefiltert - die Grundlage zum Zusammenfuehren. */
export async function allTransactions() {
  return (await load()).entries;
}

/**
 * Filtern und sortieren, losgeloest von der Datei.
 *
 * Steht getrennt, weil der Hauptprozess erst die Historie von
 * warframe.market mit der lokalen zusammenfuehrt und ERST DANN filtern darf.
 * Andersherum wuerden die entfernten Zeilen ungefiltert an jedem Filter
 * vorbei in die Liste rutschen.
 */
export function selectTransactions(entries, {
  direction = 'all', kind = 'all', days = null, query = '',
  sort = 'date-desc', limit = null
} = {}) {
  const q = String(query || '').toLowerCase().trim();
  const since = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

  let list = (entries || []).filter(e => {
    if (direction !== 'all' && e.direction !== direction) return false;
    if (kind !== 'all' && e.kind !== kind) return false;
    if (since && e.at < since) return false;
    if (q && !(e.name.toLowerCase().includes(q) || (e.partner || '').toLowerCase().includes(q))) return false;
    return true;
  });

  if (sort === 'date-asc')        list.sort((a, b) => a.at - b.at);
  else if (sort === 'total-desc') list.sort((a, b) => b.total - a.total);
  else if (sort === 'total-asc')  list.sort((a, b) => a.total - b.total);
  else if (sort === 'name-asc')   list.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  else                            list.sort((a, b) => b.at - a.at);

  return {
    entries: limit ? list.slice(0, limit) : list,
    total: list.length,
    summary: summariseEntries(list)
  };
}

/**
 * Die Zahlen ueber der Liste.
 *
 * net ist bewusst Einnahmen minus Ausgaben und nicht "Gewinn": was ein Teil
 * beim Farmen gekostet hat, weiss diese Datei nicht. Wer etwas fuer 10p
 * kauft und fuer 30p verkauft, sieht hier +20p - das ist die ehrliche
 * Auskunft dieser Datenlage.
 */
export function summariseEntries(list) {
  let earned = 0, spent = 0, soldCount = 0, boughtCount = 0;
  for (const e of list) {
    if (e.direction === 'sold') { earned += e.total; soldCount += e.quantity; }
    else                        { spent  += e.total; boughtCount += e.quantity; }
  }
  return {
    earned, spent, net: earned - spent,
    soldCount, boughtCount,
    entries: list.length,
    /* Bester Einzelposten: die Zeile, an die man sich erinnert. */
    best: list.filter(e => e.direction === 'sold').sort((a, b) => b.total - a.total)[0] || null
  };
}

/**
 * Was hat sich mit welchem Item verdienen lassen - zusammengefasst je Item.
 * Beantwortet "womit verdiene ich eigentlich Platin", was die Einzelliste
 * ab etwa fuenfzig Zeilen nicht mehr hergibt.
 */
export async function transactionsByItem({ direction = 'sold', days = null } = {}) {
  const { entries } = await listTransactions({ direction, days });
  const map = new Map();
  for (const e of entries) {
    const key = e.slug || e.name;
    const row = map.get(key) || {
      slug: e.slug, name: e.name, image: e.image,
      quantity: 0, total: 0, trades: 0, best: 0
    };
    row.quantity += e.quantity;
    row.total += e.total;
    row.trades += 1;
    row.best = Math.max(row.best, e.platinum);
    map.set(key, row);
  }
  return [...map.values()]
    .map(r => ({ ...r, avg: r.quantity ? Math.round(r.total / r.quantity) : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Nur fuer Tests: den Zwischenspeicher vergessen. */
export function _resetForTests() { cache = null; }
