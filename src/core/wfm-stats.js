/**
 * Kursverlauf von warframe.market - was WIRKLICH gehandelt wurde.
 *
 * DER UNTERSCHIED ZU market.js, UND ER IST DER GANZE PUNKT:
 *   market.js liest ANGEBOTE: was jemand verlangt. Ein Angebot ist eine
 *   Behauptung - es kann seit vier Monaten dastehen und nie jemanden gefunden
 *   haben. Hier stehen ABSCHLUESSE: was jemand tatsaechlich bezahlt hat, mit
 *   Datum und Stueckzahl. Daraus, und nur daraus, laesst sich beantworten, ob
 *   ein Preis steigt und ob sich ueberhaupt jemand fuer die Ware interessiert.
 *
 * DER ENDPUNKT (nachgemessen am 17.09.2026):
 *   GET /v1/items/{slug}/statistics
 *     -> { payload: { statistics_closed: { '48hours', '90days' },
 *                     statistics_live:   { '48hours', '90days' } } }
 *
 *   ES GIBT KEIN v2 DAFUER. /v2/items/{slug}/statistics und
 *   /v2/item/{slug}/statistics antworten beide "404 page not found". Das
 *   passt zu dem, was wfm-http.js im Kopf notiert: v2 deckt Items, Preise,
 *   Orders und Anmeldung ab, der Rest lebt weiter unter v1.
 *
 * GESCHLOSSEN UND NICHT LIVE:
 *   statistics_live verdichtet die STEHENDEN Orders je Stunde - also wieder
 *   Behauptungen, und diesmal auch die von Leuten, die seit Wochen offline
 *   sind. statistics_closed verdichtet die Abschluesse. Fuer die Frage "was
 *   ist das wert und bewegt es sich" ist das erste Rauschen und das zweite
 *   die Antwort.
 *
 * DER RANG GEHOERT IN DIE FRAGE - SONST IST JEDE ZAHL EINE MISCHUNG:
 *   Bei Mods und Arcanes fuehrt die Antwort ALLE Raenge in EINER Liste, je
 *   Tag ein Eintrag pro Rang, unterschieden nur durch das Feld `mod_rank`.
 *   Nachgemessen am 17.09.2026:
 *
 *     Arcane Energize    Rang 0    8p Median      Rang 5   140p Median
 *     Primed Continuity  Rang 0   50p Median      Rang 10  115p Median
 *
 *   Wer die Liste ungefiltert mittelt, bekommt eine Zahl, die zu keiner der
 *   beiden Waren gehoert - und einen "Trend", der nur davon erzaehlt, an
 *   welchem Tag zufaellig mehr ungerankte Exemplare durchgingen. Dieselbe
 *   Lehre wie bei priceKey() in market.js, nur dass sie hier nicht am
 *   Schluessel haengt, sondern an einem Filter ueber den Zeilen.
 *
 *   Nebenbei: warframe.market fuehrt nur Rang 0 und den Hoechstrang. Die
 *   Zwischenstufen werden zu selten gehandelt, um eine eigene Reihe zu
 *   ergeben - eine Anfrage nach Rang 3 bekommt deshalb nichts und sagt das,
 *   statt auf Rang 0 auszuweichen und eine falsche Ware zu zeigen.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';
import { queued } from './wfm-http.js';

const HOST = 'https://api.warframe.market';
const USER_AGENT = 'Argus/0.1 (persoenlicher Mastery-Planer)';

const STATS_CACHE = () => dataFile('market-stats.json');

/**
 * SECHS STUNDEN, und das ist bewusst laenger als bei den Preisen (30 Minuten).
 *
 * Ein Angebot kann sich jede Minute aendern - deshalb altern Preise schnell.
 * Ein Kursverlauf ueber 90 Tage aendert sich durch einen weiteren Handel
 * praktisch nicht: der letzte Tageskasten bekommt eine Stueckzahl mehr, der
 * Trend ueber dreissig Tage bleibt auf die zweite Stelle gleich. Kuerzere
 * Fristen kosteten Abrufe fuer eine Kurve, die identisch aussieht.
 */
const STATS_TTL_MS = 6 * 60 * 60 * 1000;

let cache = null;

async function readCacheFile() {
  const file = STATS_CACHE();
  if (!existsSync(file)) return {};
  try {
    const json = JSON.parse(await readFile(file, 'utf8'));
    return json && typeof json === 'object' ? json : {};
  } catch { return {}; }
}

async function loadCache() {
  if (!cache) cache = await readCacheFile();
  return cache;
}

/* Gesammelt schreiben statt je Abruf: ein Kachelraster holt dreissig
   Verlaeufe hintereinander, und dreissig Schreibvorgaenge auf dieselbe Datei
   waeren dreissig Mal dieselbe Datei. */
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const file = STATS_CACHE();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(cache));
    } catch { /* Ein nicht geschriebener Cache kostet Abrufe, keine Daten. */ }
  }, 1500);
}

/**
 * Der Schluessel im Cache - mit Rang und Zustand, aus demselben Grund wie bei
 * priceKey(): zwei Raenge derselben Mod und zwei Zustaende desselben Relikts
 * sind verschiedene Waren und duerfen sich nicht gegenseitig ueberschreiben.
 */
export const statsKey = (slug, rank = null, subtype = null) =>
  slug + (rank == null ? '' : `#r${rank}`) + (subtype == null ? '' : `#${subtype}`);

/* ------------------------------ Verdichten ------------------------------ */

const TAG = 86400000;

/** Median einer Zahlenreihe. Leer ergibt null, nicht 0. */
function median(values) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

/**
 * Der Median der Tage innerhalb eines Zeitfensters - GEWICHTET NACH STUECKZAHL.
 *
 * WARUM NICHT DER SCHLICHTE DURCHSCHNITT DER TAGESMEDIANE: ein Tag mit einem
 * einzigen Handel zu 300p zaehlte dann genauso viel wie ein Tag mit vierzig
 * Handeln zu 60p. Genau so entstehen "Trends", die nur aus einem Ausreisser
 * bestehen. Jeder Tag geht deshalb so oft ein, wie an ihm gehandelt wurde.
 */
function weightedMedian(days) {
  const werte = [];
  for (const d of days) {
    if (!Number.isFinite(d.m)) continue;
    /* Gedeckelt: ein einzelner Tag mit 900 Handeln soll das Fenster nicht
       allein bestimmen. Zwanzig reichen, um schwere von leichten Tagen zu
       unterscheiden. */
    const gewicht = Math.min(20, Math.max(1, Math.round(d.v || 1)));
    for (let i = 0; i < gewicht; i++) werte.push(d.m);
  }
  return median(werte);
}

const summe = (days, feld) => days.reduce((n, d) => n + (Number(d[feld]) || 0), 0);

/**
 * Aus den Tageskaesten die Zahlen, die auf ein Datenblatt passen.
 *
 * DREI FENSTER, WEIL DREI FRAGEN DAHINTERSTEHEN:
 *   7 Tage   - was gilt gerade
 *   30 Tage  - wovon kommt es
 *   90 Tage  - wo liegt es normalerweise
 * Der Trend ist der Abstand zwischen dem ersten und dem zweiten: steht die
 * Woche ueber dem Monat, zieht der Preis an.
 */
function summarise(days) {
  if (!days.length) return null;

  const jetzt = Date.now();
  const fenster = n => days.filter(d => jetzt - d.t <= n * TAG);

  const d7 = fenster(7);
  const d30 = fenster(30);

  const med7 = weightedMedian(d7);
  const med30 = weightedMedian(d30);
  const med90 = weightedMedian(days);

  /* Gehandelte Stueck je Tag, gerechnet ueber die LAUFZEIT und nicht ueber die
     Zahl der Kaesten: ein Item, das an drei von dreissig Tagen gehandelt wurde,
     hat kein Volumen von "zwanzig am Tag" - es hat sechzig in einem Monat, und
     das ist die Auskunft, die vor einem Verkauf zaehlt. */
  const vol30 = summe(d30, 'v');
  const volProTag = Math.round((vol30 / 30) * 10) / 10;

  /* Prozent, und nur wenn beide Seiten dastehen. Ein Trend gegen eine fehlende
     Vergleichszahl waere keine Aenderung, sondern eine erfundene. */
  const trend = (a, b) => (a != null && b != null && b > 0)
    ? Math.round(((a - b) / b) * 1000) / 10
    : null;

  const preise = days.map(d => d.m).filter(Number.isFinite);

  return {
    median7: med7,
    median30: med30,
    median90: med90,
    /* Die Bewegung der letzten Woche gegen den Monat dahinter. */
    trend30: trend(med7, med30),
    /* Und gegen das Vierteljahr - eine Ware kann seit Wochen steigen, ohne
       dass die letzte Woche gegen den Monat auffaellt. */
    trend90: trend(med7, med90),
    volume7: summe(d7, 'v'),
    volume30: vol30,
    volumePerDay: volProTag,
    /* An wie vielen der letzten dreissig Tage ueberhaupt etwas passiert ist.
       DIE WICHTIGSTE ZAHL NEBEN DEM PREIS: 400p sind keine 400p, wenn zuletzt
       vor zwei Wochen jemand gekauft hat. */
    activeDays30: d30.length,
    low90: preise.length ? Math.min(...preise) : null,
    high90: preise.length ? Math.max(...preise) : null,
    lastTradeAt: days.length ? days[days.length - 1].t : null,
    days: days.length
  };
}

/**
 * Die Antwort von warframe.market in Tageskaesten.
 *
 * LUECKEN BLEIBEN LUECKEN. Die Antwort fuehrt nur Tage, an denen gehandelt
 * wurde - bei einem gefragten Prime sind das 89 von 90, bei einem Ladenhueter
 * vier. Die fehlenden mit dem letzten Preis aufzufuellen saehe aus wie ein
 * ruhiger Kurs, waehrend in Wirklichkeit nichts passiert ist. Jeder Kasten
 * traegt deshalb seinen Zeitstempel, und das Diagramm setzt ihn an die Stelle,
 * an die er zeitlich gehoert.
 */
/**
 * Der meistgehandelte Zustand einer Ware.
 *
 * WOZU: Relikte tragen dasselbe Problem wie Mods, nur unter anderem Namen.
 * Statt `mod_rank` steht dort `subtype` - "intact" gegen "radiant" -, und auch
 * das sind zwei Waren zu zwei Preisen in EINER Liste. Fuer Raenge gibt es eine
 * eingebuergerte Voreinstellung (ungerankt, so wie die Preisschilder), fuer
 * Zustaende gibt es keine: ein intaktes Relikt ist nicht "die Grundform" eines
 * strahlenden, beide werden nebeneinander gehandelt.
 *
 * Gewaehlt wird deshalb der Zustand mit dem meisten Umsatz - und das Ergebnis
 * sagt hinterher, welcher es war. Raten waere, sich für einen zu entscheiden
 * und es zu verschweigen.
 */
function haeufigsterSubtype(rows) {
  const summe = new Map();
  for (const r of rows || []) {
    if (r?.subtype == null) continue;
    summe.set(r.subtype, (summe.get(r.subtype) || 0) + (Number(r.volume) || 0));
  }
  if (!summe.size) return null;
  return [...summe.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function toDays(rows, rank, subtype) {
  const out = [];
  for (const r of rows || []) {
    if (!r?.datetime) continue;

    /* DER RANGFILTER. Fehlt das Feld, ist es ein Item ohne Raenge (ein
       Prime-Teil, ein Relikt) und die Zeile gilt. Ist es da, muss es passen -
       siehe den Kopf dieser Datei. */
    if (r.mod_rank != null && rank != null && r.mod_rank !== rank) continue;
    /* Ohne gefragten Rang bei einem Item MIT Raengen: die ungerankte Reihe.
       Das ist die Stufe, in der die Karte faellt, und dieselbe Voreinstellung,
       die auch die Preisschilder nehmen. */
    if (r.mod_rank != null && rank == null && r.mod_rank !== 0) continue;

    /* Derselbe Schnitt fuer den Zustand - siehe haeufigsterSubtype(). */
    if (r.subtype != null && subtype != null && r.subtype !== subtype) continue;

    const t = Date.parse(r.datetime);
    if (!Number.isFinite(t)) continue;

    out.push({
      t,
      m: Number(r.median ?? r.avg_price ?? r.closed_price) || null,
      v: Number(r.volume) || 0,
      lo: Number(r.min_price) || null,
      hi: Number(r.max_price) || null
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out.filter(d => d.m != null);
}

/* -------------------------------- Abruf -------------------------------- */

async function fetchStats(slug) {
  const res = await queued(() => fetch(
    `${HOST}/v1/items/${encodeURIComponent(slug)}/statistics`,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
  ));
  if (!res.ok) {
    const err = new Error(`warframe.market statistics: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return json?.payload?.statistics_closed || null;
}

/**
 * Kursverlauf eines Items. null, wenn der Markt dazu nichts fuehrt.
 *
 * @param rank  Bei Mods und Arcanes die Stufe. null heisst "ungerankt" bei
 *              Items mit Raengen und "alles" bei Items ohne.
 */
export async function getStats(slug, { maxAgeMs = STATS_TTL_MS, rank = null, subtype = null } = {}) {
  if (!slug) return null;

  const store = await loadCache();
  const key = statsKey(slug, rank, subtype);
  const hit = store[key];
  if (hit && Date.now() - hit.fetchedAt < maxAgeMs) return hit.stats;

  try {
    const closed = await fetchStats(slug);
    const rows = closed?.['90days'] || [];
    /* Kein Zustand gefragt, aber die Zeilen tragen einen: den mit dem meisten
       Umsatz nehmen und hinterher dazusagen, welcher es war. */
    const zustand = subtype ?? haeufigsterSubtype(rows);
    const days = toDays(rows, rank, zustand);
    const summary = summarise(days);

    const stats = summary
      ? { slug, rank, subtype: zustand, ...summary, series: days }
      : null;
    store[key] = { fetchedAt: Date.now(), stats };
    scheduleSave();
    return stats;
  } catch (err) {
    /* Ein alter Verlauf ist hier fast so gut wie ein frischer - siehe die
       Begruendung der Frist oben. Er sagt ueber `stale`, dass er alt ist. */
    if (hit?.stats) return { ...hit.stats, stale: true, fetchedAt: hit.fetchedAt };
    /* 404 heisst: den Slug gibt es, einen Verlauf dazu nicht. Das ist eine
       Antwort und wird gemerkt, damit nicht jeder Blick erneut fragt. */
    if (err.status === 404) {
      store[key] = { fetchedAt: Date.now(), stats: null };
      scheduleSave();
    }
    return null;
  }
}

/** Was auf der Platte steht - ohne Netz, sofort. Fuer den ersten Anstrich. */
export async function cachedStats(slug, { rank = null, subtype = null } = {}) {
  if (!slug) return null;
  const store = await loadCache();
  const hit = store[statsKey(slug, rank, subtype)];
  if (!hit?.stats) return null;
  return Date.now() - hit.fetchedAt < STATS_TTL_MS
    ? hit.stats
    : { ...hit.stats, stale: true, fetchedAt: hit.fetchedAt };
}

/**
 * Verlaeufe fuer mehrere Items, nacheinander.
 *
 * Die Warteschlange in wfm-http.js haelt den Takt; hier steht nur die
 * Reihenfolge. Ein Deckel ist trotzdem noetig: der Insights-Tab wuerde sonst
 * hundert Abrufe in eine Kette stellen, die bei 350 ms Abstand eine halbe
 * Minute laeuft, waehrend niemand mehr hinsieht.
 */
export async function getManyStats(entries, { maxAgeMs = STATS_TTL_MS, limit = 40, signal = null } = {}) {
  const out = {};
  let n = 0;
  for (const e of entries || []) {
    const slug = typeof e === 'string' ? e : e?.slug;
    if (!slug) continue;
    const rank = typeof e === 'string' ? null : (e.rank ?? null);
    const subtype = typeof e === 'string' ? null : (e.subtype ?? null);
    const key = statsKey(slug, rank, subtype);
    if (key in out) continue;
    if (n++ >= limit) break;
    if (signal?.aborted) break;
    out[key] = await getStats(slug, { maxAgeMs, rank, subtype }).catch(() => null);
  }
  return out;
}
