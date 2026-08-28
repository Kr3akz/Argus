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
reward screen opens:

```
VoidProjections: <accountId> gets reward /Lotus/StoreItems/.../PyranaPrimeBarrel
ProjectionRewardChoice.lua: Got rewards
```

The account IDs in those lines are discarded and never passed on.

**The other three** are not in there — DE only logs your own. They are read off the
screen by **text recognition**: a capture of the screen, then Windows' own OCR
(`Windows.Media.Ocr`, no extra package, runs offline). The pixels go straight from the
capture into the recognition — no image file is written at all, and nothing leaves your
machine.

What makes this reliable is the matching: it is not the recognised text that counts, but
the hit within the set of **roughly 600 possible relic rewards** from DE's drop tables.
A misread "kris Prime Grip" becomes *Paris Prime Grip* again. Only enough has to be
recognised to be unambiguous in that field.

Three things make it both fast and complete:

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

Measured at 2560×1440 with an English client: all four names, in one look, 0.6 s after
the log line — out of 15 seconds of thinking time.

Argus asks for the **English** recognition model explicitly, because Warframe's item
names are English and a German model pulls them towards German words. If the English
language pack is not installed (Windows Settings → Language → optional features), it
falls back to your Windows language; the matching against the drop tables absorbs most
of the difference either way.

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
