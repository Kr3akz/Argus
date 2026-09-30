# Install, updates and first run

*Download, the SmartScreen warning, what you agree to on the first start, how updates are verified, and where your data is kept.*

[← Back to the README](../README.md)

---

## Install

1. Download the latest **`Argus-<version>-Setup.exe`** from the
   [releases page](https://github.com/Kr3akz/Argus/releases).
2. Run it. No administrator rights needed — it installs for your user account.
3. Start it and follow the [first run](#first-run) below.

There is also a **portable** `.exe` on the same page if you would rather not install
anything. It keeps its data in the same place as the installed version.

### "Windows protected your PC"

The releases are not code-signed — a certificate costs a few hundred euros a year, and
this is a hobby project. So SmartScreen will warn you. Click **More info → Run anyway**
if you want to proceed.

If you would rather verify what you downloaded, every release ships a
`SHA256SUMS.txt`. Compare it against your file, with the version you downloaded:

```powershell
Get-FileHash "Argus-1.20.0-Setup.exe" -Algorithm SHA256
```

Some antivirus products also flag the app. That is worth explaining rather than waving
away: Argus can read the memory of the running Warframe process, which is a pattern
heuristics look for. What it actually does with that is described under
[Is this safe?](security.md) — and it is **off until you switch it on**.

## Updates

Argus tells you when a newer version exists. Once an hour it asks GitHub for the latest
release; if there is one, an **Update** badge appears in the title bar. Clicking it shows
what changed before anything is downloaded.

The download itself is the same file from the same releases page — but the app does the
checking for you. It fetches the release's `SHA256SUMS.txt`, hashes the file while it
downloads, and compares the two. **If they do not match, the file is deleted instead of
run.** Without a code-signing certificate that comparison is the only thing standing
between "the file built from this source" and "some .exe"; it is therefore not optional,
and a release without a checksum file sends you to the browser rather than installing
anything.

Then the installer runs in the background, without a window of its own: Argus closes so
its files can be replaced and comes back on the new version, in the same folder it was
installed to before. It asks nothing further — the window you clicked in has already
shown the version, what changed and the checksum it verified. On the **portable** build
there is nothing to install: the folder with the new `.exe` opens and you swap the old
one yourself.

The hourly check can be turned off under **Settings → About**. It is the only reason
Argus talks to GitHub on its own, and no update is ever downloaded without your say-so.

## First run

Argus asks one question: may it read from the running game?

Start Warframe, log in, then press **Allow and continue**. Argus finds your account and
your inventory by itself — there is nothing to look up, copy or paste.

What you are agreeing to, in plain terms:

- **Reading only.** Argus never changes anything in the game, never plays for you, and
  never touches the game's network traffic.
- **Your password is never involved**, and neither is your session. Argus does not sign
  in anywhere and does not ask Warframe's servers for anything on your behalf.
- **Your inventory never leaves this PC.** The running game already holds it in memory;
  Argus reads it there and stops. Nothing is uploaded, nothing is fetched.
- **What stays on your PC:** your account ID — needed for the *public* profile page,
  the same 24 characters you could copy off warframe.com yourself — and a copy of your
  inventory, so Argus need not look again.

One practical detail: the game only puts your inventory in memory **when it loads a
zone**. If nothing shows up, travel to a relay or your dojo and back to your ship, then
fetch again. If it still will not, *Scan log* under **Settings → Inventory** says
what the search actually did and where it stopped — it holds no account ID and no
inventory contents, so a screenshot of it can go to whoever is helping you.

The mechanics behind that are spelled out under [Is this safe?](security.md), and you
can switch it off again at any time under Settings.

### Game not running, or playing on console?

Take the second route on the same screen: **Enter your account ID instead**. That works
without the game and on every platform — you then get everything except the inventory,
which only the running game can provide. It also leaves the memory access switched off.

1. Sign in on warframe.com
2. Open `https://www.warframe.com/api/user-data`
3. Copy the value of `user_id` — 24 characters, digits and `a`–`f`

Since Update 38.0.8 the lookup only works by account ID. Anything that still asks for
your display name is out of date.

### The tour

Once the window is up, a short guided tour runs by itself: nineteen stations through
every tab and the panels over the game, each one marking the piece of the window it is
talking about. It takes a minute or two, **Esc** ends it at any point, and it only
explains — no switch is flipped along the way. It runs once; **Settings → General →
Guided tour → Start the tour** brings it back whenever you want it.

When an update adds stations, the tour comes back once with only those — opened by a
card that says why it is there, so it does not look like the old tour starting over.

## Where your data is kept

The first start downloads about 12 MB of public game data (DE's item catalogue and the
mod list). Everything is stored under `%APPDATA%\Argus\data` — which means your goals,
builds, notes and themes survive an update, and an uninstall leaves them alone.
