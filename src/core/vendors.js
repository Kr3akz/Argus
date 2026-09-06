/**
 * Haendler-Angebote: was ein Update bei seinem Haendler fuehrt - und was davon
 * schon im Schrank liegt.
 *
 * DIE FRAGE:
 *   Seit Citrine haengt fast jedes Update seinen Warframe und dessen Waffen an
 *   einen eigenen Haendler mit eigener Waehrung. Otak nimmt Kristallsplitter,
 *   Zorba Atramentum, der Schrein Schicksalsperlen. Im Spiel steht dort eine
 *   Liste mit Preisen - aber nicht, was man davon laengst hat. Wer nachsehen
 *   will, verlaesst den Haendler und sucht im Arsenal. Hier steht es daneben,
 *   und darunter die Summe fuer den Rest.
 *
 * WARUM DIESE TABELLE VON HAND GEPFLEGT IST:
 *   DEs PublicExport kennt keine Haendler. Die Droptabellen kennen sie auch
 *   nicht - ein Ladenposten faellt nirgends, also fuehrt DE ihn nicht. Es gibt
 *   keine Quelle, aus der sich das ableiten liesse; es gibt nur das Wiki.
 *
 * DIE ZAHLEN SIND ABGESCHRIEBEN, NICHT ERINNERT.
 *   Jede Zeile stammt aus der Warenliste der jeweiligen Wiki-Seite
 *   (wiki.warframe.com, action=parse ueber die API), Stand September 2026.
 *   Wer hier etwas aendert: erst nachsehen, dann tippen. tools/check-vendor-wares.mjs
 *   holt die Listen erneut und meldet jede Abweichung - Preis, Posten, Rang.
 *
 * WAS BEWUSST NICHT DRINSTEHT:
 *   - Kosmetik: Prex-Karten, Glyphen, Captura-Szenen, Dekor. Sie kosten
 *     dieselbe Waehrung, aber Argus kann zu ihnen nichts sagen, was der Laden
 *     nicht schon sagt.
 *   - Mods und Arcanes derselben Haendler. Sie gehoeren zur selben Frage,
 *     haengen aber am Mod-Bestand statt am Katalog; das ist ein eigener Schritt.
 *   - Die Syndikate (Steel Meridian und die anderen fuenf), Simaris und die
 *     modularen Haendler (Hok, Rude Zuud, Legs, Son). Ihre Waffen zaehlen fuer
 *     Mastery, aber ihr Angebot ist anders gebaut - Bauteile statt Bauplaene.
 *   - Baro: der hat einen eigenen Zettel im Dukaten-Reiter, weil sein Angebot
 *     alle zwei Wochen wechselt und aus dem Weltzustand kommt.
 *
 * EIN LADEN, KEIN HAENDLER:
 *   Aufgeteilt wird nach ANGEBOT, nicht nach Person. Acrithis fuehrt zwei
 *   getrennte Sortimente mit zwei Waehrungen - Kullervo gegen Kullervo's Bane,
 *   Oraxia gegen Scuttler Husk. Als eine Kachel waeren das zwei Preislisten
 *   uebereinander; als zwei Kacheln ist es das, wonach jemand sucht.
 */
import { imageUrl } from './catalog.js';
import { ownedIndex } from './baro.js';
import { ownedStock, recipeRow } from './inventory-items.js';
import { resolveGoal, buildNameIndex } from './recipes.js';

/**
 * Die Laeden.
 *
 * key        stabiler Schluessel fuer die Oberflaeche
 * title      wonach jemand sucht - der Warframe, nicht der Verkaeufer
 * vendor     wer hinter dem Tresen steht
 * location   wo er steht, in Spielsprache
 * currency   eine Waehrung, oder zwei mit `pay`
 * pay        'both'   beide Waehrungen zusammen (Otak nimmt beide Splitter)
 *            'either' eine von beiden genuegt (Hunhow, je nach Seite)
 * standing   Syndikats-Tag, wo mit Ansehen bezahlt wird. Sonderwaehrungen
 *            brauchen das nicht: sie liegen als Ressource im Inventar und
 *            werden ueber ihren Namen im Katalog gefunden.
 * earnedFrom woher die Waehrung kommt - ohne das ist ein Preis nur eine Zahl
 * gate       was vorher erledigt sein muss, sonst steht der Laden gar nicht da
 * hero       Item, dessen Bild auf der Kachel steht
 * wiki       Seite, aus der die Liste stammt (auch fuer den Pruefer)
 * wares      ein Eintrag je Kaufposten. Ohne `part` ist es der Hauptbauplan.
 */
export const SHOPS = [
  {
    key: 'citrine',
    title: 'Citrine',
    vendor: 'Otak',
    location: 'Necralisk, Deimos',
    currency: ['Belric Crystal Fragment', 'Rania Crystal Fragment'],
    pay: 'both',
    earnedFrom: 'Mirror Defense at Tyana Pass on Mars',
    gate: 'Heart of Deimos',
    hero: 'Citrine',
    wiki: 'Otak',
    note: 'Only the Prex card and the captura scene are exclusive to Otak — everything else also drops in Mirror Defense.',
    wares: [
      { item: 'Citrine', c: [500, 500] },
      { item: 'Citrine', part: 'Neuroptics', c: [350, 350] },
      { item: 'Citrine', part: 'Chassis', c: [350, 350] },
      { item: 'Citrine', part: 'Systems', c: [300, 350] },
      { item: 'Corufell', c: [300, 500] },
      { item: 'Corufell', part: 'Barrel', c: [150, 250] },
      { item: 'Corufell', part: 'Receiver', c: [150, 250] },
      { item: 'Corufell', part: 'Handle', c: [150, 250] },
      { item: 'Steflos', c: [500, 300] },
      { item: 'Steflos', part: 'Barrel', c: [250, 150] },
      { item: 'Steflos', part: 'Receiver', c: [250, 150] },
      { item: 'Steflos', part: 'Stock', c: [250, 150] }
    ]
  },
  {
    key: 'oraxia',
    title: 'Oraxia',
    vendor: 'Acrithis',
    location: 'Dormizone, Duviri',
    currency: 'Scuttler Husk',
    earnedFrom: 'Defeating Oraxia in Isleweaver missions (Duviri)',
    gate: 'The Duviri Paradox',
    hero: 'Oraxia',
    wiki: 'Acrithis',
    wares: [
      { item: 'Oraxia', c: [60] },
      { item: 'Oraxia', part: 'Neuroptics', c: [20] },
      { item: 'Oraxia', part: 'Chassis', c: [20] },
      { item: 'Oraxia', part: 'Systems', c: [20] },
      { item: 'Scyotid', c: [48] },
      { item: 'Scyotid', part: 'Barrel', c: [12] },
      { item: 'Scyotid', part: 'Gauntlet', c: [12] },
      { item: 'Spinnerex', c: [48] },
      { item: 'Spinnerex', part: 'Blade', c: [16] },
      { item: 'Spinnerex', part: 'Handle', c: [16] },
      { item: 'Spinnerex', part: 'String', c: [16] },
      { item: 'Thalys', c: [96] }
    ]
  },
  {
    key: 'kullervo',
    title: 'Kullervo',
    vendor: 'Acrithis',
    location: 'Dormizone, Duviri',
    currency: "Kullervo's Bane",
    earnedFrom: 'Confronting Kullervo and beating the Orowyrm in the same Duviri run',
    gate: 'The Duviri Paradox',
    hero: 'Kullervo',
    wiki: 'Acrithis',
    wares: [
      { item: 'Kullervo', c: [15] },
      { item: 'Kullervo', part: 'Neuroptics', c: [9] },
      { item: 'Kullervo', part: 'Chassis', c: [9] },
      { item: 'Kullervo', part: 'Systems', c: [9] },
      { item: 'Rauta', c: [12] },
      { item: 'Rauta', part: 'Barrel', c: [6] },
      { item: 'Rauta', part: 'Receiver', c: [6] },
      { item: 'Rauta', part: 'Stock', c: [6] }
    ]
  },
  {
    key: 'follie',
    title: 'Follie',
    vendor: 'Aspirant Zorba',
    location: 'Any relay, outside the Arbiters of Hexis room',
    currency: 'Atramentum',
    earnedFrom: "Follie's Hunt missions and the Atramentum balloons in them",
    gate: null,
    hero: 'Follie',
    wiki: 'Aspirant Zorba',
    wares: [
      { item: 'Follie', c: [1200] },
      { item: 'Follie', part: 'Neuroptics', c: [400] },
      { item: 'Follie', part: 'Chassis', c: [400] },
      { item: 'Follie', part: 'Systems', c: [400] },
      { item: 'Enkaus', c: [1200] },
      { item: 'Enkaus', part: 'Barrel', c: [400] },
      { item: 'Enkaus', part: 'Receiver', c: [400] },
      { item: 'Enkaus', part: 'Stock', c: [400] }
    ]
  },
  {
    key: 'jade',
    title: 'Jade',
    vendor: 'Ordis',
    location: "Drifter's Camp",
    currency: 'Vestigial Motes',
    earnedFrom: 'Ascension missions on Brutus, Uranus',
    gate: 'Jade Shadows',
    hero: 'Jade',
    wiki: 'Ordis (Vendor)',
    note: 'Ordis also ran an event store on Volatile Motes — that one was time-limited and is not listed here.',
    wares: [
      { item: 'Jade', c: [450] },
      { item: 'Jade', part: 'Neuroptics', c: [150] },
      { item: 'Jade', part: 'Chassis', c: [150] },
      { item: 'Jade', part: 'Systems', c: [150] },
      { item: 'Harmony', c: [300] },
      { item: 'Cantare', c: [300] },
      { item: 'Evensong', c: [300] }
    ]
  },
  {
    key: 'koumei',
    title: 'Koumei',
    vendor: "Koumei's Shrine",
    location: 'At the entrance of Cetus',
    currency: 'Fate Pearl',
    earnedFrom: 'Shrine Defense',
    gate: null,
    hero: 'Koumei',
    wiki: "Koumei's Shrine",
    wares: [
      { item: 'Koumei', c: [165] },
      { item: 'Koumei', part: 'Neuroptics', c: [55] },
      { item: 'Koumei', part: 'Chassis', c: [55] },
      { item: 'Koumei', part: 'Systems', c: [55] },
      { item: 'Higasa', c: [135] },
      { item: 'Higasa', part: 'Barrel', c: [45] },
      { item: 'Higasa', part: 'Receiver', c: [45] },
      { item: 'Higasa', part: 'Stock', c: [45] },
      { item: 'Amanata', c: [135] },
      { item: 'Amanata', part: 'Blade', c: [45] },
      { item: 'Amanata', part: 'Handle', c: [45] }
    ]
  },
  {
    key: 'qorvex',
    title: 'Qorvex',
    vendor: 'Bird 3',
    location: 'Sanctum Anatomica, Deimos',
    currency: 'Cavia standing',
    standing: 'EntratiLabSyndicate',
    earnedFrom: "Albrecht's Laboratories bounties and Netracells",
    gate: 'Whispers in the Walls',
    hero: 'Qorvex',
    wiki: 'Bird 3',
    wares: [
      { item: 'Qorvex', c: [50000] },
      { item: 'Qorvex', part: 'Neuroptics', c: [20000] },
      { item: 'Qorvex', part: 'Chassis', c: [20000] },
      { item: 'Qorvex', part: 'Systems', c: [20000] },
      { item: 'Grimoire', c: [50000] },
      { item: 'Ekhein', c: [15000] }
    ]
  },
  {
    key: 'styanax',
    title: 'Styanax',
    vendor: 'Chipper',
    location: "Kahl's Garrison, Drifter's Camp",
    currency: 'Stock',
    earnedFrom: "Break Narmer bonus challenges — 105 Stock a week, resetting Monday",
    gate: 'Veilbreaker',
    hero: 'Styanax',
    wiki: 'Chipper',
    note: 'Chipper takes Stock, not standing — the ranks below are Kahl’s Garrison ranks.',
    wares: [
      { item: 'Styanax', c: [90], rank: 'Rank 5: Home' },
      { item: 'Styanax', part: 'Neuroptics', c: [60], rank: 'Rank 3: Fort' },
      { item: 'Styanax', part: 'Chassis', c: [60], rank: 'Rank 4: Settlement' },
      { item: 'Styanax', part: 'Systems', c: [60], rank: 'Rank 2: Encampment' },
      { item: 'Afentis', c: [60], rank: 'Rank 5: Home' },
      { item: 'Aegrit', c: [30], rank: 'Rank 4: Settlement' },
      { item: 'Slaytra', c: [30], rank: 'Rank 2: Encampment' }
    ]
  },
  {
    key: 'temple',
    title: 'Temple',
    vendor: 'Flare',
    location: 'Höllvania, The Hex',
    currency: 'Beating Heartstrings',
    earnedFrom: 'Stage Defense at Solstice Square, Höllvania',
    gate: 'The Hex — Rank 4: Hot & Fresh',
    hero: 'Temple',
    wiki: 'Flare',
    wares: [
      { item: 'Temple', c: [195] },
      { item: 'Temple', part: 'Neuroptics', c: [65] },
      { item: 'Temple', part: 'Chassis', c: [65] },
      { item: 'Temple', part: 'Systems', c: [65] },
      { item: 'Riot-848', c: [120] },
      { item: 'Riot-848', part: 'Barrel', c: [60] },
      { item: 'Riot-848', part: 'Receiver', c: [60] },
      { item: 'Riot-848', part: 'Stock', c: [60] }
    ]
  },
  {
    key: 'cyte09',
    title: 'Cyte-09',
    vendor: 'Amir',
    location: 'Höllvania, The Hex',
    currency: 'Hex standing',
    standing: 'HexSyndicate',
    earnedFrom: 'Höllvania bounties and Hex syndicate work',
    gate: 'The Hex',
    hero: 'Cyte-09',
    wiki: 'Amir',
    wares: [
      { item: 'Cyte-09', c: [50000], rank: 'Rank 4: Hot & Fresh' },
      { item: 'Cyte-09', part: 'Neuroptics', c: [20000], rank: 'Rank 2: Fresh Slice' },
      { item: 'Cyte-09', part: 'Chassis', c: [20000], rank: 'Rank 2: Fresh Slice' },
      { item: 'Cyte-09', part: 'Systems', c: [20000], rank: 'Rank 2: Fresh Slice' },
      { item: 'AX-52', c: [30000], rank: 'Rank 4: Hot & Fresh' },
      { item: 'Vesper 77', c: [15000] },
      { item: 'Vesper 77', part: 'Barrel', c: [5000] },
      { item: 'Vesper 77', part: 'Receiver', c: [5000] },
      { item: 'Vesper 77', part: 'Handle', c: [5000] },
      { item: 'Reconifex', c: [15000], rank: 'Rank 4: Hot & Fresh' },
      { item: 'Reconifex', part: 'Barrel', c: [5000], rank: 'Rank 4: Hot & Fresh' },
      { item: 'Reconifex', part: 'Receiver', c: [5000], rank: 'Rank 4: Hot & Fresh' },
      { item: 'Reconifex', part: 'Stock', c: [5000], rank: 'Rank 4: Hot & Fresh' }
    ]
  },
  {
    key: 'uriel',
    title: 'Uriel',
    vendor: 'Roathe',
    location: 'Necralisk, Deimos — in front of Mother',
    currency: 'Maphica',
    earnedFrom: 'Crates and bosses in the Descendia (Dark Refractory)',
    gate: null,
    hero: 'Uriel',
    wiki: 'Roathe',
    wares: [
      { item: 'Uriel', c: [75] },
      { item: 'Uriel', part: 'Neuroptics', c: [25] },
      { item: 'Uriel', part: 'Chassis', c: [25] },
      { item: 'Uriel', part: 'Systems', c: [25] },
      { item: 'Vinquibus', c: [35] },
      { item: 'Vinquibus', part: 'Barrel', c: [25] },
      { item: 'Vinquibus', part: 'Receiver', c: [25] },
      { item: 'Vinquibus', part: 'Blade', c: [25] },
      { item: 'Vinquibus', part: 'Stock', c: [25] },
      { item: 'Galariak Prime', c: [35] },
      { item: 'Galariak Prime', part: 'Blade', c: [25] },
      { item: 'Galariak Prime', part: 'Handle', c: [25] },
      { item: 'Sagek Prime', c: [35] },
      { item: 'Sagek Prime', part: 'Barrel', c: [25] },
      { item: 'Sagek Prime', part: 'Receiver', c: [25] }
    ]
  },
  {
    key: 'nokko',
    title: 'Nokko',
    vendor: 'Nightcap',
    location: 'Deepmines, beneath the Orb Vallis',
    currency: 'Fergolyte',
    earnedFrom: 'Deepmines bounties',
    gate: null,
    hero: 'Nokko',
    wiki: 'Nightcap',
    wares: [
      { item: 'Nokko', c: [240], rank: 'Rank 4: Gardener' },
      { item: 'Nokko', part: 'Neuroptics', c: [160], rank: 'Rank 4: Gardener' },
      { item: 'Nokko', part: 'Chassis', c: [160], rank: 'Rank 4: Gardener' },
      { item: 'Nokko', part: 'Systems', c: [160], rank: 'Rank 4: Gardener' },
      { item: 'Arbucep', c: [220], rank: 'Rank 3: Seeker' },
      { item: 'Arbucep', part: 'Barrel', c: [150], rank: 'Rank 3: Seeker' },
      { item: 'Arbucep', part: 'Receiver', c: [150], rank: 'Rank 3: Seeker' },
      { item: 'Arbucep', part: 'Stock', c: [150], rank: 'Rank 3: Seeker' }
    ]
  },
  {
    key: 'sirius',
    title: 'Sirius & Orion',
    vendor: 'Hunhow',
    location: 'Pontis Tower',
    currency: ['Emerald Talent', 'Crimson Talent'],
    pay: 'either',
    earnedFrom: 'The Kuva Wytch and Scoria’s Angel on Uranus Proxima (Railjack)',
    gate: 'Jade Shadows: Constellations',
    hero: 'Sirius & Orion',
    wiki: 'Hunhow',
    note: 'Emerald buys Pride, Crimson buys Wrath — the frame takes either.',
    wares: [
      { item: 'Sirius & Orion', c: [275] },
      { item: 'Sirius & Orion', part: 'Neuroptics', c: [90] },
      { item: 'Sirius & Orion', part: 'Chassis', c: [90] },
      { item: 'Sirius & Orion', part: 'Systems', c: [90] },
      { item: 'Pride', c: [90] },
      { item: 'Pride', part: 'Blade', c: [45] },
      { item: 'Pride', part: 'Handle', c: [45] },
      { item: 'Wrath', c: [90] },
      { item: 'Wrath', part: 'Blade', c: [45] },
      { item: 'Wrath', part: 'Handle', c: [45] }
    ]
  },
  {
    key: 'lavos',
    title: 'Lavos & the Deimos arsenal',
    vendor: 'Father',
    location: 'Necralisk, Deimos',
    currency: 'Entrati standing',
    standing: 'EntratiSyndicate',
    earnedFrom: 'Cambion Drift bounties and Entrati tokens',
    gate: 'Heart of Deimos',
    hero: 'Lavos',
    wiki: 'Father',
    wares: [
      { item: 'Lavos', c: [5000] },
      { item: 'Lavos', part: 'Neuroptics', c: [5000] },
      { item: 'Lavos', part: 'Chassis', c: [5000] },
      { item: 'Lavos', part: 'Systems', c: [5000] },
      { item: 'Cedo', c: [5000] },
      { item: 'Cedo', part: 'Barrel', c: [5000] },
      { item: 'Cedo', part: 'Receiver', c: [5000] },
      { item: 'Cedo', part: 'Stock', c: [5000] },
      { item: 'Trumna', c: [5000] },
      { item: 'Trumna', part: 'Barrel', c: [2500] },
      { item: 'Trumna', part: 'Receiver', c: [2500] },
      { item: 'Trumna', part: 'Stock', c: [2500] },
      { item: 'Sepulcrum', c: [4000] },
      { item: 'Sepulcrum', part: 'Barrel', c: [2000] },
      { item: 'Sepulcrum', part: 'Receiver', c: [2000] },
      { item: 'Zymos', c: [2000] },
      { item: 'Zymos', part: 'Barrel', c: [1000] },
      { item: 'Zymos', part: 'Receiver', c: [1000] },
      { item: 'Keratinos', c: [1000] },
      /* Der Laden schreibt "Keratinos Blade", der Katalog "Keratinos Blades" -
         und der Katalog gibt hier den Namen vor, weil an ihm der Abgleich
         haengt. wikiName sagt dem Pruefer, wonach er suchen soll. */
      { item: 'Keratinos', part: 'Blades', c: [500], wikiName: 'Keratinos Blade Blueprint' },
      { item: 'Keratinos', part: 'Gauntlet', c: [500] },
      { item: 'Arcroid', c: [1000] },
      { item: 'Macro Thymoid', c: [1000] },
      { item: 'Macro Arcroid', c: [500] },
      { item: 'Thymoid', c: [500] },
      { item: 'Vermisplicer', c: [500] },
      { item: 'Sporelacer', c: [500] },
      { item: 'Palmaris', c: [500] },
      { item: 'Ulnaris', c: [500] }
    ]
  },
  {
    key: 'baruuk',
    title: 'Baruuk & Hildryn',
    vendor: 'Little Duck',
    location: 'Fortuna backroom, Venus',
    currency: 'Vox Solaris standing',
    standing: 'VoxSyndicate',
    earnedFrom: 'Toroids and Vox Solaris work on the Orb Vallis',
    gate: 'Vox Solaris',
    hero: 'Baruuk',
    wiki: 'Little Duck',
    note: 'The amp parts here count for mastery only as prisms — scaffolds and braces do not.',
    wares: [
      { item: 'Baruuk', c: [5000], rank: 'Rank 2: Agent' },
      { item: 'Baruuk', part: 'Neuroptics', c: [5000], rank: 'Rank 3: Hand' },
      { item: 'Baruuk', part: 'Chassis', c: [5000], rank: 'Rank 3: Hand' },
      { item: 'Baruuk', part: 'Systems', c: [5000], rank: 'Rank 3: Hand' },
      { item: 'Hildryn', c: [5000], rank: 'Rank 2: Agent' },
      { item: 'Cantic Prism', c: [3000], rank: 'Rank 2: Agent' },
      { item: 'Exard Scaffold', c: [3000], rank: 'Rank 2: Agent' },
      { item: 'Suo Brace', c: [3000], rank: 'Rank 2: Agent' },
      { item: 'Lega Prism', c: [3000], rank: 'Rank 3: Hand' },
      { item: 'Dissic Scaffold', c: [3000], rank: 'Rank 3: Hand' },
      { item: 'Plaga Brace', c: [3000], rank: 'Rank 3: Hand' },
      { item: 'Klamora Prism', c: [3000], rank: 'Rank 4: Instrument' },
      { item: 'Propa Scaffold', c: [3000], rank: 'Rank 4: Instrument' },
      { item: 'Certus Brace', c: [3000], rank: 'Rank 4: Instrument' }
    ]
  },
  {
    key: 'necramech',
    title: 'Necramechs',
    vendor: 'Loid',
    location: 'Necralisk backroom, Deimos',
    currency: 'Necraloid standing',
    standing: 'NecraloidSyndicate',
    earnedFrom: 'Isolation Vaults and Necraloid tokens',
    gate: 'Heart of Deimos',
    hero: 'Voidrig',
    wiki: 'Loid',
    wares: [
      /* Bei Loid heisst der Hauptbauplan "Voidrig Necramech Blueprint" - der
         Katalog kennt den Mech aber als "Voidrig". */
      { item: 'Voidrig', c: [5000], rank: 'Rank 2: Clearance Modus', wikiName: 'Voidrig Necramech Blueprint' },
      { item: 'Voidrig', part: 'Casing', c: [2000], rank: 'Rank 1: Clearance Agnesis' },
      { item: 'Voidrig', part: 'Engine', c: [2000], rank: 'Rank 1: Clearance Agnesis' },
      { item: 'Voidrig', part: 'Capsule', c: [2000], rank: 'Rank 1: Clearance Agnesis' },
      { item: 'Voidrig', part: 'Weapon Pod', c: [2000], rank: 'Rank 1: Clearance Agnesis' },
      { item: 'Bonewidow', c: [10000], rank: 'Rank 3: Clearance Odima' },
      { item: 'Bonewidow', part: 'Casing', c: [3500], rank: 'Rank 2: Clearance Modus' },
      { item: 'Bonewidow', part: 'Engine', c: [3500], rank: 'Rank 2: Clearance Modus' },
      { item: 'Bonewidow', part: 'Capsule', c: [3500], rank: 'Rank 2: Clearance Modus' },
      { item: 'Bonewidow', part: 'Weapon Pod', c: [3500], rank: 'Rank 2: Clearance Modus' },
      { item: 'Cortege', c: [8000], rank: 'Rank 3: Clearance Odima' },
      { item: 'Cortege', part: 'Barrel', c: [4000], rank: 'Rank 2: Clearance Modus' },
      { item: 'Cortege', part: 'Receiver', c: [4000], rank: 'Rank 2: Clearance Modus' },
      { item: 'Cortege', part: 'Stock', c: [4000], rank: 'Rank 2: Clearance Modus' },
      { item: 'Morgha', c: [8000], rank: 'Rank 3: Clearance Odima' },
      { item: 'Morgha', part: 'Barrel', c: [4000], rank: 'Rank 2: Clearance Modus' },
      { item: 'Morgha', part: 'Receiver', c: [4000], rank: 'Rank 2: Clearance Modus' },
      { item: 'Morgha', part: 'Stock', c: [4000], rank: 'Rank 2: Clearance Modus' },
      { item: 'Sporothrix', c: [8000], rank: 'Rank 3: Clearance Odima' },
      { item: 'Sporothrix', part: 'Barrel', c: [6000], rank: 'Rank 3: Clearance Odima' },
      { item: 'Sporothrix', part: 'Receiver', c: [6000], rank: 'Rank 3: Clearance Odima' },
      { item: 'Sporothrix', part: 'Stock', c: [6000], rank: 'Rank 3: Clearance Odima' },
      { item: 'Arum Spinosa', c: [8000], rank: 'Rank 2: Clearance Modus' },
      { item: 'Arum Spinosa', part: 'Guard', c: [6000], rank: 'Rank 2: Clearance Modus' },
      { item: 'Arum Spinosa', part: 'Rivet', c: [6000], rank: 'Rank 2: Clearance Modus' }
    ]
  },
  {
    key: 'incarnon',
    title: 'Incarnon weapons',
    vendor: 'Cavalero',
    location: 'Chrysalith, Zariman',
    currency: 'Holdfasts standing',
    standing: 'ZarimanSyndicate',
    earnedFrom: 'Zariman missions and Holdfasts tokens',
    gate: 'Angels of the Zariman',
    hero: 'Phenmor',
    wiki: 'Cavalero',
    wares: [
      { item: 'Laetum', c: [3000], rank: 'Rank 0: Neutral' },
      { item: 'Innodem', c: [5500], rank: 'Rank 1: Fallen' },
      { item: 'Phenmor', c: [6000], rank: 'Rank 2: Watcher' },
      { item: 'Felarx', c: [8000], rank: 'Rank 3: Guardian' },
      { item: 'Praedos', c: [9000], rank: 'Rank 4: Seraph' }
    ]
  },
  {
    key: 'scaldra',
    title: 'Scaldra weapons',
    vendor: 'Minerva',
    location: 'Höllvania, The Hex',
    currency: 'Hex standing',
    standing: 'HexSyndicate',
    earnedFrom: 'Höllvania bounties and Hex syndicate work',
    gate: 'The Hex — Rank 5: Pizza Party',
    hero: 'EFV-8 Mars',
    wiki: 'Minerva',
    wares: [
      { item: 'EFV-8 Mars', c: [15000], rank: 'Rank 5: Pizza Party' },
      { item: 'EFV-8 Mars', part: 'Barrel', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'EFV-8 Mars', part: 'Receiver', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'EFV-8 Mars', part: 'Stock', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'EFV-5 Jupiter', c: [15000], rank: 'Rank 5: Pizza Party' },
      { item: 'EFV-5 Jupiter', part: 'Barrel', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'EFV-5 Jupiter', part: 'Receiver', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'EFV-5 Jupiter', part: 'Stock', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'Purgator 1', c: [15000], rank: 'Rank 5: Pizza Party' },
      { item: 'Purgator 1', part: 'Barrel', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'Purgator 1', part: 'Receiver', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'Purgator 1', part: 'Stock', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'Dual Viciss', c: [15000], rank: 'Rank 5: Pizza Party' },
      { item: 'Dual Viciss', part: 'Blade', c: [5000], rank: 'Rank 5: Pizza Party' },
      { item: 'Dual Viciss', part: 'Hilt', c: [5000], rank: 'Rank 5: Pizza Party' }
    ]
  }
];

/* ------------------------------------------------------------------ */
/*  Abgleich mit dem eigenen Bestand                                  */
/* ------------------------------------------------------------------ */

/**
 * Name -> Pfad.
 *
 * Der Katalog fuehrt beides: die Waffe ("Citrine") und ihre Bauteile
 * ("Citrine Chassis", aus ExportResources). Ueber den Namen zu gehen ist hier
 * die einzige Moeglichkeit - das Wiki kennt DEs Pfade nicht. Damit ein echtes
 * Item nie von einem gleichnamigen Nachschlage-Eintrag verdraengt wird, gewinnt
 * der erste Treffer aus items; lookup fuellt nur Luecken.
 */
function nameIndex(catalog, entries) {
  const byName = new Map();
  const add = (name, u) => {
    if (name && u && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), u);
  };
  /* Die Mastery-Eintraege zuerst: sie sind bereits die Auswahl, auf die es
     ankommt. Gaebe es einen Namen zweimal - einmal als fuehrbare Waffe und
     einmal als Sonderform - traegt der Katalog beide, und der erste Treffer
     waere Zufall. */
  for (const e of entries || []) add(e.name, e.uniqueName);
  for (const it of catalog?.items || []) add(it.name, it.uniqueName);
  for (const it of catalog?.lookup || []) add(it.name, it.uniqueName);
  return byName;
}

/** "Citrine" + "Chassis" -> der Name, unter dem der Katalog das Teil fuehrt. */
const wareName = w => (w.part ? `${w.item} ${w.part}` : w.item);

/**
 * Bild zur Waehrung.
 *
 * ZWEI QUELLEN, WEIL ES ZWEI SORTEN SIND:
 *   Sonderwaehrungen sind Items - ihr Symbol steht im Bilderspiegel des
 *   Exports, genau wie das jeder anderen Ressource. Alle dreizehn haben eins,
 *   nachgemessen.
 *   Ansehen ist kein Item und hat deshalb auch kein Item-Bild. Dafuer steht
 *   die Syndikatsflagge aus dem Wiki - dieselbe Quelle, aus der schon die
 *   Mod-Karten kommen, und in der CSP bereits erlaubt.
 *
 * Die Dateinamen sind NACHGESEHEN, nicht geraten: sie stehen so in der
 * Syndikatsleiste am Fuss jeder Wiki-Seite (action=parse, prop=images).
 */
const WIKI = 'https://wiki.warframe.com';

const SYNDICATE_FLAGS = new Map([
  ['EntratiLabSyndicate', 'CaviaSyndicateFlag.png'],
  ['HexSyndicate',        'TheHexSyndicateFlag.png'],
  ['EntratiSyndicate',    'EntratiSyndicateFlag.png'],
  ['VoxSyndicate',        'VoxSolarisSyndicateFlag.png'],
  ['NecraloidSyndicate',  'NecraloidSyndicateFlag.png'],
  ['ZarimanSyndicate',    'HoldfastsSyndicateFlag.png']
]);

function currencyImages(shop, currencies, byName) {
  if (shop.standing) {
    const file = SYNDICATE_FLAGS.get(shop.standing);
    /* Verkleinerung wie bei den Kartenbildern: MediaWiki legt sie unter
       /images/thumb/<Datei>/<Breite>px-<Datei> ab. */
    const url = file ? `${WIKI}/images/thumb/${file}/64px-${file}` : null;
    return currencies.map(() => url);
  }
  return currencies.map(name => {
    const u = byName.get(String(name).toLowerCase());
    return u ? imageUrl(u, 64) : null;
  });
}

/**
 * Was im Beutel liegt - je Waehrung eine Zahl, oder null.
 *
 * ZWEI SORTEN WAEHRUNG, ZWEI ORTE IM INVENTAR:
 *   Sonderwaehrungen (Scuttler Husk, Atramentum, Fate Pearl, auch Chippers
 *   "Stock") sind ganz normale Ressourcen und stehen mit ihrer Stueckzahl
 *   unter MiscItems. Gefunden werden sie ueber ihren Namen im Katalog - alle
 *   dreizehn stehen dort, nachgemessen.
 *   Ansehen steht woanders: in Affiliations, je Syndikat ein Eintrag mit dem
 *   verfuegbaren Guthaben. Deshalb traegt so ein Laden seinen Tag mit.
 *
 * null heisst "nicht bekannt" und ist kein Nullbestand: ohne Inventarabruf
 * weiss niemand, was im Beutel liegt.
 */
function currencyStock(shop, currencies, { byName, stock, affiliations }) {
  if (!stock) return currencies.map(() => null);

  if (shop.standing) {
    const guthaben = affiliations.get(shop.standing);
    /* Beide Spalten tragen dasselbe Guthaben - ein Ansehens-Laden hat nie
       zwei davon, aber die Form bleibt dieselbe wie bei Otak. */
    return currencies.map(() => (guthaben === undefined ? null : guthaben));
  }

  return currencies.map(name => {
    const u = byName.get(String(name).toLowerCase());
    return u ? (stock.have.get(u) ?? 0) : null;
  });
}

/**
 * Ein Laden, Posten fuer Posten mit Besitzstand.
 *
 * DREI ZUSTAENDE, NICHT ZWEI. `owned: null` heisst "keine Aussage" - kein
 * Inventar abgerufen, oder der Name laesst sich im Katalog nicht aufloesen.
 * Dann steht dort ein Strich. Ein "fehlt" waere in beiden Faellen gelogen.
 *
 * WAS ALS ERLEDIGT GILT: nicht nur das gebaute Item. Wer den Bauplan schon
 * gekauft hat, muss ihn nicht zweimal kaufen; wer das Bauteil gebaut hat, auch
 * nicht. Beides steht im Inventar (Recipes und MiscItems) und wird deshalb
 * getrennt ausgewiesen - "bought" ist eine andere Nachricht als "built".
 */
function buildShop(shop, { idx, byName, entryOf, catalog, stock, asRow, names, affiliations }) {
  const currencies = Array.isArray(shop.currency) ? shop.currency : [shop.currency];

  /* Nach Zielitem gruppieren, in der Reihenfolge der Tabelle. */
  const groups = new Map();
  for (const w of shop.wares) {
    if (!groups.has(w.item)) groups.set(w.item, []);
    groups.get(w.item).push(w);
  }

  const out = [];
  for (const [item, wares] of groups) {
    const itemU = byName.get(item.toLowerCase()) || null;
    const entry = itemU ? entryOf.get(itemU) : null;

    /* Steht das fertige Item schon im Arsenal? Zwei Quellen, weil keine allein
       reicht: der Mastery-Eintrag kennt auch, was laengst wieder verkauft
       wurde, aber Affinity getragen hat; das Inventar kennt das frisch
       gebaute Stueck, das noch keinen einzigen Rang hat. */
    const itemOwned = !idx.usable ? null
      : (entry?.status && entry.status !== 'missing') || (!!itemU && idx.owned.has(itemU));

    const recipeU = itemU ? catalog?.recipeFor?.get(itemU)?.uniqueName : null;

    const lines = wares.map(w => {
      const u = byName.get(wareName(w).toLowerCase()) || null;

      let owned = null, via = null;
      if (idx.usable) {
        if (itemOwned) { owned = true; via = 'item'; }
        else if (!w.part) {
          /* Hauptbauplan: gekauft heisst, er liegt als Rezept im Schrank. */
          const has = (recipeU && idx.asBlueprint.has(recipeU)) || (itemU && idx.asBlueprint.has(itemU));
          owned = !!has; via = has ? 'blueprint' : null;
        } else if (u) {
          const built = idx.owned.has(u);
          const bought = idx.asBlueprint.has(u);
          owned = built || bought;
          via = built ? 'built' : bought ? 'blueprint' : null;
        }
      }

      return {
        name: wareName(w),
        uniqueName: u,
        part: w.part || null,
        cost: w.c,
        rank: w.rank || null,
        owned,
        via,
        resolved: !!u
      };
    });

    /* Was der Bau danach noch verlangt.
       DER PREIS BEIM HAENDLER IST NICHT DER PREIS DES ITEMS: gekauft werden
       Bauplaene, gebaut wird daraus mit Ressourcen und Credits. Wer 120 Husks
       zusammenhat und dann an drei Orokin-Zellen scheitert, hat die falsche
       Zahl angesehen.
       Nur fuer das, was noch nicht im Arsenal steht, und nur wo es ueberhaupt
       ein Rezept gibt - sonst meldete resolveGoal das Item selbst als sein
       eigenes Material. */
    const rezept = itemU ? catalog?.recipeFor?.get(itemU) : null;
    const bau = rezept && itemOwned !== true && asRow
      ? resolveGoal(itemU, catalog, { names })
      : null;

    /* Was der Laden selbst verkauft, gehoert nicht in den Bauzettel. Bei
       Waffen taucht jedes Bauteil dort als Material auf - DE fuehrt zu ihnen
       kein eigenes Rezept, also endet die Aufloesung bei ihnen. Ueber den
       Zeilen darueber stehen sie schon, mit Preis und Besitzstand; ein
       zweites Mal darunter waere dieselbe Auskunft ohne den Preis. */
    const gekauft = new Set(lines.map(l => l.uniqueName).filter(Boolean));

    const open = lines.filter(l => l.owned === false);
    out.push({
      item,
      uniqueName: itemU,
      image: itemU ? imageUrl(itemU, 128) : null,
      materials: bau ? bau.materials.filter(m => !gekauft.has(m.uniqueName)).map(asRow) : [],
      credits: bau ? bau.totalCredits : 0,
      /* Nur wo es eine gibt: Amp-Bauteile und Kosmetik haben keine
         Mastery-Zeile, und eine erfundene waere schlimmer als keine. */
      status: entry?.status || null,
      rank: entry?.rank ?? null,
      maxLvl: entry?.maxLvl ?? null,
      category: entry?.category || null,
      newMastery: !!entry && entry.status === 'missing',
      owned: itemOwned,
      lines,
      /* Was der Rest noch kostet - je Waehrung eine Zahl. */
      cost: currencies.map((_, i) => open.reduce((s, l) => s + (l.cost[i] ?? l.cost[0] ?? 0), 0)),
      openCount: open.length
    });
  }

  const openLines = out.flatMap(g => g.lines).filter(l => l.owned === false);
  const kosten = currencies.map((_, i) => openLines.reduce((s, l) => s + (l.cost[i] ?? l.cost[0] ?? 0), 0));
  const beutel = currencyStock(shop, currencies, { byName, stock, affiliations });

  return {
    ...shop,
    currencies,
    currencyImages: currencyImages(shop, currencies, byName),
    pay: shop.pay || 'both',
    heroImage: (() => {
      const u = byName.get((shop.hero || '').toLowerCase());
      return u ? imageUrl(u, 256) : null;
    })(),
    goods: out,
    summary: {
      goods: out.length,
      /* "fertig" heisst hier: es gibt nichts mehr zu kaufen. */
      done: out.filter(g => g.openCount === 0 && idx.usable).length,
      openLines: openLines.length,
      newMastery: out.filter(g => g.newMastery).length,
      cost: kosten,
      /* Der Beutel, und was daran fehlt. Beides null, solange kein Inventar
         abgerufen wurde - dann ist die Preisliste eine Preisliste. */
      stock: beutel,
      short: beutel.map((have, i) => (have === null ? null : Math.max(0, kosten[i] - have)))
    },
    matched: idx.usable
  };
}

/**
 * Alle Laeden gegen Inventar und Mastery-Stand.
 *
 * @param inventory  Inventarabzug; fehlt er, bleibt jeder Besitzstand null
 * @param catalog    fuer Namen, Bilder und Rezepte
 * @param entries    Mastery-Eintraege aus analyze() - fuer Rang und Status
 */
export function buildVendorOffers({ inventory = null, catalog = null, entries = [] } = {}) {
  const idx = ownedIndex(inventory, catalog);
  const byName = nameIndex(catalog, entries);
  const entryOf = new Map(entries.map(e => [e.uniqueName, e]));

  /* Bestand und Rezeptzeilen genau wie im Planer - dieselbe Regel fuer
     "reicht das", damit eine Zeile hier nicht anders antwortet als dort
     (siehe renderer/stock.js). */
  const stock = inventory && catalog ? ownedStock(inventory, catalog) : null;
  const asRow = catalog ? recipeRow(stock) : null;
  const names = catalog ? buildNameIndex(catalog) : null;
  const affiliations = new Map((inventory?.Affiliations || [])
    .filter(a => a?.Tag)
    .map(a => [a.Tag, a.Standing ?? 0]));

  return SHOPS.map(shop =>
    buildShop(shop, { idx, byName, entryOf, catalog, stock, asRow, names, affiliations }));
}
