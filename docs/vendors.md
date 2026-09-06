# Update vendors

*Since Citrine, most new Warframes are not farmed — they are bought. Every update hangs its
frame and its weapons on one vendor with one currency of its own, and the shop tells you the
price but never whether you already own the thing.*

[← Back to the README](../README.md)

---

Otak takes crystal fragments, Zorba takes Atramentum, the shrine at the gates of Cetus takes
Fate Pearls. Eighteen of these shops exist by now, and each one is a small wall of prices
with no answer to the only question you have in front of it: **what of this do I still need?**

Answering it in the game means leaving the vendor, opening the arsenal, and searching by
hand — once per part, four parts per frame. The Vendors mode in the mastery tab puts that
answer next to the price instead.

---

## One tile per offer, not per vendor

The tiles are cut by **offer**, not by the person behind the counter. Acrithis sells two
completely separate stocks — Kullervo for Kullervo's Bane, Oraxia for Scuttler Husks — that
have nothing in common except her. As one tile they would be two price lists stacked on top
of each other; as two tiles, each is the thing you were actually looking for.

Each tile carries the frame's own picture, the vendor and the place, the currency, and how
much of the offer is still open. A gold badge counts what would be **new mastery**.

---

## What "already owned" means here

A part can be settled in three different ways, and they are three different messages:

| Mark | What it means |
|---|---|
| **owned** | The finished item is in your arsenal. Nothing about it needs buying. |
| **blueprint bought** | You already carry that blueprint. Buying it a second time is money gone. |
| **part built** | The component is built and waiting in the foundry stock. |

The distinction matters most where it is easy to lose money: a half-finished weapon whose
blueprint you bought three months ago looks exactly like one you never touched. The vendor
does not remember. This does.

The price on each item is the sum for **what is still missing** — not for the full set. Once
nothing is missing, the card steps back and says so rather than disappearing: the offer is
still worth reading when you want to know what a vendor carries.

---

## Your purse, and the bill after the purse

One box in the top right corner holds both halves of that question, split by a line: on the
left what the shop still wants from you — items open, things to buy, the total — and on the
right what you actually hold. They belong together, because neither number decides anything
on its own; they are kept apart, because one comes from the counter and the other from your
account.

Both kinds of currency end up on that right-hand side even though they live in different
places: Scuttler Husks, Fate Pearls and Chipper's Stock are ordinary resources in your
inventory, while Cavia, Hex or Necraloid standing sits in the syndicate ledger. The line
underneath says the same thing either way: **enough**, or **short by this much** — and the
dividing line takes the colour of that answer. A shop that takes two currencies gets two
figures, because two balances are two numbers and never one.

Every price carries the currency's own icon rather than its name: a shop like Otak, which
takes two crystals at once, would otherwise spell out "Belric Crystal Fragment + Rania
Crystal Fragment" on all twelve of its rows, when the only thing changing from row to row is
the number. The names are written out once, at the top. Resource icons come from DE's export
like every other item picture; the six standing shops use the syndicate's flag from the wiki,
because standing is not an item and has no picture of its own.

And then there is the part the shop never mentions. **What you buy at the counter is a
blueprint, not the weapon.** Saving up 120 Husks for Oraxia and then finding out you are two
hundred Kovnik short of building her is the same disappointment one step later, so every item
you do not own yet carries its build underneath: the resources it needs, the credits, and how
much of each you have. Short rows show your amount in front of the required one — the same
notation, the same colours as the goal cards in the manager, because it is the same question.

---

## Where the numbers come from

Nowhere official. DE's public export does not know vendors, and the drop tables do not
either — shop stock does not drop anywhere, so it is not listed anywhere. There is exactly
one source, the [Warframe Wiki](https://wiki.warframe.com), and the table in
`src/core/vendors.js` is copied from it, item by item.

Copied data goes stale, so it can be re-checked against the source at any time:

```
npm run check-vendors            all eighteen shops
node tools/check-vendor-wares.mjs otak
```

The tool fetches the same wiki pages, compares every item, every price and every rank gate,
and exits non-zero on the first disagreement. If DE moves a price in an update, one command
says so.

---

## What is deliberately not in it

- **Cosmetics.** Prex cards, glyphs, captura scenes, decorations. They cost the same currency,
  but Argus has nothing to add to them that the shop does not already say.
- **Mods and arcanes** from the same vendors. They belong to the same question but hang off
  the mod inventory rather than the item catalogue — a separate step.
- **The six syndicates, Simaris, and the modular vendors** (Hok, Rude Zuud, Legs, Son). Their
  weapons count for mastery, but their offer is built differently: parts you combine, not
  blueprints you buy.
- **Baro Ki'Teer.** He has his own shopping list in the [ducats tab](baro.md) — his stock
  changes every two weeks and comes from the world state, not from a table.

---

## Without an inventory

Every ownership mark is a dash until an inventory has been fetched once. A price list without
the comparison is still a price list; a list that claims everything is missing because it has
never seen your account would be a lie. The panel says which of the two you are looking at.

The marks refresh with the next inventory fetch — the prices do not, because they only change
when DE changes them.
