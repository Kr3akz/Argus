#!/usr/bin/env node
/**
 * Prueft die Riven-Umrechnung gegen das, was das Spiel anzeigt.
 *
 *   node src/cli/riven-test.js
 *
 * Teil 1 und 2 laufen ohne Daten auf der Platte: die Messpunkte stehen hier
 * drin, abgelesen am 2026-09-29 aus Screenshots von Kaans Mod-Bildschirm und
 * gegen die Fingerprints derselben Rivens gestellt. Teil 3 rechnet das echte
 * Inventar durch, wenn eins da ist. Teil 4 prueft Wuensche und Noten
 * (riven-wants.js) an Marktanteilen, die am 2026-09-29 gemessen wurden -
 * ebenfalls ohne Netz.
 */
import { computeStat, rivenName, buildRivens } from '../core/rivens.js';

let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};

/* ------------------------------------------------------------------------
   Teil 1: 32 Werte aus elf Karten. Je Zeile: Tag, Anzeigeform und
   Basiswert aus der Vorlage, Value aus dem Fingerprint, dann die Karte.
   ------------------------------------------------------------------------ */
const RIVENS = [
  { name: 'Hate', rank: 8, disposition: 1.1, stats: [
    ['WeaponCritDamageMod', '|val|% Critical Damage', 0.0099999998, 935887879, false, '+99.7%'],
    ['WeaponMeleeDamageMod', '|val|% Melee Damage', 0.018300001, 572554327, false, '+171%'],
    ['WeaponMeleeFactionDamageGrineer', '|val| Damage to Grineer', 0.0049999999, 592427818, false, 'x1.47'],
    ['WeaponMeleeFinisherDamageMod', '|val|% Finisher Damage', 0.0133, 826028680, true, '-104.1%'],
  ] },
  { name: 'Torid', rank: 8, disposition: 1.3, stats: [
    ['WeaponCritDamageMod', '|val|% Critical Damage', 0.013333, 22059498, false, '+105.8%'],
    ['WeaponFireIterationsMod', '|val|% Multishot', 0.0099999998, 554640753, false, '+88%'],
    ['WeaponCritChanceMod', '|val|% Critical Chance', 0.016666001, 399041954, false, '+142.5%'],
  ] },
  { name: 'Ocucor', rank: 8, disposition: 1.2, stats: [
    ['WeaponElectricityDamageMod', '|val|% <DT_ELECTRICITY_COLOR>Electricity', 0.0099999998, 284106141, false, '+96.5%'],
    ['WeaponCritChanceMod', '|val|% Critical Chance', 0.016666001, 800134701, false, '+177%'],
    ['WeaponFireIterationsMod', '|val|% Multishot', 0.0133, 976378591, false, '+145.7%'],
    ['WeaponZoomFovMod', '|val|% Zoom', 0.0088999998, 548826945, true, '-72.3%'],
  ] },
  { name: 'Dual Toxocyst', rank: 8, disposition: 1.35, stats: [
    ['WeaponCritDamageMod', '|val|% Critical Damage', 0.0099999998, 326200055, false, '+115.6%'],
    ['WeaponFireIterationsMod', '|val|% Multishot', 0.0133, 245922878, false, '+151.3%'],
  ] },
  { name: 'Scourge', rank: 0, disposition: 1.2, stats: [
    ['WeaponFactionDamageInfested', '|val| Damage to Infested', 0.0049999999, 441322987, false, 'x1.07'],
    ['WeaponReloadSpeedMod', '|val|% Reload Speed', 0.0055550002, 281722927, false, '+7.9%'],
    ['WeaponProjectileSpeedMod', '|val|% Projectile Speed', 0.0099999998, 822337458, true, '-6.3%'],
  ] },
  /* Zweite Runde, alle Rang 0. Hind prueft den Rang gegen F(2+0) von Rang 8,
     Hek die Familien-Disposition und Punch Through, Galariak Prime die
     frische Disposition (0,9 statt 0,8 im alten Katalog), Range und
     Slide-Crit. */
  { name: 'Hind', rank: 0, disposition: 1.42, stats: [
    ['WeaponFreezeDamageMod', '|val|% <DT_FREEZE_COLOR>Cold', 0.0099999998, 705891383, false, '+14.5%'],
    ['WeaponProcTimeMod', '|val|% Status Duration', 0.01111, 799563771, false, '+16.4%'],
  ] },
  { name: 'Hek (family)', rank: 0, disposition: 1.2, stats: [
    ['WeaponPunctureDepthMod', '|val| Punch Through', 0.029999999, 1018203435, false, '+0.3'],
    ['WeaponFreezeDamageMod', '|val|% <DT_FREEZE_COLOR>Cold', 0.0099999998, 664350547, false, '+9.2%'],
    ['WeaponFactionDamageInfested', '|val| Damage to Infested', 0.0049999999, 67739717, false, 'x1.04'],
  ] },
  { name: 'Baza', rank: 0, disposition: 1.05, stats: [
    ['WeaponReloadSpeedMod', '|val|% Reload Speed', 0.0055550002, 109508832, false, '+6.6%'],
    ['WeaponClipMaxMod', '|val|% Magazine Capacity', 0.0055550002, 475346997, false, '+7.1%'],
    ['WeaponZoomFovMod', '|val|% Zoom', 0.006666, 277507139, true, '-3.3%'],
  ] },
  { name: 'Galariak Prime', rank: 0, disposition: 0.89999998, stats: [
    ['WeaponMeleeRangeIncMod', '|val| Range', 0.021579999, 567348873, false, '+0.2'],
    ['SlideAttackCritChanceMod', '|STAT1|% Critical Chance for Slide Attack', 0.013334, 247289960, false, '+14%'],
    ['WeaponArmorPiercingDamageMod', '|val|% <DT_PUNCTURE_COLOR>Puncture', 0.0133, 574758233, true, '-6%'],
  ] },
  /* Dritte Runde: der Umwandeln-Bildschirm, "Show ranked" an, also Rang 8.
     Er rechnet mit der Waffe unter "Fits in" - Scourge Prime, 1,1 - und
     nicht mit der Grundwaffe des Rivens (Scourge, 1,2). Puratak legt dabei
     F fuer den negativen Wert bei 2 positiven auf 4,95 fest; Zetidra zeigt
     Rueckstoss mit negativer Basis als Staerke. */
  { name: 'Puratak (Prime)', rank: 8, disposition: 1.1, stats: [
    ['WeaponFactionDamageInfested', '|val| Damage to Infested', 0.0049999999, 441322987, false, 'x1.6'],
    ['WeaponReloadSpeedMod', '|val|% Reload Speed', 0.0055550002, 281722927, false, '+64.8%'],
    ['WeaponProjectileSpeedMod', '|val|% Projectile Speed', 0.0099999998, 822337458, true, '-51.6%'],
  ] },
  { name: 'Zetidra (Prime)', rank: 8, disposition: 1.1, stats: [
    ['WeaponRecoilReductionMod', '|val|% Weapon Recoil', -0.0099999998, 457998870, false, '-96.6%'],
    ['WeaponFireRateMod', '|val|% Fire Rate (x2 for Bows)', 0.00667, 33872852, false, '+59.2%'],
  ] },
];

console.log('=== Teil 1: Werte gegen die Karte im Spiel ===');
for (const r of RIVENS) {
  const buffCount = r.stats.filter(s => !s[4]).length;
  const hasCurse = r.stats.some(s => s[4]);
  for (const [tag, locTag, base, value, curse, shown] of r.stats) {
    const s = computeStat({
      entry: { tag, upgradeValues: [{ locTag, value: base }] },
      value, curse, buffCount, hasCurse, disposition: r.disposition, rank: r.rank,
    });
    ok(`${r.name.padEnd(14)} ${s.label.padEnd(20)}`, s.text === shown,
       `gerechnet ${s.text}, Karte ${shown}`);
  }
}

/* ------------------------------------------------------------------------
   Teil 2: die 15 Namen aus dem Raster. Je Riven die positiven Werte mit
   Vorsilbe, Endsilbe und Value, in der Reihenfolge des Fingerprints.
   ------------------------------------------------------------------------ */
const NAMES = [
  ['Acri-argiata', [['acri', 'tis', 935887879], ['visi', 'ata', 572554327], ['argi', 'con', 592427818]]],
  ['Argi-decido', [['argi', 'con', 852061648], ['geli', 'do', 219993970], ['deci', 'des', 427192325]]],
  ['Deci-heracron', [['hera', 'lis', 608573623], ['crita', 'cron', 8259693], ['deci', 'des', 860459904]]],
  ['Ampi-saticron', [['sati', 'can', 874014967], ['crita', 'cron', 444605859], ['ampi', 'bin', 910894089]]],
  ['Forti-vexipha', [['vexi', 'tio', 871559261], ['igni', 'pha', 842475995], ['forti', 'us', 944310120]]],
  ['Loctinent', [['locti', 'tor', 567348873], ['pleci', 'nent', 247289960]]],
  ['Sati-critatis', [['acri', 'tis', 22059498], ['sati', 'can', 554640753], ['crita', 'cron', 399041954]]],
  ['Lexi-ignicon', [['lexi', 'nok', 723715914], ['igni', 'pha', 135769670], ['argi', 'con', 44861520]]],
  ['Igni-armanok', [['lexi', 'nok', 133725979], ['igni', 'pha', 868658101], ['arma', 'tin', 417306649]]],
  ['Lexi-geliada', [['lexi', 'nok', 1018203435], ['geli', 'do', 664350547], ['pura', 'ada', 67739717]]],
  ['Sati-critatio', [['vexi', 'tio', 284106141], ['crita', 'cron', 800134701], ['sati', 'can', 976378591]]],
  ['Acrican', [['acri', 'tis', 326200055], ['sati', 'can', 245922878]]],
  ['Armatak', [['feva', 'tak', 109508832], ['arma', 'tin', 475346997]]],
  ['Puratak', [['pura', 'ada', 441322987], ['feva', 'tak', 281722927]]],
  ['Decido', [['geli', 'do', 705891383], ['deci', 'des', 799563771]]],
];

console.log('\n=== Teil 2: Namen gegen das Raster im Spiel ===');
for (const [expected, buffs] of NAMES) {
  const name = rivenName(buffs.map(([prefixTag, suffixTag, value]) =>
    ({ value, entry: { prefixTag, suffixTag } })));
  ok(expected.padEnd(15), name === expected, name === expected ? '' : `gerechnet ${name}`);
}

/* ------------------------------------------------------------------------
   Teil 2b: der Umwandeln-Bildschirm aus dem Log. Die Zeilen stammen aus
   Kaans EE.log vom 2026-09-29 (gekuerzt): Nataruk umgewandelt, danach
   Torid und Ocucor nur geoeffnet. Davor zwei Stoerer - eine Waffe, die
   lange vorher geladen wurde, und eine Schlusszeile ohne offenen Bildschirm.
   ------------------------------------------------------------------------ */
const { RivenCycleWatch } = await import('../core/riven-cycle.js');
const CYCLE_LOG = [
  '15400.000 Sys [Info]: ResourceLoader 0x0000017800000000 (/Lotus/Weapons/Tenno/Pistol/Lato) Found 10 items to load (0ms)',
  '15450.000 Sys [Info]: Flushed 192 bytes of recycled effects.',
  '15560.102 Sys [Info]: ResourceLoader 0x00000178E5A0DBB0 (/Lotus/Weapons/Tenno/Bows/Omicrus/OmicrusPlayerWep) Found 1,185 items to load (0ms)',
  '15560.103 Sys [Info]: Created /Lotus/Interface/OmegaRerollSelection.swf',
  '15560.762 Script [Info]: OmegaRerollSelection.lua: Diorama setup',
  '15563.844 Script [Info]: Dialog.lua: Dialog::CreateOkCancel(description=Are you sure you want to cycle Nataruk Igni-armanok for 900?, title= leftItem=/Menu/Confirm_Item_Yes, rightItem=/Menu/Confirm_Item_No)',
  '15566.032 Script [Info]: Dialog.lua: Dialog::SendResult(4)',
  '15566.159 Script [Info]: Dialog.lua: Dialog::CreateOkCancel(description=/Lotus/Language/Menu/NavBar_QuickMatchPleaseWait, title= leftItem=nil, rightItem=nil)',
  '15576.863 Script [Info]: Dialog.lua: Dialog::CreateOkCancel(description=Cycle Riven into current selection?, title= leftItem=/Menu/Confirm_Item_Yes, rightItem=/Menu/Confirm_Item_No)',
  '15577.542 Script [Info]: Dialog.lua: Dialog::SendResult(4)',
  '15577.668 Script [Info]: Dialog.lua: Dialog::CreateOkCancel(description=/Lotus/Language/Menu/NavBar_QuickMatchPleaseWait, title= leftItem=nil, rightItem=nil)',
  '15579.425 Sys [Info]: Flushed 43,280 bytes of recycled effects.',
  '15586.385 Sys [Info]: ResourceLoader 0x000001782776A5D0 (/Lotus/Weapons/ClanTech/Bio/BioWeapon) Found 823 items to load (0ms)',
  '15586.386 Sys [Info]: Created /Lotus/Interface/OmegaRerollSelection.swf',
  '15608.212 Sys [Info]: Flushed 80 bytes of recycled effects.',
  '15612.126 Sys [Info]: ResourceLoader 0x0000017831944DB0 (/Lotus/Weapons/Corpus/Pistols/CrpSentExperimentPistol/CrpSentExperimentPistol) Found 564 items to load (0ms)',
  '15612.126 Sys [Info]: Created /Lotus/Interface/OmegaRerollSelection.swf',
  '15615.279 Sys [Info]: Flushed 80 bytes of recycled effects.',
];

console.log('\n=== Teil 2b: Umwandeln-Bildschirm aus dem Log ===');
const events = [];
const watch = new RivenCycleWatch((type, data) => events.push(
  type === 'open' ? `open ${String(data.weaponPath).split('/').pop()}`
  : type === 'roll' ? `roll ${data.name} ${data.kuva}`
  : type === 'close' ? `close ${data.reason}` : type));
CYCLE_LOG.forEach(l => watch.handleLine(l));
const EXPECTED = [
  'open OmicrusPlayerWep', 'roll Nataruk Igni-armanok 900', 'choice', 'close closed',
  'open BioWeapon', 'close closed',
  'open CrpSentExperimentPistol', 'close closed',
];
ok('Ereignisfolge wie im Spiel', JSON.stringify(events) === JSON.stringify(EXPECTED), events.join(' | '));

/* ------------------------------------------------------------------------
   Teil 2c: welcher Stand gilt, welcher ist neu. Die Lage im Speicher nach
   Kaans Nataruk-Umwandlung (alter Wurf behalten), gemessen am 2026-09-29:
   der alte Stand elfmal (einmal als eigenes Objekt), der behaltene mit
   rerolls 1 zweimal (einmal eigen), der abgelehnte nur in der Serverantwort.
   ------------------------------------------------------------------------ */
const { pickCurrent, pickNewRoll } = await import('../core/riven-scan.js');
const OLD = [{ Tag: 'WeaponPunctureDepthMod', Value: 133725979 }, { Tag: 'WeaponFireDamageMod', Value: 868658101 }, { Tag: 'WeaponClipMaxMod', Value: 417306649 }];
const NEW = [{ Tag: 'WeaponFactionDamageCorpus', Value: 1 }, { Tag: 'WeaponPunctureDepthMod', Value: 2 }];
const HEAP = [
  { fp: { compat: 'x', buffs: OLD, rerolls: 0 }, copies: 11, plainCopies: 1 },
  { fp: { compat: 'x', buffs: OLD, rerolls: 1 }, copies: 2, plainCopies: 1 },
  { fp: { compat: 'x', buffs: NEW, rerolls: 1 }, copies: 1, plainCopies: 0 },
];
/* ------------------------------------------------------------------------
   Teil 2d: welcher Riven zur gezeigten Waffe gehoert. Der Bildschirm laedt
   bei einer Familie die Variante, die man besitzt - Pfade aus Kaans Log.
   ------------------------------------------------------------------------ */
const { rivensForShownWeapon } = await import('../core/rivens.js');
const NAMES_BY_PATH = {
  '/Lotus/Weapons/Tenno/LongGuns/PrimeScourge/PrimeScourgeWeapon': 'Scourge Prime',
  '/Lotus/Weapons/Tenno/LongGuns/TnPriestSpear/TnPriestSpearGun': 'Scourge',
  '/Lotus/Weapons/Syndicates/SteelMeridian/LongGuns/SMHek': 'Vaykor Hek',
  '/Lotus/Weapons/Tenno/Shotgun/QuadShotgun': 'Hek',
  '/Lotus/Weapons/Tenno/LongGuns/PrimeCedo/PrimeCedoWeapon': 'Cedo Prime',
  '/Lotus/Weapons/Tenno/LongGuns/TnAlchemistShotgun/TnAlchemistShotgun': 'Cedo',
  '/Lotus/Weapons/Grineer/Melee/Scythe/GrnDrillScythe/GrnDrillScythe': 'Galariak Prime',
  '/x/Skana': 'Skana', '/x/DualSkana': 'Dual Skana', '/x/PrismaSkana': 'Prisma Skana',
};
const nameOf = p => NAMES_BY_PATH[p] || null;
const OWNED = [
  { fp: { compat: '/Lotus/Weapons/Tenno/LongGuns/TnPriestSpear/TnPriestSpearGun' }, id: 'Scourge' },
  { fp: { compat: '/Lotus/Weapons/Tenno/Shotgun/QuadShotgunBase' }, id: 'Hek' },
  { fp: { compat: '/Lotus/Weapons/Tenno/LongGuns/TnAlchemistShotgun/TnAlchemistShotgun' }, id: 'Cedo' },
  { fp: { compat: '/Lotus/Weapons/Grineer/Melee/Scythe/GrnDrillScythe/GrnDrillScythe' }, id: 'Galariak' },
  { fp: { compat: '/x/Skana' }, id: 'Skana' }, { fp: { compat: '/x/DualSkana' }, id: 'DualSkana' },
];
console.log('\n=== Teil 2d: Riven zur gezeigten Waffe ===');
for (const [shown, want] of [
  ['/Lotus/Weapons/Tenno/LongGuns/PrimeScourge/PrimeScourgeWeapon', 'Scourge'],
  ['/Lotus/Weapons/Syndicates/SteelMeridian/LongGuns/SMHek', 'Hek'],
  ['/Lotus/Weapons/Tenno/LongGuns/PrimeCedo/PrimeCedoWeapon', 'Cedo'],
  ['/Lotus/Weapons/Grineer/Melee/Scythe/GrnDrillScythe/GrnDrillScythe', 'Galariak'],
  ['/x/PrismaSkana', 'Skana'],
  ['/x/DualSkana', 'DualSkana'],
]) {
  const got = rivensForShownWeapon(shown, OWNED, nameOf).map(r => r.id).join(',');
  ok(`${NAMES_BY_PATH[shown].padEnd(15)} -> ${want}`, got === want, got || 'nichts');
}

console.log('\n=== Teil 2c: Staende im Speicher ===');
const cur = pickCurrent(HEAP);
ok('nach der Wahl gilt der behaltene', cur.rerolls === 1 && cur.buffs === OLD);
const neu = pickNewRoll(HEAP, HEAP[0].fp);
ok('neuer Wurf zum Stand davor ist der andere', neu && neu.buffs === NEW);
ok('ohne neuen Wurf im Speicher: null', pickNewRoll(HEAP.slice(0, 2), HEAP[0].fp) === null);

/* ------------------------------------------------------------------------
   Teil 3: das echte Inventar, falls vorhanden. Keine festen Zahlen - ein
   Inventar aendert sich mit jeder Umwandlung.
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 3: echtes Inventar ===');
let inventory = null;
let catalog = null;
let dispositions = null;
try {
  const { loadInventory } = await import('../core/inventory.js');
  const { loadCatalog } = await import('../core/catalog.js');
  const { loadDispositions } = await import('../core/dispositions.js');
  ({ inventory } = await loadInventory());
  catalog = await loadCatalog();
  dispositions = await loadDispositions();
} catch (err) {
  console.log(`  uebersprungen: ${err.message}`);
}

if (inventory && catalog) {
  const view = buildRivens(inventory, catalog, { dispositions });
  ok('Dispositionen frisch geholt', view.unveiled.every(r => r.weapon.fresh),
     dispositions ? `Stand ${new Date(dispositions.fetchedAt).toLocaleString('de-DE')}` : 'kein Abruf moeglich');
  ok('alles aufgeloest', view.unresolved.length === 0,
     view.unresolved.map(u => `${u.weapon || u.type}: ${u.reason}`).join('; '));
  ok('jeder enthuellte hat einen Namen', view.unveiled.every(r => r.name),
     view.unveiled.filter(r => !r.name).map(r => r.weapon.name).join(', '));
  ok('jede Aufgabe hat einen Text', view.veiled.every(v => v.challenge.text),
     `${view.veiled.length} verschleiert`);
  ok('Wurfqualitaet zwischen 0 und 1',
     view.unveiled.every(r => r.stats.every(s => s.quality >= 0 && s.quality <= 1)));

  console.log('');
  for (const r of view.unveiled) {
    const mark = r.verified ? ' ' : '~';
    console.log(`  ${mark} ${r.fullName.padEnd(28)} R${r.rank} MR${String(r.mr).padEnd(3)} ⟳${String(r.rerolls).padEnd(3)} ` +
      r.stats.map(s => `${s.text} ${s.label} (${Math.round(s.quality * 100)}%)`).join(' | '));
  }
  for (const v of view.veiled) console.log(`    ${v.kind} Riven, verschleiert: ${v.challenge.text} (${v.challenge.progress}/${v.challenge.required})`);
  console.log(`    ungeoeffnet: ${view.unrevealed.map(u => `${u.count}x ${u.kind}`).join(', ') || 'keine'}`);
  console.log('  (~ = enthaelt gerechnete, noch nicht an einer Karte abgelesene Werte)');
}

/* ------------------------------------------------------------------------
   Teil 4: Wuensche und Noten (riven-wants.js). Die Anteile sind am
   2026-09-29 gemessen - je Waffe eine Suche auf warframe.market, nach Preis
   absteigend, davon das teuerste Viertel. Laeuft ohne Netz.
   ------------------------------------------------------------------------ */
console.log('\n=== Teil 4: Wuensche und Noten ===');
{
  const W = await import('../core/riven-wants.js');
  const slugs = list => list.map(w => w.slug).join(',');

  /* Gemessene Anteile: Waffe -> erwartete Einteilung. */
  const MEASURED = [
    { name: 'Torid', shares: { negBase: 107,
        pos: { critical_chance: 0.92, critical_damage: 0.89, multishot: 0.81, 'base_damage_/_melee_damage': 0.11, toxin_damage: 0.04 },
        neg: { zoom: 0.33, magazine_capacity: 0.19, recoil: 0.17, damage_vs_infested: 0.09 } },
      best: 'critical_chance,critical_damage,multishot', good: '', harmless: 'zoom,magazine_capacity,recoil' },
    { name: 'Hate', shares: { negBase: 120,
        pos: { critical_damage: 0.84, 'fire_rate_/_attack_speed': 0.51, critical_chance: 0.48, range: 0.39,
               'base_damage_/_melee_damage': 0.19, electric_damage: 0.16 },
        neg: { critical_chance_on_slide_attack: 0.21, finisher_damage: 0.2, slash_damage: 0.15, channeling_efficiency: 0.14,
               damage_vs_infested: 0.12, combo_duration: 0.05 } },
      best: 'critical_damage,fire_rate_/_attack_speed,critical_chance', good: 'range,base_damage_/_melee_damage',
      harmless: 'critical_chance_on_slide_attack,finisher_damage,slash_damage,channeling_efficiency,damage_vs_infested' },
    /* Vectis: ein Schuss im Magazin - weniger Magazin tut ihr nicht weh, und
       genau das zeigt der Markt mit 52 %. */
    { name: 'Vectis', shares: { negBase: 115,
        pos: { critical_damage: 0.82, critical_chance: 0.75, multishot: 0.75, 'base_damage_/_melee_damage': 0.3, heat_damage: 0.17 },
        neg: { magazine_capacity: 0.52, zoom: 0.16, impact_damage: 0.1, damage_vs_infested: 0.07 } },
      best: 'critical_damage,critical_chance,multishot', good: 'base_damage_/_melee_damage,heat_damage',
      harmless: 'magazine_capacity,zoom,impact_damage' },
    /* Galariak Prime: duenner Markt, flache Anteile - eine feste Grenze von
       45 % liesse ihr gar nichts Gewuenschtes. */
    { name: 'Galariak Prime', shares: { negBase: 24,
        pos: { 'base_damage_/_melee_damage': 0.39, critical_damage: 0.35, critical_chance: 0.29,
               'fire_rate_/_attack_speed': 0.23, range: 0.23, damage_vs_grineer: 0.16 },
        neg: { critical_chance_on_slide_attack: 0.29, puncture_damage: 0.21, channeling_efficiency: 0.13, impact_damage: 0.13 } },
      best: 'base_damage_/_melee_damage,critical_damage,critical_chance',
      good: 'fire_rate_/_attack_speed,range,damage_vs_grineer',
      harmless: 'critical_chance_on_slide_attack,puncture_damage,channeling_efficiency,impact_damage' },
    { name: 'Ocucor', shares: { negBase: 118,
        pos: { multishot: 0.91, critical_damage: 0.82, toxin_damage: 0.54, critical_chance: 0.24, 'base_damage_/_melee_damage': 0.2 },
        neg: { zoom: 0.16, puncture_damage: 0.15, recoil: 0.14, slash_damage: 0.13, projectile_speed: 0.13, impact_damage: 0.11 } },
      best: 'multishot,critical_damage,toxin_damage', good: 'critical_chance,base_damage_/_melee_damage',
      harmless: 'zoom,puncture_damage,recoil,slash_damage,projectile_speed' },
  ];
  for (const m of MEASURED) {
    const w = W.classifyShares(m.shares);
    ok(`${m.name}: gewuenscht`, slugs(w.best) === m.best, slugs(w.best));
    ok(`${m.name}: auch gut`, slugs(w.good) === m.good, slugs(w.good));
    ok(`${m.name}: unschaedlich negativ`, slugs(w.harmless) === m.harmless, slugs(w.harmless));
  }

  /* Aus rohen Auktionen: die teuren tragen CC/CD/MS, die billigen Beliebiges.
     Dazu ein Scherzpreis mit Schrottwerten - er darf nicht in die Spitze. */
  const auctions = [];
  for (let i = 0; i < 30; i++) auctions.push({ price: 2000 + i * 50, pos: ['critical_chance', 'critical_damage', 'multishot'], neg: ['zoom'] });
  for (let i = 0; i < 90; i++) auctions.push({ price: 30 + i, pos: ['heat_damage', 'reload_speed'], neg: ['critical_chance'] });
  auctions.push({ price: 888888, pos: ['reload_speed', 'ammo_maximum'], neg: ['multishot'] });
  auctions.push({ price: 1, pos: ['zoom'], neg: [] });
  const d = W.deriveWants(auctions);
  ok('aus Auktionen: das Teure gewinnt', slugs(d.best) === 'critical_chance,critical_damage,multishot', slugs(d.best));
  ok('Scherzpreis und 1p fliegen raus', d.sample === 120, `${d.sample} bereinigt`);
  ok('negativ auf Gewuenschtem ist nie unschaedlich', !d.harmless.some(w => w.slug === 'critical_chance'), slugs(d.harmless));
  ok('zu wenig Auktionen heisst duenn', W.deriveWants(auctions.slice(0, 12)).thin === true);

  /* Tags aus dem Fingerprint - Nahkampf fuehrt Schaden und Fraktion unter
     eigenen Tags (Hate: WeaponMeleeDamageMod, WeaponMeleeFactionDamageGrineer). */
  ok('Nahkampf-Schaden', W.tagToSlug('WeaponMeleeDamageMod') === 'base_damage_/_melee_damage');
  ok('Nahkampf-Fraktion', W.tagToSlug('WeaponMeleeFactionDamageGrineer') === 'damage_vs_grineer');
  ok('Feuerrate heisst im Nahkampf Angriffstempo', W.attrLabel('fire_rate_/_attack_speed', 'melee') === 'Attack speed'
     && W.attrLabel('fire_rate_/_attack_speed', 'rifle') === 'Fire rate');
  ok('Klasse: Arch-Gun ueber die Gruppe', W.rivenClass('Rifle', { group: 'archgun', rivenType: 'rifle' }) === 'archgun');
  ok('Klasse: Begleiterwaffe ueber den Riven-Typ', W.rivenClass('Companion Weapon', { rivenType: 'melee' }) === 'melee');

  /* Auktionswerte, wie warframe.market sie fuehrt (17.000 Werte gesichtet). */
  const fmt = [
    ['damage_vs_grineer', 1.46, 'x1.46'], ['damage_vs_infested', 0.72, 'x0.72'], ['zoom', -61.7, '-61.7%'],
    ['critical_chance', 118.8, '+118.8%'], ['combo_duration', 6, '+6s'], ['punch_through', 2.3, '+2.3'],
    ['recoil', -72.7, '-72.7%'], ['range', 1.4, '+1.4']
  ];
  for (const [slug, v, want] of fmt) ok(`Auktionswert ${slug} ${v}`, W.formatAuctionValue(slug, v) === want, W.formatAuctionValue(slug, v));

  /* Jede Klasse hat Wuensche, und jeder slug gibt es. */
  const known = new Set(W.RIVEN_ATTRS.map(a => a.slug));
  for (const [cls, s] of Object.entries(W.CLASS_SHARES)) {
    const w = W.classWants(cls);
    ok(`Klasse ${cls}: mindestens zwei gewuenschte`, w.best.length >= 2, slugs(w.best));
    ok(`Klasse ${cls}: nur bekannte Werte`, [...Object.keys(s.pos), ...Object.keys(s.neg)].every(k => known.has(k)));
  }

  /* Noten an Kaans Rivens, mit den gemessenen Wuenschen der Waffe. */
  const torid = W.classifyShares(MEASURED[0].shares);
  const stat = (tag, quality, curse = false) => ({ tag, quality, curse });
  const g1 = W.gradeRiven([stat('WeaponCritDamageMod', 0.02), stat('WeaponFireIterationsMod', 0.52), stat('WeaponCritChanceMod', 0.37)], torid);
  ok('Torid CD/MS/CC ohne Negativ: A-', g1.letter === 'A-', `${g1.letter} ${g1.score}`);
  const g2 = W.gradeRiven([stat('WeaponCritDamageMod', 0.9), stat('WeaponFireIterationsMod', 0.9), stat('WeaponCritChanceMod', 0.9),
                           stat('WeaponZoomFovMod', 0.5, true)], torid);
  ok('drei gewuenschte, gut gewuerfelt, unschaedliches Negativ: S', g2.letter === 'S', `${g2.letter} ${g2.score}`);
  const baza = W.classWants('rifle');
  const g3 = W.gradeRiven([stat('WeaponReloadSpeedMod', 0.1), stat('WeaponClipMaxMod', 0.44), stat('WeaponZoomFovMod', 0.74, true)], baza);
  ok('nichts Gewuenschtes: F', g3.letter === 'F', `${g3.letter} ${g3.score}`);
  const g4 = W.gradeRiven([stat('WeaponCritDamageMod', 0.9), stat('WeaponFireIterationsMod', 0.9),
                           stat('WeaponCritChanceMod', 0.5, true)], torid);
  ok('Negativ auf Gewuenschtem kostet', g4.score < W.gradeRiven([stat('WeaponCritDamageMod', 0.9), stat('WeaponFireIterationsMod', 0.9)], torid).score,
     `${g4.letter} ${g4.score}`);
  ok('Buchstabe je Wert: gewuenscht vor ungewuenscht',
     g1.stats.every(s => s.fit === 'best') && g3.stats[0].fit === 'neutral' && g3.stats[2].fit === 'harmless');

  /* Auktionswerte auf Rang 8: ein Torid-Riven auf Rang 0 stand am 2026-09-29
     mit +14.9% Critical Damage auf warframe.market - auf Rang 8 das Neunfache. */
  const atMax = (slug, v, r) => W.formatAuctionValue(slug, W.auctionValueAtMax(slug, v, r));
  ok('Rang 0 -> Rang 8', atMax('critical_damage', 14.9, 0) === '+134.1%', atMax('critical_damage', 14.9, 0));
  ok('Faktor: nur der Aufschlag waechst', atMax('damage_vs_grineer', 1.05, 0) === 'x1.45', atMax('damage_vs_grineer', 1.05, 0));
  ok('Rang 8 bleibt', atMax('zoom', -61.7, 8) === '-61.7%');

  /* Finder: Filter, die warframe.market nicht kann, und die Aehnlichkeit. */
  const { shapeFinderOffers } = await import('../core/riven-market.js');
  const auction = (id, price, status, attrs, rank = 8) => ({
    id, buyoutPrice: price, startingPrice: price, owner: { name: id, status, reputation: 1 },
    item: { name: 'crita-satitis', modRank: rank, reRolls: 3, attributes: attrs.map(([slug, value, positive = true]) => ({ slug, value, positive })) }
  });
  const raw = [
    auction('a', 1, 'ingame', [['critical_chance', 150], ['multishot', 100]]),
    auction('b', 900, 'offline', [['critical_chance', 150], ['critical_damage', 100], ['zoom', -40, false]]),
    auction('c', 500, 'online', [['critical_chance', 150], ['critical_damage', 100], ['multishot', 90], ['zoom', -40, false]]),
    auction('d', 300, 'ingame', [['critical_chance', 150], ['heat_damage', 90]])
  ];
  const ref = { pos: ['critical_chance', 'critical_damage', 'multishot'], neg: 'zoom' };
  const shaped = shapeFinderOffers(raw, { cls: 'rifle', wants: torid, opts: { onlineOnly: true, hideOnePlat: true, reference: ref } });
  ok('online und ohne 1p', shaped.offers.map(o => o.id).join(',') === 'c,d', shaped.offers.map(o => o.id).join(','));
  ok('Aehnlichkeit: alle vier Werte gleich', shaped.offers[0].similarity === 100, String(shaped.offers[0].similarity));
  ok('Aehnlichkeit: einer von vier', shaped.offers[1].similarity === 25, String(shaped.offers[1].similarity));
  ok('Werte passen zur Waffe', shaped.offers[0].stats.find(s => s.slug === 'zoom').fit === 'harmless'
     && shaped.offers[1].stats.find(s => s.slug === 'heat_damage').fit === 'neutral');
  const cheap = shapeFinderOffers(raw, { cls: 'rifle', wants: torid, opts: { priceMax: 600 } });
  ok('ohne Vorlage nach Preis, Preisgrenze', cheap.offers.map(o => o.id).join(',') === 'a,d,c', cheap.offers.map(o => o.id).join(','));
  ok('Name wie im Spiel', cheap.offers[0].name === 'Crita-satitis', cheap.offers[0].name);

  /* Rang 0 mit abgetippten Rang-8-Werten. Beide Auktionen standen am
     2026-09-29 unter der Torid; die Basiswerte sind die der Gewehr-Vorlage
     aus Teil 1, die Disposition die der Torid (1,3). */
  const { auctionMaxima } = await import('../core/riven-market.js');
  const rifleTpl = { upgradeEntries: [
    { tag: 'WeaponCritChanceMod', upgradeValues: [{ value: 0.016666001 }] },
    { tag: 'WeaponCritDamageMod', upgradeValues: [{ value: 0.013333 }] },
    { tag: 'WeaponFireIterationsMod', upgradeValues: [{ value: 0.0099999998 }] }
  ] };
  const byUniqueName = new Map([['/Lotus/Upgrades/Mods/Randomized/LotusRifleRandomModRare', rifleTpl]]);
  const maxima = auctionMaxima('rifle', byUniqueName, 1.3);
  const real = auction('r0', 3999, 'ingame', [['critical_damage', 14.9], ['multishot', 12.3], ['critical_chance', 20.7], ['recoil', 10.4, false]], 0);
  const typed = auction('r8', 10000, 'ingame', [['critical_chance', 199.8], ['critical_damage', 159.4], ['multishot', 104.9], ['damage_vs_grineer', 0.58, false]], 0);
  const both = shapeFinderOffers([real, typed], { cls: 'rifle', wants: torid, maxima, opts: {} }).offers;
  const cd = o => o.stats.find(s => s.slug === 'critical_damage').text;
  const cc = o => o.stats.find(s => s.slug === 'critical_chance').text;
  ok('echte Rang-0-Werte werden hochgerechnet', both[0].scale === 'scaled' && cd(both[0]) === '+134.1%', `${both[0].scale} ${cd(both[0])}`);
  ok('abgetippte Rang-8-Werte bleiben, wie sie sind', both[1].scale === 'maxed' && cc(both[1]) === '+199.8%', `${both[1].scale} ${cc(both[1])}`);
  const blind = shapeFinderOffers([real], { cls: 'rifle', wants: torid, opts: {} }).offers[0];
  ok('ohne Vorlage wird nicht hochgerechnet', blind.scale === 'unknown' && cd(blind) === '+14.9%', `${blind.scale} ${cd(blind)}`);
}

console.log(failures ? `\n${failures} Fehler.` : '\nAlles gruen.');
process.exitCode = failures ? 1 : 0;
