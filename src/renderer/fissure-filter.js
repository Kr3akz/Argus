/* Void-Riss-Filter: entscheidet, ob ein Riss zu den gewaehlten
   Benachrichtigungs-Einstellungen passt.

   Diese Datei ist die EINZIGE Quelle dieser Regeln. Der Renderer laedt sie als
   klassisches Skript (wie icons.js), der Main-Prozess ueber
   src/core/fissure-filter.js. Beide muessen dieselbe Antwort geben - sonst
   markiert die Rissliste einen Treffer, fuer den nie ein Toast kommt.

   Der Missionstyp wird auf einen kanonischen Namen gebracht und dann EXAKT
   verglichen. Der frueher benutzte Teilstring-Vergleich hat drei Wege gefunden,
   die falsche Mission durchzulassen:
     - "Void Cascade" galt zusaetzlich fuer jeden Riss auf einem Zariman-Knoten,
       und "Void Flood" liegt ebenfalls auf dem Zariman
     - "Defense" steckt in "Mobile Defense"
     - der Rueckwaerts-Vergleich (wanted.includes(fType)) liess kurze Typnamen
       auf laengere Auswahlen passen */

const FissureFilter = (() => {

  /* Kanonischer Name -> weitere Schreibweisen. Die API liefert Englisch; die
     deutschen Namen stehen hier, weil frueher gespeicherte Auswahlen sie
     enthalten koennen und nach dem Update weiter gelten sollen. */
  const ALIASES = {
    'void cascade':    ['cascade', 'kaskade', 'void kaskade'],
    'void flood':      ['flood', 'flut', 'void flut'],
    'void armageddon': ['armageddon'],
    'capture':         ['gefangennahme'],
    'extermination':   ['exterminate', 'auslöschung', 'ausloeschung'],
    'survival':        ['überleben', 'ueberleben'],
    'defense':         ['verteidigung'],
    'mobile defense':  ['mobile verteidigung'],
    'disruption':      ['störung', 'stoerung'],
    'excavation':      ['ausgrabung'],
    'alchemy':         ['alchemie'],
    'rescue':          ['rettung'],
    'spy':             ['spionage'],
    'interception':    ['abfangen'],
    'skirmish':        ['scharmützel', 'scharmuetzel'],
    'orphix':          ['orphix-venom'],
    'defection':       ['überlaufen', 'ueberlaufen']
  };

  /* Einmal umgedreht: Schreibweise -> kanonischer Name. */
  const CANONICAL = new Map();
  for (const [name, aliases] of Object.entries(ALIASES)) {
    CANONICAL.set(name, name);
    for (const alias of aliases) CANONICAL.set(alias, name);
  }

  const normalize = value => String(value ?? '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  /** "Void-Flut", "void flood" und "Flut" landen alle auf 'void flood'. */
  function canonicalMissionType(value) {
    const key = normalize(value);
    return CANONICAL.get(key) || key;
  }

  /** Passt der Riss zu den Einstellungen? */
  function matches(fissure, settings) {
    if (!settings?.enabled || !settings?.fissures?.enabled) return false;
    const cfg = settings.fissures;

    /* 1. Relikt-Stufen. Leere Liste heisst "keine Einschraenkung" - sonst
          wuerde ein noch nie geoeffnetes Einstellungsfenster alles abwuergen. */
    const tiers = (cfg.tiers || []).map(t => String(t).toLowerCase());
    if (tiers.length && !tiers.includes(String(fissure.tier || '').toLowerCase())) return false;

    // 2. Steel Path
    if (cfg.steelPathOnly && !fissure.isHard) return false;
    if (cfg.includeSteelPath === false && fissure.isHard) return false;

    // 3. Railjack-Stuerme
    if (cfg.includeStorms === false && fissure.isStorm) return false;

    /* 4. Missionstyp. Anders als bei den Stufen heisst leer hier "nichts
          ausgewaehlt" - wer alle Haken entfernt, will keine Toasts. */
    if (cfg.allMissionTypes) return true;
    const wanted = (cfg.missionTypes || []).map(canonicalMissionType).filter(Boolean);
    if (!wanted.length) return false;

    return wanted.includes(canonicalMissionType(fissure.missionType));
  }

  return { canonicalMissionType, matches };
})();
