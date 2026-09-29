# Relic rewards

*What happens when a reward screen opens: the overlay, the price tags in the game, and where the numbers come from.*

[← Back to the README](../README.md)

---

## When the recommendation appears

Before the reward screen there is the *other* screen: the grid of your own relics, where
you pick the one to take in. Argus puts a panel over it with your relics ranked by what a
crack is worth on average — and **only there**. It appears when you:

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

It closes when the input filter leaves the menu, when you pick a relic (the game asks for
confirmation, and that dialog is the signal), and at the latest five minutes on, whether
or not the game said anything. Between rounds the game
gives you a clock of its own — 20 seconds, announced 61 to 72 ms after the screen opens
(four rounds measured) — and then that clock decides instead, plus two seconds. A panel
stuck over a running game is the worst thing it could do, so the clock has a vote.

### Its own window

The panel is a window of its own, built like the riven panels on the cycle screen:
transparent, **click-through**, not focusable, laid over the game window wherever that
is — on the second monitor at `x = -2560` too. It used to be the big overlay window that
jumped up here, with cycles, fissures and goals that mean nothing on this screen, and at
a spot that had nothing to do with where the game was. That no longer happens; if you have
the overlay open anyway, it still highlights the relic selection as before. The panel has
its own switch under **Settings**.

It also leaves with the game. Warframe logs `WM_ACTIVATEAPP 0` when another window takes
the foreground and `WM_ACTIVATEAPP 1` when it gets it back — 118 such lines in one
evening, strictly alternating, seven of them while a selection was open. Without this the
panel, which sits above everything, would have stayed on top of whatever you switched
to; now it hides and comes back as long as the selection is still open.

It has to be quick, and how quick is measured. Over six picks, the time from the screen
opening to choosing a relic was **1.1 to 2.8 seconds**; the game itself finished building
the screen 89 to 367 ms after the log line (23 openings — around 90 ms between rounds,
around 300 ms from the star chart or the orbiter). A panel that needed a second would miss
half the picks. So the window is created hidden at start, like the price-tag window, and
shown the moment the numbers are ready — nothing waits for the game to finish drawing,
because the panel sits at the edge and not on the grid that is building up.

Only if the numbers take longer than 150 ms — the first time after a start, with the
catalogue, market list and drop tables still cold — does it show *Reading your relics…*
first. Anything shorter would just flicker.

Each row shows the relic with its refinement and how many you have, what one crack is
worth on average in platinum and ducats, and the best part in it. The numbers are the
relic planner's, so the two never disagree. A **≥** in front of the platinum value means
prices are known for less than 90 % of the drop chance, so the value is a lower bound — the
same threshold at which the planner warns.

### Where it sits, and filtering by hand

The panel sits in the **top right corner** of the game, ten points from both edges. Its
first position — on the height of the riven panels, a fifth of the way down — read as
"somewhere in the middle" in the first test, so it moved to the edge.

The **cursor hotkey** (`Ctrl+E` unless you changed it) brings the mouse to the panel, the
same key that takes the cursor into the overlay window. While the selection screen is
open, the key belongs to the panel; the overlay gets it back afterwards. In that mode:

- **Chips** filter the list: *Auto* (whatever the log or the screen said), *All*, one per
  era, and *★ Starred* for the relics you starred in the planner. The choice holds for this
  selection; the next one starts on *Auto* again.
- **Drag the title** to move the panel. The position is kept as a fraction of the game
  window, so it stays in the same place of the picture after a resolution change, and it
  survives a restart. **Double-click the title** to send it back to the corner.
- The panel takes clicks **only while the cursor is on it**; everywhere else they keep
  going to the game, the same trick the overlay's title bar uses. The window never takes
  focus, so Warframe stays in front and there is nothing to click back into.

Press the key again, or pick a relic, and it is click-through as before.

### It shows the era the fissure actually takes

A Lith fissure takes a Lith relic. The game knows that and greys out the rest, so a list
of all of yours would have you filtering in your head against a screen that had already
done it. When the fissure is known, the panel shows only relics that fit and names the
fissure in its heading. An **Omnia** fissure accepts any era, so there the answer is
*all* — that is the right answer, not a missing one.

**Where it comes from depends on the way in.** Argus tells the three apart by what the log
wrote just before the selection opened — measured on all 23 openings of 28 and 29 Sep,
none left over:

| way in | what comes just before | era from |
|---|---|---|
| relic segment in the orbiter | `UIConsoleTrigger::Open()`, 22–41 ms earlier | none — refining, so every era in one list |
| between rounds | `Relic reward screen shut down`, 60–68 ms earlier | the log, see below |
| star chart | the map's input filter was the last one set | **the screen** |

**On the star chart the log is too late.** The game opens the selection first and writes
the mission into the log only *after* you pick: measured on two fissures, 0.8 and 0.9
seconds after the confirmation. Nothing before that gives it away either — the last node
the cursor passed over before the Axi selection was Nakki; the fissure was on Hydron, and
in a later test the last ones were Maroo's Bazaar and Wahiba. So Argus reads the era off
the selection screen itself, and only with *Read the rewards off the screen* switched on.

**What the screen shows**, measured on three captures from the first test (2560×1440,
English client):

- Under *VOID RELICS/REFINEMENT* at the top left, the era has a line of its own:
  `LITH ERA`, `NEO ERA`.
- Next to it a counter, `COLLECTED 75/202`. 202 is exactly the number of Lith relics in the
  drop tables; the Neo screen said `62/196`, and there are 196 Neo relics. The second number
  is how many relics the screen lists.
- The grid holds cards of that one era only (`Lith G14 Relic`).

**And when it can be read.** The screen fades in. About 0.45 s after it opened, everything
was still half transparent: cards and counter could already be read, the small era line
could not; by 0.7 s it was there. The first version waited for that line — so for about
half a second the panel stood there with every era and then jumped to the right one, which
is exactly what the first test complained about.

So now there are three pieces of evidence, in this order:

1. The line `<era> ERA`. It *is* the answer.
2. The counter: if the screen lists more than half of all relics, it shows every era —
   Omnia. (An Omnia screen has not been captured yet; this follows from what the counter
   demonstrably counts for Lith and Neo.)
3. The cards — but for a single era **only with the counter as proof** that the screen
   lists one era. Without it the visible cards might be the first row of an Omnia grid
   that happens to start with one era. Cards of two eras, on the other hand, always mean
   every era.

While fading in, the text recognition misreads the pale cards (`Lit%`, `Liti`, `Lfth` for
*Lith*), so at the start of a card a word one letter off still counts — only for the long
names and only with the same first letter; `With …` is not a Lith card, `Liii` is left
out. A counter that cannot be right (`75/2020`, one digit too many) is ignored instead of
turning the screen into Omnia. The panel's own text and the overlay window are left out
of the reading, or they would read themselves.

**The panel waits for the answer.** Argus starts looking the moment the game reports the
screen built (`LoadingCompleteEnd`) and looks again every 80 ms — a look at a somewhat
smaller top left area took 26 to 45 ms in the first test. Until the era is decided the
panel stays hidden, so it appears once, already filtered; going by the captures, the cards
and counter are readable from about 0.45 s after the screen opens, while the game's own
screen is still fading in. If nothing is decided
within 1.2 seconds, it shows **the best relics of each era**, two per era, instead of one
ranking across all of them: a single list would put Lith relics on top while the screen
only offers Axi. Every later selection in the same mission knows the era from the log.

What was read is written to `argus.log`, with the number of looks and the time since the
screen opened. With `relicScanDebug` switched on, the first reading of a session is kept as
a capture in `data/diag/auswahl-*.png` together with what was read, plus up to two more
when a reading finds nothing — never more than six such captures in the folder.

That is where the log line the game writes as a mission **loads** comes in:

```
Client loaded {"difficulty":"","voidTier":"VoidT6","quest":"","name":"SolNode232_ActiveMission"} with MissionInfo:
```

It is needed because the line for the squad's target does not last: 2.9 seconds after
it, as the mission starts, the game logs that you left the matchmaking squad, and that
cleared the fissure. Between rounds of an endless fissure — exactly where the selection
comes back every few minutes — the era was therefore never known. The loading line comes
after that and holds until you are back in your ship or load somewhere else; a place
without `voidTier`, such as a relay, clears it.

`voidTier` names the era directly — `VoidT1` to `VoidT6` for Lith, Meso, Neo, Axi,
Requiem and Omnia, the same numbering as in the relics' own item paths. Measured: `VoidT4`
on *Hydron (Sedna) – Axi Fissure* with an Axi relic equipped, `VoidT6` on
*Tuvul Commons (Zariman) – Omnia Fissure*.

The node is still read, for the heading and the Steel Path mark. It used to be the only
source, joined to the world state through a node table:

```
Set squad mission: {"difficulty":"","voidTier":"VoidT4","quest":"","name":"SolNode195_ActiveMission"}
            SolNode195  ->  Hydron (Sedna)      ← the node table
            Hydron (Sedna)  ->  Axi             ← the world state's fissure list
```

Two things went wrong with that for fissures. The name carries `_ActiveMission`, which
the node table does not know, so a fissure mission never resolved; node ids never contain
an underscore (452 of 452), so everything from the first one on is now cut off. And the
world state had to be reachable. Now the era comes from the log and the world state only
adds the rest — if it cannot be reached, the filter still works.

The id is used rather than the mission title standing next to it in the log, because that
title is in **the language the game is set to**. The ids are not: `SolNode75` is the same
everywhere. Three prefixes occur in practice — `SolNode`, `SettlementNode` and
`CrewBattleNode` for Railjack — and all three are covered.

In the overlay window, your own click on an era chip always wins from then until you
start the next fissure. A mission that is not a fissure filters nothing, and if neither
the log nor the node says which fissure it is, nothing is filtered either — a list cut
down for a reason nobody can see is worse than a long one.

## The reward screen

The moment the reward screen opens after a fissure mission, Argus shows **all four parts
on offer** — each with a platinum price and ducat value, plus a countdown of the 15
seconds you have to choose. Then it disappears by itself.

```
RELIC REWARDS                             9s
   REWARD                      PLAT    DUC.
1  Pyrana Prime Barrel            4p     15
   your relic · set 68p
2  Vadarya Prime Receiver         2p     45
   set 130p
3  Dual Zoren Prime Handle        2p     15
   set 22p
4  Perigale Prime Stock           1p     15
   set 45p
```

**The numbering is the point:** it matches the order on screen, left to right. You read
the number and click the card — no comparing names under time pressure.

**What the whole set goes for** stands in the small line underneath, and deliberately
not in the price column. A single part says little: two platinum for a Vadarya Prime
Receiver reads like junk until you know the set is 130p and this is one of four pieces.
But it is not the number you choose by — you are taking the *part*, not the set, and the
column on the right is what lands in your pocket in the next fifteen seconds. Forma has
no set, so its line stays empty; a part whose set price has not arrived yet shows
nothing rather than a loading dot.

## Price tags inside the game

Faster still, without a list: Argus puts a small tag with the platinum price and ducat
value under each of the four cards. The most expensive part gets a green border, your
own the label *yours*.

The tag also carries the **set**, as one bar: the component boxes on the left, each with
how many you already own, and the whole set's platinum on the right.

```
        Trinity Prime Systems Blueprint
                  0 / 1 owned
   ┌──────────────────────────────────┐
   │  [▫][▫][▫][▫]          SET 56 ⬡  │
   └──────────────────────────────────┘
    9 ⬡                          15 D
```

The two halves answer the same question — how far along am I, and what is it worth at
the end — so they share a frame. Loose underneath each other they belonged to nothing
visibly, and the number was the first thing you missed. It still stays smaller and
dimmer than the price at the bottom: that is the one you actually choose by, because you
are taking the *part*, not the set.

**This is where you see it if the tags are switched on**, because then the overlay window
does not open at all; it would only repeat what is already on screen.

That works because text recognition returns not just names but their **screen
coordinates**. Each tag sits centred under the name it belongs to.

Technically it is **one** transparent window over the whole screen, not four: four
windows would be four renderers for the same thing and four chances for one to hang. It
is **click-through** and not focusable — it cannot swallow a click meant for the card
beneath it, and never takes input away from the game.

Three traps are in there, all solved:

- Screen coordinates are real pixels; window coordinates are device-independent points.
  At 125% scaling the tags would otherwise sit a quarter too far right.
- `showInactive()` leaves a window with `transparent: true` and `focusable: false`
  invisible on Windows — measured. Hence `show()`, which is safe here: a non-focusable
  window cannot take focus.
- **The field is fixed once and then left alone.** How wide the dock is and where it
  starts depends on how many relics cracked — and that number comes from the log, which
  can arrive nine seconds late. Recomputing it on every redraw meant the whole dock slid
  a full card width sideways while you were looking at it: measured, three read cards
  without the number sit at x=957 across three columns, and the same three cards with a
  late-arriving *four* sit at x=635 across four. So the field is settled on the first
  draw — placeholders included — and a number that turns up afterwards counts for the
  *next* round. In an endless mission that is thirty seconds away.

And a card that was read is never dropped. Each card goes to the column whose centre is
nearest; if one falls outside the field, the field is **re-laid from the cards** rather
than patched, because a field for three columns and a row of four cards are offset by
exactly half a card — widening it would have put every tag half a card beside its own.
Two readings landing in one column still collapse to the better one: that is the same
card read twice, which is what the rule is for.

**The component pictures are fetched before they are needed.** Each tag shows three to
five of them, and cold from the mirror one costs 329 ms measured — sixteen of those
under a fifteen-second clock, and the boxes visibly filled in afterwards. But there are
few of them and they are always the same ones: counted across every relic there are
exactly **575 distinct component pictures, 2.8 MB together**, and the eras overlap
almost completely (Lith 560, Axi 572), so there is nothing to narrow down. The moment a
relic is equipped they are all loaded eight at a time — about half a minute, against a
fissure run that takes longer.

That happens **once**, and not once per session: the mirror sends
`cache-control: public, max-age=31536000, immutable`, so Chromium keeps them across
restarts. Measured in place: 1136 ms for a picture it had never seen, **0 ms** for the
same one afterwards. About 7% of components have no picture on the mirror at all; those
boxes stay empty, as they always did.

The loading is done **by the tag window**, not by the main process, even though the list
is computed there. Chromium partitions its disk cache by origin, and a fetch from the
main process has none — what landed there might not be found again by the window that
needs it, and the whole exercise would have been silent busywork. The window loads them
with `new Image()`, which is the same path the tag takes later, and is also the only one
its content-security policy allows: `cdn.jsdelivr.net` is listed there as an image
source, not as a connect source.

They disappear as soon as the log reports the reward screen closed — unless that report
arrived in the same buffered flush as the opening one, in which case it describes a
screen that is still in front of you and the round's own clock decides instead — see
*But the log is not always punctual* further down. And at the
latest two seconds after the countdown expires, even if no message ever arrives. A tag
stuck over a running game would be the worst possible trait, so the clock has a vote.

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

**And when it catches up, it brings the ending with it.** The same flush that finally
delivers `Got rewards` usually carries `Relic reward screen shut down` right behind it —
a line that, in game time, belongs fifteen seconds later. Taken at face value it closed
the round on the spot and the tags vanished in front of a screen that was still open;
measured on 21 Sep 2026, the flush arrived 9.2 s after the watcher and cut the tags six
seconds short. So a closing line is only news when the log has been talking all along.
If the *watcher* opened the round and the log's own opening line arrived less than two
seconds ago, the ending is history, not news — and the round then ends on **its own
clock**, the same fifteen seconds the game gives you.

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

The set price comes from the same place, looked up as the market's own set entry for the
part — `saryn_prime_systems_blueprint` belongs to `saryn_prime_set`. Of the 596 rewards
in DE's drop tables, 582 resolve to one of 160 prime sets; the remaining fourteen are
Forma, Kuva, Ayatan stars, a Riven sliver, an Exilus adapter and the Requiem mods, none
of which have a set. Once a relic is equipped, those 160 set prices are warmed in the
background along with the part prices — behind them, never in front: the part price is
the number on the card, the set price the note underneath, and they should arrive in
that order.

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
