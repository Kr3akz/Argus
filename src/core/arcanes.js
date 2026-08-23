/**
 * Arcanes fuer das Build-Brett.
 *
 * WARUM EIN EIGENES MODUL UND NICHT mods.js:
 *   Arcanes sind keine Mods. Sie stehen in einer anderen Export-Datei
 *   (ExportRelicArcane statt ExportUpgrades), kosten keine Kapazitaet, tragen
 *   keine Polaritaet und werden nicht mit Endo aufgewertet, sondern mit
 *   weiteren Exemplaren ihrer selbst verschmolzen. Gemeinsam haben sie mit
 *   einer Mod nur den Rang - und den zaehlt das Inventar auf demselben Weg.
 *
 * WOHER DIE DATEN KOMMEN:
 *   Der Katalog laedt ExportRelicArcane bereits mit, legt die Eintraege aber
 *   NICHT in `items` ab (dort rechnet analyze.js die Mastery aus, und Arcanes
 *   geben keine). Sie liegen in `catalog.lookup` - von dort holt dieses Modul
 *   sie sich.
 */

const ARCANE_PATH = '/CosmeticEnhancers/';

export const isArcaneName = u => String(u || '').includes(ARCANE_PATH) && !String(u || '').includes('/Peculiars/');

/* DE fuehrt in den Export-Dateien einige unvollstaendige Prototypen aus frueheren
   Entwicklungsphasen (z. B. Scarlet Spear 2020), die nie im Spiel erschienen
   sind und keine Bild-/Drop-Eintraege besitzen. */
export const UNRELEASED_ARCANES = new Set([
  '/Lotus/Upgrades/CosmeticEnhancers/Defensive/CorrosiveProcResist',
  '/Lotus/Upgrades/CosmeticEnhancers/Defensive/GasProcResist',
  '/Lotus/Upgrades/CosmeticEnhancers/Defensive/ImpactProcResist',
  '/Lotus/Upgrades/CosmeticEnhancers/Defensive/PoisonProcResist',
  '/Lotus/Upgrades/CosmeticEnhancers/Defensive/PunctureProcResist',
  '/Lotus/Upgrades/CosmeticEnhancers/Utility/DamageReductionDuringRevive',
  '/Lotus/Upgrades/CosmeticEnhancers/Utility/SlowerBleedOutOnPredeath'
]);

export const isInternalArcane = u => /Ability\d+Listener$/.test(String(u || '')) || UNRELEASED_ARCANES.has(String(u || ''));

/**
 * Wie viele Arcane-Plaetze ein Item hat - so, wie das Arsenal sie zeigt.
 *
 * Was hier fehlt, hat keine: Begleiter, Archwings und Sentinel-Waffen tragen
 * keine Arcanes. Waffen brauchen im Spiel zusaetzlich einen Arcane-Adapter;
 * das ist eine Freischaltung am Item und keine Eigenschaft des Builds, deshalb
 * steht sie hier nicht.
 */
export const ARCANE_SLOTS = {
  Suits:     2,
  MechSuits: 2,
  LongGuns:  1,
  Pistols:   1,
  Melee:     1,
  AmpPrism:  1,
  /* Zaws und Kitguns klassifizieren wir ueber ihre Kernkomponente (classify.js),
     tragen aber dieselben Arcanes wie die Waffenklasse, zu der sie werden. */
  ZawStrike:     1,
  KitgunChamber: 1
};

export const arcaneSlotCount = category => ARCANE_SLOTS[category] || 0;

/**
 * Worauf ein Arcane gehoert - abgelesen am NAMEN, nicht am Pfad.
 *
 * Der Pfad taugt dafuer nicht: "Melee Influence" und "Arcane Guardian" liegen
 * beide unter Offensive bzw. Defensive. Die Namen dagegen sind bei DE streng
 * durchgehalten - ein Waffen-Arcane heisst "Primary …", "Secondary …" oder
 * "Melee …", ein Zaw-Arcane "Exodia …", ein Kitgun-Arcane "Pax …".
 *
 * Das ist eine Heuristik, und sie darf es sein: sie ENTSCHEIDET nichts, sie
 * sortiert nur die Suche. Wer ein Arcane sucht, das hier falsch einsortiert
 * ist, findet es trotzdem - es steht dann eben weiter unten.
 *
 * `null` heisst "passt ueberall".
 */
const PREFIX_CATEGORY = {
  Primary: 'LongGuns', Longbow: 'LongGuns', Shotgun: 'LongGuns',
  Secondary: 'Pistols', Akimbo: 'Pistols',  Pax: 'Pistols',
  Melee: 'Melee',       Exodia: 'Melee',
  Virtuos: 'AmpPrism',
  Magus: 'Operator',    'Zid-An': 'Operator', // Operator - kein Build-Item
  Peculiar: null
};

/* Zaw und Kitgun werden zu Nahkampf- bzw. Sekundaerwaffe - fuer die Suche
   zaehlt, was sie im Arsenal sind. */
const CATEGORY_ALIAS = { ZawStrike: 'Melee', KitgunChamber: 'Pistols' };

export function arcaneCategory(name) {
  const prefix = String(name || '').split(' ')[0];
  return prefix in PREFIX_CATEGORY ? PREFIX_CATEGORY[prefix] : 'Suits';
}

/** Hoechster Rang, den ein Arcane erreichen kann. levelStats fuehrt Rang 0 mit. */
export const maxArcaneRank = a => Math.max(0, (a?.levelStats?.length || 1) - 1);

/**
 * Exemplare, die ein Arcane bis zu diesem Rang schluckt.
 *
 * Arcanes werden nicht mit Endo aufgewertet, sondern miteinander verschmolzen:
 * Rang 1 kostet zwei Karten, Rang 2 drei weitere, und so fort - in Summe die
 * Dreieckszahl, also die bekannten 21 Stueck fuer Rang 5.
 */
export const arcaneCopies = rank => ((rank + 1) * (rank + 2)) / 2;

/**
 * Der Arcane-Index aus dem geladenen Katalog.
 *
 * Gleiche Form wie loadMods(): { arcanes, byUniqueName }. So kann builds.js
 * beide gleich behandeln.
 */
export function indexArcanes(catalog) {
  const arcanes = (catalog?.lookup || [])
    .filter(a => a.uniqueName && a.name && isArcaneName(a.uniqueName) && !isInternalArcane(a.uniqueName));

  const byUniqueName = new Map();
  for (const a of arcanes) byUniqueName.set(a.uniqueName, a);

  return { arcanes, byUniqueName };
}

/**
 * Freitextsuche. Ohne Suchwort kommt die ganze Liste - die Auswahl im Editor
 * beginnt naemlich nicht mit einem leeren Feld, sondern mit dem, was passt.
 *
 * Sortierung in drei Stufen: passende Kategorie zuerst, dann Treffer am
 * Wortanfang, dann alphabetisch.
 */
export function searchArcanes(index, query, { category = null, limit = 60 } = {}) {
  const q = String(query || '').toLowerCase().trim();
  const want = CATEGORY_ALIAS[category] || category;

  const hits = index.arcanes.filter(a => !q || a.name.toLowerCase().includes(q));

  const fits = a => {
    const cat = arcaneCategory(a.name);
    return cat === null || cat === want;
  };

  return hits
    .slice()
    .sort((a, b) => {
      const fa = fits(a) ? 0 : 1, fb = fits(b) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      if (q) {
        const sa = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const sb = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (sa !== sb) return sa - sb;
      }
      return a.name.localeCompare(b.name, 'en');
    })
    .slice(0, limit);
}
