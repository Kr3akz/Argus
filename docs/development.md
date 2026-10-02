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

Write the `CHANGELOG.md` section for that version first, under a heading of exactly
`## [1.2.3]`. That section becomes the release notes — and the text people read in the
update window **before** they decide to download anything, so it is worth two minutes.
Forgetting it does not break the build: `tools/release-notes.mjs` falls back to the
commit subjects since the last tag, which is uglier but never empty.

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
  ratelimit.js    protects against the login lockout (profile fetch only)
  procmem.js      read-only access to the game process, Windows x64
  inventory-scan.js  reads the inventory out of the running game's memory
  accountid.js    reads the account ID for the public profile lookup
  inventory.js    local inventory state on top of that scan
  scan-worker.js  runs both memory scans off the main thread
  store.js        goals and notes
  foreground.js   hands input focus back to the game
  logwatch.js     reads Warframe's EE.log (relic rewards)
  rewardscan.js   recognises the four rewards on screen
  relics.js       relic reward tables from DE's drop tables
  droptables.js   locations for mods and arcanes ("where do I get this?"), update check
  drop-search.js  the Drop tables tab: flat rows, search, filters, changes between two updates
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
  themes.js       themes: presets, the tones derived from them, limits, share codes
  webpush.js      notifications to a phone: VAPID and RFC 8291 encryption, node:crypto only
  phone.js        pairing, paired devices, delivering a notification to every phone
  phone-server.js the server a paired phone talks to at home (port 47120, own network only)
  phone-views.js  what the phone gets of the big answers, trimmed for a small screen
  qrcode.js       the pairing QR code (byte mode, all 40 versions)
src/main/     Electron main process (main window + overlay window)
src/renderer/ interface
  index.html    main window
  overlay.html  overlay window, its own lean interface
  style.css     every window; all themeable colours are the --t-* channels in :root
  theme.js      puts the chosen theme on each window before it first draws
  appearance.js Settings → Appearance: gallery, editor, colour picker, sharing
  assets/mod/   frame textures for the mod cards (game assets)
  assets/icons/ sidebar symbols, used as CSS masks (colour comes from the theme)
src/mobile/   the phone app - one set of files for GitHub Pages and for the PC at home
  app.js        start, tabs, data, pairing; 'web' under https, 'pc' when the PC serves it
  lib/          source-web.js (public sources on the go), source-pc.js (the PC at home),
                pairing.js, store.js, ui.js
  views/        live, foundry & goals, inventory & prices, drops, more
  sw.js         service worker: push, notification taps, offline start
  shims/        node:fs, node:path, node:url for the src/core modules the app reuses
```

### The phone app

`src/mobile` runs in two places. **GitHub Pages** serves it under https — the only way a
phone accepts push notifications and an app on its home screen — and there it reads the
public sources itself. **Argus on the PC** serves the same files at home
(`core/phone-server.js`), and then everything comes from the PC.

On the go, the app reuses the live-tracker and drop-table logic from `src/core` instead of
a second copy: an import map in `index.html` points `node:fs` and friends at the stand-ins
in `src/mobile/shims`. `node src/cli/mobile-test.js` loads the modules exactly that way and
fails when one of them needs something the stand-ins do not provide.

```bash
npm run mobile-dev
```

serves the app with sample data on `http://localhost:47199`, as the PC would at home — open
it with your browser's phone view. `npm run mobile-build` builds what GitHub Pages
publishes into `dist/pages`; `.github/workflows/pages.yml` does the same on every push to
`main` that touches the app. **One-time setup:** Settings → Pages → Source: *GitHub
Actions*.

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
npm run drop-search-test
```

Checks the Drop tables tab against the real tables in `data/`: relic rarities, enemy
drops counted once with both rolls, the ordering of a node, the filters, and the
comparison between two states of the tables (built from a copy with three known
changes).

```bash
npm run theme-test
```

Checks the themes: the default theme resolves to exactly the values in `:root`, every
preset stays readable (text, the ink on the accent, status colours), the limits keep
every colour dark or light where it has to be, and share codes survive the round trip —
while a tampered one is turned away. Run it after touching `themes.js` or the `--t-*`
channels in `style.css`.

```bash
npm run webpush-test
npm run qr-test
npm run phone-test
npm run mobile-test
```

The phone: the push encryption against the worked example in RFC 8291, byte for byte; the
pairing QR code against the format and version fields of the standard; pairing, keys,
lockout and path handling of the server at home; and the phone app itself — its modules
loaded as a browser loads them, every page drawn from sample data, and pairing codes that
point anywhere but a PC in your own network turned away. None of them needs the network.

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
