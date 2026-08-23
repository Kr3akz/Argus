# Resources, farming and mining

*Best nodes per material, ores and gems of the three landscapes - and why those tables are verified rather than remembered.*

[← Back to the README](../README.md)

---


The **Farm guide** tab answers one question: *I need this material — where do I go?* It
has two halves, because farming a resource and mining an ore are not the same activity.

## Resources

50 materials, from Ferrite to Entrati Lanthorn, filtered by Common, Uncommon, Rare, dojo
research, special, open world and Railjack. Each card carries the planets that actually
have it, three ranked nodes with the mission type and why that node, the other places it
comes from, the frames worth bringing, and one tip that is not obvious.

The node picks are not vibes. Where a Dark Sector exists, its **exact resource drop
bonus** is in the text — Gabii and Seimeni on Ceres and Hieracon and Sechura on Pluto are
+35%, the highest on the star chart, and a card that recommends one says so. Where a boss
beats a farm, the drop chance is named: the Raptor on Europa drops Neural Sensors at a
flat 50%, Corrupted Vor in the Void gives a guaranteed argon crystal or orokin cell.
Where the popular advice is wrong, the card says that too — Alad V does not reliably hand
out sensors, his table is a 97% region-resource roll.

Search covers more than names: mission types (`excavation`, `dark sector`), planets,
frames (`nekros`, `smeeta`) and the secondary sources (`sealab`, `nightwave`).

## Mining — ores & gems

All 30 ores and gems of the Plains of Eidolon, the Orb Vallis and the Cambion Drift,
organised by the only thing you can see before you cut: **the colour of the vein.**

- **red** — ore, on the Plains and the Vallis
- **yellow** — ore, on the Cambion Drift (the Drift is the exception)
- **blue** — gems, everywhere

Every card shows that colour as a drawn vein, plus what the raw ore refines into, which
cutter can produce it, what it is worth in standing, and what it is used for. Below the
cards sit the four cutters with their real numbers — only the Advanced Nosam Cutter (15%)
and the Sunpoint Plasma Drill (20%) can produce special-tier gems at all — and the rules
that decide what you get: the 30% gem-vein baseline, how boosters shift it towards gems
without adding veins, and why the rocks outside the gate only ever give commons.

## Why the data is checked, not remembered

A wrong node name is invisible. Nobody notices that "Camacol" is not a Deimos node until
they fly there and find nothing — and then they assume they are searching wrong. So
`npm run check-farm` verifies every entry against the live star chart and DE's export
(see [Tests](development.md#tests)). The earlier version of this guide contained three fabricated nodes
and a planet mix-up; the check exists so that cannot happen again quietly.

---
