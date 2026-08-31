# Foundry, crafting chains, vault status and subsumed frames

*Four things in the Mastery tab that answer the same question from different sides: what is still between you and the item.*

[← Back to the README](../README.md)

---

The Mastery tab has three modes. **Manager** is your goals and what they still need,
**Catalogue** is every item in the game with its status, and **Foundry** is what you have
already paid for and are only waiting on.

---

## The foundry

Everything currently building, and everything finished and waiting to be collected, with
the item's own artwork beside it.

Warframe announces a finished build only in the orbiter, standing at the foundry itself.
Go straight from navigation into a mission and you never see it. On the account this was
built against, two items had been sitting there **finished for three weeks**.

**The times are not calculated.** Every pending build carries a completion timestamp that
DE's server set when you started it, and that timestamp is what you see. Rush a build with
platinum and the next fetch simply shows the new time — there is nothing here to fall out
of date.

That is a different question from the build time shown on a goal. A goal answers *how long
will this take once I start*; the foundry answers *when is it done*.

The Helminth stands in the same list — what it is digesting, and when it will take the next
warframe.

While Argus is running it also raises a desktop notification for each build as it falls due.
The same switch as the fissure notifications turns it off. Nothing is lost when Argus is
closed: a finished build is simply finished the next time you look.

**Where the data comes from:** the foundry is part of your account inventory, so it needs
one [inventory fetch](inventory.md) to exist. After that it is read from the local copy and
costs neither network nor memory access.

Each running build carries a bar under its name: the completion time says *when*, the bar
says *how far* — three hours of four looks nothing like three of seventy. Its length comes
from the recipe's own build time, so there is nothing to guess.

---

## Crafting chains

Some weapons are built out of other weapons, and **each stage is consumed when you build
the next one.** The Akjagara wants an Akbolto, the Akbolto wants two Bolto, and a Bolto
wants a Lato. That is four weapons and 12,000 mastery points standing in a row — but only
if you rank each of them to 30 *before* it goes into the foundry. Feed an unranked Bolto to
the Akbolto and those 3,000 points are gone; getting them back means farming, building and
levelling the whole thing again.

The game never says this. A recipe shows you the next ingredient, never the chain beneath
it, and certainly not which link you have never owned.

So every chain in the game is listed here with **every link carrying its own rank**, not
just the weapon at the end:

- a green check and `30/30` — mastered, safe to consume
- a gold ring and `17/30` — you own it and it is **not** finished
- a hollow ring and *not owned* — never had it

A gold warning line appears when you own a link that is not yet rank 30: *"Rank Tipedo to
30 first — the next build consumes it, and the mastery goes with it."* That line is the
reason this view exists.

Beside each link it says what you have in stock, because building the next stage needs the
copies, not the memory of them: `1/2 in stock` means the Akbolto is one Bolto short. When
everything is there, the card says so.

Under long chains there is a one-line build order — `Lato → 2× Bolto → Akbolto + Dual Skana
→ Akjagara` — which is the answer to *and what do I do now.*

**Where the chains come from:** DE's own recipes, not a hand-kept list. An ingredient counts
as a link when it is itself an item that gives mastery; everything else — ferrite, orokin
cells, forma — is material and belongs on a [goal's shopping list](../README.md) instead.
When DE ships a weapon built from two old ones, it appears here on its own.

The chains need no inventory fetch — they come from the item catalogue, and the ranks come
from your public profile. With an inventory they gain the stock counts and the mark on
anything currently in the foundry.

---

## Vaulted prime gear

A prime item in the catalogue carries a mark saying how many of its parts still drop:
`0/4` in red when the vault is shut on it, `2/4` in gold when it is half open — because
"three of the four parts still fall" is completely different advice from "forget it". The
item window names the parts you can no longer farm.

**How it is worked out.** Argus reads which relics currently drop anywhere in the game —
on a node, in a bounty, from a vendor — and then which prime parts those relics contain.
A part that no dropping relic contains is a part you cannot farm.

This is not the same as the relic reward table, which DE also publishes. That table lists
every relic that ever existed, because they live on in players' inventories: at the reading
this was built against, **773** of the 774 that warframe.market knows. What actually drops,
at the same reading, was **35**.

Raw materials are deliberately not counted as parts. Braton Prime's recipe wants ten Orokin
Cells; they fall everywhere except out of a relic, and counting them would mark every prime
set in the game as vaulted.

**What it cannot see** is Varzia. Prime Resurgence rotates a different selection of vaulted
relics into reach for Aya every month, and DE publishes no drop table for it. "Vaulted"
here means precisely: *it drops nowhere.* See [known limits](limits.md).

---

## Subsumed warframes

Every frame you have already fed to the Helminth carries its mark in the catalogue, so
"have I done this one" is answered where you are browsing rather than two menus deep in the
game.

The list comes from your inventory and needs no translation table, which is worth a line:
DE's internal names for warframes are not their names in the game — Sevagoth is `Wraith`
internally, Gauss is `Runner`, Xaku is `BrokenFrame`. Those internal paths are also what
the item catalogue is keyed by, so the two sides match without a lookup that would go stale
every time a new warframe ships.
