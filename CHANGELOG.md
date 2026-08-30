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

## [1.3.2] - 2026-08-30

### Changed

- **The reading stops once there is nothing left to find.** When the log
  reports how many relics were opened, the loop stops the moment it has them
  all. When nothing is reported — the screen watcher has no log to read it from
  — there was no such exit, so it kept looking until the 15 seconds were up.
  Measured on a three-player defense: **34 looks over 13 seconds**, showing the
  same three cards from the very first one, including six of the most expensive
  look at about a second each. That is screen capture while you are playing,
  which is exactly the load that makes the game feel sluggish. It now stops
  after two full rounds through every kind of look without anything new —
  measured, that ends the same run after 15 looks and about 5 seconds.
  - Two rounds and not one: in an earlier run the fourth card turned up at look
    8, exactly one full round after the previous find. One round as the
    threshold would have lost that card.
  - A run that ends this way now counts as complete, so the geometry is
    recorded from it and the next dock starts with the right number of slots.
    Before, a watcher-announced round never taught anything, because three
    found cards were measured against an assumed four.
- **Log lines no longer claim a number nobody reported.** A three-card round
  announced by the watcher used to log `3 von 4 Schildern` and
  `3 Treffer (erwartet 4)` — which reads like a failure where everything was
  found. Where no count was reported, that is now what it says.

## [1.3.1] - 2026-08-30

### Fixed

- **Fewer than four relics no longer get a four-slot dock.** Two different
  things had been sharing one number: how many cards the recognition should
  look for, and how many slots the dock should show. For the search, four is
  the right answer when nothing is known — there are never more. For the
  display it is not: a missing count was read as "four" rather than as "no
  information", so a squad that opened two relics got a dock built for four.
  It was not only too wide but **off centre** — measured, the two cards landed
  in slots 2 and 3 of 4, a card and a half to the right of where they belong.
  The two numbers are now separate, and the dock follows only what was actually
  reported: the count of opened relics from the log, and where that is silent,
  the cards that were actually read. Nothing is held open for a card nobody
  said exists.

## [1.3.0] - 2026-08-29

### Added

- **The dock is already standing when the names arrive.** It used to appear
  only once text recognition had said where the cards are — which meant waiting
  for the reward screen to be announced, read and matched before anything was
  on screen. Two things changed that. The log announces the reward screen
  opening a full **0.758 seconds** before the line Argus used to trigger on
  (measured in `EE.log`); that line was already being read and thrown away.
  And since the card geometry is now measured rather than guessed, the dock's
  position is known before a single pixel is read. So it appears immediately,
  empty, with a loading shimmer in each slot.
- **Cards that are still loading keep their place.** While the four names
  arrive one by one, the dock used to be rebuilt around whatever had been read
  so far — growing and shifting with every addition. Each missing card now
  holds its slot and shows that it is still loading, so the dock stands
  perfectly still from the first name to the last: same position, same width,
  same height throughout. You can see what you are still waiting for instead of
  watching the panel rearrange itself.

### Changed

- **The reward screen is read where the game actually is.** Every crop used to be
  a fraction of the *primary monitor*. That is only the same thing when the game
  runs borderless-fullscreen on the primary screen. On a second monitor — which
  can sit at `x = -2560`, entirely outside the primary screen's coordinates —
  every quick strip captured the wrong screen, and only the slowest look found
  anything at all. Argus now finds the game window's drawing area and measures
  everything from that: fullscreen, windowed, either monitor.
- **The four cards are read one at a time.** The one thing that reliably lost
  names was the recognition throwing two side-by-side cards into a single line
  ("Vadarya Prime Receiver Dual Zoren Prime Handle") — two names gone at once.
  With one card per crop that cannot happen. It is also *faster* than the strip
  it replaces: 123 ms for all four against 192 ms, and a third of a full-screen
  look.
- **Argus now measures your screen instead of guessing it.** The moment a run
  reads every card, it records where they stood and starts there next time. The
  measurement comes from your own screen, so it fits your resolution, your
  window mode and your in-game interface size — nothing has to be configured,
  and it improves by itself.
- **The price tags follow the game window.** They were pinned to the primary
  monitor and positioned once, at startup. Playing on a second screen put the
  tags on the wrong one; playing windowed pushed them below the window, because
  the drop beneath the cards was a fraction of the *screen* height rather than
  the game's.

### Fixed

- **Reward screens missed while playing in the foreground.** The screen watcher
  only wakes up once it has *seen* Warframe leave the foreground — that is when
  its log buffer stalls. But it checked who was in front only every four
  seconds, and a glance at Argus, Discord or a browser is shorter than that. The
  excursion fell between two samples, the buffer stalled anyway, and the reward
  screen was gone before anything looked at it: measured, the log arrived 15
  seconds late while the watcher had looked four times in three minutes. Who is
  in front is now sampled twice a second. That costs nothing and captures
  nothing — it is a window question, not a screen capture, and the screen is
  still left alone while you are actually playing.
- **A missed reward screen now counts as evidence.** Argus already detected the
  case where the log arrives after the screen has closed, said so in the log,
  and then discarded the finding. That is the strongest possible proof that the
  write buffer is stalling, so it now keeps the watcher awake for the rest of
  the mission — in an endless run, the next round is no longer missed the same
  way.
- **The log now distinguishes "never looked" from "looked and found nothing".**
  `4 looks` did not say whether 37 ticks bounced off the foreground check or
  whether it looked 41 times and saw nothing. Two entirely different faults with
  entirely different causes; the summary now names both, plus how often the game
  left the foreground.
- **The tab under the dock no longer looks stuck on.** It was a filled SVG, and
  measured against the dock it was a different material throughout: a different
  shade (`rgba(10,13,20,.97)` against the dock's `rgba(9,12,18,.97)`), no
  backdrop blur where the dock has one, and its own drop shadow — which fell
  upward onto the dock as well. The 1px seam it tried to hide never worked
  either: the path started one unit above its own `viewBox` and was simply
  clipped away, so the dock's hairline ran straight across the opening while
  the tab drew its curve underneath. It is now cut out of the dock's own colour
  layer with a mask, so the shade cannot drift apart — it is the same paint.
- **Text recognition on scaled displays.** The recognition process did not
  declare itself display-scaling aware, so at anything other than 100 % Windows
  handed it an upscaled, soft copy of the screen and lied to it about the
  coordinates — a blurrier image to read and price tags a fifth out of place. It
  now reads real pixels. Nothing changes at 100 %.

## [1.2.0] - 2026-08-29

### Added

- **Goals now know what you already own.** Every resource and part on a goal is
  checked against your inventory. What you have enough of looks exactly as it
  did before; what you are short of turns grey and shows both numbers, so
  `9/10` says at a glance that one Fieldron stands between you and the forge.
  It reads the same way in the planner, on the dashboard cards, in the item
  sheet, in the shopping list and in the overlay — where it matters most,
  because that is the one you can see while farming.
  - A part sitting in the foundry is not counted as missing. It gets a blue dot
    and a note in the tooltip instead, because something that finishes in four
    hours is not something to go farming for.
  - A goal card answers "can I build *this*". The shopping list underneath
    still adds up every open goal, so the same resource can be green in one
    place and grey in the other — both are true, they are different questions.
  - Without inventory data nothing is claimed at all: the numbers stay as they
    were rather than showing you a grey zero about an account nobody looked at.
- **Show up as "in game" on warframe.market automatically.** A switch next to
  your account in the trading tab. While Warframe is running, Argus sets your
  status to *in game*; when you close the game — or Argus — it takes it back.
  Sellers who are actually in game get written to; the rest get scrolled past.
  - It only ever adds *in game*. It never sets you to online or invisible, so
    whatever you chose on the site yourself stays yours. Taking it back means
    closing the connection, and what you look like afterwards is warframe.market's
    call, not ours.
  - Nothing is sent while the game is closed. Switch on, game shut: no
    connection, no status, nothing said.
  - The dot next to the switch carries the state — grey waiting, green live,
    red if something went wrong. The label never changes, so you always know
    what you are about to toggle.
- **Look up what anything is going for, and copy the whisper.** A fourth tab in
  trading: **Market**. Type an item name, pick it, and the top ten offers stand
  there the way they do on the site — cheapest first, people who are in game
  right now only, with a **Copy** button that puts the trade message on your
  clipboard. You paste it in Warframe yourself; Argus does not message anyone
  for you and has no way to.
  - **Rank and condition are part of the price, so they are part of the search.**
    Serration at rank 0 is 2p and at rank 10 is 49p — one list holding both is
    not a price comparison. Mods get a rank picker, relics and arcanes their
    condition, and both end up in the copied message so the other side knows
    what you mean.
  - It works signed out. Other people's offers are public, and looking up what
    a part costs should not need an account.
  - Change the search and the list of items comes straight back — there is no
    button to press to look up something else.
- **"Cheap to pick up" opens up.** The section still leads with the same eight
  recommendations it always did; a button underneath unfolds two dozen more when
  those eight are things you already looked at and passed on. The deeper list
  allows four items per category instead of two, because someone who deliberately
  asked for more is looking for choice rather than the same spread again. It stays
  open while you set goals, so you do not lose your place after every click.

### Fixed

- **Prime parts no longer all wear the same picture.** Every Nidus Prime part
  looked exactly like Nidus Prime, in the search, in the order list and in the
  order form — which made a list of five near-identical names a reading exercise.
  Warframe.market builds these images from two layers: one illustration shared by
  the whole set, and a small badge on top saying *which* piece. Argus was only
  drawing the first. The badge is now drawn as well, so the systems, the
  neuroptics and the chassis are told apart at a glance. It affects 787 of the
  3,840 items on the market; the rest were already unmistakable on their own.
- **The buttons above the trading list sit level again** — that row never had a
  layout rule of its own, so its buttons lined up on the text baseline. It went
  unnoticed while they all held nothing but a label; the new presence switch has
  a different baseline, and the whole row went crooked by up to four pixels. The
  row is now laid out properly, which also replaces the three-pixel gap between
  the buttons — that was the width of a space character in the source, not a
  decision — with the spacing used between pills everywhere else.

## [1.1.6] - 2026-08-29

### Changed

- **The price tags are one dock instead of four separate labels** — four boxes
  under four cards meant four borders, four shadows and three gaps for the eye
  to fall into, so the row fell apart visually even though it says one thing.
  It is now a single panel divided into columns, one per card, with the Argus
  mark centred underneath. Its width follows the number of players: three
  players, three columns. Columns in a grid row are the same height by
  construction, so a reward without set siblings no longer ends higher than its
  neighbours.

### Fixed

- **The tag layout no longer collapses into narrow strips** — the card width was
  derived from the smallest gap between recognised names. When the same card was
  read twice — which happens with long names that wrap over three lines — those
  two readings sat a few pixels apart, and that tiny gap became the assumed card
  width. Four cards turned into dozens of columns spread across the screen. Gaps
  that cannot plausibly be a card width are now ignored, the column count is
  capped at the number of players, and two readings of the same card collapse
  into the better one.
- **"YOURS" is marked again on Warframe blueprints** — the catalogue does not
  list recipes such as `MesaPrimeChassisBlueprint`, so the raw path name was
  used, which never matches the "Mesa Prime Chassis Blueprint" read off the
  screen. The name is now split at its capitals.
- **A reward screen is no longer missed after tabbing out mid-mission** — the
  watcher assumed that Warframe in the foreground meant a punctual log. It does
  not: a buffer filled while the game sat in the background is not flushed by
  tabbing back in, and the event still arrived fifteen seconds late. Once the
  game has been in the background at all, the watcher now stays awake until the
  mission ends.
- **Input no longer feels sluggish while the watcher runs** — reading the screen
  costs almost no CPU, but each read touches the display, and with a game in
  fullscreen that can disturb its output. Checks now run every four seconds
  instead of two, and every six seconds while Warframe is in the foreground,
  where someone is actually playing. That interval is also how long a reward
  screen can go unnoticed, so it is a balance rather than a maximum: twelve
  seconds was tried and left only three of the fifteen seconds usable. If the
  sluggishness returns, set `"relicWatch": false` in `data/config.json` to
  switch the watcher off rather than slowing it further — a half-blind watcher
  helps nobody.
- **The tags no longer blink when a card or price arrives** — every partial
  result rebuilt the panel, and the entrance animation restarted each time from
  fully transparent. The panel now animates only on its first appearance.
- **Recognition gets more attempts in the same time** — measured on a stubborn
  run of seventeen attempts, the expensive full-screen pass at 2.5× cost a
  second each and found no more than the hundred-millisecond strip passes. It
  now runs once per six attempts rather than every fourth.

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
