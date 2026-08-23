/**
 * Datenblatt einer einzelnen Mod- oder Arcane-Karte.
 *
 * Alles hier stammt aus DEs Export (ExportUpgrades, ExportRelicArcane) - also
 * aus derselben Datei, aus der das Spiel selbst die Karte zeichnet. Deshalb
 * stehen die Werte JE RANG da und nicht als ein Satz Zahlen: eine Mod auf
 * Rang 3 wirkt anders als dieselbe auf Rang 10, und genau das ist die Frage,
 * die man sich im Inventar stellt.
 *
 * Die Fundorte kommen aus droptables.js und werden hier nur angehaengt.
 */
import { imageUrl, cleanGameText } from './catalog.js';
import { POLARITIES, RARITY_LABELS, modDrain, endoCost, auraBonus, isAuraMod, isExilusMod } from './mods.js';
import { sourcesFor } from './droptables.js';

/**
 * Anzeigetexte als Zeilenliste.
 *
 * Zwei Formate zugleich: mehrzeilige Angaben liegen mal als Array vor, mal als
 * ein String mit Zeilenumbruechen darin ("On Energy Pickup:\r\n60% chance...").
 * Beides wird hier zu einer Zeile je Aussage - sonst klebt bei den Arcanes die
 * halbe Karte in einem Absatz.
 *
 * Doppelte Zeilen fliegen raus, weil DE selbst welche fuehrt: Arcane Energize
 * nennt "+1 Arcane Revive" einmal im Fliesstext und gleich noch einmal als
 * eigenen Eintrag.
 */
const textList = v => [...new Set(
  (Array.isArray(v) ? v : [v])
    .flatMap(s => String(s ?? '').split(/\r?\n/))
    .map(cleanGameText)
    .filter(Boolean)
)];

/**
 * Exemplare, die ein Arcane bis zu diesem Rang schluckt.
 *
 * Arcanes werden nicht mit Endo aufgewertet, sondern miteinander verschmolzen:
 * Rang 1 kostet zwei Karten, Rang 2 drei weitere, und so fort - in Summe die
 * Dreieckszahl, also die bekannten 21 Stueck fuer Rang 5.
 */
const arcaneCopies = rank => ((rank + 1) * (rank + 2)) / 2;

/**
 * Worauf die Karte passt.
 *
 * Die generischen Klassen werden uebersetzt, Eigennamen NICHT: bei einem
 * Augment steht in compatName der Warframe ("Nekros"), bei einer Waffenmod
 * die Waffe ("Paris Prime") - beides heisst im deutschen Spiel genauso.
 */
const COMPAT_LABELS = {
  WARFRAME: 'Warframe',      ANY: 'Beliebig',            AURA: 'Aura-Slot',
  PRIMARY: 'Primary',        SECONDARY: 'Secondary',     MELEE: 'Melee',
  Rifle: 'Rifle',            Pistol: 'Pistol',           Shotgun: 'Shotgun',
  Melee: 'Melee',            Bow: 'Bow',                 Sniper: 'Sniper',
  'Assault Rifle': 'Sturmgewehr', 'Thrown Melee': 'Wurfwaffe', Claws: 'Klauen',
  Archgun: 'Archgun',        Archmelee: 'Arch-Nahkampf', Archwing: 'Archwing',
  Necramech: 'Necramech',    Parazon: 'Parazon',         'K-Drive': 'K-Drive',
  COMPANION: 'Begleiter',    ROBOTIC: 'Roboter-Begleiter', BEAST: 'Tier-Begleiter',
  Sentinel: 'Sentinel',      SENTINEL: 'Sentinel',       Kubrow: 'Kubrow',
  Kavat: 'Kavat',            Tome: 'Foliant',            MOD: 'Mod',
  STANCE: 'Stance',          OPERATOR: 'Operator'
};

const TYPE_LABELS = {
  WARFRAME: 'Warframe mod',  PRIMARY: 'Primary mod',      SECONDARY: 'Secondary mod',
  MELEE: 'Nahkampf-Mod',     AURA: 'Aura',                STANCE: 'Stance',
  SENTINEL: 'Begleiter-Mod', KUBROW: 'Kubrow-Mod',        KAVAT: 'Kavat-Mod',
  ARCHWING: 'Archwing-Mod',  'ARCH-GUN': 'Archgun-Mod',   'ARCH-MELEE': 'Arch-Nahkampf-Mod',
  PARAZON: 'Parazon-Mod',    'HELMINTH CHARGER': 'Helminth-Charger-Mod'
};

const isArcane = u => String(u || '').includes('/CosmeticEnhancers/') && !String(u || '').includes('/Peculiars/');

/** Set-Pfad -> Anzeigename. .../Sets/Vigilante/VigilanteSetMod ergibt "Vigilante". */
function setName(modSet) {
  const parts = String(modSet || '').split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

/**
 * Rangleiter der Karte.
 *
 * levelStats hat einen Eintrag JE RANG, beginnend bei Rang 0. Manche Karten
 * fuehren dort ueberall denselben Satz (Precepts etwa wirken rangunabhaengig) -
 * das faellt in der Anzeige von selbst auf und muss nicht gefiltert werden.
 */
function rankLadder(mod, arcane) {
  const levels = mod.levelStats || [];
  /* Arcanes fuehren gar kein fusionLimit - ihre Rangzahl steht nur in der
     Laenge der Liste. */
  const max = mod.fusionLimit ?? Math.max(0, levels.length - 1);
  const aura = isAuraMod(mod);

  const rows = [];
  for (let rank = 0; rank <= max; rank++) {
    const row = { rank, stats: textList(levels[rank]?.stats || []) };

    if (arcane) {
      row.copies = arcaneCopies(rank);
    } else {
      /* Auras GEBEN Kapazitaet, statt sie zu kosten - im Export steht deshalb
         ein negativer baseDrain. Ohne Fallunterscheidung stuende hier ein
         Minuswert als "Kosten". */
      row.drain = aura ? auraBonus(mod, rank) : modDrain(mod, rank);
      row.endo = endoCost(mod, rank);
    }
    rows.push(row);
  }
  return { rows, max };
}

/**
 * Besitzstand nach Raengen.
 *
 * Der Inventar-Eintrag zaehlt nur GERANKTE Exemplare einzeln auf - die kommen
 * aus Upgrades, wo jedes Stueck eine eigene ItemId und einen eigenen Rang hat.
 * Die ungerankten liegen als blosse Stueckzahl in RawUpgrades und tauchen in
 * `ranks` gar nicht auf. Ohne diese Ergaenzung stuenden neben "13 Exemplare"
 * nur zwei Raenge, und die anderen elf waeren spurlos verschwunden.
 */
function ownedRanks(owned, arcane) {
  /* Eigene Objekte, keine Verweise: `rest` wird unten auf Rang 0 aufaddiert,
     und das darf den Inventar-Eintrag des Aufrufers nicht veraendern. */
  const ranks = (owned.ranks || []).map(r => ({ ...r }));
  const listed = ranks.reduce((sum, r) => sum + (r.count || 0), 0);
  const rest = (owned.count || 0) - listed;

  if (rest > 0) {
    const zero = ranks.find(r => r.rank === 0);
    if (zero) zero.count += rest;
    else ranks.unshift({ rank: 0, count: rest });
  }
  ranks.sort((a, b) => a.rank - b.rank);

  /* Hoechster Rang, den man wirklich hat - danach richtet sich, welche Stufe
     das Datenblatt beim Oeffnen zeigt. */
  return {
    count: owned.count || 0,
    ranks,
    maxRank: ranks.length ? ranks[ranks.length - 1].rank : (owned.maxRank ?? null),
    /* Ein Arcane auf Rang 5 IST kein einzelnes Stueck, es sind 21 verschmolzene.
       Fuer die Frage "wie weit bin ich" zaehlt deshalb nicht die Anzahl der
       Karten, sondern was in ihnen steckt - sonst stuende neben einem fertigen
       Rang-5-Arcane "noch 20 fehlen". */
    copies: arcane
      ? ranks.reduce((sum, r) => sum + r.count * arcaneCopies(r.rank), 0)
      : null
  };
}

/**
 * Baut das Datenblatt zusammen.
 *
 * `owned` ist der Inventar-Eintrag ({ count, ranks }) und darf fehlen - das
 * Datenblatt beantwortet auch Fragen zu Karten, die man gar nicht besitzt.
 */
export function upgradeDetails(uniqueName, catalog, dropIndex, owned = null) {
  const mod = catalog?.byUniqueName?.get(uniqueName);
  if (!mod) return null;

  const arcane = isArcane(uniqueName);
  const { rows, max } = rankLadder(mod, arcane);
  const aura = isAuraMod(mod);

  const set = mod.modSet ? {
    name: setName(mod.modSet),
    members: (catalog.lookup || [])
      .filter(m => m.modSet === mod.modSet && m.name)
      .map(m => m.name)
  } : null;

  const pol = POLARITIES[mod.polarity] || null;

  return {
    uniqueName,
    name: mod.name,
    image: imageUrl(uniqueName, 256),
    kind: arcane ? 'arcane' : 'mod',
    kindLabel: arcane ? 'Arcane' : 'Mod',
    typeLabel: TYPE_LABELS[mod.type] || (mod.type && mod.type !== '---' ? mod.type : null),
    rarity: mod.rarity || null,
    rarityLabel: RARITY_LABELS[mod.rarity] || null,
    polarity: pol ? { glyph: pol.glyph, symbol: pol.symbol, label: pol.label } : null,
    compat: COMPAT_LABELS[mod.compatName] || mod.compatName || null,
    isAura: aura,
    isExilus: isExilusMod(mod),
    maxRank: max,
    /* Voll aufgewertet - die Zahlen, die man beim Bauen braucht. Arcanes
       kosten keine Kapazitaet und kein Endo, dort bleiben beide leer. */
    maxDrain: arcane ? null : (rows.at(-1)?.drain ?? 0),
    endoToMax: arcane ? null : endoCost(mod, max),
    copiesToMax: arcane ? arcaneCopies(max) : null,
    description: textList(mod.description),
    ranks: rows,
    set,
    owned: owned ? ownedRanks(owned, arcane) : null,
    sources: sourcesFor(dropIndex, { name: mod.name, uniqueName })
  };
}
