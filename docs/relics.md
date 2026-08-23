# Relic rewards

*What happens when a reward screen opens: the overlay, the price tags in the game, and where the numbers come from.*

[← Back to the README](../README.md)

---


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

The vertical offset below the name is 8.3% of screen height — 120 px at 1440p, about
three centimetres on 27 inches. As a fraction rather than a fixed pixel count, so it sits
in the same place of the image at 1080p. To change it, set this in
`%APPDATA%\Argus\data\config.json`:

```json
{ "relicTagOffset": 0.083 }
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
screen by **text recognition**: a screenshot, then Windows' own OCR
(`Windows.Media.Ocr`, no extra package, runs offline), then the image is deleted. It
never leaves your machine.

What makes this reliable is the matching: it is not the recognised text that counts, but
the hit within the set of **roughly 600 possible relic rewards** from DE's drop tables.
A misread "kris Prime Grip" becomes *Paris Prime Grip* again. Only enough has to be
recognised to be unambiguous in that field.

Measured at 2560×1440 with an English client: all four names read correctly, capture and
recognition in 1.3 seconds — out of 15 seconds of thinking time. Installing the English
OCR language pack (Windows Settings → Language → optional features) gives recognition the
matching language model; Argus picks it up automatically once it is there.

Reading from the screen can be switched off under **Settings**. Your own drop from the
log remains — with no screenshot at all.

## Prices

From **warframe.market**, via the v2 API — v1 is retired (`/v1/items` answers 404). Only
offers from sellers who are **currently in game** are counted: the cheapest offer from
someone who has been offline for three days is not a price, it is a number.

## Limits

- Recognition covers the **primary screen**. If Warframe runs on a different monitor,
  it finds nothing.
- If recognition fails, your own drop remains — the display never disappears entirely.
- Very small resolutions are untested; the matching absorbs a lot, but below 1080p the
  text can get too small.

---
