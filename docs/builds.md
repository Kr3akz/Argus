# Builds and mods

*Build your own loadouts, see what you actually own, and import from Overframe.*

[← Back to the README](../README.md)

---


**Builds** opens as an arsenal: one tile per frame, weapon or companion you have a build
for, with its artwork, how many builds it holds and what is still missing. Clicking a tile
opens that item — its builds sit next to each other as tabs, and below them the mod board
in the same layout the game uses.

The mod cards are the same ones the inventory draws, and they behave the same way:
collapsed you see the name, hovering opens the card with artwork, effect and
compatibility. That way all ten slots fit on one screen.

Paste an Overframe link (`overframe.gg/build/86364/…`, or just the ID) into the field at
the top and the tool takes over mods, ranks, polarities, capacity and forma requirements.
It adds up what you need in total: forma, aura/umbra forma, orokin reactors and catalysts,
endo.

## What you own is read from your inventory

Ownership is not ticked off by hand. Once the inventory has been fetched once, Argus knows
which mods you have **and at which rank** — so a build separates three states: the mod is
there, the mod is there but not ranked up far enough, or the mod is missing entirely. The
list under *Still needed for your builds* follows from that and updates with the next
inventory fetch.

Without inventory data the old way still works: click a row to mark that mod as owned.

## Arcanes

Below the mod board sits a second row for arcanes — two slots on a warframe or necramech,
one on a primary, secondary or melee weapon, none on anything that has none. They are not
drawn as cards, because in the game they are not cards: the vessel, the name and the rank
stars, the same way the inventory shows them.

Arcanes are paid for in copies of themselves rather than in endo — rank 1 costs two, rank 5
costs twenty-one. The editor says how many are still missing for the rank you set, and
*Total requirements* adds them up across all builds.

## Your own builds

**New build** → pick an item → fill the 10 slots by clicking (8 normal, one
aura/stance and one exilus slot). *Another build* adds a second version for the same item.
In the slot editor, the **slot polarity** sits directly under the search field — it belongs
to the slot, not to the mod you put in it, and it stays when you swap that mod. Pick the
mod, set its rank with the slider. Capacity use is calculated live:

- **Matching polarity** halves the cost (rounded up)
- **Wrong polarity** raises it by 25%
- **Aura mods grant capacity** instead of costing it — doubled with matching polarity

Cross-check: Steel Charge at rank 5 with Madurai gives **+18** — exactly the value
Overframe reports for the same mod.

## How the import works

`overframe.gg/api/v1/builds/<id>/` is **undocumented** and returns only internal mod IDs;
there is no public mapping to names (`/api/v1/mods/` → 404). The names are produced at
render time. So Electron loads the page **once, invisibly**, reads the mod names out and
saves the mapping. Known IDs need no page load after that.

The `drain` value acts as a safeguard: it appears both in the API and on the page. If
fewer than 80% agree, the import aborts rather than saving the wrong mods. If Overframe
changes its page structure, only the import fails — everything else keeps working.

---
