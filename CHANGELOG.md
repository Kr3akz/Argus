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

## [1.1.5] - 2026-08-28

### Fixed

- **Reward recognition is faster, more complete and no longer depends on the
  log** — the overlay used to wait for two network calls before looking at the
  screen, which added up to ten seconds of the fifteen available. The screen is
  now read first, and names, ducats and prices fill in beside it. An enlarged
  second pass catches cards that a single zoom level misses; measured against
  real captures, both zoom levels together found all four names in every case
  where either level alone did not. When Warframe runs in the background, the
  top of the screen is watched directly for the reward banner instead of
  relying on the log, which can be delayed by minutes when nothing else flushes
  its buffer. Partial results appear immediately — each card goes up as soon as
  it is read, instead of waiting for all four. Every reward screen now carries a
  sequence number in the log, and the active relic changes only through a single
  function that records the reason.
- **Price tags sit on a common baseline** — each tag hung from the bottom of
  *its own* bounding box, and bounding boxes differ in height when a name wraps.
  The row looked staggered even though the four cards in the game are level. The
  lowest edge of all boxes is now used as the shared baseline.

### Changed

- **The update badge matches the inventory filter chips** — it used to carry its
  own sizing that resembled the chips without matching them. Padding, font size,
  weight and transition are now taken from the active chip style; measured, both
  come out to the same 27.8 px height. No border, because the chips themselves
  render borderless (their `border-color` token is undefined, so the declaration
  falls back to `none`).

## [1.1.4] - 2026-08-28

### Fixed

- **Squads of two or three no longer wait seven seconds** — there is one reward
  card per player, not always four, and the reading stopped only once it had
  four. In a squad of three that number never arrived, so it kept reading until
  the time ran out and showed the three cards after seven seconds instead of
  half a second. The number of cards to expect is now taken from the log, which
  counts the players. For the same reason the overlay no longer claims "3 of 4
  could be read" when three was all there ever was.
- **Something always appears now.** If the screen could not be read, the price
  tags in the game have no positions to sit at — and because tags were switched
  on, the overlay window stayed shut as well. The result was nothing at all: no
  drop, no reason, silence. Your own drop is known from the log regardless, so
  the overlay now opens with it and says what went wrong.
- **A reading cut short by the next round is no longer silent** in the log. It
  left the loop without a word, so the record went straight from "found in log"
  to nothing, which is exactly the case that most needed explaining.

### Added

- **A log file** at `%APPDATA%\Argus\data\argus.log`, rewritten at every start.
  A packaged app has no console, so when the relic display stayed away the
  reason was written to nowhere. Same content as the console — no credentials,
  no account IDs.
- **Evidence for a failed reading**, off by default. With
  `{ "relicScanDebug": true }` in `%APPDATA%\Argus\data\config.json`, a reading
  that finds nothing keeps one capture under `data/diag/` so it can be looked
  at. Off by default, because no screenshot should be written that nobody asked
  for.

## [1.1.3] - 2026-08-28

### Changed

- **An update installs without a second window** — *Install and restart Argus*
  now closes the app, installs in the background and brings Argus back up on the
  new version. Until now the installer opened its own window and asked once more
  where to install, although the window in Argus had already shown the version,
  what changed and the checksum it had verified; the same questions, a second
  time. It installs into the folder it was installed to before. Nothing changes
  for the **portable** build — there is nothing to install there.

## [1.1.2] - 2026-08-28

### Fixed

- **The relic recommendation no longer opens on its own** — it appears where it
  should and nowhere else: opening the relic segment in your Orbiter, picking a
  relic before a Void Fissure, and picking the next one between rounds in endless
  fissures. It used to also react to an Orbiter console identified by its number,
  on the assumption that the number named the relic segment. It does not — the
  number counts consoles within one scene layer, so which console carries it
  depends on how your ship is fitted, and unrelated consoles pulled up the relic
  list over screens that had nothing to do with relics.
- **The reward overlay arrives while you can still use it** — all four parts,
  typically on the first look, about 0.6 seconds after the reward screen opens
  instead of several seconds. Previously each look started its own PowerShell
  process; of the 1.2 seconds that cost, only 116 milliseconds were the actual
  recognition. The process now starts once, in the background, the moment you
  pick a relic — and is shut down again five minutes after the last look, or
  immediately when you switch screen reading off.
- **Parts whose names wrap onto two lines are found again** — "Caliban Prime
  Neuroptics Blueprint" and every other Warframe part blueprint break over two
  lines under the card. Compared line by line they could never match, so those
  cards silently stayed blank. Lines sitting directly beneath one another under
  the same card are now read as one name.
- **Missing cards are filled in across looks instead of discarded** — the reward
  screen is still building itself while it is read. One look might catch cards 1,
  2 and 4, the next 2, 3 and 4; the better single look used to win, so one card
  was thrown away. The looks are now combined by position on screen.
- **Text recognition asks for English again** — it had been silently falling back
  to your Windows display language, which pulls English item names towards words
  in that language. If the English language pack is not installed, the fallback
  still applies, as before.
- **A stuck recommendation clears itself** — if the game never reports the relic
  screen closing, it closes after five minutes rather than staying over the game.
- **The price tags no longer wait on the item catalogue** — it was being re-read
  from disk and re-indexed once per reward, four times, while the fifteen-second
  countdown was running.

### Changed

- **No screenshot is written to disk during a reward screen.** The pixels go
  straight from the capture into the recognition. Reading the screen can still be
  switched off entirely under Settings, and your own drop from the log remains.
- The vertical offset of the in-game price tags is documented correctly again:
  `relicTagOffset` defaults to `0.23`, not `0.083`.

## [1.1.1] - 2026-08-26

### Added

- **Automatic inventory synchronization** — when game scanning is enabled, Argus
  now detects mission completions, returning to the Orbiter, and completed trades
  to automatically refresh your inventory in the background (respecting the 10-minute
  rate limit). Includes a dedicated switch in Settings.

### Fixed

- **Crisp Windows application icons** — installed builds and desktop/taskbar
  shortcuts now use a dedicated multi-resolution `.ico` containing pre-rendered
  mipmaps (16, 24, 32, 48, 64, 128, 256 px) with clean anti-aliasing. The window
  runtime icon is also bundled directly with the application, resolving pixelated
  and blurry icons on Windows.
- **Relic tracking in endless missions** — the equipped relic counter in the
  overlay now stays active between rounds in endless fissures where the initial
  confirmation dialog is not shown again.

## [1.1.0] - 2026-08-24

### Added

- **Weekly rotation tab** — everything that resets once a week in one place:
  Archon Hunt, The Circuit, Deep and Temporal Archimedea, Netracells and Kahl's
  Garrison, plus the vendor resets for Teshin, Bird 3, Archimedian Yonta,
  Acrithis, Palladino and Nightwave. Entries carry their own expiry where the
  world state reports one, and are marked as following the common weekly reset
  where it does not.
- **Dynamic Mastery Rank Emblems** — the hero header dynamically displays the
  official mastery rank crests for Mastery Rank 0 through 30 and Legendary ranks
  1 through 4 reflecting your account's current rank.

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

- **Overlay** redrawn from the ground up. Era colour now runs through the whole
  relic card — a thin bar at the edge, the tier label and the artwork's glow —
  instead of every row being the same blue block. Refinement, stock and the
  expected platinum return read at a glance, a live fissure for that era shows
  as a green marker rather than a sentence, and clicking a relic unfolds its six
  possible drops with rarity, chance, platinum and ducats. During Warframe's own
  relic selection the best relic unfolds by itself, because reaching for the
  overlay there costs the game its focus.

- **Open goals in the overlay** now unfold into the parts and resources the item
  actually needs — the same breakdown the Goals tab shows, set narrow enough for
  a 380 px column, with parts that need their own build time marked as such.
  Goals you already own show a rank bar instead.

- The overlay has **no scrollbar** any more. It was a strip of foreign matter
  down the edge of a window that sits on top of the game, and it took width from
  an already narrow column. The wheel still scrolls.

- **Void Traces** show the resource's own artwork instead of a drawn symbol,
  in the overlay and in the relic planner alike, and the amount is no longer
  set smaller than the label next to it.

- **Platinum and ducats carry their icons in the overlay**, the same ones the
  rest of the app uses, instead of a trailing "p" and "d".

- **Relic era colours now match the game**: Neo is blue and Axi gold, the way
  round they are in your Void Relic screen. They were swapped.

- **Ore and gem cards in the Farming Guide lead with the ore.** The rock with
  the glowing vein came first and largest, the ore itself sat small and dimmed
  at the far edge — so the vein read as the subject of a card that is named
  after the ore. They have swapped sides and the ore is half again as large.

- **A hotkey for the main window** — <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd>
  by default, rebindable next to the other two in Settings. It pulls the window
  to the front from anywhere, including out of a mission, and restores it if it
  was minimised. It does not hide it again; Alt+Tab or a click puts you back in
  the game.

- **Overlays can be switched off**, in their own Settings group rather than
  scattered among the notifications. The overlay window has a master switch:
  off means off, so neither the hotkey nor a relic reward brings it up, and it
  disappears at once if it is showing. The in-game price tags keep their own
  switch — they are a second window and independent of the panel. With the
  master off, the overlay button in the title bar says so instead of doing
  nothing when clicked.

- **The overlay says how to get rid of it.** Its two shortcuts —
  <kbd>Ctrl</kbd>+<kbd>R</kbd> to hide, <kbd>Ctrl</kbd>+<kbd>E</kbd> for the
  cursor — now sit permanently along the bottom edge, taken from whatever you
  have them bound to rather than written into the page. The line used to appear
  only in click-through and cursor mode, which are exactly the two cases where
  you already knew.

### Fixed

- **Reading the four relic rewards off the screen now works far more often.**
  It read the screen exactly once, the instant the log announced the rewards —
  before the game had finished drawing the cards. Whatever that one look
  produced counted, and finding nothing was treated as a valid "nothing there"
  rather than as a miss, so it failed silently. It now waits a moment, reads
  repeatedly until all four are there, and keeps the best attempt rather than
  the last. The recognition itself was never the problem: measured against a
  real capture it reads all four exactly, in 0.7 seconds.
- If fewer than four can be read, the position numbers are left out instead of
  guessed. They come from the order of the *hits* — with a card missing, the
  numbering pointed at the wrong card.
- **The overlay no longer offers you relics you have just opened.** Your
  inventory is only fetched when you ask for it — polling Digital Extremes in
  the background gets your IP throttled, and that throttling reaches your game
  login — so during a fissure session the list stayed on the state it had at
  the last fetch. It is now kept up to date without asking anyone: the game log
  names the relic when you equip it and confirms it when the reward screen
  appears, so the count comes down as you open them, and a relic you had one of
  disappears from the list. The next real inventory fetch takes over again.
  Relics you *find* are not counted this way, and in endless fissures only the
  first round is — both err towards showing you less than you have, which is
  the harmless direction.
- **The open-world timers no longer depend on a server that lags.** Cetus,
  Orb Vallis and the Cambion Drift are now worked out from the clock instead of
  asked for. They run on a fixed cycle that nothing random touches, so there is
  nothing to fetch — and the source we used was regularly hours behind, which
  did not look like an outage: it reported a state and an expiry that had passed
  long ago, so every countdown sat at zero. Measured on 24 Aug 2026 the source
  was six hours behind and all three cycles had expired. They now also work with
  no connection at all.
- The "source is behind" warning no longer appears when the fissure list came
  from the live fallback. It reported the lag of a source the list was not from.
- **The sun and moon in the cycle badges** were an unrecognisable speckled
  square. Both were textured 256 px images used as a colour mask, and the grain
  became the colour — at 13 px nothing was left of the shape. They are drawn
  now, and hold up at any size.
- **Relic era colours were inconsistent between windows**: in the relic data
  sheet Neo was green and Axi gold, everywhere else Neo gold and Axi blue. The
  six colours now live in one place instead of six.
- **Your ducat balance was wrong** — it read a field that has nothing to do with
  Baro and happened to hold a small number (1 where the account had 30). Ducats
  and Void Traces both sit among the resources rather than in a field of their
  own, and are now read from there.
- Mod cards no longer stay open on top of the data sheet you just opened with
  them. The card kept its hover state until the mouse moved again, and sat above
  the window it had opened.
- The relic panel in the overlay now closes when you leave the Void Relic
  Refinement segment in your Orbiter, instead of hanging around until the game
  happened to log something unrelated. Over the star chart it was already
  immediate — the "equip this relic?" dialogue announces the exit — but the ship
  has no such dialogue. The same change stops the panel from disappearing a few
  seconds *before* you pick a relic, which could happen for the same reason.
- The overlay no longer hides itself after a relic selection if you had opened
  it yourself beforehand.
- The relic reward panel could collapse to nothing when the overlay had enough
  else to show — it was still there, and zero pixels tall.
- The app now identifies itself as **Argus** in the Windows taskbar. It showed
  the full description line ("Mastery rank planner and live companion…") because
  that is what Windows reads as the file description.
- Running from the source folder no longer leaves the taskbar entry without a
  name or icon.
- The logo on the permission screen is centred instead of left-aligned.
- **Overlay cursor mode focus** — entering cursor mode now cleanly claims OS
  foreground focus and moves the pointer safely.
- **Settings hotkey capture** — fixed input conflicts when binding custom hotkeys.
- **Hero Warframe artwork** — fixed rendering resolution and scaling for the
  featured Warframe image in the header.

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
