<div align="center">

<img src="src/renderer/assets/logo.png" alt="" width="96">

# Argus

**A mastery planner and live companion for Warframe.**

*The hundred-eyed watchman of Greek myth — he never closes all his eyes at once.*

[![Latest release](https://img.shields.io/github/v/release/Kr3akz/Argus?style=flat-square&color=4a9eff&label=release)](https://github.com/Kr3akz/Argus/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Kr3akz/Argus/total?style=flat-square&color=4a9eff)](https://github.com/Kr3akz/Argus/releases)
[![Licence](https://img.shields.io/github/license/Kr3akz/Argus?style=flat-square&color=4a9eff)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-4a9eff?style=flat-square)

**[Download](https://github.com/Kr3akz/Argus/releases/latest)** ·
[Is it safe?](#is-it-safe-can-i-get-banned) ·
[What it does](#what-it-does) ·
[Every tab](#every-tab-up-close) ·
[Getting started](#getting-started) ·
[Documentation](#documentation)

</div>

---

Argus runs next to Warframe and keeps track of what the game spreads across a dozen
menus and websites: which items you still need for mastery and what they really cost you,
what your prime parts, mods and rivens are worth, what is happening in the world right
now, and where anything drops.

While you play, it works inside the game — prices under the four cards of a relic reward
screen, your relics ranked on the selection screen, riven rolls side by side while you
cycle. It does all of that by *looking*: it never changes the game, and never logs in to
Warframe as you. Your inventory comes from the game already running on your PC,
read-only, only if you allow it, and it never leaves your machine.

**Windows only.** The panels over the game, the log reader and the inventory lookup rely
on Windows APIs. Free and open source under the GPL.

![Your profile, and the goals you are farming broken down into the parts they still need](docs/img/hero-mastery.webp)

Every tab, view by view, is further down under **[Every tab, up close](#every-tab-up-close)**.

---

## Is it safe? Can I get banned?

**Argus is very safe to use, because it only ever reads.** It never changes the game,
never plays for you, and never talks to Digital Extremes' servers as if it were you.

Your full inventory is not on your public profile. The only way to get it complete and
exact without typing it in is to read it from the game running on your PC — that is what
Argus does, and it is how the established Warframe companion apps have done it for years.
Argus reads the inventory the game has *already downloaded* and stops there. It does not
borrow the game's session to ask DE's servers for anything: that would mean imitating the
game towards DE, which is exactly what Warframe's EULA rules out.

In short:

- **Nothing about the game is changed.** No DLL injection, no hooks, no memory writes,
  and no input automation or macros.
- **No network interception.** It never sniffs or intercepts the game's encrypted network
  traffic, which would break Warframe's EULA.
- **Nothing is asked of DE in your name.** No sign-in, no borrowed session, no API calls
  on your behalf — and your inventory never leaves the machine.
- **Read-only and opt-in.** Memory reading is strictly read-only (`PROCESS_VM_READ`),
  happens only when you ask for it or after a zone load, and stays switched off unless you
  turn it on.
- **Built-in rate limiting.** The one thing fetched from DE — your *public* profile — has
  mandatory cooldowns to protect you from their IP login throttles.

**What nobody can promise.** DE's policy on third-party software has no list of approved
tools and one rule: *use it at your own risk*. That holds for every tool, this one
included. What DE does ban for — altered game files, cheating, exploiting, AFK farming —
is nothing Argus does or could do, and tools that read the game this way have been in
wide use for years without a documented ban. Should DE ever change that stance, the
announcement will come from DE, not from this repository.

Every mechanism, permission and endpoint is explained in detail:
**→ [Read the full security & safety breakdown](docs/security.md)**

---

## What it does

### Inside the game

- **Prices on the reward screen.** When a relic reward screen opens, Argus reads the four
  parts off the screen and puts the platinum price, the ducat value and what the whole
  set is worth under each card — in the game, not in a second window.
  → [Relic rewards](docs/relics.md)
- **The best relic for this fissure.** On the relic selection screen, a small panel ranks
  the relics you own by what one crack is worth, narrowed to the era the fissure accepts.
  → [Relic rewards](docs/relics.md)
- **Riven rolls side by side.** While you cycle a riven, your current and your new roll
  stand next to each other — every stat marked better or worse, and a grade for both —
  so you can decide before you pick. → [Rivens](docs/rivens.md)
- **The overlay window.** Open-world cycles, void fissures, your relics and goals on top
  of the running game, on a hotkey. → [Controls](docs/controls.md)
- **Notifications** for the void fissures you care about, a few minutes before an
  open-world cycle flips, and for whispers in game — if you like, only the ones copied
  from warframe.market, so a ping means someone wants to trade.
  → [Controls](docs/controls.md)

### Planning

- **Mastery.** Every item you have not mastered, ranked by what it actually costs you.
  Goals resolve down to the raw materials and are checked against what you own — with how
  long the build takes, whether the vault is shut on it, and which blueprints want a
  Forma before you can even start.
- **Foundry and crafting chains.** What is building and when it is done, what has been
  finished for weeks without you noticing, what the Helminth is digesting — and which
  weapons are built out of other weapons you should rank to 30 first.
  → [Foundry](docs/foundry.md)
- **Update vendors.** The shops that sell a Warframe instead of dropping it — Otak, Zorba,
  Acrithis, the shrine at Cetus — each price list lined up against what you already own.
  → [Vendors](docs/vendors.md)
- **Live tracker.** Every reset and rotation on one board, all six open-world cycles —
  Earth, the Plains, Orb Vallis, Cambion Drift, the Zariman and Duviri's mood — and what
  is left for you today. Void fissures split into normal, Steel Path and Void Storms; the
  sortie, the Archon hunt and the arbitration schedule; every bounty board with what each
  stage pays out; invasions, Nightwave, Teshin's offers weeks ahead, and the traders —
  Baro, Varzia's Prime Resurgence, Darvo, Ergo Glast and Eleanor — with what you already
  own marked, down to the Incarnon in this week's Circuit.
- **Weekly rotation.** Everything that resets once a week — Archon Hunt, The Circuit,
  Deep and Temporal Archimedea, Netracells, Kahl's Garrison, the Descendia and the vendor
  resets — ticked off by itself wherever your own save records it.

### What you own

- **Inventory.** Mods, arcanes and relics as the cards they are in game, with data sheets
  and rank-by-rank values. Every relic in the game, vaulted or farmable, owned or not.
  Your sets, ranked by what the part *you* hold is worth — and a warframe.market price on
  everything, at the rank you have. → [Inventory](docs/inventory.md)
- **Rivens.** Every riven with its stats exactly as the game shows them and a grade from
  S to F — taken from which stats the *pricey* rivens of that weapon carry on
  warframe.market, not from guesswork. Veiled rivens with their challenges.
  → [Rivens](docs/rivens.md)
- **Ducats & Baro.** What every prime part is worth melted against sold, what can no
  longer be farmed, a relic planner, and Baro's manifest lined up against what you
  already own. → [Ducats and Baro](docs/baro.md)

### Trading

- **warframe.market, straight from your inventory.** Orders and contracts for what you
  own, with a suggested price taken from the sellers who are in game rather than the ones
  who left days ago. A price lookup for anything, a riven finder, and ninety days of
  *completed* trades on every data sheet. → [Trading](docs/trading.md)
- **A trade ledger** in platinum *and* ducats — charted, and checked against what your
  balance actually did. **Insights** says which primes are heading for the vault next,
  and what of that is on your shelves. → [Trading](docs/trading.md)

Argus never messages anyone for you: whispers are copied to your clipboard, and you send
them yourself.

### Looking things up

- **Drop tables.** Every drop DE publishes, searchable by item, location or enemy and
  narrowed by source, rarity, rotation, planet and chance — with the real chance of enemy
  drops, the effort each one takes on average, and what changed with the last update.
  → [Drop tables](docs/droptables.md)
- **Farming & mining.** The best nodes per material, and every ore and gem of the three
  landscapes sorted by vein colour. → [Farming](docs/farming.md)
- **Builds.** Loadouts checked against what you own, or imported from Overframe — with
  the forma, catalysts and endo they add up to. → [Builds](docs/builds.md)

### Your way

- **Themes.** Nine looks to pick from — Orokin gold, Void violet, true black for OLED
  screens, a red–green safe one — or your own: six colours, corners, glow and blur,
  shared as a single line of text. The panels over the game change with it.
  → [Themes](docs/themes.md)
- **Everything where you want it.** Move and resize each panel Argus draws over the game
  on a stage shaped like your game window, pick your own hotkeys, and switch off whatever
  you do not need. → [Controls](docs/controls.md)

---

## Every tab, up close

Each tab of the window, with a screenshot of every view in it. Click one to open it.

<details>
<summary><b>Mastery & goals</b> — what to build next, and what it takes</summary>

<br>

**Goals** — your open goals broken down into parts, and one shopping list across all of them

![Mastery: goals](docs/img/mastery-goals.webp)

**Recommendations** — quick wins you already own, and items that are cheap to pick up

![Mastery: recommendations](docs/img/mastery-recommendations.webp)

**Catalogue** — every item in the game, by category and status; a click shows where it comes from

![Mastery: catalogue](docs/img/mastery-catalogue.webp)

**Item sheet** — stats, where to get it, what it is built from, and whether the vault is shut on it

![Mastery: item sheet](docs/img/mastery-item.webp)

**Foundry** — what is building, and what has been finished and waits for you

![Mastery: foundry](docs/img/mastery-foundry.webp)

**Crafting chains** — weapons built from other weapons, every link its own mastery

![Mastery: crafting chains](docs/img/mastery-chains.webp)

**Update vendors** — the Warframes you buy rather than farm, lined up against what you own

![Mastery: update vendors](docs/img/mastery-vendors.webp)

</details>

<details>
<summary><b>Live tracker</b> — every clock, cycle, fissure, bounty and trader in the world right now</summary>

<br>

**Overview** — every reset and rotation in one row, and all six open-world cycles with a bell for a notification before they change

![Live tracker: overview](docs/img/ws-overview.webp)

**Today and this week** — the sortie, what standing and focus you can still earn, the Circuit picks you already own, and the traders at a glance

![Live tracker: today and this week](docs/img/ws-board.webp)

**Void fissures** — normal, Steel Path or Void Storm, with era, mission and time left

![Live tracker: void fissures](docs/img/ws-fissures.webp)

**Fissure notifications** — which fissures are worth a desktop notification, with what matches right now

![Live tracker: fissure notifications](docs/img/ws-fissure-notifications.webp)

**Missions** — the sortie, the Archon hunt, the arbitration running now and the next day of them

![Live tracker: missions](docs/img/ws-missions.webp)

**Syndicates & bounties** — today's syndicate missions on top, then every bounty board; a click shows what each stage pays out, at the rotation it is on

![Live tracker: bounties](docs/img/ws-bounties.webp)

**Invasions** — both sides, their progress and their rewards

![Live tracker: invasions](docs/img/ws-invasions.webp)

**Steel Path** — Teshin's offer this week, the weeks after, and what he always has

![Live tracker: Steel Path](docs/img/ws-steelpath.webp)

**Nightwave** — daily, weekly and elite acts with their standing

![Live tracker: Nightwave](docs/img/ws-nightwave.webp)

**Traders** — Baro, Varzia's Prime Resurgence, Darvo's deal, and the four-day rotations of Ergo Glast and Eleanor

![Live tracker: traders](docs/img/ws-traders.webp)

**Operations** — running events, and how far the enemy fleets are with their next assault

![Live tracker: operations](docs/img/ws-operations.webp)

</details>

<details>
<summary><b>Weekly rotation</b> — everything that resets once a week</summary>

<br>

**Content** — Archon Hunt, The Circuit, Deep and Temporal Archimedea, Netracells, Kahl's Garrison and the Descendia, ticked off from your save where it records them

![Weekly rotation: content](docs/img/weekly-content.webp)

**Vendor resets** — Teshin, Bird 3, Yonta, Acrithis, Palladino and Nightwave

![Weekly rotation: vendor resets](docs/img/weekly-vendors.webp)

</details>

<details>
<summary><b>Inventory</b> — relics, sets, mods, arcanes, materials and blueprints</summary>

<br>

**Relics** — the ones you own, what one crack is worth, and whether they still drop

![Inventory: relics](docs/img/inv-relics.webp)

**My sets** — prime sets part by part, with their ducats and the best part you hold

![Inventory: my sets](docs/img/inv-sets.webp)

**Mods** — as the cards they are in game, owned or not

![Inventory: mods](docs/img/inv-mods.webp)

**Arcanes** — the same for arcanes, with rank and copies

![Inventory: arcanes](docs/img/inv-arcanes.webp)

**Materials** — everything you hold, with the count

![Inventory: materials](docs/img/inv-materials.webp)

**Blueprints** — every blueprint in your inventory

![Inventory: blueprints](docs/img/inv-blueprints.webp)

**Mod sheet** — ninety days of completed trades at your rank, the effect rank by rank, capacity and endo

![Inventory: mod sheet](docs/img/inv-mod-sheet.webp)

**Relic sheet** — the six rewards with their chances, platinum and ducats, for every refinement

![Inventory: relic sheet](docs/img/inv-relic-sheet.webp)

**Set sheet** — the market history of the full set, and whether its parts are worth more one by one

![Inventory: set sheet](docs/img/inv-set-sheet.webp)

</details>

<details>
<summary><b>Rivens</b> — graded by what the market wants</summary>

<br>

**Unveiled** — every riven with its stats as the game shows them, how well each rolled, and a grade from S to F

![Rivens: unveiled](docs/img/rivens-unveiled.webp)

**Veiled** — the challenges you are on, and the rivens you have not revealed yet

![Rivens: veiled](docs/img/rivens-veiled.webp)

**Riven finder** — warframe.market auctions by weapon and stats, next to the stats that weapon's pricey rivens carry (seller names blurred here)

![Rivens: riven finder](docs/img/rivens-finder.webp)

</details>

<details>
<summary><b>Baro & ducats</b> — melt or sell, and what Baro brings</summary>

<br>

**My prime inventory** — every prime part you own, in ducats, platinum and ducats per platinum

![Baro & ducats: my prime inventory](docs/img/ducats-inventory.webp)

**Full prime catalogue** — the same for every prime part in the game

![Baro & ducats: full prime catalogue](docs/img/ducats-catalogue.webp)

**Relic planner** — your relics ranked by what one crack is worth, era by era

![Baro & ducats: relic planner](docs/img/ducats-planner.webp)

**Baro's offer** — his manifest against what you own, and what it costs in ducats and credits

![Baro & ducats: Baro's offer](docs/img/ducats-baro.webp)

</details>

<details>
<summary><b>Trading</b> — warframe.market, straight from your inventory</summary>

<br>

**Orders** — your buy and sell orders, marked sold, edited or hidden with one click

![Trading: orders](docs/img/trading-orders.webp)

**Market** — what anything is going for right now, from the sellers who are in game (names blurred here)

![Trading: market](docs/img/trading-market.webp)

**Contracts** — your riven, lich and sister auctions

![Trading: contracts](docs/img/trading-contracts.webp)

**Transactions** — a local ledger of every trade, in platinum and ducats

![Trading: transactions](docs/img/trading-transactions.webp)

**Analytics** — earned and spent per day, and the running total

![Trading: analytics](docs/img/trading-analytics.webp)

**Insights** — which primes are heading for the vault next, and what of that you hold

![Trading: insights](docs/img/trading-insights.webp)

</details>

<details>
<summary><b>Builds</b> — loadouts against what you own</summary>

<br>

**Arsenal** — every frame, weapon and companion you have a build for, and the forma, reactors and endo they add up to

![Builds: arsenal](docs/img/builds-arsenal.webp)

**A build** — mods, ranks and polarities, and how much of it you already own

![Builds: a build](docs/img/builds-build.webp)

</details>

<details>
<summary><b>Farming guide</b> — resources, ores and gems</summary>

<br>

**Resources** — the best nodes per material, and why that node

![Farming guide: resources](docs/img/farm-resources.webp)

**Mining** — every ore and gem of the three landscapes, sorted by vein colour

![Farming guide: mining](docs/img/farm-mining.webp)

</details>

<details>
<summary><b>Drop tables</b> — every drop DE publishes</summary>

<br>

**By item** — everywhere Serration drops

![Drop tables: by item](docs/img/drops-item.webp)

**By location** — Apollodorus, rotation by rotation

![Drop tables: by location](docs/img/drops-location.webp)

**By enemy** — the Stalker, with both rolls counted

![Drop tables: by enemy](docs/img/drops-enemy.webp)

</details>

<details>
<summary><b>Notes</b> — a notebook that saves itself</summary>

<br>

**Notebook** — plans and lists, saved as you type (example text)

![Notes](docs/img/notes.webp)

</details>

<details>
<summary><b>Settings</b> — hotkeys, themes, overlays, notifications, inventory access and version</summary>

<br>

**General** — the guided tour and the global hotkeys

![Settings: general](docs/img/settings-general.webp)

**Appearance** — nine themes, your own, and the interface size

![Settings: appearance](docs/img/settings-appearance.webp)

**Overlays** — every panel over the game, each with its own switch

![Settings: overlays](docs/img/settings-overlays.webp)

**Notifications** — fissures, open-world cycles and whispers, with sound and a desktop toast

![Settings: notifications](docs/img/settings-notifications.webp)

**Inventory** — reading the running game, and the scan log

![Settings: inventory](docs/img/settings-inventory.webp)

**About** — version, updates, and where the data comes from

![Settings: about](docs/img/settings-about.webp)

</details>

<details>
<summary><b>Over the game</b> — the overlay window and the panels inside the game</summary>

<br>

**Overlay window** — your tracked relics with the fissures that take them, the cycles and the fissures, on a hotkey

<img src="docs/img/overlay-window.webp" alt="The overlay window" width="380">

The three panels inside the game, as the arrangement stage shows them with its sample content:

**Price tags** — under each card on the reward screen: the part, how many of it you own, platinum and ducats

![Price tags on the reward screen](docs/img/panel-tags.webp)

**Relic recommendation** — your best relics for the fissure you are choosing a relic for

<img src="docs/img/panel-relicpick.webp" alt="Relic recommendation" width="420">

**Riven comparison** — your current roll and the new one while you cycle

<img src="docs/img/panel-riven-current.webp" alt="Riven comparison: current roll" width="49%"> <img src="docs/img/panel-riven-new.webp" alt="Riven comparison: new roll" width="49%">

**Arrange overlays** — every panel on a stage shaped like your game window, to move and resize

![Arrange overlays](docs/img/arrange-relicpick.webp)

</details>

<details>
<summary><b>The guided tour</b> — a walk through every tab</summary>

<br>

Each station marks the part of the window it talks about.

![The guided tour](docs/img/tour.webp)

</details>

---

## Getting started

1. **Download** `Argus-<version>-Setup.exe` from the
   [latest release](https://github.com/Kr3akz/Argus/releases/latest) and run it — no
   administrator rights needed. A **portable** `.exe` is on the same page.
2. **Windows will warn you**, because the releases are not code-signed: **More info →
   Run anyway**. Every release ships a `SHA256SUMS.txt` to check your file against.
3. **Start Warframe and log in**, then press **Allow and continue** in Argus. It finds
   your account and your inventory by itself — there is nothing to look up, copy or
   paste. No game running, or playing on console? **Enter your account ID instead**: you
   get everything except the inventory.
4. **A short tour** shows you around, pointing at each part of the window as it goes.
   **Esc** ends it; **Settings → General → Guided tour** brings it back.

Argus checks for a new version once an hour and installs it only when you click —
after checking the download against the release's checksum. Your goals, builds, notes
and themes stay where they are.

**→ [Install, updates and first run](docs/install.md)** has the details: what exactly you
agree to on the first start, what to do if your inventory does not show up, how updates
are verified, and where your data is kept.

---

## Documentation

| | |
|---|---|
| [Install, updates and first run](docs/install.md) | Download, the SmartScreen warning, the first start, updates and where your data is kept |
| [Controls, windows and settings](docs/controls.md) | The two windows, hotkeys, cursor mode, and everything under Settings |
| [Relic rewards](docs/relics.md) | The price tags on a reward screen and the relic recommendation on the selection screen |
| [Rivens](docs/rivens.md) | Grades, veiled rivens, the riven finder and the panels on the cycle screen |
| [Inventory](docs/inventory.md) | Mods, arcanes and relics — cards, data sheets and drop locations |
| [Foundry, chains, vault & subsume](docs/foundry.md) | What is building, which weapons eat other weapons, which primes are vaulted, and which frames you have subsumed |
| [Update vendors](docs/vendors.md) | The shops that sell a Warframe — their prices, what of it you own, and where the numbers come from |
| [Ducats and Baro](docs/baro.md) | Melt or sell, what can no longer be farmed, and Baro's manifest against your inventory |
| [Trading](docs/trading.md) | Orders, contracts, the local trade ledger, market history and the vault forecast |
| [Drop tables](docs/droptables.md) | Searching every drop table, the filters, what the numbers mean, and the changes after an update |
| [Resources, farming and mining](docs/farming.md) | Best nodes per material, ores and gems |
| [Builds and mods](docs/builds.md) | Loadouts, what you own, and the Overframe import |
| [Themes](docs/themes.md) | Nine presets, your own themes, sharing them, and the interface size |
| [Is this safe?](docs/security.md) | Everything Argus does to the game and your machine |
| [Known limits](docs/limits.md) | What it cannot do, and where the data stops being reliable |
| [Building from source](docs/development.md) | Build it, publish a release, find your way around |

---

## Building from source

You need Node.js 20 or newer.

```bash
git clone https://github.com/Kr3akz/Argus.git
cd Argus
npm install
npm start
```

The full picture — packaging, how a release is published, the tests and the layout of
the source tree — is in **[Building from source](docs/development.md)**.

**Note on the source:** comments and commit messages are in German. The interface and
the documentation are English.

---

## Contributing

Bug reports and ideas are welcome — open an [issue](https://github.com/Kr3akz/Argus/issues).
If you want to send code, [CONTRIBUTING.md](CONTRIBUTING.md) has the few things worth
knowing beforehand. Security problems go the way described in
[SECURITY.md](SECURITY.md), not into a public issue.

---

## Licence

[GNU General Public License v3.0 or later](LICENSE).

That means you may use, study, change and share it freely — but if you publish a
modified version, it has to stay open under the same licence. A closed-source fork of
Argus is not allowed. For a program that reads another process's memory, that matters:
every copy in circulation stays as auditable as this one.

Argus is a fan project and is **not affiliated with, endorsed by or sponsored
by Digital Extremes**. Warframe and all related assets are the property of Digital
Extremes Ltd. Game assets used in the interface belong to them and are used here under
their content usage policy.

The mod cards are set in [Roboto](https://fonts.google.com/specimen/Roboto)
(`src/renderer/assets/fonts/`), bundled under the Apache License 2.0 so the cards
read the same offline as they do in the game.
