/**
 * Rivens aus dem Inventar - mit genau den Zahlen, die das Spiel anzeigt.
 *
 * WAS IM INVENTAR STEHT:
 *   Jeder enthuellte Riven ist ein Upgrade mit einem UpgradeFingerprint, einem
 *   JSON-Text: die Waffe (compat), der Rang (lvl, fehlt bei 0), die
 *   Meisterschaftsvoraussetzung (lvlReq), die Umwandlungen (rerolls, fehlt
 *   bei 0), die Polaritaet (pol) und die Werte als [{Tag, Value}] - die
 *   positiven unter buffs, der negative unter curses. Value ist KEIN
 *   Anzeigewert, sondern die Lage des Wurfs: eine ganze Zahl von 0 bis 2^30.
 *
 *   Verschleierte Rivens mit Aufgabe tragen nur challenge {Type, Progress,
 *   Required, Complication}. Noch ungeoeffnete liegen als Stapel in
 *   RawUpgrades.
 *
 *   Den Rest liefert der Katalog: den Basiswert je Tag aus der Riven-Vorlage
 *   (upgradeEntries) und die Disposition der Waffe (omegaAttenuation). Die
 *   Disposition kommt bevorzugt frisch aus dispositions.js - der Katalog-Cache
 *   veraltet, und eine veraltete Disposition verschiebt jede Zahl.
 *
 * DIE UMRECHNUNG, gemessen am 2026-09-29:
 *   Screenshots aus Kaans Mod-Bildschirm gegen die Fingerprints derselben
 *   Rivens: 27 Werte aus neun Rivens, 13 davon auf Rang 8.
 *
 *     angezeigt = Basis * Disposition * (Rang + 1) * F * (0,9 + 0,2 * Wurf)
 *
 *   Wurf = Value / 2^30. Dass der Wurf linear eingeht und oben das 1,22-Fache
 *   von unten ergibt, zeigen drei Rivens mit je drei positiven Werten
 *   unabhaengig voneinander (Torid 1,221, Ocucor 1,222, Hate 1,217) - das ist
 *   die Spanne 0,9 bis 1,1. Die Mitte auf 1 zu legen ist Konvention, der Rest
 *   steckt in F. F haengt nur von der Zusammensetzung ab, siehe FACTOR. Jeder
 *   der 13 Werte auf Rang 8 trifft die Anzeige bis auf die letzte Stelle.
 *
 *   Der Rang geht als (Rang + 1) ein: Hind hat dieselbe Zusammensetzung wie
 *   Dual Toxocyst, steht aber auf Rang 0 - F kommt dort mit Faktor 1 genau
 *   so heraus wie auf Rang 8 mit Faktor 9. Zwischenraenge sind nicht belegt.
 *
 * WELCHE DISPOSITION - das haengt am Bildschirm (gemessen 2026-09-29):
 *   Rivens gibt es je Waffenfamilie, das compat nennt die Grundwaffe. Der
 *   Mod-Bildschirm rechnet mit ihr (Scourge Puratak: +7,9% Reload auf Rang 0
 *   passt nur zu Scourge, 1,2). Der Umwandeln-Bildschirm dagegen rechnet mit
 *   der Waffe unter "Fits in", die er auch als Modell laedt - bei Kaan die
 *   Scourge Prime, 1,1: +64,8% Reload, -96,6% Recoil, +59,2% Fire Rate, alle
 *   auf die Stelle. Deshalb nimmt rivenView() eine abweichende Waffe an.
 *
 * WAS NOCH NICHT GEMESSEN IST:
 *   - Die Anzeigeform "s" (Combo Duration) und "Initial Combo" - an keiner
 *     Karte gesehen.
 *   Solche Werte tragen `verified: false`, damit die Oberflaeche sie als
 *   gerechnet und nicht als abgelesen kennzeichnen kann.
 */
import { cleanGameText } from './catalog.js';
import { POLARITIES, RIVEN_MAX_RANK } from './mods.js';

const RIVEN_PATH = '/Upgrades/Mods/Randomized/';

/* Value laeuft von 0 bis 2^30. Hoechster gesehener Wert: 1.018.203.435 von
   1.073.741.824, ueber alle 46 Werte in Kaans Rivens. */
export const ROLL_SPAN = 2 ** 30;
const ROLL_LOW = 0.9;
export const ROLL_HIGH = 1.1;

/* F nach Zusammensetzung, alle am 2026-09-29 gemessen. In Klammern der
   Bereich, den die Rundung der Anzeige offenlaesst:

     2 positive, kein negativer   9,9     (9,8987 .. 9,9027)
     3 positive, kein negativer   7,5     (7,4980 .. 7,5008)

   Ein negativer Wert hebt die positiven um 1,25:
     3 + 1   9,375   (9,3736 .. 9,3767)
     2 + 1  12,375   (12,364 .. 12,375 - Scourge, Baza, Galariak Prime, Rang 0)

   Der negative Wert selbst:
     3 + 1   7,5     (7,4999 .. 7,5057)
     2 + 1   4,95    (4,945 .. 5,019 auf Rang 0 - Scourge, Baza, Galariak Prime)

   Den letzten hat erst der Umwandeln-Bildschirm festgelegt: dort steht
   Scourge Puratak auf Rang 8 mit -51,6% Projectile Speed. 4,95 ergibt genau
   das, 5,0 ergaebe -52,1%, die Mitte des Rang-0-Bereichs -51,9%. Auf Rang 0
   ist der negative Wert nur 3 bis 6 % gross, eine Nachkommastelle liess dort
   rund 1 % offen. */
/* Exportiert fuer riven-market.js: dort prueft es, ob die Werte einer Auktion
   zu ihrem Rang passen koennen. */
export const FACTOR = {
  buff: { 2: 9.9, 3: 7.5 },
  curseLift: 1.25,
  curse: { 2: 4.95, 3: 7.5 },
};

/* Kapazitaet: 10 auf Rang 0, 18 auf Rang 8 - an allen 15 Karten abgelesen.
   Die Vorlage im Export traegt 2, die gilt fuer den Riven nicht. */
const RIVEN_BASE_DRAIN = 10;

/* Anzeigeformen, die bisher an einer echten Karte abgelesen wurden - "plain"
   an Punch Through (Hek) und Range (Galariak Prime), beide "+0.3"-artig mit
   einer Nachkommastelle. Alles andere wird gerechnet, aber als unverified
   markiert. */
const VERIFIED_UNITS = new Set(['percent', 'multiplier', 'plain']);

/**
 * Anzeigeform aus dem locTag: "|val|% Critical Damage", "|val| Damage to
 * Grineer", "|val|s Combo Duration", "|STAT1|% Critical Chance for Slide
 * Attack". Farbmarken wie <DT_FIRE_COLOR> nennen das Element.
 */
function parseLoc(locTag, tag) {
  const m = /^\|(?:val|STAT1)\|(%|s)?\s*(.*)$/i.exec(String(locTag || ''));
  const rest = m ? m[2] : String(locTag || '');
  const el = /<DT_([A-Z]+)_COLOR>/.exec(rest);
  /* Fraktionsschaden steht ohne Einheit im Export, das Spiel zeigt ihn aber
     als Faktor: "x1.47 Damage to Grineer" (Hate, Scourge). */
  const unit = /FactionDamage/.test(tag) ? 'multiplier'
    : m?.[1] === '%' ? 'percent'
    : m?.[1] === 's' ? 'seconds'
    : 'plain';
  return { unit, label: cleanGameText(rest), element: el ? el[1].toLowerCase() : null };
}

/* Eine Nachkommastelle wie im Spiel, und wie dort ohne ",0": "+171%", "+88%". */
function oneDecimal(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Wert als Text, so wie ihn die Karte zeigt. `value` ist der Anteil mit
 * Vorzeichen: 0.997 fuer "+99.7%", -0.723 fuer "-72.3%", 0.469 fuer "x1.47".
 *
 * Faktoren mit zwei Stellen, eine Null am Ende faellt weg wie bei den
 * Prozenten: der Umwandeln-Bildschirm zeigt Scourge Puratak mit "x1.6", wo
 * gerechnet 1,6017 steht.
 */
export function formatRivenValue(value, unit) {
  if (unit === 'multiplier') return `x${String(Number((1 + value).toFixed(2)))}`;
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(value);
  if (unit === 'percent') return `${sign}${oneDecimal(abs * 100)}%`;
  if (unit === 'seconds') return `${sign}${oneDecimal(abs)}s`;
  return `${sign}${oneDecimal(abs)}`;
}

/**
 * Ein Wert eines Rivens, gerechnet aus Wurf, Basiswert und Disposition.
 *
 * @param entry        upgradeEntries-Eintrag der Vorlage fuer diesen Tag
 * @param value        Value aus dem Fingerprint (0 .. 2^30)
 * @param curse        steht der Wert unter curses?
 * @param buffCount    Zahl der positiven Werte (2 oder 3)
 * @param hasCurse     hat der Riven einen negativen Wert?
 * @param disposition  omegaAttenuation der Waffe
 * @param rank         Rang des Rivens (0 .. 8)
 */
export function computeStat({ entry, value, curse, buffCount, hasCurse, disposition, rank }) {
  /* Der erste Eintrag traegt die Anzeige. Einige Tags fuehren einen zweiten
     ohne locTag (Nahkampf-IPS mit dem Fuenffachen) - welcher Fall den nutzt,
     ist nicht gemessen, angezeigt wird immer der erste. */
  const uv = entry.upgradeValues[0];
  const { unit, label, element } = parseLoc(uv.locTag, entry.tag);

  const factor = curse
    ? FACTOR.curse[buffCount]
    : FACTOR.buff[buffCount] * (hasCurse ? FACTOR.curseLift : 1);
  const roll = Math.min(1, Math.max(0, value / ROLL_SPAN));

  /* Vorzeichen: negative Basis (Rueckstoss) zeigt als Staerke ein Minus,
     reverseValueSymbol dreht es fuer die Anzeige noch einmal um, und ein
     negativer Wert kehrt alles. */
  const sign = Math.sign(uv.value || 1) * (uv.reverseValueSymbol ? -1 : 1) * (curse ? -1 : 1);
  const scale = Math.abs(uv.value) * disposition * factor;
  const at = (r, u) => sign * scale * (r + 1) * (ROLL_LOW + (ROLL_HIGH - ROLL_LOW) * u);

  const current = at(rank, roll);
  const max = at(RIVEN_MAX_RANK, roll);
  return {
    tag: entry.tag,
    curse,
    label,
    element,
    unit,
    roll,
    /* Wie gut der Wurf ist: 1 ist das Beste, was dieser Wert auf diesem Riven
       werden kann. Beim negativen Wert ist das der mildeste. */
    quality: curse ? 1 - roll : roll,
    value: current,
    text: formatRivenValue(current, unit),
    /* Auf Hoechstrang - so zeigt ihn der Umwandeln-Bildschirm mit "Show
       ranked", und so wird gehandelt. */
    maxValue: max,
    maxText: formatRivenValue(max, unit),
    /* Spanne auf Hoechstrang, vom schlechtesten zum besten Wurf. */
    rangeText: [formatRivenValue(at(RIVEN_MAX_RANK, curse ? 1 : 0), unit),
                formatRivenValue(at(RIVEN_MAX_RANK, curse ? 0 : 1), unit)],
    verified: factor != null && VERIFIED_UNITS.has(unit),
  };
}

/**
 * Der Name, den das Spiel dem Riven gibt, etwa "Sati-critatis".
 *
 * Gemessen am 2026-09-29 an allen 15 Namen in Kaans Mod-Bildschirm: die
 * positiven Werte nach Value absteigend, von allen ausser dem letzten die
 * Vorsilbe, vom letzten die Endsilbe. Zwei Silben ohne Bindestrich
 * ("Acrican"), drei mit einem nach der ersten ("Sati-critatis"). Weder die
 * Reihenfolge im Fingerprint (5 von 15) noch die aufsteigende (0 von 15)
 * trifft.
 */
export function rivenName(buffs) {
  const sorted = [...buffs].sort((a, b) => b.value - a.value);
  const prefixes = sorted.slice(0, -1).map(b => b.entry?.prefixTag);
  const suffix = sorted.at(-1)?.entry?.suffixTag;
  if (!suffix || prefixes.some(p => !p)) return null;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  return prefixes.length === 1
    ? cap(prefixes[0] + suffix)
    : cap(prefixes[0]) + '-' + prefixes.slice(1).join('') + suffix;
}

/**
 * Waffe zum compat-Pfad, mit Name und Disposition.
 *
 * Die frische Liste aus dispositions.js geht vor dem Katalog: dort steht die
 * aktuelle Disposition, und dort steht auch eine Waffe, die nach dem
 * Katalog-Cache erschienen ist.
 *
 * FAMILIEN-RIVENS verweisen auf keine einzelne Waffe: Kaans Hek-Riven traegt
 * .../Shotgun/QuadShotgunBase, das im Export nicht vorkommt, das Spiel nennt
 * ihn "Hek". Ohne das "Base" steht dort der Hek - und dessen Disposition
 * nimmt das Spiel auch: gemessen am 2026-09-29, +9,2% Cold passt nur zu 1,2
 * (Hek), nicht zu 1,15 (Vaykor Hek) oder 1,0 (Kuva Hek).
 */
function resolveWeapon(compat, byUniqueName, fresh) {
  const lookup = p => {
    const item = byUniqueName.get(p);
    const f = fresh?.[p];
    if (!item && !f) return null;
    return {
      uniqueName: p,
      name: f?.[0] || item?.name || null,
      disposition: f?.[1] ?? item?.omegaAttenuation ?? null,
      fresh: !!f,
    };
  };
  const direct = lookup(compat);
  if (direct) return { ...direct, family: false };
  if (compat.endsWith('Base')) {
    const base = lookup(compat.slice(0, -'Base'.length));
    if (base) return { ...base, family: true };
  }
  return null;
}

/* "Rifle Riven Mod" -> "Rifle". Die Art steht im Katalognamen der Vorlage,
   fuer enthuellte wie fuer ungeoeffnete. */
const kindOf = (item, path) =>
  (item?.name || path.split('/').pop()).replace(/\s*Riven Mod$/i, '');

/* "Pick up |COUNT| Syndicate Medallions" + "without taking damage". Die
   Erschwernis beginnt mal mit Komma, mal ohne - dann braucht es ein
   Leerzeichen dazwischen. */
function challengeText(template, challenge) {
  const def = (template?.availableChallenges || []).find(c => c.fullName === challenge.Type);
  if (!def) return null;
  const base = cleanGameText(String(def.description || '').replace(/\|COUNT\|/g, String(challenge.Required ?? '')));
  const comp = (def.complications || []).find(c => c.fullName === challenge.Complication);
  const extra = comp ? cleanGameText(comp.description) : '';
  if (!extra) return base;
  return extra.startsWith(',') ? base + extra : `${base} ${extra}`;
}

/**
 * Ein enthuellter Riven als Ansicht: Werte, Name, Wurfqualitaet.
 *
 * Eigene Funktion, weil es zwei Quellen gibt: das Inventar fuer den Reiter und
 * den Speicher des Spiels fuer das Overlay - ein frisch gewuerfelter Riven
 * steht noch in keinem Inventar.
 *
 * @param fp        der geparste UpgradeFingerprint
 * @param template  die Riven-Vorlage aus dem Katalog (ItemType des Upgrades)
 * @returns {{ view } | { error, weapon }}
 */
export function rivenView(fp, template, catalog, { dispositions = null, showOn = null } = {}) {
  if (!fp?.compat || !Array.isArray(fp.buffs)) return { error: 'no weapon or stats' };
  if (!template?.upgradeEntries) return { error: 'riven template missing from catalog' };

  const byUniqueName = catalog?.byUniqueName || new Map();
  const weapon = resolveWeapon(fp.compat, byUniqueName, dispositions?.weapons || null);
  /* showOn: die Waffe, fuer die der Bildschirm rechnet, wenn es nicht die
     Grundwaffe ist - siehe Kopf, "Welche Disposition". */
  const shown = showOn && showOn !== fp.compat
    ? resolveWeapon(showOn, byUniqueName, dispositions?.weapons || null)
    : null;
  const disposition = shown?.disposition ?? weapon?.disposition;
  const entries = new Map(template.upgradeEntries.map(e => [e.tag, e]));
  const buffs = fp.buffs.map(s => ({ tag: s.Tag, value: s.Value, curse: false }));
  const curses = (fp.curses || []).map(s => ({ tag: s.Tag, value: s.Value, curse: true }));
  const rank = Math.min(fp.lvl || 0, RIVEN_MAX_RANK);

  const missing = [...buffs, ...curses].filter(s => !entries.has(s.tag)).map(s => s.tag);
  if (disposition == null || missing.length || !FACTOR.buff[buffs.length]) {
    return {
      weapon: weapon?.name || null,
      error: disposition == null ? 'weapon has no disposition'
        : missing.length ? `unknown stats: ${missing.join(', ')}`
        : `unexpected composition: ${buffs.length} positive, ${curses.length} negative`,
    };
  }

  const stats = [...buffs, ...curses].map(s => computeStat({
    entry: entries.get(s.tag),
    value: s.value,
    curse: s.curse,
    buffCount: buffs.length,
    hasCurse: curses.length > 0,
    disposition,
    rank,
  }));

  const name = rivenName(buffs.map(b => ({ value: b.value, entry: entries.get(b.tag) })));
  const weaponName = weapon?.name || fp.compat.split('/').pop();
  const positives = stats.filter(s => !s.curse);

  return {
    view: {
      kind: kindOf(template, template.uniqueName || ''),
      /* uniqueName ist die aufgeloeste Waffe und nicht compat - beim
         Familien-Riven gibt es zu compat kein Bild. */
      weapon: {
        path: fp.compat,
        uniqueName: weapon?.uniqueName || null,
        name: weaponName,
        disposition,
        family: weapon?.family || false,
        /* Kam die Disposition aus der frischen Liste oder nur aus dem Cache? */
        fresh: (shown || weapon)?.fresh || false,
      },
      /* Nur gesetzt, wenn mit einer anderen Waffe der Familie gerechnet wird
         als der Grundwaffe - beim Umwandeln die unter "Fits in". */
      shownOn: shown ? { path: showOn, uniqueName: shown.uniqueName, name: shown.name } : null,
      name,
      fullName: name ? `${weaponName} ${name}` : weaponName,
      rank,
      maxRank: RIVEN_MAX_RANK,
      drain: RIVEN_BASE_DRAIN + rank,
      mr: fp.lvlReq ?? null,
      rerolls: fp.rerolls || 0,
      polarity: POLARITIES[fp.pol] || null,
      stats,
      /* Mittel der positiven Wuerfe - eine grobe Zahl fuer die Sortierung,
         keine Bewertung, welche Werte zur Waffe passen. */
      avgQuality: positives.reduce((sum, s) => sum + s.quality, 0) / positives.length,
      verified: stats.every(s => s.verified),
    },
  };
}

/**
 * Welche Rivens zu der Waffe passen, die der Umwandeln-Bildschirm zeigt.
 *
 * Rivens gibt es je Waffenfamilie; compat nennt die Grundwaffe. Der
 * Bildschirm laedt aber die Waffe unter "Fits in" - bei einer Familie die
 * Variante, die man besitzt. Gemessen am 2026-09-29 in Kaans Log: Scourge-
 * Riven mit Scourge Prime (PrimeScourge statt TnPriestSpear, anderer
 * Ordner), Hek-Riven mit Vaykor Hek, Cedo-Riven mit Cedo Prime.
 *
 *   1. Gleicher Pfad - Waffen ohne Familie (Nataruk, Torid) und Galariak
 *      Prime, die keine Grundversion hat.
 *   2. Gleiche Familie - der Name der Grundwaffe steht als ganzes Wort im
 *      Namen der gezeigten: "Scourge" in "Scourge Prime", "Hek" in "Vaykor
 *      Hek". Mehrere Treffer: der laengste Name gewinnt ("Dual Skana" vor
 *      "Skana"), und alle Rivens mit diesem Namen bleiben Kandidaten.
 *
 * @param shownPath  Waffenpfad aus dem Ladevorgang vor dem Bildschirm
 * @param rivens     [{ fp, template }] - die enthuellten Rivens
 * @param nameOf     Pfad -> Waffenname oder null
 * @returns die passenden Eintraege aus `rivens`, leer wenn keiner passt
 */
export function rivensForShownWeapon(shownPath, rivens, nameOf) {
  const exact = rivens.filter(r => r.fp?.compat === shownPath);
  if (exact.length) return exact;

  const baseName = p => nameOf(p) || (p.endsWith('Base') ? nameOf(p.slice(0, -'Base'.length)) : null);
  const shown = baseName(shownPath);
  if (!shown) return [];
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const family = rivens
    .map(r => ({ r, base: r.fp?.compat ? baseName(r.fp.compat) : null }))
    .filter(x => x.base && new RegExp(`(^|[\\s-])${escRe(x.base)}($|\\s)`, 'i').test(shown))
    .sort((a, b) => b.base.length - a.base.length);
  return family.filter(x => x.base === family[0]?.base).map(x => x.r);
}

/**
 * Alle Rivens aus dem Inventar.
 *
 * @returns {{ unveiled, veiled, unrevealed, unresolved }}
 *   unveiled    enthuellte Rivens mit Werten, Name und Wurfqualitaet
 *   veiled      verschleierte mit Aufgabe und Fortschritt
 *   unrevealed  ungeoeffnete Stapel je Art
 *   unresolved  was sich nicht aufloesen liess, mit Grund
 *
 * @param dispositions  Ergebnis von loadDispositions(), optional. Ohne gilt
 *                      die Disposition aus dem Katalog.
 */
export function buildRivens(inventory, catalog, { dispositions = null } = {}) {
  const byUniqueName = catalog?.byUniqueName || new Map();
  const unveiled = [];
  const veiled = [];
  const unresolved = [];

  for (const u of inventory?.Upgrades || []) {
    const type = String(u.ItemType || '');
    if (!type.includes(RIVEN_PATH)) continue;
    const id = u.ItemId?.$oid || u.ItemId || null;
    const template = byUniqueName.get(type);

    let fp;
    try { fp = JSON.parse(u.UpgradeFingerprint || '{}'); } catch { fp = null; }
    if (!fp) { unresolved.push({ id, type, reason: 'fingerprint unreadable' }); continue; }

    if (fp.challenge) {
      veiled.push({
        id,
        kind: kindOf(template, type),
        challenge: {
          text: challengeText(template, fp.challenge),
          progress: fp.challenge.Progress ?? 0,
          required: fp.challenge.Required ?? null,
        },
      });
      continue;
    }

    const res = rivenView(fp, template, catalog, { dispositions });
    if (res.error) {
      unresolved.push({ id, type, weapon: res.weapon || fp.compat || null, reason: res.error });
      continue;
    }
    unveiled.push({ id, ...res.view });
  }

  /* Ungeoeffnete: "RawMeleeRandomMod" und Verwandte, als Stapel mit Anzahl. */
  const unrevealed = [];
  for (const r of inventory?.RawUpgrades || []) {
    const type = String(r.ItemType || '');
    if (!type.includes(RIVEN_PATH) || !/\/Raw\w*RandomMod$/.test(type)) continue;
    unrevealed.push({ kind: kindOf(byUniqueName.get(type), type), count: r.ItemCount || 0, type });
  }

  unveiled.sort((a, b) => a.weapon.name.localeCompare(b.weapon.name));
  unrevealed.sort((a, b) => a.kind.localeCompare(b.kind));
  return { unveiled, veiled, unrevealed, unresolved };
}
