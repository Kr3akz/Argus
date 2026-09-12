/**
 * Der Kontostand ueber die Zeit - die Gegenprobe zum Handelsbuch.
 *
 * WARUM ES DAS BRAUCHT:
 *   Das Handelsbuch (transactions.js) kennt zwei Quellen, und beide haben
 *   dasselbe Loch: warframe.market verzeichnet nur, was ueber deren
 *   Bestaetigung lief, und die lokalen Zeilen nur, was jemand abgehakt oder
 *   nachgetragen hat. Ein Handel im Chatfenster, ein spontaner Kauf, ein
 *   Waffenplatz fuer 12 Platin - davon steht nirgends etwas. Die Auswertung
 *   zeigt dann eine saubere Bilanz ueber ein Buch mit Luecken, und niemand
 *   sieht, dass sie unvollstaendig ist.
 *
 *   Der Kontostand luegt nicht. Er steht im Inventar, und wenn er sich anders
 *   bewegt hat als das Buch sagt, ist genau diese Differenz die Auskunft:
 *   so viel ist an den Aufzeichnungen vorbeigegangen.
 *
 * WAS HIER NICHT PASSIERT: aus den Differenzen Handel zu ERFINDEN. Platin
 * geht auch fuer Waffenplaetze, Farbpaletten und Booster weg, Dukaten nur bei
 * Baro - eine Differenz ist "nicht im Buch", nicht "unverzeichneter Handel".
 * Die Oberflaeche sagt es so, und mehr laesst diese Datenlage nicht zu.
 *
 * GESTEMPELT WIRD MIT syncedAt, NICHT MIT DER LESEZEIT:
 *   Argus liest die Abschrift, die der Client beim letzten Sync bekam - beim
 *   Login und bei Zonenwechseln. "Gelesen vor zwei Minuten" kann einen zwei
 *   Stunden alten Stand meinen (siehe inventory.js). Der Zeitpunkt, zu dem
 *   dieser Kontostand GALT, ist syncedAt; damit ist er zugleich der
 *   Schluessel, unter dem derselbe Stand nicht zweimal landet, egal wie oft
 *   der Tab geoeffnet wird.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dataDir, dataFile } from './paths.js';

const FILE = () => dataFile('wallet-history.json');

/* Ein Eintrag sind rund 60 Byte. Bei einer Handvoll Zonenwechsel am Tag
   reichen 4000 fuer Jahre - und deckeln heisst hier, dass die Datei nicht
   still weiterwaechst, bis sie jemandem auffaellt. Geschnitten wird vorne:
   der aelteste Stand ist der, auf den am wenigsten geschaut wird. */
const MAX_ENTRIES = 4000;

let cache = null;

async function load() {
  if (cache) return cache;
  if (!existsSync(FILE())) return (cache = { entries: [] });
  try {
    const parsed = JSON.parse(await readFile(FILE(), 'utf8'));
    cache = { entries: Array.isArray(parsed?.entries) ? parsed.entries : [] };
  } catch {
    cache = { entries: [] };   // beschaedigte Datei blockiert den Tab nicht
  }
  return cache;
}

/**
 * Einen Kontostand vermerken.
 *
 * Zurueck kommt, OB etwas dazugekommen ist - der Aufrufer ruft das bei jedem
 * Oeffnen des Tabs auf, und das Allermeiste davon ist derselbe Stand wie
 * beim letzten Mal.
 *
 * @param at  Zeitpunkt, zu dem der Stand galt (syncedAt), sonst die Lesezeit
 */
export async function recordBalance({ platinum = null, ducats = null } = {}, at = Date.now()) {
  const stamp = Number(at) || Date.now();
  if (platinum == null && ducats == null) return { added: false };

  const s = await load();

  /* Derselbe Sync liefert denselben Stand - der gehoert nicht zweimal in die
     Reihe. Geprueft wird gegen den juengsten Eintrag und nicht gegen die
     ganze Liste: die Staende kommen der Reihe nach, und eine Suche ueber
     Tausende Zeilen je Tabwechsel waere Arbeit fuer nichts. */
  const last = s.entries[s.entries.length - 1];
  if (last && last.at >= stamp) return { added: false, entries: s.entries };

  s.entries.push({ at: stamp, platinum, ducats });
  if (s.entries.length > MAX_ENTRIES) s.entries = s.entries.slice(-MAX_ENTRIES);

  await mkdir(dataDir(), { recursive: true });
  await writeFile(FILE(), JSON.stringify(s));
  return { added: true, entries: s.entries };
}

/**
 * Alle bekannten Staende, aeltester zuerst.
 *
 * Roh und ungefiltert: welcher Ausschnitt gefragt ist, entscheidet sich in
 * der Oberflaeche beim Umschalten des Zeitraums, und ein Aufruf je Klick
 * waere ein Umweg ueber zwei Prozesse fuer eine Handvoll Zahlen, die ohnehin
 * schon dort liegen. Das Zuschneiden macht walletWindow in charts.js.
 */
export async function loadWallet() {
  return (await load()).entries;
}

/** Nur fuer Tests: den Zwischenspeicher vergessen. */
export function _resetForTests() { cache = null; }
