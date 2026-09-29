/**
 * Welche Werte man auf einem Riven fuer eine bestimmte Waffe haben will - und
 * wie gut ein Riven damit ist.
 *
 * WOHER "GEWUENSCHT" KOMMT: AUS DEM MARKT, NICHT AUS DEN WAFFENWERTEN.
 *   Naheliegend waere, es aus der Waffe zu rechnen: hohe kritische Chance, also
 *   Crit-Werte. Nachgemessen am 2026-09-29 stimmt das nicht. Torid (15 % Crit),
 *   Dual Toxocyst (5 %), Hek (10 %) und sogar Scourge (2 %) werden auf
 *   warframe.market mit Crit Chance, Crit Damage und Multishot gehandelt - wer
 *   aus den Grundwerten schaetzt, liegt genau bei den gefragten Rivens falsch.
 *
 *   Deshalb zaehlt, was die TEUREN Auktionen einer Waffe tragen: von den
 *   Angeboten (nach Preis absteigend, ein Abruf) das teuerste Viertel, und je
 *   Wert der Anteil dieser Spitze, die ihn traegt. An 22 Waffen gemessen trifft
 *   das durchweg das Bekannte:
 *
 *     Torid        Crit Damage 89 %  Crit Chance 92 %  Multishot 81 %
 *     Ocucor       Multishot 91 %    Crit Damage 82 %  Toxin 54 %
 *     Hate         Crit Damage 84 %  Attack Speed 51 % Crit Chance 48 %
 *     Vectis       Negativ Magazin 52 % - die Waffe hat einen Schuss im Magazin
 *
 *   Ob das ganze Angebot oder nur die teure Haelfte (500 von ueber 1000)
 *   gelesen wird, aendert an der Spitze nichts (Torid, Ocucor, Hate, Cedo
 *   gegengeprueft). Ein Abruf je Waffe reicht also - und mehr ist auch nicht
 *   drin, siehe riven-market.js zur Drosselung.
 *
 * DIE SCHWELLEN sind relativ zum staerksten Wert, weil duenne Maerkte flacher
 *   sind: bei Galariak Prime (134 Auktionen) fuehrt Schaden mit 39 %, bei der
 *   Torid Crit Chance mit 92 %. Eine feste Grenze von 45 % haette der Galariak
 *   gar nichts Gewuenschtes gelassen.
 *
 * OHNE MARKTDATEN - offline, oder die Waffe hat kaum Auktionen - gilt das
 *   Mittel der Waffenklasse aus derselben Messung (CLASS_SHARES). Das sagt
 *   "was Gewehr-Rivens allgemein tragen" und ist als Schaetzung gekennzeichnet.
 *
 * DIE NOTE (gradeRiven) mischt beides: ob ein Wert gewuenscht ist, zaehlt mehr
 *   als wie gut er gewuerfelt ist. Ein perfekt gerollter Wert, den niemand
 *   will, bleibt unbrauchbar; ein gewuenschter, schwach gewuerfelter Wert ist
 *   immer noch ein guter Riven.
 */

/* ------------------------------------------------------------------------
   Die Attribute. slug wie bei warframe.market (Suche und Auktionen), tags wie
   im UpgradeFingerprint. Nahkampf fuehrt Schaden und Fraktionsschaden unter
   eigenen Tags, meint aber dasselbe Attribut - an Kaans Hate-Riven
   (WeaponMeleeDamageMod) und an der Attributliste von warframe.market
   (WeaponDamageAmountMod als "Damage") abgeglichen.
   ------------------------------------------------------------------------ */
export const RIVEN_ATTRS = [
  // slug                                  Fingerprint-Tags                                            Name                                Kurz
  ['critical_chance',                     ['WeaponCritChanceMod'],                                    'Critical Chance',                  'Crit chance'],
  ['critical_damage',                     ['WeaponCritDamageMod'],                                    'Critical Damage',                  'Crit damage'],
  ['multishot',                           ['WeaponFireIterationsMod'],                                'Multishot',                        'Multishot'],
  ['base_damage_/_melee_damage',          ['WeaponDamageAmountMod', 'WeaponMeleeDamageMod'],          'Damage',                           'Damage'],
  ['fire_rate_/_attack_speed',            ['WeaponFireRateMod'],                                      'Fire Rate / Attack Speed',         'Fire rate'],
  ['status_chance',                       ['WeaponStunChanceMod'],                                    'Status Chance',                    'Status'],
  ['status_duration',                     ['WeaponProcTimeMod'],                                      'Status Duration',                  'Status duration'],
  ['toxin_damage',                        ['WeaponToxinDamageMod'],                                   'Toxin',                            'Toxin'],
  ['heat_damage',                         ['WeaponFireDamageMod'],                                    'Heat',                             'Heat'],
  ['cold_damage',                         ['WeaponFreezeDamageMod'],                                  'Cold',                             'Cold'],
  ['electric_damage',                     ['WeaponElectricityDamageMod'],                             'Electricity',                      'Electricity'],
  ['impact_damage',                       ['WeaponImpactDamageMod'],                                  'Impact',                           'Impact'],
  ['puncture_damage',                     ['WeaponArmorPiercingDamageMod'],                           'Puncture',                         'Puncture'],
  ['slash_damage',                        ['WeaponSlashDamageMod'],                                   'Slash',                            'Slash'],
  ['punch_through',                       ['WeaponPunctureDepthMod'],                                 'Punch Through',                    'Punch through'],
  ['reload_speed',                        ['WeaponReloadSpeedMod'],                                   'Reload Speed',                     'Reload'],
  ['magazine_capacity',                   ['WeaponClipMaxMod'],                                       'Magazine Capacity',                'Magazine'],
  ['ammo_maximum',                        ['WeaponAmmoMaxMod'],                                       'Ammo Maximum',                     'Ammo max'],
  ['recoil',                              ['WeaponRecoilReductionMod'],                               'Weapon Recoil',                    'Recoil'],
  ['zoom',                                ['WeaponZoomFovMod'],                                       'Zoom',                             'Zoom'],
  ['projectile_speed',                    ['WeaponProjectileSpeedMod'],                               'Projectile Speed',                 'Projectile speed'],
  ['damage_vs_corpus',                    ['WeaponFactionDamageCorpus', 'WeaponMeleeFactionDamageCorpus'],       'Damage to Corpus',   'vs Corpus'],
  ['damage_vs_grineer',                   ['WeaponFactionDamageGrineer', 'WeaponMeleeFactionDamageGrineer'],     'Damage to Grineer',  'vs Grineer'],
  ['damage_vs_infested',                  ['WeaponFactionDamageInfested', 'WeaponMeleeFactionDamageInfested'],   'Damage to Infested', 'vs Infested'],
  ['range',                               ['WeaponMeleeRangeIncMod'],                                 'Range',                            'Range'],
  ['channeling_damage',                   ['WeaponMeleeComboInitialBonusMod'],                        'Initial Combo',                    'Initial combo'],
  ['channeling_efficiency',               ['WeaponMeleeComboEfficiencyMod'],                          'Heavy Attack Efficiency',          'Heavy efficiency'],
  ['finisher_damage',                     ['WeaponMeleeFinisherDamageMod'],                           'Finisher Damage',                  'Finisher'],
  ['critical_chance_on_slide_attack',     ['SlideAttackCritChanceMod'],                               'Critical Chance for Slide Attack', 'Slide crit'],
  ['combo_duration',                      ['ComboDurationMod'],                                       'Combo Duration',                   'Combo duration'],
  ['chance_to_gain_extra_combo_count',    ['WeaponMeleeComboBonusOnHitMod'],                          'Additional Combo Count Chance',    'Extra combo'],
  ['chance_to_gain_combo_count',          ['WeaponMeleeComboPointsOnHitMod'],                         'Chance to Gain Combo Count',       'Combo chance'],
].map(([slug, tags, name, short]) => ({ slug, tags, name, short }));

const BY_SLUG = new Map(RIVEN_ATTRS.map(a => [a.slug, a]));
const BY_TAG = new Map(RIVEN_ATTRS.flatMap(a => a.tags.map(t => [t, a])));

/** Fingerprint-Tag -> slug, oder null fuer einen Tag, den es (noch) nicht gibt. */
export const tagToSlug = tag => BY_TAG.get(tag)?.slug || null;

/* Nahkampf nennt die Feuerrate Angriffstempo - derselbe slug, anderes Wort. */
const MELEE_CLASSES = new Set(['melee', 'zaw']);
export function attrLabel(slug, cls = null, { short = true } = {}) {
  const a = BY_SLUG.get(slug);
  if (!a) return String(slug || '').replace(/_/g, ' ');
  if (slug === 'fire_rate_/_attack_speed' && cls) return MELEE_CLASSES.has(cls) ? 'Attack speed' : 'Fire rate';
  return short ? a.short : a.name;
}

/* Wie warframe.market einen Wert fuehrt - nachgemessen an 17.000 Werten aus
   22 Waffen (2026-09-29): Fraktionsschaden als Faktor (1.46, negativ 0.72),
   Punch Through, Reichweite und Initial Combo ohne Einheit, Combo Duration
   in Sekunden, alles andere in Prozent. Recoil traegt das Vorzeichen der
   Wirkung: -72.7 ist weniger Rueckstoss, also gut. */
const AUCTION_UNIT = {
  damage_vs_corpus: 'factor', damage_vs_grineer: 'factor', damage_vs_infested: 'factor',
  punch_through: 'plain', range: 'plain', channeling_damage: 'plain', combo_duration: 'seconds'
};

/** Einheit eines Attributs bei warframe.market: percent | factor | plain | seconds. */
export const auctionUnit = slug => AUCTION_UNIT[slug] || 'percent';

/**
 * Ein Auktionswert auf Hoechstrang hochgerechnet - wie "Show ranked" im Spiel.
 *
 * warframe.market fuehrt die Werte auf dem Rang, mit dem der Riven eingestellt
 * ist: ein Torid-Riven auf Rang 0 steht dort mit "+14.9% Critical Damage", auf
 * Rang 8 waeren es +134 %. Nebeneinander verglichen waere das Unsinn. Der Rang
 * geht linear mit (Rang + 1) ein (rivens.js, an Kaans Karten gemessen); beim
 * Faktor nur der Aufschlag ueber 1.
 */
export function auctionValueAtMax(slug, value, rank, maxRank = 8) {
  const v = Number(value);
  const r = Number.isFinite(Number(rank)) ? Math.min(maxRank, Math.max(0, Number(rank))) : maxRank;
  const k = (maxRank + 1) / (r + 1);
  return AUCTION_UNIT[slug] === 'factor' ? 1 + (v - 1) * k : v * k;
}

/** Ein Auktionswert als Text, so wie ihn die Karte im Spiel zeigen wuerde. */
export function formatAuctionValue(slug, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '';
  const unit = AUCTION_UNIT[slug] || 'percent';
  if (unit === 'factor') return `x${String(Number(v.toFixed(2)))}`;
  const sign = v < 0 ? '-' : '+';
  const abs = String(Number(Math.abs(v).toFixed(1)));
  if (unit === 'seconds') return `${sign}${abs}s`;
  if (unit === 'plain') return `${sign}${abs}`;
  return `${sign}${abs}%`;
}

/* ------------------------------------------------------------------------
   Klasse eines Rivens. Die Art steht im Namen der Vorlage ("Rifle Riven
   Mod" -> "Rifle", rivens.js kindOf); warframe.market fuehrt Arch-Guns als
   Gruppe "archgun" mit dem Riven-Typ "rifle".
   ------------------------------------------------------------------------ */
const KIND_CLASS = {
  rifle: 'rifle', shotgun: 'shotgun', pistol: 'pistol', melee: 'melee',
  kitgun: 'kitgun', zaw: 'zaw', archgun: 'archgun'
};

/**
 * @param kind   Art aus der Vorlage: "Rifle", "Archgun", "Companion Weapon" …
 * @param market Eintrag aus der Waffenliste von warframe.market, falls bekannt
 */
export function rivenClass(kind, market = null) {
  if (market?.group === 'archgun') return 'archgun';
  const k = String(kind || '').toLowerCase().replace(/[^a-z]/g, '');
  if (KIND_CLASS[k]) return KIND_CLASS[k];
  /* Begleiterwaffen: die Art sagt nichts, der Riven-Typ der Waffe schon. */
  return KIND_CLASS[market?.rivenType] || 'rifle';
}

/* ------------------------------------------------------------------------
   Marktanteile aus Auktionen
   ------------------------------------------------------------------------ */

/* Weniger bereinigte Auktionen als das, und die Spitze waere eine Handvoll
   Zufaelle. Galariak Prime mit 122 ist das duennste gemessene Beispiel und
   liefert noch klare Ergebnisse. */
const MIN_SAMPLE = 20;
/* Das teuerste Viertel, mindestens zehn. */
const TOP_SHARE = 0.25;
const TOP_MIN = 10;
/* Mindestens so viele Rivens der Spitze muessen ueberhaupt einen negativen
   Wert haben, sonst sagt die Verteilung der Negativen nichts. */
const MIN_NEG_BASE = 8;

const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * Welche Werte die teuren Auktionen einer Waffe tragen.
 *
 * PREISE: Sofortkauf, sonst Startpreis. Weg faellt, was unter 5 Platin steht
 * (Platzhalter, "1p, Gebote willkommen") und was absurd teuer ist - 888.888
 * oder 12.345 sind keine Preise, sondern Scherze, und sie standen bei
 * Dual Toxocyst und Torid ganz oben. Absurd heisst: ueber dem Vierfachen des
 * 90-%-Werts UND ueber dem Zwanzigfachen des Medians.
 *
 * @param auctions  [{ price, pos: [slug], neg: [slug] }]
 * @returns { sample, topCount, topFrom, pos: {slug: Anteil}, neg: {slug: Anteil}, negBase }
 *          oder { thin: true, sample }, wenn es zu wenige sind
 */
export function marketShares(auctions) {
  const priced = (auctions || []).filter(a => Number.isFinite(a?.price) && a.price > 0);
  const prices = priced.map(a => a.price).sort((x, y) => x - y);
  if (!prices.length) return { thin: true, sample: 0 };
  const med = quantile(prices, 0.5);
  const p90 = quantile(prices, 0.9);
  const ceiling = Math.max(p90 * 4, med * 20);
  const clean = priced.filter(a => a.price >= 5 && a.price <= ceiling);
  if (clean.length < MIN_SAMPLE) return { thin: true, sample: clean.length };

  const top = [...clean].sort((x, y) => y.price - x.price)
    .slice(0, Math.max(TOP_MIN, Math.ceil(clean.length * TOP_SHARE)));
  const topNeg = top.filter(a => a.neg?.length);

  const count = (list, key) => {
    const out = {};
    for (const a of list) for (const s of new Set(a[key] || [])) out[s] = (out[s] || 0) + 1;
    for (const s of Object.keys(out)) out[s] /= list.length;
    return out;
  };
  return {
    sample: clean.length,
    topCount: top.length,
    topFrom: top.at(-1).price,
    pos: count(top, 'pos'),
    neg: topNeg.length ? count(topNeg, 'neg') : {},
    negBase: topNeg.length
  };
}

/* Die Regeln, nach denen aus Anteilen Wuensche werden - an allen 22 Waffen
   dieselben:
     best      die bis zu drei staerksten, mit mindestens 25 % und mindestens
               55 % des staerksten Werts (drei Plaetze hat ein Riven)
     good      die naechsten bis zu vier mit mindestens 15 % und 20 % des
               staerksten
     harmless  Negative, die mindestens 10 % der Spitze tragen - bis zu fuenf,
               und nie ein Wert, der positiv gewuenscht ist */
const BEST = { min: 0.25, rel: 0.55, max: 3 };
const GOOD = { min: 0.15, rel: 0.2, max: 4 };
const HARMLESS = { min: 0.1, max: 5 };

export function classifyShares(shares) {
  const pos = Object.entries(shares?.pos || {}).sort((a, b) => b[1] - a[1]);
  const top = pos[0]?.[1] || 0;
  const best = pos.filter(([, v]) => v >= BEST.min && v >= top * BEST.rel).slice(0, BEST.max);
  const bestSet = new Set(best.map(([s]) => s));
  const good = pos.filter(([s, v]) => !bestSet.has(s) && v >= GOOD.min && v >= top * GOOD.rel).slice(0, GOOD.max);
  const wanted = new Set([...bestSet, ...good.map(([s]) => s)]);
  const harmless = (shares?.negBase ?? MIN_NEG_BASE) >= MIN_NEG_BASE
    ? Object.entries(shares?.neg || {}).sort((a, b) => b[1] - a[1])
        .filter(([s, v]) => v >= HARMLESS.min && !wanted.has(s)).slice(0, HARMLESS.max)
    : [];
  const pack = list => list.map(([slug, share]) => ({ slug, share: Math.round(share * 100) / 100 }));
  return { best: pack(best), good: pack(good), harmless: pack(harmless) };
}

/**
 * Wuensche fuer eine Waffe aus ihren Auktionen, oder null, wenn der Markt zu
 * duenn ist.
 */
export function deriveWants(auctions) {
  const shares = marketShares(auctions);
  if (shares.thin) return { thin: true, sample: shares.sample };
  const wants = classifyShares(shares);
  /* Reichen die Negativen der Spitze nicht, bleiben sie leer - gradeRiven
     nimmt dann die der Klasse dazu (mergeClassNegatives). */
  return { ...wants, sample: shares.sample, topCount: shares.topCount, topFrom: shares.topFrom,
           negativesThin: shares.negBase < MIN_NEG_BASE };
}

/* ------------------------------------------------------------------------
   Klassenmittel - gemessen am 2026-09-29, je Waffe das teuerste Viertel,
   dann ueber die Waffen gemittelt (jede Waffe zaehlt gleich):
     rifle    Torid, Baza, AX-52, Scourge, Hind, Vectis, Nataruk, Rubico
     shotgun  Cedo, Hek
     pistol   Ocucor, Dual Toxocyst, EFV-8 Mars
     melee    Hate, Galariak Prime, Ceramic Dagger
     kitgun   Catchmoon, Rattleguts
     zaw      Balla, Plague Kripath
     archgun  Imperator, Kuva Ayanga
   Es sind die Anteile, nicht die Einteilung - classifyShares macht daraus
   Wuensche nach denselben Regeln wie bei einer einzelnen Waffe.
   ------------------------------------------------------------------------ */
export const CLASS_SHARES = {
  rifle: {
    pos: { critical_damage: 0.69, critical_chance: 0.64, multishot: 0.62, 'base_damage_/_melee_damage': 0.26, toxin_damage: 0.13, 'fire_rate_/_attack_speed': 0.09, heat_damage: 0.08, status_chance: 0.06 },
    neg: { zoom: 0.19, magazine_capacity: 0.16, recoil: 0.13, damage_vs_infested: 0.08, ammo_maximum: 0.06, reload_speed: 0.06, impact_damage: 0.06, puncture_damage: 0.05 }
  },
  shotgun: {
    pos: { multishot: 0.77, critical_damage: 0.66, critical_chance: 0.47, 'base_damage_/_melee_damage': 0.23, 'fire_rate_/_attack_speed': 0.21, toxin_damage: 0.16, status_chance: 0.09, electric_damage: 0.06 },
    neg: { puncture_damage: 0.21, recoil: 0.15, damage_vs_infested: 0.09, ammo_maximum: 0.09, magazine_capacity: 0.08, damage_vs_corpus: 0.06, damage_vs_grineer: 0.06, reload_speed: 0.06 }
  },
  pistol: {
    pos: { multishot: 0.75, critical_damage: 0.73, critical_chance: 0.41, 'base_damage_/_melee_damage': 0.24, toxin_damage: 0.2, 'fire_rate_/_attack_speed': 0.12, punch_through: 0.09, heat_damage: 0.07 },
    neg: { zoom: 0.21, puncture_damage: 0.18, recoil: 0.14, projectile_speed: 0.09, damage_vs_infested: 0.09, impact_damage: 0.07, slash_damage: 0.04, ammo_maximum: 0.04 }
  },
  melee: {
    pos: { critical_damage: 0.64, critical_chance: 0.48, 'base_damage_/_melee_damage': 0.32, 'fire_rate_/_attack_speed': 0.29, range: 0.25, channeling_damage: 0.15, electric_damage: 0.12, toxin_damage: 0.08 },
    neg: { critical_chance_on_slide_attack: 0.23, finisher_damage: 0.16, channeling_efficiency: 0.12, puncture_damage: 0.11, damage_vs_infested: 0.09, slash_damage: 0.05, damage_vs_grineer: 0.05, impact_damage: 0.04 }
  },
  kitgun: {
    pos: { critical_chance: 0.53, critical_damage: 0.48, multishot: 0.47, 'base_damage_/_melee_damage': 0.32, toxin_damage: 0.16, status_chance: 0.13, heat_damage: 0.11, 'fire_rate_/_attack_speed': 0.11 },
    neg: { zoom: 0.15, impact_damage: 0.15, ammo_maximum: 0.1, puncture_damage: 0.1, recoil: 0.07, damage_vs_infested: 0.07, damage_vs_corpus: 0.07, status_duration: 0.07 }
  },
  zaw: {
    pos: { critical_damage: 0.57, critical_chance: 0.53, 'fire_rate_/_attack_speed': 0.38, 'base_damage_/_melee_damage': 0.3, range: 0.22, heat_damage: 0.14, toxin_damage: 0.13, cold_damage: 0.12 },
    neg: { critical_chance_on_slide_attack: 0.14, impact_damage: 0.1, finisher_damage: 0.1, puncture_damage: 0.1, damage_vs_infested: 0.08, channeling_efficiency: 0.07, status_duration: 0.07, damage_vs_grineer: 0.07 }
  },
  archgun: {
    pos: { critical_chance: 0.54, multishot: 0.51, critical_damage: 0.45, 'base_damage_/_melee_damage': 0.26, 'fire_rate_/_attack_speed': 0.16, damage_vs_corpus: 0.16, electric_damage: 0.13, ammo_maximum: 0.12 },
    neg: { zoom: 0.23, recoil: 0.16, impact_damage: 0.13, status_duration: 0.1, status_chance: 0.09, damage_vs_grineer: 0.08, magazine_capacity: 0.06, ammo_maximum: 0.04 }
  }
};

/** Die Wuensche einer Klasse, nach denselben Regeln wie fuer eine Waffe. */
export function classWants(cls) {
  const shares = CLASS_SHARES[cls] || CLASS_SHARES.rifle;
  return classifyShares({ ...shares, negBase: MIN_NEG_BASE });
}

/* ------------------------------------------------------------------------
   Noten
   ------------------------------------------------------------------------ */

/* Wie viel ein positiver Wert ist, je nachdem, ob man ihn will. */
const POS_FIT = { best: 1, good: 0.7, neutral: 0.35 };
/* Und wie sehr der Wurf daneben noch zaehlt: ein gewuenschter Wert bleibt
   mit dem schlechtesten Wurf bei 75 % seines Werts. Die Spanne eines Wurfs
   ist nur 0,9 bis 1,1 (rivens.js) - der Unterschied zwischen zwei Werten
   ist dagegen der zwischen "gesucht" und "nutzlos". */
const ROLL_WEIGHT = 0.25;

/* Der negative Wert allein: unschaedlich ist ideal, er hebt die positiven um
   ein Viertel. Einer auf einem gewuenschten Wert kostet genau das, was man
   haben wollte. */
const NEG_SCORE = { harmless: 0.9 };
/* Und was er am ganzen Riven aendert - als Faktor auf das Mittel der
   positiven. Ohne negativen Wert fehlt nur der Aufschlag von 25 %. */
const NEG_FACTOR = { none: 0.96, harmless: 1, neutral: [0.92, 0.98], good: 0.8, best: 0.6 };

/* Buchstaben von S bis F. Die Grenzen sind so gelegt, dass drei gewuenschte
   Werte mit mittlerem Wurf und einem unschaedlichen Negativen bei A landen,
   einer ohne jeden gewuenschten Wert bei F. */
const LETTERS = [
  [0.92, 'S'], [0.87, 'A+'], [0.83, 'A'], [0.79, 'A-'], [0.74, 'B+'], [0.69, 'B'], [0.64, 'B-'],
  [0.58, 'C+'], [0.52, 'C'], [0.46, 'C-'], [0.36, 'D'], [-Infinity, 'F']
];
const WORDS = { S: 'God roll', A: 'Great', B: 'Good', C: 'Decent', D: 'Weak', F: 'Poor' };

export const gradeLetter = score => LETTERS.find(([min]) => score >= min)[1];
export const gradeWord = letter => WORDS[String(letter || '').charAt(0)] || '';

/**
 * Wie gut ein Riven fuer seine Waffe ist.
 *
 * @param stats  view.stats aus rivens.js: { tag, curse, quality }
 * @param wants  { best, good, harmless } - von der Waffe oder der Klasse
 * @returns { score, letter, word, stats: [{ slug, fit, score, letter }] }
 *   fit: best | good | neutral bei positiven, harmless | neutral | good | best
 *   bei negativen (ein negativer auf einem gewuenschten Wert heisst wie der
 *   Wunsch, den er trifft)
 */
export function gradeRiven(stats, wants) {
  const best = new Set((wants?.best || []).map(w => w.slug));
  const good = new Set((wants?.good || []).map(w => w.slug));
  const harmless = new Set((wants?.harmless || []).map(w => w.slug));

  const graded = (stats || []).map(s => {
    const slug = tagToSlug(s.tag);
    const q = Math.min(1, Math.max(0, Number(s.quality) || 0));
    if (!s.curse) {
      const fit = best.has(slug) ? 'best' : good.has(slug) ? 'good' : 'neutral';
      const score = POS_FIT[fit] * (1 - ROLL_WEIGHT + ROLL_WEIGHT * q);
      return { slug, curse: false, fit, score };
    }
    const fit = best.has(slug) ? 'best' : good.has(slug) ? 'good' : harmless.has(slug) ? 'harmless' : 'neutral';
    /* Beim negativen ist quality 1 der mildeste Wurf. Bei einem unschaedlichen
       ist die Groesse gleich: er schadet ja nicht. */
    const score = fit === 'harmless' ? NEG_SCORE.harmless
      : fit === 'neutral' ? 0.6 * (0.7 + 0.3 * q)
      : fit === 'good' ? 0.3 * (0.5 + 0.5 * q)
      : 0.1;
    return { slug, curse: true, fit, score };
  });

  const positives = graded.filter(s => !s.curse);
  const negative = graded.find(s => s.curse) || null;
  const mean = positives.length ? positives.reduce((n, s) => n + s.score, 0) / positives.length : 0;
  const q = negative ? Math.min(1, Math.max(0, Number(stats.find(s => s.curse)?.quality) || 0)) : 0;
  const factor = !negative ? NEG_FACTOR.none
    : negative.fit === 'neutral' ? NEG_FACTOR.neutral[0] + (NEG_FACTOR.neutral[1] - NEG_FACTOR.neutral[0]) * q
    : NEG_FACTOR[negative.fit];
  const score = Math.round(mean * factor * 1000) / 1000;
  const letter = gradeLetter(score);

  return {
    score,
    letter,
    word: gradeWord(letter),
    stats: graded.map(s => ({ ...s, score: Math.round(s.score * 1000) / 1000, letter: gradeLetter(s.score) }))
  };
}

/**
 * Wuensche fuer die Anzeige: slug, Name je Klasse, Anteil.
 * Die Oberflaeche braucht den Namen, rechnen muss sie nichts.
 */
export function labelWants(wants, cls) {
  const lab = list => (list || []).map(w => ({ ...w, label: attrLabel(w.slug, cls) }));
  return { best: lab(wants?.best), good: lab(wants?.good), harmless: lab(wants?.harmless) };
}

/**
 * Wenn der Markt einer Waffe zu wenige Negative hergibt, fuellen die der
 * Klasse auf - die positiven Wuensche bleiben die der Waffe.
 */
export function mergeClassNegatives(wants, cls) {
  if (!wants?.negativesThin || wants.harmless?.length) return wants;
  const wanted = new Set([...(wants.best || []), ...(wants.good || [])].map(w => w.slug));
  return { ...wants, harmless: classWants(cls).harmless.filter(w => !wanted.has(w.slug)) };
}
