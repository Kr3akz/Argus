/**
 * Baros Angebot gegen das eigene Inventar.
 *
 * DIE FRAGE:
 *   Baro steht zwei von vierzehn Tagen in einem Relais und bringt jedes Mal
 *   dreizehn bis zwanzig Posten mit. Die Haelfte davon hat man laengst - nur
 *   sieht man das im Spiel nicht: seine Liste sagt Preis und Namen, nicht
 *   Besitz. Wer nachsehen will, verlaesst den Haendler, geht in den Arsenal-
 *   Mod-Bildschirm und sucht von Hand. Hier steht es daneben.
 *
 * DER ABGLEICH LAEUFT UEBER PFADE, NICHT UEBER NAMEN:
 *   Die Weltzustandsquelle liefert zu jedem Posten seinen uniqueName. Namen
 *   waeren die schlechtere Kupplung - DE schreibt "Prime Revenant Cape" im
 *   Laden und "Revenant Prime Cape" im Inventar, und bei Kosmetik gibt es
 *   ueberhaupt keinen Export, an dem man Namen aufloesen koennte.
 *
 * DER EINE HAKEN: /StoreItems/
 *   Im Laden heisst dieselbe Karte
 *     /Lotus/StoreItems/Upgrades/Mods/Melee/PrimedFever
 *   im Inventar aber
 *     /Lotus/Upgrades/Mods/Melee/PrimedFever
 *   Das Segment faellt deshalb auf BEIDEN Seiten weg, bevor verglichen wird.
 *   Es steckt je nach Warengruppe an unterschiedlicher Stelle im Pfad
 *   (/Lotus/StoreItems/... und /Lotus/Types/StoreItems/...) - daher wird es
 *   als Segment entfernt und nicht als Praefix abgeschnitten.
 *
 * WAS HIER NICHT BEANTWORTET WIRD:
 *   Was Baro beim NAECHSTEN Mal mitbringt. DE veroeffentlicht das Angebot
 *   erst, wenn er im Relais steht; vorher ist die Liste leer, und eine
 *   geratene waere schlimmer als keine. Solange er unterwegs ist, zeigt die
 *   Oberflaeche den Stand seines letzten Besuchs - als das, was er ist.
 */
import { imageUrl } from './catalog.js';
import { classify } from './classify.js';

/* Reihenfolge zaehlt: die erste passende Regel gewinnt. Mods stehen vor
   Kosmetik, weil Mod-Pfade unter /Upgrades/ liegen und Skins auch. */
const KIND_RULES = [
  [/\/Upgrades\/Mods\//i,                                   'mod'],
  [/\/Powersuits\//i,                                       'warframe'],
  [/\/Weapons\//i,                                          'weapon'],
  [/\/Upgrades\/(Skins|CosmeticEnhancers)\//i,              'cosmetic'],
  [/\/(Scarves|Sigils|ShipDecorations|ShipDecos|AvatarImages|Emotes|Palettes)\//i, 'cosmetic'],
  [/\/Types\/Items\/ShipDecos\//i,                          'cosmetic'],
  [/\/Types\/Recipes\//i,                                   'blueprint'],
  [/\/Types\/Items\//i,                                     'resource']
];

export const KIND_LABELS = {
  mod: 'Mod',
  weapon: 'Weapon',
  warframe: 'Warframe',
  cosmetic: 'Cosmetic',
  blueprint: 'Blueprint',
  resource: 'Item',
  other: 'Item'
};

/** Ladenpfad -> Inventarpfad. Siehe Kopfkommentar. */
export function normalizeStorePath(uniqueName) {
  return String(uniqueName || '').replace(/\/StoreItems(?=\/)/gi, '');
}

function kindOf(uniqueName) {
  for (const [re, kind] of KIND_RULES) if (re.test(uniqueName)) return kind;
  return 'other';
}

/* Jedes Feld des Inventars, das Besitz ausdrueckt. Bewusst als Liste und
   nicht "alles, was ein Array ist": Missions, Wishlist und DeathMarks tragen
   ebenfalls ItemType-Felder und wuerden Dinge als besessen melden, die man
   nur einmal gesehen hat. */
const OWNED_FIELDS = [
  'Suits', 'LongGuns', 'Pistols', 'Melee', 'SpecialItems',
  'SpaceSuits', 'SpaceGuns', 'SpaceMelee', 'MechSuits',
  'Sentinels', 'SentinelWeapons', 'KubrowPets', 'Hoverboards', 'OperatorAmps',
  'RawUpgrades', 'Upgrades',
  'WeaponSkins', 'FlavourItems', 'ShipDecorations', 'Ships', 'EquippedEmotes',
  'Consumables', 'MiscItems', 'QuestKeys', 'LevelKeys', 'DataKnives', 'Drones'
];

/**
 * Was man hat - als Menge normalisierter Pfade.
 *
 * `Recipes` steht getrennt: eine Blaupause im Schrank ist kein gebautes Item.
 * Fuer den Einkaufszettel zaehlt sie trotzdem (man braucht sie nicht zweimal),
 * aber sie wird als solche ausgewiesen.
 */
export function ownedIndex(inventory, catalog = null) {
  const owned = new Set();
  const asBlueprint = new Set();
  if (!inventory) return { owned, asBlueprint, usable: false };

  for (const field of OWNED_FIELDS) {
    for (const row of inventory[field] || []) {
      if (row?.ItemType) owned.add(normalizeStorePath(row.ItemType));
    }
  }

  for (const row of inventory.Recipes || []) {
    if (!row?.ItemType) continue;
    const path = normalizeStorePath(row.ItemType);
    asBlueprint.add(path);
    /* Die Blaupause traegt einen anderen Pfad als ihr Ergebnis. Ueber das
       Rezept kommt man an das Item, unter dem Baro es verkauft. */
    const result = catalog?.recipeByUniqueName?.get(row.ItemType)?.resultType;
    if (result) asBlueprint.add(normalizeStorePath(result));
  }

  /* Auch fertig gebaute Items decken ihre Blaupause ab: wer die Waffe hat,
     braucht den Bauplan nicht mehr. */
  if (catalog?.recipeFor) {
    for (const path of [...owned]) {
      const recipe = catalog.recipeFor.get(path);
      if (recipe?.uniqueName) owned.add(normalizeStorePath(recipe.uniqueName));
    }
  }

  return { owned, asBlueprint, usable: true };
}

/**
 * Baros Angebot, Posten fuer Posten mit Besitzstand.
 *
 * @param trader     voidTrader aus dem Weltzustand (oder ein gespeicherter
 *                   Stand eines frueheren Besuchs)
 * @param inventory  der Inventarabzug; fehlt er, bleibt `owned` ueberall null
 * @param catalog    fuer Namen, Bilder und den Blaupausen-Abgleich
 * @param xpMap      optional - macht aus "fehlt" ein "fehlt, und es waere
 *                   neue Mastery"
 */
export function buildBaroOffer(trader, { inventory = null, catalog = null, xpMap = null } = {}) {
  const idx = ownedIndex(inventory, catalog);
  const raw = trader?.inventory || [];

  const items = raw.map(entry => {
    const storePath = entry.uniqueName || '';
    const path = normalizeStorePath(storePath);
    const catItem = catalog?.byUniqueName?.get(path) || null;

    const hasIt = idx.usable ? idx.owned.has(path) : null;
    const hasBlueprint = idx.usable ? idx.asBlueprint.has(path) : null;

    /* Mastery nur dort behaupten, wo sie zu holen ist: das Item muss Mastery
       GEBEN (ein Primed Mod gibt keine) und darf noch keine Affinity haben.
       Ohne XP-Karte bleibt es null - der Zettel sagt dann nichts ueber
       Mastery, statt jeden Posten als neue Punkte auszugeben. */
    const givesMastery = !!catItem && classify(catItem).countsForMastery;
    const neverLeveled = xpMap ? !xpMap.has(path) : null;

    return {
      uniqueName: path,
      storePath,
      /* DEs eigener Anzeigename vor dem der Weltzustandsquelle: die schreibt
         den Pfad auseinander ("Prime A Furis Weapon"), wo der Katalog
         "Afuris Prime" kennt - und genau so steht es im Rest der App. */
      name: catItem?.name || entry.item || path.split('/').pop(),
      image: catItem ? imageUrl(path, 128) : null,
      ducats: entry.ducats || 0,
      credits: entry.credits || 0,
      kind: kindOf(path),
      owned: hasIt,
      /* Nur melden, wenn es die Antwort AENDERT - "Blaupause vorhanden" neben
         einem Haken waere Rauschen. */
      blueprintOnly: hasIt === false && hasBlueprint === true,
      newMastery: hasIt === false && neverLeveled === true && givesMastery,
      resolved: !!catItem
    };
  });

  /* Fehlendes zuerst - das ist der Zettel. Innerhalb dessen das Teure oben:
     wer nicht alles kaufen kann, entscheidet zuerst darueber. */
  const order = { mod: 0, weapon: 1, warframe: 2, blueprint: 3, cosmetic: 4, resource: 5, other: 6 };
  items.sort((a, b) =>
    (a.owned === b.owned ? 0 : a.owned ? 1 : -1) ||
    (order[a.kind] ?? 9) - (order[b.kind] ?? 9) ||
    b.ducats - a.ducats ||
    a.name.localeCompare(b.name, 'en'));

  const missing = items.filter(i => i.owned === false);
  const stock = {
    ducats: ducatStock(inventory),
    credits: inventory?.RegularCredits ?? null
  };
  const cost = {
    ducats: missing.reduce((s, i) => s + i.ducats, 0),
    credits: missing.reduce((s, i) => s + i.credits, 0)
  };

  return {
    character: trader?.character || "Baro Ki'Teer",
    location: trader?.location || null,
    active: !!trader?.active,
    activation: trader?.activation || null,
    expiry: trader?.expiry || null,
    items,
    stock,
    cost,
    summary: {
      total: items.length,
      owned: items.filter(i => i.owned === true).length,
      missing: missing.length,
      newMastery: items.filter(i => i.newMastery).length,
      /* Reicht der Bestand fuer alles Fehlende? Beide Waehrungen muessen
         stimmen - an Credits ist selten jemand gescheitert, an Dukaten
         staendig. */
      shortDucats: stock.ducats == null ? null : Math.max(0, cost.ducats - stock.ducats),
      shortCredits: stock.credits == null ? null : Math.max(0, cost.credits - stock.credits)
    },
    /* Ob ueberhaupt abgeglichen werden konnte - ohne Inventar ist die Liste
       ein Angebot, kein Einkaufszettel. */
    matched: idx.usable
  };
}

/** Dukatenbestand. Steht als MiscItem im Inventar, nicht als eigenes Feld. */
function ducatStock(inventory) {
  const row = (inventory?.MiscItems || []).find(e =>
    typeof e.ItemType === 'string' && e.ItemType.split('/').pop() === 'PrimeBucks');
  return inventory ? (row?.ItemCount ?? 0) : null;
}
