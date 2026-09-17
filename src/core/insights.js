/**
 * Was als naechstes in den Vault geht - und was das fuer den eigenen Schrank
 * bedeutet.
 *
 * DIE FRAGE, DIE DAHINTERSTEHT: ein gevaultetes Prime faellt nirgendwo mehr.
 * Wer es dann noch will, muss es kaufen, und zwar von jemandem, der es vorher
 * gefarmt hat. Genau das hebt die Preise - regelmaessig und vorhersehbar
 * genug, dass sich ein Blick darauf lohnt, BEVOR es soweit ist.
 *
 * WOHER DIE DATEN KOMMEN, UND WAS SIE WERT SIND:
 *   api.warframestat.us/items fuehrt zu jedem Prime `releaseDate`, `vaulted`,
 *   `vaultDate` und - das ist das Entscheidende - `estimatedVaultDate`.
 *   Die Schaetzung stammt von der Gemeinschaft hinter WFCD, nicht von DE:
 *   Digital Extremes kuendigt Vaultings nicht im Voraus an. Sie beruht darauf,
 *   dass Prime Access einem festen Takt folgt und die Reihenfolge der
 *   Vaultings der Reihenfolge der Veroeffentlichungen entspricht.
 *
 *   NACHGEMESSEN AM 17.09.2026 ergibt das saubere Dreiergruppen - je ein
 *   Warframe und zwei Waffen, also genau ein Prime-Access-Paket:
 *
 *     -35 Tage   Quassus Prime, Trumna Prime, Xaku Prime
 *     +56 Tage   Cedo Prime, Dual Zoren Prime, Lavos Prime
 *    +157 Tage   Daikyu Prime, Kompressa Prime, Yareli Prime
 *
 *   Das ist eine Prognose und wird auch so benannt. Sie sagt nicht, WANN DE
 *   vaultet; sie sagt, was als naechstes dran waere, wenn es weitergeht wie
 *   bisher.
 *
 * WARUM DER MARKT-SET-EINTRAG DER FILTER IST:
 *   Von 242 Eintraegen mit "Prime" im Namen haben 159 ein handelbares Set auf
 *   warframe.market. Die uebrigen 83 sind Dinge, die hier nichts zu suchen
 *   haben: Faehigkeits-Primes (Whipclaw Prime, Iron Staff Prime), Noggle-
 *   Statuen, die Gruenderwaffen (Excalibur Prime, Lato Prime), Begleiter-
 *   waffen ohne eigenes Set - und "E Prime", ein Knoten auf der Erde.
 *   Ueber den Set-Eintrag zu gehen sortiert all das aus, ohne eine einzige
 *   Ausnahmeliste zu pflegen.
 *
 * DIE ACHT, DIE NIE GEVAULTET WERDEN:
 *   Braton, Bronco, Fang, Orthos, Paris, Burston, Akbronco und Lex Prime
 *   liegen dauerhaft im allgemeinen Relikt-Bestand. WFCD fuehrt fuer sie eine
 *   Schaetzung aus dem Jahr 2015, die damit elf Jahre ueberfaellig ist. Sie
 *   als "ueberfaellig" zu melden waere das Gegenteil der Wahrheit: sie sind
 *   die einzigen, bei denen feststeht, dass sie bleiben. Alles, was laenger
 *   als ein Jahr ueber der Schaetzung liegt und immer noch faellt, gilt
 *   deshalb als DAUERHAFT und nicht als ueberfaellig.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const WFS_URL = 'https://api.warframestat.us/items/'
  + '?only=name,uniqueName,category,vaulted,releaseDate,vaultDate,estimatedVaultDate';

const CACHE = () => dataFile('vault-forecast.json');

/* Vault-Daten aendern sich, wenn DE vaultet - also ein paar Mal im Jahr. Ein
   Tag Frist ist reichlich und haelt den Abruf aus dem Weg. */
const TTL_MS = 24 * 60 * 60 * 1000;

const TAG = 86400000;

/**
 * Ab wann eine ueberfaellige Schaetzung nicht mehr "ueberfaellig" heisst,
 * sondern "faellt dauerhaft". Ein Jahr ist grosszuegig: DE hat Vaultings schon
 * um mehrere Monate verschoben, aber nie um mehr als ein Jahr - und die acht
 * dauerhaften liegen um ein Vielfaches darueber (siehe Kopf).
 */
const DAUERHAFT_AB_TAGEN = 365;

let memo = null;

async function readCache() {
  const file = CACHE();
  if (!existsSync(file)) return null;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function writeCache(data) {
  const file = CACHE();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

/**
 * Die Vault-Angaben zu allen Primes, als Karte ueber den uniqueName.
 *
 * Ein alter Stand ist hier fast so gut wie ein frischer - Vault-Termine
 * verschieben sich um Monate, nicht um Stunden. Faellt der Abruf aus, gilt
 * deshalb der Cache, egal wie alt.
 */
export async function loadVaultData({ refresh = false } = {}) {
  if (memo && !refresh && Date.now() - memo.fetchedAt < TTL_MS) return memo;

  const cached = await readCache();
  if (cached && !refresh && Date.now() - cached.fetchedAt < TTL_MS) {
    memo = { ...cached, byRef: new Map(cached.list.map(e => [e.uniqueName, e])) };
    return memo;
  }

  try {
    const res = await fetch(WFS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`warframestat: HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json) || !json.length) throw new Error('leere Antwort');

    /* Nur Primes, und nur die Felder, um die es geht: die volle Antwort sind
       17.000 Eintraege, davon braucht diese Datei 242. */
    const list = json
      .filter(i => / Prime$/.test(String(i?.name || '')))
      .map(i => ({
        name: i.name,
        uniqueName: i.uniqueName,
        category: i.category || null,
        vaulted: i.vaulted === true,
        releaseDate: i.releaseDate || null,
        vaultDate: i.vaultDate || null,
        estimatedVaultDate: i.estimatedVaultDate || null
      }));

    const data = { fetchedAt: Date.now(), list };
    await writeCache(data).catch(() => {});
    memo = { ...data, byRef: new Map(list.map(e => [e.uniqueName, e])) };
    return memo;
  } catch (err) {
    if (cached) {
      memo = {
        ...cached,
        byRef: new Map(cached.list.map(e => [e.uniqueName, e])),
        stale: err.message
      };
      return memo;
    }
    throw err;
  }
}

/* ---------------------------- Einstufung ---------------------------- */

/**
 * Was der Termin bedeutet.
 *
 *   vaulted    faellt schon jetzt nirgendwo mehr
 *   evergreen  ueberfaellig um mehr als ein Jahr und faellt trotzdem - die
 *              acht dauerhaften (siehe Kopf)
 *   overdue    ueber der Schaetzung, aber innerhalb eines Jahres: kann jede
 *              Prime-Access-Ankuendigung treffen
 *   soon       innerhalb der naechsten 120 Tage
 *   later      danach
 *   unknown    keine Schaetzung vorhanden
 */
export function vaultStage(entry, jetzt = Date.now()) {
  if (!entry) return { stage: 'unknown', days: null };
  if (entry.vaulted) {
    const seit = entry.vaultDate ? Math.round((jetzt - Date.parse(entry.vaultDate)) / TAG) : null;
    return { stage: 'vaulted', days: null, vaultedForDays: Number.isFinite(seit) ? seit : null };
  }

  const est = entry.estimatedVaultDate ? Date.parse(entry.estimatedVaultDate) : NaN;
  if (!Number.isFinite(est)) return { stage: 'unknown', days: null };

  const days = Math.round((est - jetzt) / TAG);
  if (days < -DAUERHAFT_AB_TAGEN) return { stage: 'evergreen', days };
  if (days < 0)   return { stage: 'overdue', days };
  if (days <= 120) return { stage: 'soon', days };
  return { stage: 'later', days };
}

/* Die Reihenfolge, in der die Stufen im Bericht stehen. Ueberfaellig zuerst:
   das ist das einzige, was heute passieren kann. */
const STUFEN_RANG = { overdue: 0, soon: 1, later: 2, evergreen: 3, vaulted: 4, unknown: 5 };

/**
 * Die Prognose, verknuepft mit dem eigenen Schrank.
 *
 * @param sets   Ergebnis von buildPrimeSets() - traegt Besitz, Preis und Slug
 * @param vault  Ergebnis von loadVaultData()
 *
 * DER ABGLEICH LAEUFT UEBER gameRef UND NICHT UEBER DEN NAMEN. DEs uniqueName
 * ist derselbe Schluessel auf beiden Seiten; Namen laufen bei "Prime Blueprint"
 * gegen "Prime" auseinander, und ein Fehltreffer waere hier nicht sichtbar -
 * er saehe aus wie ein Set ohne Vault-Angabe.
 */
export function buildForecast(sets = [], vault = null, { now = Date.now() } = {}) {
  if (!vault?.byRef) return { groups: [], items: [], usable: false };

  const items = [];
  for (const s of sets) {
    /* Basis-Sets haben keinen Markt-Slug und keinen Vault-Zustand - ihre Teile
       sind nicht handelbar. Sie gehoeren nicht in eine Handelsprognose. */
    if (!s.setSlug || !s.gameRef) continue;
    const entry = vault.byRef.get(s.gameRef);
    if (!entry) continue;

    const { stage, days, vaultedForDays } = vaultStage(entry, now);

    items.push({
      name: s.name,
      uniqueName: s.gameRef,
      slug: s.setSlug,
      image: s.image || null,
      category: entry.category || null,
      stage,
      days,
      vaultedForDays: vaultedForDays ?? null,
      releaseDate: entry.releaseDate || null,
      estimatedVaultDate: entry.estimatedVaultDate || null,
      vaultDate: entry.vaultDate || null,
      /* Der eigene Stand - die Haelfte der Auskunft. "Xaku Prime geht bald in
         den Vault" ist eine Nachricht; "und dir fehlen zwei Teile" ist eine
         Handlungsanweisung. */
      ownedParts: s.ownedParts || 0,
      totalParts: s.totalParts || 0,
      complete: !!s.complete,
      fullSetsCount: s.fullSetsCount || 0,
      ownedDucats: s.ownedDucats || 0,
      setPrice: s.setPrice?.min ?? null,
      /* Was man von diesem Set ueberhaupt anbieten koennte - die Teile mit
         Bestand, je mit Slug, damit die Oberflaeche daraus Orders machen kann. */
      parts: (s.parts || []).map(p => ({
        name: p.name,
        shortName: p.shortName || p.name,
        slug: p.slug,
        count: p.count || 0,
        required: p.required || 1,
        ducats: p.ducats ?? null,
        price: p.price?.min ?? null
      }))
    });
  }

  items.sort((a, b) =>
    (STUFEN_RANG[a.stage] ?? 9) - (STUFEN_RANG[b.stage] ?? 9)
    || (a.days ?? 1e9) - (b.days ?? 1e9)
    || a.name.localeCompare(b.name, 'en'));

  /* NACH TERMIN GRUPPIERT, WEIL DE IN PAKETEN VAULTET. Drei Namen unter einem
     Datum sind ein Prime-Access-Paket und keine drei Zufaelle - und wer plant,
     plant gegen das Paket, nicht gegen die einzelne Waffe. */
  const groups = [];
  const nachDatum = new Map();
  for (const it of items) {
    if (it.stage === 'vaulted' || it.stage === 'evergreen' || it.stage === 'unknown') continue;
    const key = it.estimatedVaultDate;
    if (!nachDatum.has(key)) {
      const g = { date: key, days: it.days, stage: it.stage, items: [] };
      nachDatum.set(key, g);
      groups.push(g);
    }
    nachDatum.get(key).items.push(it);
  }
  groups.sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));

  return {
    groups,
    items,
    usable: items.length > 0,
    fetchedAt: vault.fetchedAt || null,
    stale: vault.stale || null
  };
}

/**
 * Was der eigene Schrank an Handlungsbedarf hergibt.
 *
 * DREI LISTEN, WEIL ES DREI VERSCHIEDENE ENTSCHEIDUNGEN SIND:
 *
 *   hold   Was man KOMPLETT hat und was bald vaultet. Nach dem Vaulting ist
 *          es knapper und damit teurer - wer es jetzt verkauft, verkauft vor
 *          der Verknappung. Die Liste sagt nicht "verkauf nicht", sie sagt,
 *          worueber es sich lohnt, zweimal nachzudenken.
 *
 *   fill   Was man ANGEFANGEN hat und was bald vaultet. Das ist die einzige
 *          Liste mit einer Frist: nach dem Vaulting sind die fehlenden Teile
 *          nur noch zu kaufen, und zwar zum Preis nach der Verknappung.
 *
 *   spare  Was man MEHRFACH hat und was schon gevaultet IST. Da ist die
 *          Verknappung vorbei und der Preis oben - das ist der Bestand, der
 *          heute etwas bringt.
 *
 * KEINE DIESER LISTEN SAGT EINEN PREIS VORAUS. Sie ordnen den eigenen Bestand
 * nach einem Termin, der bekannt ist. Was der Markt daraus macht, steht in den
 * Kursverlaeufen daneben (siehe wfm-stats.js) und nicht hier.
 */
export function buildAdvice(forecast, { soonDays = 180, limit = 12 } = {}) {
  const items = forecast?.items || [];

  const bald = it => (it.stage === 'overdue' || it.stage === 'soon'
    || (it.stage === 'later' && it.days != null && it.days <= soonDays));

  const wert = it => (it.setPrice ?? 0);

  const hold = items
    .filter(it => bald(it) && it.fullSetsCount > 0)
    .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9) || wert(b) - wert(a))
    .slice(0, limit);

  const fill = items
    .filter(it => bald(it) && !it.complete && it.ownedParts > 0)
    .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9)
      || (b.ownedParts / (b.totalParts || 1)) - (a.ownedParts / (a.totalParts || 1)))
    .slice(0, limit);

  const spare = items
    .filter(it => it.stage === 'vaulted' && it.fullSetsCount > 0)
    .sort((a, b) => wert(b) - wert(a))
    .slice(0, limit);

  return { hold, fill, spare };
}
