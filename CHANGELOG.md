# Changelog

What changed between versions, in the words of someone using the app rather than
writing it. The section for a version becomes the text people see in the update
window before they download anything — so it is worth two minutes.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [semantic versioning](https://semver.org/lang/en/).

<!--
  HINWEIS FUER MICH SELBST:

  Die Ueberschrift MUSS "## [x.y.z]" lauten - genau daran findet
  tools/release-notes.mjs den Abschnitt, und der Workflow macht daraus die
  Release-Notiz. Fehlt der Abschnitt zu einer Version, faellt das Werkzeug auf
  die Commit-Betreffzeilen zurueck; es bricht also nie, es wird nur haesslicher.

  Ausnahme von der Sprachregel: hier steht ENGLISCH, obwohl es Projekttext ist.
  Der Abschnitt landet im Update-Fenster, und das ist Oberflaeche.
-->

## [Unreleased]

<!-- Was seit dem letzten Release dazugekommen ist. Beim Anheben der Version
     in package.json wird daraus der neue Abschnitt. -->

## [1.0.0] - 2026-08-23

First public release.

### Added

- **Mastery planning** — every item you have not mastered, ranked by what it
  actually costs you. Goals resolve down to raw materials, including build times.
- **Live world state** — open-world cycles, void fissures, sorties, Nightwave,
  invasions, Steel Path and Baro Ki'Teer, with desktop notifications for the
  fissures you pick.
- **Overlay** — a second window that sits on top of the game, with global hotkeys
  and a cursor mode that hands input back to Warframe on Esc.
- **Relic rewards** — reads all four parts off the reward screen and puts platinum
  price and ducat value under each card, inside the game.
- **Inventory** — mods, arcanes and relics as the cards they are in game, with
  data sheets, drop locations and rank-by-rank values. Read from the running game,
  off by default.
- **Trading** — orders and contracts on warframe.market straight from your
  inventory, plus a local trade ledger.
- **Builds** — loadouts checked against what you actually own, or imported from
  Overframe.
- **Farming and mining guides** — best nodes per material, verified against the
  star chart rather than remembered; ores and gems of all three landscapes sorted
  by vein colour.
- **Updates** — the app checks GitHub hourly, verifies every download against the
  published SHA256 and refuses to run a file that does not match.
