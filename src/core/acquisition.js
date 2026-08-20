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
  LICH_KUVA:    { label: 'Kuva-Lich',            effort: 120, note: 'Lich erzeugen, Requiem-Morde, besiegen' },
  LICH_CODA:    { label: 'Coda-Lich (Infested)', effort: 120, note: 'Coda-Lich Nemesis-Zyklus' },
  LICH_TENET:   { label: 'Tenet (Granum Void)',  effort: 110, note: 'Granum Void + Ergo Glast' },
  PRIME:        { label: 'Prime (Relikte)',      effort:  80, note: 'Relikte farmen und oeffnen' },
  DOJO:         { label: 'Clan-Dojo',            effort:  45, note: 'Forschung im Dojo, dann bauen' },
  BARO:         { label: "Baro Ki'Teer",         effort:  90, note: 'Nur alle 2 Wochen verfuegbar' },
  PET_KUBROW:   { label: 'Kubrow',               effort:  70, note: 'Ei + Inkubator + Reifezeit' },
  PET_KAVAT:    { label: 'Kavat',                effort:  75, note: 'Genetischer Code aus Derelict' },
  PET_MOA:      { label: 'MOA',                  effort:  50, note: 'Legs bei Legs (Fortuna)' },
  PET_HOUND:    { label: 'Hound',                effort:  60, note: 'Sisters of Parvos' },
  AMP:          { label: 'Amp (Quills/Vox)',     effort:  55, note: 'Reputation bei Quills / Vox Solaris' },
  MODULAR_ZAW:  { label: 'Zaw (Hok)',            effort:  45, note: 'Cetus, Hok - Reputation' },
  MODULAR_KIT:  { label: 'Kitgun (Rude Zuud)',   effort:  45, note: 'Fortuna, Rude Zuud - Reputation' },
  KDRIVE:       { label: 'K-Drive (Ventkids)',   effort:  50, note: 'Ventkids-Reputation' },
  MECH:         { label: 'Necramech',            effort: 100, note: 'Isolation Vaults / Loid' },
  RAILJACK:     { label: 'Railjack',             effort:  70, note: 'Railjack-Missionen' },
  EVENT:        { label: 'Event / Zeitbegrenzt', effort: 150, note: 'Nur zu bestimmten Zeiten' },
  SYNDICATE:    { label: 'Syndikat',             effort:  55, note: 'Syndikats-Reputation' },
  BOSS:         { label: 'Boss-Drop / Quest',    effort:  40, note: 'Bossfarm auf der Sternenkarte' },
  MARKET:       { label: 'Markt / Blaupause',    effort:  20, note: 'Direkt im Ingame-Markt' },
  UNKNOWN:      { label: 'Unklar',               effort:  40, note: 'Quelle nicht eindeutig' }
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
