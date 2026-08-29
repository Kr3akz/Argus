# Relic rewards

*What happens when a reward screen opens: the overlay, the price tags in the game, and where the numbers come from.*

[← Back to the README](../README.md)

---

## When the recommendation appears

Before the reward screen there is the *other* screen: the grid of your own relics, where
you pick the one to take in. Argus shows what each of them is worth there — and **only
there**. It appears when you:

- open the **relic segment in your orbiter** to refine relics,
- pick a relic when **starting a void fissure** from the star chart,
- pick the next relic **between rounds** in an endless fissure — survival, excavation,
  void cascade and the rest.

All three are the same screen in the game, and it announces itself in `EE.log`:

```
ThemedProjectionManager.lua: PopulateInventoryGrid
```

That one line is the whole trigger. It used to be joined by the orbiter console
`UIConsoleTrigger3`, on the assumption that the number identified the relic segment. It
does not — it is a **running number within one scene layer**, so the relic segment is
`Layer31/UIConsoleTrigger3` while navigation is `Layer30/UIConsoleTrigger1`. Which
console carries the number 3 depends on the layer and how the ship is fitted, so other
consoles pulled up the relic recommendation over screens that had nothing to do with
relics. It bought 29 milliseconds — the log shows `PopulateInventoryGrid` arriving that
soon after the console — and it has been removed.

It closes when the input filter leaves the menu, and at the latest five minutes on,
whether or not the game said anything. An overlay stuck over a running game is the worst
thing it could do, so the clock has a vote.

## The reward screen

The moment the reward screen opens after a fissure mission, Argus shows **all four parts
on offer** — each with a platinum price and ducat value, plus a countdown of the 15
seconds you have to choose. Then it disappears by itself.

```
RELIC REWARDS                             9s
   REWARD                      PLAT    DUC.
1  Pyrana Prime Barrel            4p     15   ← your relic
2  Vadarya Prime Receiver         2p     45
3  Dual Zoren Prime Handle        2p     15
4  Perigale Prime Stock           1p     15
```

**The numbering is the point:** it matches the order on screen, left to right. You read
the number and click the card — no comparing names under time pressure.

## Price tags inside the game

Faster still, without a list: Argus puts a small tag with the platinum price and ducat
value under each of the four cards. The most expensive part gets a green border, your
own the label *yours*.

That works because text recognition returns not just names but their **screen
coordinates**. Each tag sits centred under the name it belongs to.

Technically it is **one** transparent window over the whole screen, not four: four
windows would be four renderers for the same thing and four chances for one to hang. It
is **click-through** and not focusable — it cannot swallow a click meant for the card
beneath it, and never takes input away from the game.

Two traps are in there, both solved:

- Screen coordinates are real pixels; window coordinates are device-independent points.
  At 125% scaling the tags would otherwise sit a quarter too far right.
- `showInactive()` leaves a window with `transparent: true` and `focusable: false`
  invisible on Windows — measured. Hence `show()`, which is safe here: a non-focusable
  window cannot take focus.

They disappear as soon as the log reports the reward screen closed — and at the latest
two seconds after the countdown expires, even if that message never arrives. A tag stuck
over a running game would be the worst possible trait, so the clock has a vote.

The vertical offset below the name is 23% of screen height — 331 px at 1440p, which
clears all four player names beneath the cards. As a fraction rather than a fixed pixel
count, so it sits in the same place of the image at 1080p. Values above 0.33 are capped.
To change it, set this in `%APPDATA%\Argus\data\config.json`:

```json
{ "relicTagOffset": 0.23 }
```

Switchable off under **Settings**. Without tags, the list appears in the overlay.

## Where the data comes from

Two sources, arriving one after the other:

**Your own drop** is known immediately. Warframe's `EE.log` writes this the moment the
reward screen opens. The full sequence, with the game's own timestamps:

```
15977.878  VoidProjections: OpenVoidProjectionRewardScreenRMI       ← screen opens
15978.043  VoidProjections: Client got reward info from <peer>      +165 ms
15978.572  VoidProjections: <accountId> gets reward /Lotus/…/CalibanPrimeBlueprint
15978.636  ProjectionRewardChoice.lua: Got rewards                  +758 ms
15978.638  ProjectionsCountdown.lua: Initialize timer nil  15       ← the 15 s start
15993.641  ProjectionRewardChoice.lua: Relic reward screen shut down
```

`Got rewards` is what starts the reading — by then every card is named and the peer
count is known. But the **first** line lands three quarters of a second earlier, and
Argus used to read it only to reset a counter. It now also puts the empty dock on
screen and warms the recognition process, so both are done before the countdown even
begins. It is too early to *read* — the cards are not drawn yet, which is what the
`Missing icon data!` lines a moment later are about — but not too early to *show*.

The account IDs in those lines are discarded and never passed on.

**But the log is not always punctual.** Warframe buffers `EE.log`, and the buffer is
flushed by how much the game has to write — not by the clock. On the reward screen
almost nothing happens, so while the game runs in the *background* the buffer can sit
still: measured, `Got rewards` and `Relic reward screen shut down` were 15.0 seconds
apart in game time and arrived **1 millisecond apart** in the file. Argus would then
learn about the screen only after it had closed.

That is why the screen itself is a second announcer. While a fissure run is on, Argus
glances at the top strip of the screen every two seconds and looks for the
`VOID FISSURE/REWARDS` heading — but only while Warframe is *not* in the foreground,
because with focus the log arrives on time (measured: 3 ms) and it alone names your own
drop. **Tabbing back in keeps it looking for another 25 seconds**: switching focus does
not flush Warframe's buffer, so the moment you return is exactly when you can see the
screen and Argus still cannot — and it is the moment it matters most. That
glance reads 2560×101 pixels and costs 31 ms, against 248 ms for the whole screen: about
1.5 % of one core, and only during a run. Whichever announcer is first starts the
reading; when the log catches up later, it no longer restarts anything — it only adds
the one thing the screen cannot show, your own drop.

**The other three** are not in there — DE only logs your own. They are read off the
screen by **text recognition**: a capture of the screen, then Windows' own OCR
(`Windows.Media.Ocr`, no extra package, runs offline). The pixels go straight from the
capture into the recognition — no image file is written at all, and nothing leaves your
machine.

What makes this reliable is the matching: it is not the recognised text that counts, but
the hit within the set of **roughly 600 possible relic rewards** from DE's drop tables.
A misread "kris Prime Grip" becomes *Paris Prime Grip* again. Only enough has to be
recognised to be unambiguous in that field.

Six things make it both fast and complete:

- **The crop follows the game window, not the primary monitor.** Every crop used to be a
  fraction of the primary screen. That is only the same thing when the game runs
  borderless-fullscreen on the primary monitor. On a second screen — which may sit at
  `x = -2560` — the primary screen bounds do not reach it at all, so every strip captured
  the *wrong monitor* and only the expensive full-screen look found anything. Argus now
  locates the game window's drawing area and treats that as the frame. The price tag
  window follows it too, instead of staying pinned to the primary screen.
- **The card row is read column by column.** The failure mode above — two side-by-side
  cards merged into one line — cannot happen if only one card is inside the crop. The
  four cards sit in an evenly spaced, centred row (measured at 2560×1440: 323.5 px apart,
  centred on 1280.25, which is the frame centre to within half a pixel), so the row can be
  cut into one crop per card. Four such crops cost 123 ms together — less than the single
  wide strip they replace (192 ms) and a third of the full screen (392 ms). Where the
  number of players is not known — the screen announcer has no log to read it from — the
  columns are re-derived from the first card actually read: cards abut, so a neighbour is
  exactly one card width away.

- **The recognition process stays warm.** Starting it costs about a second — assemblies,
  WinRT types, the engine itself — against 116 ms for the recognition proper. It is
  therefore started once, when the relic *selection* screen opens and nobody is waiting,
  and then answers each look in 70–250 ms. It shuts itself down five minutes after the
  last look.
- **Names that wrap are joined back together.** "Caliban Prime Neuroptics Blueprint" is
  34 characters and breaks over two lines under the card. Matched line by line it can
  never be found — "Caliban Prime" on its own does not come close enough to the full
  name. Lines that sit directly beneath one another and share a centre are tried as one.
- **Several looks are merged, not ranked.** The screen is still building itself while it
  is read. One look catches cards 1, 2 and 4, the next catches 2, 3 and 4 — neither is
  complete, together they are. Cards are matched up by their position on screen; where
  the same card was read twice, the better reading wins.
- **What is read is shown at once, not at the end.** The screen does not always hand over
  all four cards together: measured, eleven looks in a row found only two or three, and
  only the twelfth had all four — seven seconds during which two names had long been
  settled and still nothing was on screen. Every card now appears as soon as it is read,
  and already-shown cards keep the price they were given rather than reloading. The loop
  itself may run for 13 of the 15 seconds, but it stops the moment every card is
  there — normally after the first look, at 71 ms.
- **Later looks enlarge the capture.** Not for the sake of the lettering, but for the
  line splitting: at borderline text sizes the engine throws two cards standing *side by
  side* into one line ("Vadarya Prime Receiver Dual Zoren Prime Handle"), and two names
  are lost at once. Enlarging fixes that — but not always: measured against the capture
  in `data/ocr/`, 2.5× took one case from 2/4 to 4/4 and pushed another from 4/4 down to
  2/4. A fixed factor only moves the breaking point, so both readings are taken and
  merged. This costs nothing in practice: the loop stops as soon as every expected card
  is there, and from 720p upwards the first look already delivers all four.

- **The geometry is measured, not guessed.** A tighter guess is still a guess, and where
  a guess is wrong a tight crop finds *nothing* while a generous one still finds
  something. So the moment a run reads every expected card, Argus records where they
  stood — card width and name strip, as fractions of the game window — in
  `scan-geometry.json`, keyed by window size. The next reward screen starts from that
  measurement instead of a default. It comes from your own screen, so it fits your
  resolution, your window mode and your in-game interface size without anyone having to
  know those in advance. Change the resolution and the key changes with it; the next
  complete run measures again.

Measured at 2560×1440 with an English client: all four names, in one look, 0.6 s after
the log line — out of 15 seconds of thinking time. Scaled-down copies of that same
capture still give all four at 1080p, 900p and 720p; below that the enlarged looks take
over, and they carry it down to roughly 576p.

Argus asks for the **English** recognition model explicitly, because Warframe's item
names are English. If the English language pack is not installed (Windows Settings →
Language → optional features), it falls back to your Windows language — and measured
against the stored capture, that barely matters: across every resolution tested, the
German model found exactly as many names as the English one. The only reproducible
difference was `Zoren` read as `Zoten`, one character in twenty-three, which the match
against the drop tables absorbs with room to spare. What breaks the recognition is the
line splitting described above, and that is the same in both languages.

Reading from the screen can be switched off under **Settings**. Your own drop from the
log remains — with no capture at all, and the recognition process is shut down with the
switch.

## Prices

From **warframe.market**, via the v2 API — v1 is retired (`/v1/items` answers 404). Only
offers from sellers who are **currently in game** are counted: the cheapest offer from
someone who has been offline for three days is not a price, it is a number.

## When nothing appears

The reward display has two halves, and they fail differently. Your **own drop** comes
from the log and needs neither the screen nor the network — it is there in every case.
The **other players' drops** have to be read off the screen, and if that fails there are
no positions for the price tags either.

Because of that, a failed reading used to end in silence: no tags, and no overlay either,
since tags were switched on. It now opens the overlay with your own drop and the reason.

If it happens, two places say what went on:

- `%APPDATA%\Argus\data\argus.log` — rewritten at every start. The relic lines record
  what came from the log, how many cards were expected, how many were read and in how
  many attempts.
- Setting `{ "relicScanDebug": true }` in `%APPDATA%\Argus\data\config.json` makes a
  failed reading keep one capture under `data/diag/`. That answers the question the log
  cannot: what the capture actually contained. Off by default — no screenshot should be
  written that nobody asked for.

## Limits

- Recognition covers the **primary screen**. If Warframe runs on a different monitor,
  it finds nothing.
- If recognition fails, your own drop remains — the display never disappears entirely.
- Very small resolutions are untested; the matching absorbs a lot, but below 1080p the
  text can get too small.
- The first look reads only the **horizontal band** the four names sit in, which is
  quicker and takes in less clutter. If the game runs in a window or on an unusual aspect
  ratio, that band can sit wrong — so looks alternate between the band and the whole
  screen until all four are found. A misplaced band costs one look, not the round.

---
