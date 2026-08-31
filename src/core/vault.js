/**
 * Vault-Status: welche Prime-Teile lassen sich ueberhaupt noch farmen.
 *
 * DIE KETTE, IN DREI SCHRITTEN:
 *   1. Welche Relikte fallen gerade?   droptables.js -> liveRelics (35)
 *   2. Was steckt in genau diesen?     relics.js     -> Belohnungstabelle
 *   3. Ein Prime-Set ist erreichbar, wenn JEDES seiner Teile in Schritt 2
 *      vorkommt. Fehlt eins, ist das Set gevaultet - auch wenn drei von vier
 *      Teilen taeglich fallen.
 *
 * WARUM DAS DIE OFFENE FRAGE AUS docs/limits.md SCHLIESST:
 *   Dort stand "Vaulted primes are still listed as obtainable" als bekannte
 *   Grenze. Sie liess sich nicht schliessen, solange die Vault-Frage an der
 *   Belohnungstabelle haengen sollte - die fuehrt alle 773 Relikte, auch die
 *   gevaulteten (siehe liveRelics() in droptables.js). Erst die Trennung
 *   "was faellt" von "was ist drin" macht die Aussage moeglich.
 *
 * WAS DIESE DATEI NICHT WEISS:
 *   Prime Resurgence. Varzia verkauft jeden Monat eine wechselnde Auswahl
 *   gevaulteter Relikte fuer Aya, und DEs Droptabellen fuehren dieses Angebot
 *   nicht. "Vaulted" heisst hier deshalb praezise: FAELLT NIRGENDWO. Ob es
 *   diesen Monat bei Varzia liegt, ist eine andere Frage, und sie wird hier
 *   nicht beantwortet - die Oberflaeche sagt es dazu.
 *
 *   Ebenso wenig zaehlt Handel. Ein gevaultetes Teil ist auf warframe.market
 *   jederzeit zu haben; deshalb steht neben dem Hinweis der Preis.
 */
import { isRawMaterial } from './recipes.js';

/** Ein Prime-Item erkennt man am Namen - DE haelt sich daran ausnahmslos. */
export const isPrime = name => /\bPrime\b/.test(String(name || ''));

/**
 * Was aus den lebenden Relikten herausfallen kann.
 *
 * Die vier Politur-Stufen fuehren dieselben Belohnungen mit anderen Chancen -
 * fuer die Frage "ueberhaupt erreichbar" reicht deshalb eine beliebige.
 *
 * @param dropIdx   Ergebnis von loadDropTables() - liefert liveRelics
 * @param relicIdx  Ergebnis von loadRelicTables() - liefert die Inhalte
 */
export function buildVaultIndex(dropIdx, relicIdx) {
  const live = dropIdx?.liveRelics instanceof Set ? dropIdx.liveRelics : new Set();
  const obtainable = new Set();

  for (const key of live) {
    const relic = relicIdx?.byKey?.get(key);
    if (!relic) continue;
    for (const rewards of Object.values(relic.states || {})) {
      for (const r of rewards || []) if (r?.itemName) obtainable.add(r.itemName);
    }
  }

  return {
    liveRelics: live,
    obtainable,
    /* Fuer die Oberflaeche: ohne Droptabellen ist JEDES Set "gevaultet", und
       das waere eine Luege statt einer fehlenden Angabe. */
    usable: live.size > 0 && obtainable.size > 0
  };
}

/**
 * Faellt dieses Teil gerade irgendwo?
 *
 * Der Zusatz " Blueprint" ist kein Rateversuch, sondern DEs Schreibweise:
 * Warframe-Komponenten liegen als Blaupause im Relikt ("Mesa Prime Neuroptics
 * Blueprint"), Waffenteile unter ihrem blanken Namen ("Braton Prime Barrel").
 * relics.js macht bei der umgekehrten Suche denselben Schritt.
 */
const dropsNow = (idx, name) =>
  !!name && (idx.obtainable.has(name) || idx.obtainable.has(`${name} Blueprint`));

/**
 * Dasselbe fuer EIN einzelnes Teil, ohne den Umweg ueber das Set.
 *
 * vaultStatus() beantwortet "kann ich dieses Set noch farmen" und braucht
 * dafuer ein Rezept. Vor Baro steht die kleinere Frage: dieses eine Teil in
 * meinem Bestand - bekomme ich es wieder, wenn ich es einschmelze?
 *
 * @returns true / false, oder null wenn die Tabellen fehlen und die Frage
 *          damit unbeantwortbar ist. Ein "false" waere dort eine Behauptung.
 */
export function partDropsNow(idx, name) {
  if (!idx?.usable) return null;
  return dropsNow(idx, name);
}

/**
 * Vault-Status eines Katalog-Items.
 *
 * @returns null, wenn die Frage sich nicht stellt (kein Prime, kein Rezept,
 *          keine brauchbaren Tabellen) - sonst { vaulted, have, total, missing }
 */
export function vaultStatus(uniqueName, catalog, idx) {
  if (!idx?.usable || !catalog) return null;

  const item = catalog.byUniqueName?.get(uniqueName);
  if (!item || !isPrime(item.name)) return null;

  const recipe = catalog.recipeFor?.get(uniqueName);
  if (!recipe) return null;

  /* Die Teile eines Sets: das Ding selbst (seine Blaupause) und die Zutaten,
     die keine Rohstoffe sind. Die zehn Orokin-Zellen im Braton Prime bleiben
     aussen vor - sie fallen ueberall, nur nicht aus einem Relikt, und wuerden
     jedes einzelne Set als gevaultet melden. */
  const parts = [{ name: item.name, uniqueName }];
  for (const ing of recipe.ingredients || []) {
    if (isRawMaterial(ing.ItemType)) continue;
    const sub = catalog.byUniqueName?.get(ing.ItemType);
    parts.push({ name: sub?.name || null, uniqueName: ing.ItemType });
  }

  const missing = parts.filter(p => !dropsNow(idx, p.name));

  return {
    vaulted: missing.length > 0,
    have: parts.length - missing.length,
    total: parts.length,
    missing: missing.map(p => p.name).filter(Boolean)
  };
}
