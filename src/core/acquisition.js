/**
 * Beschaffungsweg und realistischer Aufwand.
 *
 * Rezeptdaten allein taeuschen: eine Kuva-Waffe kostet laut Rezept "10.000 Credits,
 * 0h Bauzeit" - verschweigt aber, dass man dafuer einen Kuva-Lich erzeugen, verfolgen
 * und besiegen muss. Diese Tabelle bildet den tatsaechlichen Weg ab.
 *
 * effort = grobe Muehe-Punkte bis das Item gebaut im Inventar liegt (ohne Leveln).
 */

export const SOURCES = {
  LICH_KUVA:    { label: 'Kuva-Lich',            effort: 120, note: 'Spawn a lich, requiem murmurs, defeat it' },
  LICH_CODA:    { label: 'Coda-Lich (Infested)', effort: 120, note: 'Coda lich nemesis cycle' },
  LICH_TENET:   { label: 'Tenet (Granum Void)',  effort: 110, note: 'Granum Void + Ergo Glast' },
  PRIME:        { label: 'Prime (relics)',       effort:  80, note: 'Farm relics and crack them' },
  DOJO:         { label: 'Clan dojo',            effort:  45, note: 'Research in the dojo, then build' },
  BARO:         { label: "Baro Ki'Teer",         effort:  90, note: 'Only available every 2 weeks' },
  PET_KUBROW:   { label: 'Kubrow',               effort:  70, note: 'Egg + incubator + maturation time' },
  PET_KAVAT:    { label: 'Kavat',                effort:  75, note: 'Genetic code from the Derelict' },
  PET_MOA:      { label: 'MOA',                  effort:  50, note: 'Legs bei Legs (Fortuna)' },
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
  MARKET:       { label: 'Market / blueprint',   effort:  20, note: 'Straight from the in-game market' },
  UNKNOWN:      { label: 'Unclear',              effort:  40, note: 'Source is ambiguous' }
};

/**
 * Reihenfolge ist bedeutsam: spezielle Regeln zuerst.
 * Prime muss vor die generischen Sentinel-/Powersuit-Regeln, sonst wuerde
 * "Wyrm Prime" als Markt-Item statt als Relikt-Farm eingestuft.
 */
const PATH_RULES = [
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
  [/Syndicate/i,                    'SYNDICATE'],
  [/Prisma|Wraith|Vandal|Dex /i,    'EVENT'],
  [/Prime/i,                        'PRIME'],
  [/\/Types\/Sentinels\//i,         'MARKET'],
  [/\/Powersuits\//i,               'BOSS']
];

/** Bestimmt den Beschaffungsweg eines Items. */
export function acquisitionOf(item) {
  const u = item.uniqueName || '';
  const n = item.name || '';
  for (const [re, key] of PATH_RULES) {
    if (re.test(u) || re.test(n)) return { key, ...SOURCES[key] };
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
