/**
 * Beschaffungsweg und realistischer Aufwand.
 *
 * Rezeptdaten allein taeuschen: eine Kuva-Waffe kostet laut Rezept "10.000 Credits,
 * 0h Bauzeit" - verschweigt aber, dass man dafuer einen Kuva-Lich erzeugen, verfolgen
 * und besiegen muss. Diese Tabelle bildet den tatsaechlichen Weg ab.
 *
 * effort = grobe Muehe-Punkte bis das Item gebaut im Inventar liegt (ohne Leveln).
 */

import { sourcesFor } from './droptables.js';

export const SOURCES = {
  LICH_KUVA:    { label: 'Kuva Lich',            effort: 120, note: 'Spawn a lich, requiem murmurs, defeat it' },
  LICH_CODA:    { label: 'Coda Lich (Infested)', effort: 120, note: 'Coda lich nemesis cycle' },
  LICH_TENET:   { label: 'Tenet (Granum Void)',  effort: 110, note: 'Granum Void + Ergo Glast' },
  PRIME:        { label: 'Prime (relics)',       effort:  80, note: 'Farm relics and crack them' },
  DOJO:         { label: 'Clan dojo',            effort:  45, note: 'Research in the dojo, then build' },
  BARO:         { label: "Baro Ki'Teer",         effort:  90, note: 'Only available every 2 weeks' },
  PET_KUBROW:   { label: 'Kubrow',               effort:  70, note: 'Egg + incubator + maturation time' },
  PET_KAVAT:    { label: 'Kavat',                effort:  75, note: 'Genetic code from the Derelict' },
  PET_MOA:      { label: 'MOA',                  effort:  50, note: 'Legs from Legs in Fortuna' },
  PET_HOUND:    { label: 'Hound',                effort:  60, note: 'Sisters of Parvos' },
  AMP:          { label: 'Amp (Quills/Vox)',     effort:  55, note: 'Standing with the Quills / Vox Solaris' },
  MODULAR_ZAW:  { label: 'Zaw (Hok)',            effort:  45, note: 'Cetus, Hok — standing' },
  MODULAR_KIT:  { label: 'Kitgun (Rude Zuud)',   effort:  45, note: 'Fortuna, Rude Zuud — standing' },
  KDRIVE:       { label: 'K-Drive (Ventkids)',   effort:  50, note: 'Ventkids standing' },
  MECH:         { label: 'Necramech',            effort: 100, note: 'Isolation Vaults / Loid' },
  RAILJACK:     { label: 'Railjack',             effort:  70, note: 'Railjack missions' },
  EVENT:        { label: 'Event / time-limited', effort: 150, note: 'Only at certain times' },
  SYNDICATE:    { label: 'Syndicate',            effort:  55, note: 'Syndicate standing' },
  BOSS:         { label: 'Boss drop / quest',    effort:  40, note: 'Boss farming on the star chart' },
  MARKET:       { label: 'In-game Market',       effort:  20, note: 'Bought complete for credits or platinum' },
  DROP:         { label: 'Drops in missions',    effort:  60, note: 'Listed in the drop tables' },
  MARKET_BP:    { label: 'Market blueprint',     effort:  25, note: 'Blueprint from the in-game Market, then build it' },
  HEX:          { label: 'The Hex (Hollvania)',  effort:  85, note: 'Hex standing or Hollvania bounties - needs The Hex quest' },
  PET_INFESTED: { label: 'Son (Necralisk)',      effort:  75, note: 'Capture on the Cambion Drift, then revivification with Son' },
  UNKNOWN:      { label: 'Unclear',              effort:  40, note: 'Source is ambiguous' }
};

/**
 * Reihenfolge ist bedeutsam: spezielle Regeln zuerst.
 * Prime muss vor die generischen Sentinel-/Powersuit-Regeln, sonst wuerde
 * "Wyrm Prime" als Markt-Item statt als Relikt-Farm eingestuft.
 */
const PATH_RULES = [
  /* Die Nemesis-Waffen liegen NICHT unter /KuvaLich/ oder /BoardExec/, sondern
     ganz normal unter /Weapons/Grineer/ und /Weapons/Corpus/. Zu erkennen sind
     sie nur am Namen - und die Pfadregeln darunter verlangen einen
     Schraegstrich, den ein Name nie hat. Dadurch fielen alle 13 durch: Kuva
     Bramma, Kuva Chakkhurr, Tenet Envoy und der Rest standen auf "Unclear"
     und wurden mit Aufwand 40 bewertet statt mit 110-120 - eine Lich-Waffe
     sah damit so billig aus wie ein Marktbauplan. */
  [/^Kuva /i,                       'LICH_KUVA'],
  [/^Tenet /i,                      'LICH_TENET'],
  [/^Coda /i,                       'LICH_CODA'],
  [/\/Grineer\/KuvaLich\//i,        'LICH_KUVA'],
  [/\/Infested\/InfestedLich\//i,   'LICH_CODA'],
  [/\/Corpus\/BoardExec\//i,        'LICH_TENET'],
  [/\/Tenet/i,                      'LICH_TENET'],
  [/\/VoidTrader\//i,               'BARO'],
  [/\/ClanTech\//i,                 'DOJO'],
  [/OperatorAmplifiers\//i,         'AMP'],
  [/\/Ostron\/Melee\//i,            'MODULAR_ZAW'],
  [/\/SolarisUnited\//i,            'MODULAR_KIT'],
  [/\/Vehicles\/Hoverboard\//i,     'KDRIVE'],
  [/MechSuit|\/Mech\//i,            'MECH'],
  [/\/CrewShip\/|RailJack/i,        'RAILJACK'],
  [/Kubrow/i,                       'PET_KUBROW'],
  [/Kavat|Catbrow/i,                'PET_KAVAT'],
  [/MoaPet|\/Moa\//i,               'PET_MOA'],
  [/Hound/i,                        'PET_HOUND'],
  /* Hollvania (1999): Bauplaene bei Amir und Minerva fuer Hex-Ansehen, Teile
     auch aus den Kopfgeldern dort. Kein Markt, und ohne "The Hex" gar nicht
     erreichbar - deshalb ein eigener Weg statt des Markt-Rueckfalls unten.
     new RegExp statt Literal, damit die Schraegstriche ohne Escapes lesbar
     bleiben. */
  [new RegExp('/Weapons/Lasria/', 'i'), 'HEX'],
  /* Vulpaphyla und Predasite werden nicht gebaut, sondern auf dem Cambion
     Drift gefangen und bei Son wiederbelebt. */
  [/Vulpaphyla|Predasite/i,         'PET_INFESTED'],
  [/Syndicate/i,                    'SYNDICATE'],
  [/Prisma|Wraith|Vandal|Dex /i,    'EVENT'],
  [/Prime/i,                        'PRIME'],
  [/\/Types\/Sentinels\//i,         'MARKET'],
  [/\/Powersuits\//i,               'BOSS']
];

/**
 * Bestimmt den Beschaffungsweg eines Items.
 *
 * `catalog` und `dropIndex` sind freiwillig, machen aber den Unterschied
 * zwischen einer Antwort und einem Achselzucken - siehe unten. Ohne sie
 * bleibt es beim alten Verhalten, damit die Werkzeuge in src/cli/ weiterlaufen.
 * analyze() reicht nur den Katalog durch: die Droptabellen sind zu dem
 * Zeitpunkt noch nicht geladen, und ein Abruf dafuer waere den Startweg nicht
 * wert. Das Fenster zum Item bekommt beides.
 *
 * WARUM DER RUECKFALL DA IST: Vorher endeten 388 von 832 Katalogeintraegen auf
 * "Unclear" - fast die Haelfte, und darunter Braton, Hek und Soma. Das ist
 * keine Wissensluecke, sondern die falsche Frage an die Droptabellen: einen
 * Marktbauplan fuehrt DE dort NICHT, weil er nirgends faellt. Wer weder in
 * einer Regel noch in einer Droptabelle steht und ein Rezept hat, ist deshalb
 * mit grosser Wahrscheinlichkeit genau das - ein Bauplan aus dem Markt.
 *
 * DAS BLEIBT EIN SCHLUSS, KEINE QUELLE. Er trifft die grosse Mehrheit, liegt
 * aber bei Einzelfaellen daneben, die DE nirgends auffuehrt - Mausolon, Haalvu
 * und ein paar Archwing-Waffen. Die Alternative war ein "Unclear" auf jeder
 * zweiten Kachel, und das half niemandem.
 */
export function acquisitionOf(item, catalog = null, dropIndex = null) {
  const u = item.uniqueName || '';
  const n = item.name || '';
  for (const [re, key] of PATH_RULES) {
    if (re.test(u) || re.test(n)) return { key, ...SOURCES[key] };
  }

  /* Erst die Droptabellen, dann der Markt-Rueckfall - sonst behauptet die
     Kachel "Market blueprint", waehrend die Fundort-Box im selben Fenster
     "Stalker" sagt. Genau das waere bei Despair, Dread und Hate passiert.

     Zweimal gefragt, weil DE den Bauplan mal unter dem Waffennamen fuehrt
     und mal als "<Name> Blueprint". */
  if (dropIndex) {
    let treffer = sourcesFor(dropIndex, { name: n, uniqueName: u });
    if (!treffer.groups?.length) treffer = sourcesFor(dropIndex, { name: n + ' Blueprint', uniqueName: u });
    const gruppe = treffer.groups?.[0];
    const wo = gruppe?.entries?.[0]?.place;
    if (wo) {
      const weitere = (treffer.total ?? 1) - 1;
      return {
        ...SOURCES.DROP,
        key: 'DROP',
        /* Das Etikett kommt aus der Fundort-Gruppe selbst - "Syndicate" fuer
           das Laetum bei den Holdfasts, "Enemies" fuer Despair beim Stalker.
           Ein pauschales "Drops in missions" waere bei beiden daneben. */
        label: gruppe.label || SOURCES.DROP.label,
        note: `${wo}` + (weitere > 0 ? ` and ${weitere} other ${weitere === 1 ? 'place' : 'places'}` : '')
      };
    }
  }

  /* Mit Rezept kommt der BAUPLAN aus dem Markt, ohne Rezept die Waffe selbst,
     fertig gekauft - so laeuft es bei Strun, Lex und den MK1-Waffen. */
  if (catalog?.recipeFor) {
    const key = catalog.recipeFor.has(u) ? 'MARKET_BP' : 'MARKET';
    return { key, ...SOURCES[key] };
  }
  return { key: 'UNKNOWN', ...SOURCES.UNKNOWN };
}

/**
 * Zusaetzlicher Aufwand fuers Hochleveln.
 * Raenge ueber 30 kosten Forma und wiegen deshalb deutlich schwerer.
 */
export function levelingEffort(ranksLeft, maxLvl) {
  const base = ranksLeft * 1.5;
  const formaRanks = Math.max(0, Math.min(ranksLeft, maxLvl - 30));
  return base + formaRanks * 8;
}
