# Building from source

*Build it yourself, publish a release, and find your way around the source tree.*

[← Back to the README](../README.md)

---


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

## Publishing a release

Nothing needs to be tagged or uploaded by hand:

```bash
npm version patch --no-git-tag-version   # or minor / major
git commit -am "..."
git push
```

`.github/workflows/release.yml` runs on every push to `main`, reads the version out of
`package.json` and decides for itself: if a release `v<version>` already exists, it stops
there and nothing is built. If it does not, it builds both exes, writes `SHA256SUMS.txt`,
tags the commit and publishes the release — at which point every running copy of Argus
picks it up within the hour.

So the version number, not the push, is what makes a release. A typo fix in the README is
not an update, and should not put a badge in everyone's title bar.

To build without publishing, run the workflow manually from the Actions tab and leave
*Release veroeffentlichen* unchecked: it builds everything and attaches the files to the
run instead of creating a release.

`npm run icon` turns the sources in `assets/` into what the app ships: the application
icon, and the sidebar masks listed in `MASKEN` inside `tools/make-icon.mjs`. Drop a white
silhouette on a transparent background into `assets/`, add a line to that list, and rerun it —
the tool crops the drawing to its content, pads it back to a square and scales it down, so a
3000 px export becomes a 256 px mask. Keep the large original in `assets/`; it is the source,
not a leftover.

## Layout

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
  farming.js      resource guide: best nodes per material, checked against the star chart
  mining.js       ores and gems of the three landscapes, sorted by vein colour
  cards.js        arcane vessel images from the Warframe wiki
  arcanes.js      arcane slots per item, search, copies per rank
  basesets.js     non-prime build kits from DE's recipes
  upgrade-details.js  data sheet for a mod/arcane, values per rank
  market.js       prices and ducat values from warframe.market
  wfm-http.js     one throttled line to warframe.market, shared by all of the below
  wfm-auth.js     sign-in and session (password never stored)
  wfm-orders.js   own orders, other players' offers, trade history
  wfm-auctions.js contracts: riven, lich and sister auctions
  transactions.js local trade ledger
  updates.js      release check, download, SHA256 verification
src/main/     Electron main process (main window + overlay window)
src/renderer/ interface
  index.html    main window
  overlay.html  overlay window, its own lean interface
  style.css     both windows
  assets/mod/   frame textures for the mod cards (game assets)
  assets/icons/ sidebar symbols, used as CSS masks (colour comes from the theme)
```

`src/core/` knows neither Electron nor the DOM — so the logic is usable without the
interface (see `src/cli/`).

**Note on the source:** comments and commit messages are in German. The interface and
this README are English.

## Data locations

| | |
|---|---|
| Installed / portable | `%APPDATA%\Argus\data` |
| Running from source | `data/` in the project folder |
| Override | set `ARGUS_DATA_DIR` to any path |

`ARGUS_DATA_DIR` is useful for testing against a clean state without touching your real
data.

## Tests

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

```bash
npm run check-farm
```

Checks the farming guide against the actual game data: every node name has to exist on
the planet the guide claims, with the mission type the guide claims, and every
`uniqueName` has to resolve in DE's export. It also enforces the mining rule — ore veins
are red, yellow on the Cambion Drift, gems are always blue — and that special-tier gems
list a cutter that can actually produce them. Run it after editing `farming.js` or
`mining.js`; a wrong node name is invisible until somebody flies there.

---
