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

### Added

- **Weekly rotation tab** — everything that resets once a week in one place:
  Archon Hunt, The Circuit, Deep and Temporal Archimedea, Netracells and Kahl's
  Garrison, plus the vendor resets for Teshin, Bird 3, Archimedian Yonta,
  Acrithis, Palladino and Nightwave. Entries carry their own expiry where the
  world state reports one, and are marked as following the common weekly reset
  where it does not.

### Changed

- **Weekly rotation** now separates *Content* and *Vendor resets* into a
  switchable view instead of two long stacked lists, and tells apart what it
  actually knows: Archon Hunt, Netracells and Circuit progress are read from
  your own game data (opt-in, same as the Inventory tab) and shown as real
  counters and bars — nothing estimated. Deep and Temporal Archimedea and
  Kahl's Garrison have no such signal in the data, so they get a manual
  checkbox instead of a guess. Teshin's and Nightwave's current offer show as
  real chips, pulled from the same response as their countdown; the four
  vendors without a public offer list (Bird 3, Yonta, Acrithis, Palladino)
  show what they trade for honestly, without inventing a catalogue.

### Fixed

- The app now identifies itself as **Argus** in the Windows taskbar. It showed
  the full description line ("Mastery rank planner and live companion…") because
  that is what Windows reads as the file description.
- Running from the source folder no longer leaves the taskbar entry without a
  name or icon.
- The logo on the permission screen is centred instead of left-aligned.

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
