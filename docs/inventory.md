# Inventory: mods, arcanes and relics

*The cards as they look in game, searching relics by their contents, your sets, and the data sheets behind each item.*

[← Back to the README](../README.md)

---

*Your builds in progress moved out of here and into the Mastery tab —
see [foundry, vault status and subsumed frames](foundry.md).*

## The cards, as they look in game

A mod has **two states** in game: collapsed it shows only the name; hovering expands it
to show the illustration, effect and compatibility. The inventory here does exactly the
same.

```
collapsed (184 × 90)              expanded (× 1.1)
┌──────────────────┐              ┌──────────────────┐
│ ╌╌╌╌╌╌╌╌╌  14 ⟋  │              │ ╌╌╌╌╌╌╌╌╌  14 ⟋  │
│                  │              │   [illustration] │
│ Primed Continuity│   ──▶        │                  │
│                  │              │ Primed Continuity│
│ ★★★★★★★★★★       │              │ +55% Ability Dur.│
└──────────────────┘              │ ▓▓ WARFRAME ▓▓   │
                                  │ ★★★★★★★★★★       │
                                  └──────────────────┘
```

**The card is drawn, not loaded as an image.** A pre-rendered card image knows only one
state; cutting the collapsed one out of it does not work, because it is built differently
and the name line sits elsewhere depending on how long the effect text is. Here every
part has its place, and the transition is a matter of height and opacity.

Three tricks carry that:

- The card carries `transform: scale(1)`. A transform makes it the **containing block**
  for everything positioned absolutely inside — frame pieces, drain number, compatibility
  bar, rank stars. That is why they move along when it expands, instead of sticking to
  the 90 px slot.
- The inner part clips. Collapsed, the card is 90 px tall; the effect text sits below
  that and is therefore gone.
- The name sits at `top: -60px` over the darkened illustration and moves to `top: 0` on
  expand, freeing the text below it.

The **slot in the grid keeps its 90 px** even as the card inside grows to 260 px —
otherwise the grid would reflow on every hover. The card itself takes no mouse events, so
the expanded version does not block its neighbours.

The frame pieces are the **real game textures** (four families by rarity, five files
each) and live under `src/renderer/assets/mod/`. The illustration comes from DE's export
as before. That makes the grid work fully offline.

The polarity symbols are vectors from the wiki, inline in `icons.js`. They tint via
`currentColor` and stay sharp at 11 or 24 pixels — before, a letter stood in as a
stopgap.

Arcanes are not cards but vessels: landscape, without a frame and without a name inside.
They get their real vessel image from the wiki and the name beneath. A separate image
cache would be pointless for that — the wiki serves
`cache-control: public, max-age=31536000, immutable`, so Chromium stores every image
permanently by itself.

## Searching relics by what is inside them

The search box in the **Relics** section asks two questions at once: the name of the
relic, and the names of its rewards. Type `Wisp Prime Neuroptics` and you get the relics
in your stock that drop it — each one labelled with the reward that matched, so it is
clear why the row is there. That is the question you actually have before cracking
anything; "no relic is called that" never was.

## My sets

Every part on a set card is a button. Clicking one answers where it comes from: the
relics that drop it, split into the ones already in your inventory and the ones still to
farm, with the rarity and the intact-state chance. For parts that come from no relic, the
drop-table locations stand there instead.

The chips above the grid are **two independent groups** that combine: origin (**Prime** or
**Base**) and kind (warframes, primary, secondary, melee, companions, archwing). Prime +
Warframes gives you the prime warframes — as one row with a single choice that was exactly
the question you could not ask. Each group counts under the other, so the number on a chip
is the number you get after clicking it.

**Base sets come from DE's recipes, not from the market.** A base part is not tradeable,
so warframe.market knows nothing about it; what it is made of stands in the recipe.
Anything built straight from raw materials is not a set and is left out — a Gorgon is
ferrite and salvage, not four parts. A part counts as owned in **both** its forms: as the
finished component and as the blueprint for it, because both mean "I have this", just at
different stages.

## Data sheet for a mod or arcane

Clicking a card opens its data sheet.

```
Serration                                    MOD · PRIMARY MOD · UNCOMMON
Fits rifles · polarity V Madurai

OWNED       13 copies                Rank 0 ×11 · Rank 6 · Rank 10

EFFECT      [0][1][2][3][4][5][6•][7][8][9][10•]
            +165% Damage
            Costs 14 capacity · 6,138 endo to get here

WHERE DO I GET THIS?
  MISSION   Arval · Mars        Spy · rotation C          8.6 %
  ENEMY     Ghoul Expired       Mod drop 20% × table 7.37%  1.47 %
```

**The rank ladder is the point.** A card at rank 3 behaves differently from the same card
at rank 10, and that is exactly the question you ask before upgrading. A dot under a
digit marks the ranks you own; the sheet opens on the highest of them.

Arcanes work differently: they cost neither capacity nor endo, but themselves. Instead of
the endo line it shows how many copies the rank consumes — 21 for rank 5. A finished
rank 5 arcane is **one** item with 21 inside it; the display accounts for that, rather
than claiming "20 missing" next to a maximum.

## Where drop locations come from

Three tiers, in this order:

1. **DE's drop tables** (`drops.warframestat.us`) — the same source as for relics. They
   give planet, node, rotation, enemy and chance as separate fields, so they can be
   labelled properly. For enemies, the **effective** chance is shown: first the enemy has
   to drop a mod at all, then it has to be this one.
2. **warframestat.us' item API** — only when tier 1 yields nothing. It knows what DE does
   not publish as a "drop" at all, above all the **syndicate augments**: *Despoil* comes
   from Red Veil and the Perrin Sequence, and the name appears nowhere in DE's tables.
3. **A rule table** for cards you simply cannot farm — Baro stock, arbitration honours,
   the Lua vaults, precepts that come with the companion. It does not guess; it reads the
   path DE filed the card under.

Measured against an account with 639 mods and 90 arcanes: 631 from tier 1, 23 from
tier 2, 57 from tier 3 — **9 cards without a location**, a little over one percent. Those
are Nightwave leftovers and discontinued items; for them, the sheet notes that they are
still available by trading, with a link to the wiki.

Everything above that — effect per rank, capacity, polarity, rarity, set membership —
comes from DE's own export, i.e. the same file the game draws the card from.

## Data sheet for a relic

Relics can be clicked too. That shows what is inside:

```
Axi A22                                       RELIC · AXI · 4 in stock

REFINEMENT      [Intact 4]  Exceptional 0  Flawless 0  Radiant 0

REWARDS
  Afentis Prime Blueprint      Rare             2.00 %    18p    100 duc.
  Dual Zoren Prime Handle      Uncommon        25.33 %     2p     15 duc.
  …

WHAT ONE CRACK RETURNS ON AVERAGE     Platinum 2.7   ·   Ducats 18
```

**All four refinement levels show the same six rewards** — only the chances shift: intact
puts the rare at 2%, radiant at 10%. So the sheet works out all four instead of picking
one; the question before refining is precisely whether it is worth it.

The expected value is **chance × value**, not the mean of the six rewards — with chances
between 2% and 25%, a mean would be a different number from the one you decide on. If
part of the chance has no platinum price, the sheet says so: the platinum value is then a
lower bound, not an estimate.

DE no longer lists a vaulted relic. Instead of an empty table, the sheet says it is
vaulted — along with what that means in practice.

---
