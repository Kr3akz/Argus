# Cephalon Argus

*The hundred-eyed watchman of Greek myth — he never closes all his eyes at once.*

A mastery rank planner and live companion for Warframe. It shows which items you are
still missing for MR, what pays off fastest, and breaks farming goals down to the raw
materials. While you play, an overlay keeps the open-world cycles, void fissures and
your goals on screen — and when a relic reward screen opens, it puts a platinum price
and ducat value under all four parts.

**Windows only.** The overlay, the log reader and the inventory lookup all rely on
Windows APIs.

---

## Install

1. Download the latest **`Cephalon Argus-<version>-Setup.exe`** from the
   [releases page](https://github.com/Kr3akz/Argus/releases).
2. Run it. No administrator rights needed — it installs for your user account.
3. Start it and enter your account ID (the app tells you where to find it).

There is also a **portable** `.exe` on the same page if you would rather not install
anything. It keeps its data in the same place as the installed version.

### "Windows protected your PC"

The releases are not code-signed — a certificate costs a few hundred euros a year, and
this is a hobby project. So SmartScreen will warn you. Click **More info → Run anyway**
if you want to proceed.

If you would rather verify what you downloaded, every release ships a
`SHA256SUMS.txt`. Compare it against your file:

```powershell
Get-FileHash "Cephalon Argus-1.0.0-Setup.exe" -Algorithm SHA256
```

Some antivirus products also flag the app. That is worth explaining rather than waving
away: Argus can read the memory of the running Warframe process, which is a pattern
heuristics look for. What it actually does with that is described under
[Is this safe?](#is-this-safe) — and it is **off until you switch it on**.

### First run

Argus asks one question: may it read from the running game?

Start Warframe, log in, then press **Allow and continue**. Argus finds your account and
your inventory by itself — there is nothing to look up, copy or paste.

What you are agreeing to, in plain terms:

- **Reading only.** Argus never changes anything in the game, never plays for you, and
  never touches the game's network traffic.
- **Your password is never involved.** Argus cannot see it. It borrows the temporary
  session key the running game already holds — the same one the game uses itself. That
  key stops working when you close Warframe.
- **It goes to Warframe's servers, nowhere else** — the same address the game itself
  talks to.
- **What stays on your PC:** your account ID and a copy of your inventory, so Argus need
  not ask again. The session key is used once and never written to disk.

The mechanics behind that are spelled out under [Is this safe?](#is-this-safe), and you
can switch it off again at any time under Settings.

#### Game not running, or playing on console?

Take the second route on the same screen: **Enter your account ID instead**. That works
without the game and on every platform — you then get everything except the inventory,
which only the running game can provide. It also leaves the memory access switched off.

1. Sign in on warframe.com
2. Open `https://www.warframe.com/api/user-data`
3. Copy the value of `user_id` — 24 characters, digits and `a`–`f`

Since Update 38.0.8 the lookup only works by account ID. Tools that still ask for your
display name are out of date.

Either way, the first start downloads about 12 MB of public game data (DE's item
catalogue and the mod list). Everything is stored under `%APPDATA%\Cephalon Argus\data` —
which means your goals, builds and notes survive an update, and an uninstall leaves them
alone.

---

## Controls

| | |
|---|---|
| **Ctrl+R** | Show/hide the overlay (global — works in-game too) |
| **Ctrl+E** | Pull the mouse cursor into the overlay; **Esc** hands it back to the game |
| **▣** in the title bar | Show/hide the overlay |

Both shortcuts are freely assignable under **Settings**.

> **About Ctrl+R:** a globally registered shortcut is **no longer passed on to the
> game** by Windows. In Warframe, Ctrl is crouch and R is reload — so if you reload
> mid-slide, you toggle the overlay instead of reloading. If that bothers you, change it
> in Settings, for example to Ctrl+Alt+R.

### Two windows

The **main window** is the full interface with all nine sections — meant for a second
monitor. It stays open when the overlay appears: both run at once, on separate screens.

The **overlay** is a window of its own with its own interface (`overlay.html`), not a
shrunken dashboard. It is 380 px wide, meant for the screen the game runs on, and shows
only what is decided in the next few minutes:

- the three open-world cycles with a second-accurate countdown
- active void fissures — matches for your notification filter go to the top and are
  highlighted, the rest stays visible below
- tracked relics from the relic planner — with expected value, most expensive reward,
  and how many fissures of their era are open right now
- your open farming goals

Anything under five minutes turns gold.

Which relics appear in the overlay is decided by the **star** on the cards in the relic
planner (**Baro & ducats** tab). The choice takes effect immediately, even with the
overlay open, and survives a restart — it lives in `goals.json`. If a fissure of the
matching era is open for a tracked relic, its row is highlighted: that is the moment to
take it along.

The overlay remembers its position and size separately from the main window. The first
time, it opens at the top right of the **primary screen** — usually where the game runs,
while the main window stays on the second monitor. Once you drag it somewhere else, it
stays there, across restarts.

Hiding it does not close it, only hides it — so the next keypress is instant. Only when
the main window closes does the overlay go away and the app quit.

The footer sets the **opacity** (35–100%). The crosshair button toggles **click-through**:
clicks then go to the game instead of landing in the overlay. The header stays usable —
otherwise you could not reach the switch to turn it off again.

### Pulling the cursor into the overlay

While Warframe is in the foreground it holds the mouse cursor captive — the overlay is
visible but not usable. **Ctrl+E** fetches it: the overlay briefly takes input focus, and
Windows then releases the cursor by itself. The game keeps running in the background.

**Esc** or the same hotkey takes you back. Focus returns to the window you came from,
not somewhere arbitrary — the app remembers its window handle beforehand (see
`src/core/foreground.js`). Clicking into the game yourself ends the mode just as well.

In cursor mode, click-through is suspended and the overlay gets a blue border. The
setting itself is untouched: after jumping back, whatever applied before applies again.

**A mouse wheel or button cannot do this.** Electron can only capture keys system-wide;
mouse events would need a global mouse hook. In Warframe the wheel would be the wrong
choice anyway — it switches weapons. If you want to save the reach to the keyboard, bind
Ctrl+E to a thumb button in your mouse software.

The overlay requires Warframe in **borderless windowed** mode. True fullscreen does not
let another window sit on top — that is a Windows trait, not a limitation of this app.

---

## Relic rewards

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

### Price tags inside the game

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
`%APPDATA%\Cephalon Argus\data\config.json`:

```json
{ "relicTagOffset": 0.083 }
```

Switchable off under **Settings**. Without tags, the list appears in the overlay.

### Where the data comes from

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

### Prices

From **warframe.market**, via the v2 API — v1 is retired (`/v1/items` answers 404). Only
offers from sellers who are **currently in game** are counted: the cheapest offer from
someone who has been offline for three days is not a price, it is a number.

### Limits

- Recognition covers the **primary screen**. If Warframe runs on a different monitor,
  it finds nothing.
- If recognition fails, your own drop remains — the display never disappears entirely.
- Very small resolutions are untested; the matching absorbs a lot, but below 1080p the
  text can get too small.

---

## Mods, arcanes and relics in the inventory

### The cards, as they look in game

A mod has **two states** in game: collapsed it shows only the name; hovering expands it
to show the illustration, effect and compatibility. The inventory here does exactly the
same.

```
collapsed (184 × 90)              expanded (× 1.1)
┌──────────────────┐              ┌──────────────────┐
│ ╌╌╌╌╌╌╌╌╌  14 ⟋  │              │ ╌╌╌╌╌╌╌╌╌  14 ⟋  │
│                  │              │   [illustration] │
│ Primed Continuity│   ──▶        │                  │
│                  │              │ Primed Continuity│
│ ★★★★★★★★★★       │              │ +55% Ability Dur.│
└──────────────────┘              │ ▓▓ WARFRAME ▓▓   │
                                  │ ★★★★★★★★★★       │
                                  └──────────────────┘
```

**The card is drawn, not loaded as an image.** A pre-rendered card image knows only one
state; cutting the collapsed one out of it does not work, because it is built differently
and the name line sits elsewhere depending on how long the effect text is. Here every
part has its place, and the transition is a matter of height and opacity.

Three tricks carry that:

- The card carries `transform: scale(1)`. A transform makes it the **containing block**
  for everything positioned absolutely inside — frame pieces, drain number, compatibility
  bar, rank stars. That is why they move along when it expands, instead of sticking to
  the 90 px slot.
- The inner part clips. Collapsed, the card is 90 px tall; the effect text sits below
  that and is therefore gone.
- The name sits at `top: -60px` over the darkened illustration and moves to `top: 0` on
  expand, freeing the text below it.

The **slot in the grid keeps its 90 px** even as the card inside grows to 260 px —
otherwise the grid would reflow on every hover. The card itself takes no mouse events, so
the expanded version does not block its neighbours.

The frame pieces are the **real game textures** (four families by rarity, five files
each) and live under `src/renderer/assets/mod/`. The illustration comes from DE's export
as before. That makes the grid work fully offline.

The polarity symbols are vectors from the wiki, inline in `icons.js`. They tint via
`currentColor` and stay sharp at 11 or 24 pixels — before, a letter stood in as a
stopgap.

Arcanes are not cards but vessels: landscape, without a frame and without a name inside.
They get their real vessel image from the wiki and the name beneath. A separate image
cache would be pointless for that — the wiki serves
`cache-control: public, max-age=31536000, immutable`, so Chromium stores every image
permanently by itself.

### Data sheet for a mod or arcane

Clicking a card opens its data sheet.

```
Serration                                    MOD · PRIMARY MOD · UNCOMMON
Fits rifles · polarity V Madurai

OWNED       13 copies                Rank 0 ×11 · Rank 6 · Rank 10

EFFECT      [0][1][2][3][4][5][6•][7][8][9][10•]
            +165% Damage
            Costs 14 capacity · 6,138 endo to get here

WHERE DO I GET THIS?
  MISSION   Arval · Mars        Spy · rotation C          8.6 %
  ENEMY     Ghoul Expired       Mod drop 20% × table 7.37%  1.47 %
```

**The rank ladder is the point.** A card at rank 3 behaves differently from the same card
at rank 10, and that is exactly the question you ask before upgrading. A dot under a
digit marks the ranks you own; the sheet opens on the highest of them.

Arcanes work differently: they cost neither capacity nor endo, but themselves. Instead of
the endo line it shows how many copies the rank consumes — 21 for rank 5. A finished
rank 5 arcane is **one** item with 21 inside it; the display accounts for that, rather
than claiming "20 missing" next to a maximum.

### Where drop locations come from

Three tiers, in this order:

1. **DE's drop tables** (`drops.warframestat.us`) — the same source as for relics. They
   give planet, node, rotation, enemy and chance as separate fields, so they can be
   labelled properly. For enemies, the **effective** chance is shown: first the enemy has
   to drop a mod at all, then it has to be this one.
2. **warframestat.us' item API** — only when tier 1 yields nothing. It knows what DE does
   not publish as a "drop" at all, above all the **syndicate augments**: *Despoil* comes
   from Red Veil and the Perrin Sequence, and the name appears nowhere in DE's tables.
3. **A rule table** for cards you simply cannot farm — Baro stock, arbitration honours,
   the Lua vaults, precepts that come with the companion. It does not guess; it reads the
   path DE filed the card under.

Measured against an account with 639 mods and 90 arcanes: 631 from tier 1, 23 from
tier 2, 57 from tier 3 — **9 cards without a location**, a little over one percent. Those
are Nightwave leftovers and discontinued items; for them, the sheet notes that they are
still available by trading, with a link to the wiki.

Everything above that — effect per rank, capacity, polarity, rarity, set membership —
comes from DE's own export, i.e. the same file the game draws the card from.

### Data sheet for a relic

Relics can be clicked too. That shows what is inside:

```
Axi A22                                       RELIC · AXI · 4 in stock

REFINEMENT      [Intact 4]  Exceptional 0  Flawless 0  Radiant 0

REWARDS
  Afentis Prime Blueprint      Rare             2.00 %    18p    100 duc.
  Dual Zoren Prime Handle      Uncommon        25.33 %     2p     15 duc.
  …

WHAT ONE CRACK RETURNS ON AVERAGE     Platinum 2.7   ·   Ducats 18
```

**All four refinement levels show the same six rewards** — only the chances shift: intact
puts the rare at 2%, radiant at 10%. So the sheet works out all four instead of picking
one; the question before refining is precisely whether it is worth it.

The expected value is **chance × value**, not the mean of the six rewards — with chances
between 2% and 25%, a mean would be a different number from the one you decide on. If
part of the chance has no platinum price, the sheet says so: the platinum value is then a
lower bound, not an estimate.

DE no longer lists a vaulted relic. Instead of an empty table, the sheet says it is
vaulted — along with what that means in practice.

---

## Settings

Under **Settings** are the things that always apply:

- **Hotkeys.** Click the button, press the combination, done. It must include at least
  Ctrl, Alt or Shift — a single key would be captured system-wide by Argus, including in
  chat. If the combination is already taken by another program (Discord, GeForce
  Experience, another overlay), the app says so and keeps the previous one.
- **Inventory access** — off by default, see below.
- **Notifications on/off**, sound, and Windows desktop toasts.

**Which** fissures get reported — tiers, mission types, Steel Path, Railjack — stays in
the live tracker under *Void fissures → Notifications*. That choice belongs with the list
it filters: the preview there shows immediately how many fissures currently match.

---

## Is this safe?

**The app changes nothing about the game.** Here is everything it does:

- **No injection, no DLL hook, no write access** to the game process
- **No network interception** — expressly forbidden by Warframe's EULA
- **No automation, no input simulation**
- **Read-only memory access** to the game process, exclusively for the inventory lookup,
  only at the press of a button, and **only if you switched it on**: `gamecreds.js` finds
  the current session's temporary API credentials on the heap. Reading only, writing
  never.
- **Read access to `EE.log`**, Warframe's own log file, for relic rewards. From the last
  byte read onwards, without locking the file.
- **A screenshot** during the reward screen, to read the four parts via text recognition.
  It is deleted immediately after evaluation, never leaves the machine, and can be
  switched off entirely under Settings.
- **A focus change** via `SetForegroundWindow` for cursor mode — a window operation, not
  access to the game.

### What the memory read actually does

Your public Warframe profile contains no inventory, and since Update 38.0.8 it cannot
even be looked up by name. Anything that shows you an inventory either reads the game's
memory or logs in with your credentials. Argus takes the first route.

Concretely: while the game runs, it holds the request it uses to talk to Warframe's own
API in memory — including your account ID and a temporary session key (`nonce`). Argus
searches the game's heap for exactly that string, reads it, and uses it for one request
to `api.warframe.com`. It opens the process with `PROCESS_VM_READ` and
`PROCESS_QUERY_INFORMATION` — read rights, no write rights. There is no injection, no
DLL, no hook, no input simulation and no traffic interception.

The session key is not written to disk. What is cached locally is the address where the
credentials were found last time (`scan-hint.json`, so the next search is fast), your
account ID, and the inventory itself.

**It is a permission, and it can be withdrawn.** The switch sits under
**Settings → Inventory access**. With it off, the request is refused before the game
process is touched at all — and everything except the Inventory tab works regardless.
Choosing *Enter your account ID instead* during setup never turns it on in the first
place.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `api.warframe.com/cdn/getProfileViewingData.php` | your public profile |
| `api.warframe.com/api/inventory.php` | your inventory (button press only, opt-in) |
| `cdn.jsdelivr.net/.../warframe-exports-data` | DE's item catalogue + images |
| `api.warframestat.us` | world state, cycles, fissures, syndicate augment locations |
| `drops.warframestat.us` | DE's drop tables for relics, mods and arcanes |
| `api.warframe.market/v2` | platinum prices and ducat values |
| `wiki.warframe.com` | arcane images, mod frames, polarity symbols |
| `overframe.gg` | build import, button press only |

### ⚠️ Important: do not refresh too often

DE throttles **per IP address**, not per endpoint. Too many requests mean you **cannot
log in to Warframe** any more ("too many logins") — an IP block of up to 24 hours. Not an
account ban, but a nuisance.

So this is built in:

- The profile is fetched **only on a button press**, never automatically
- At least **10 minutes** between two fetches
- After being throttled, a **3 hour pause**, with no retry

Profile and inventory share one budget, because DE's limit is per IP — otherwise you
could sidestep the limit by using the other route.

---

## Builds and mods

Under **Builds** you paste an Overframe link (`overframe.gg/build/86364/…`, or just the
ID). The tool takes over mods, ranks, polarities, capacity and forma requirements, and
adds up what you need in total: forma, aura/umbra forma, orokin reactors and catalysts,
endo.

Clicking a mod slot (or a row under *Missing mods*) marks it as owned. Only what appears
in your builds is tracked — not all 1,280 mods.

### Your own builds

**Custom build** → pick an item → fill the 10 slots by clicking (8 normal, one
aura/stance and one exilus slot). In the slot editor you search for the mod, set the rank
with a slider and choose the polarity. Capacity use is calculated live:

- **Matching polarity** halves the cost (rounded up)
- **Wrong polarity** raises it by 25%
- **Aura mods grant capacity** instead of costing it — doubled with matching polarity

Cross-check: Steel Charge at rank 5 with Madurai gives **+18** — exactly the value
Overframe reports for the same mod.

For imported builds, clicking a slot opens no editor but toggles mod ownership — the
loadout comes from Overframe, after all.

### How the import works

`overframe.gg/api/v1/builds/<id>/` is **undocumented** and returns only internal mod IDs;
there is no public mapping to names (`/api/v1/mods/` → 404). The names are produced at
render time. So Electron loads the page **once, invisibly**, reads the mod names out and
saves the mapping. Known IDs need no page load after that.

The `drain` value acts as a safeguard: it appears both in the API and on the page. If
fewer than 80% agree, the import aborts rather than saving the wrong mods. If Overframe
changes its page structure, only the import fails — everything else keeps working.

---

## Known limits

- **The MR display can be off by one.** MR XP per star chart node is not publicly
  documented; the calculation assumes 100. The item lists and the MR gains per item are
  **not** affected — those come straight from your profile data.
- **Vaulted primes** are still listed as obtainable.
- Zaw/kitgun/amp parts are roughly classified.
- **Mod ownership cannot be detected automatically.** The public profile contains no mod
  data whatsoever, so you tick mods off yourself.
- **Arcanes** are not in the mod catalogue (they live in `ExportRelicArcane`) and stay
  "unmatched" on import.
- **Endo without an Overframe source is estimated.** The built-in formula (doubling per
  rank) lands about a factor of 2 below Overframe's value, probably because duplicate
  mods are counted there. For imported builds the exact source value is used.

---

## Building from source

You need Node.js 20 or newer.

```bash
git clone https://github.com/Kr3akz/Argus.git
cd Argus
npm install
npm start
```

To build the installer and the portable exe:

```bash
npm run icon && npm run dist
```

The results land in `release/`.

### Layout

```
src/core/     logic, entirely independent of the interface
  paths.js        where data and bundled files live
  mastery.js      MR formulas (verified against a real profile)
  catalog.js      load + cache DE's PublicExport
  profile.js      profile fetch with throttling protection
  classify.js     clean up DE's categories
  acquisition.js  acquisition routes + realistic effort
  analyze.js      target/actual comparison + recommendations
  recipes.js      recursive material resolution
  ratelimit.js    protects against the login lockout
  store.js        goals and notes
  foreground.js   hands input focus back to the game
  logwatch.js     reads Warframe's EE.log (relic rewards)
  rewardscan.js   recognises the four rewards on screen
  relics.js       relic reward tables from DE's drop tables
  droptables.js   locations for mods and arcanes ("where do I get this?")
  cards.js        arcane vessel images from the Warframe wiki
  upgrade-details.js  data sheet for a mod/arcane, values per rank
  market.js       prices and ducat values from warframe.market
src/main/     Electron main process (main window + overlay window)
src/renderer/ interface
  index.html    main window
  overlay.html  overlay window, its own lean interface
  style.css     both windows
  assets/mod/   frame textures for the mod cards (game assets)
```

`src/core/` knows neither Electron nor the DOM — so the logic is usable without the
interface (see `src/cli/`).

**Note on the source:** comments and commit messages are in German. The interface and
this README are English.

### Data locations

| | |
|---|---|
| Installed / portable | `%APPDATA%\Cephalon Argus\data` |
| Running from source | `data/` in the project folder |
| Override | set `ARGUS_DATA_DIR` to any path |

`ARGUS_DATA_DIR` is useful for testing against a clean state without touching your real
data.

### Tests

```bash
node src/cli/dashboard-test.js
```

Checks the whole data chain without Electron. Also:

```bash
npm run relic-test "Meso H1"
```

Rewards of a relic with platinum price and ducats, plus a sample across the relic paths
in your own inventory.

```bash
node src/cli/log-test.js
```

Replays the existing `EE.log` and shows what Argus would have recognised. With `--live`
the test waits for the next fissure mission.

---

## Licence

[MIT](LICENSE).

Cephalon Argus is a fan project and is **not affiliated with, endorsed by or sponsored
by Digital Extremes**. Warframe and all related assets are the property of Digital
Extremes Ltd. Game assets used in the interface belong to them and are used here under
their content usage policy.
