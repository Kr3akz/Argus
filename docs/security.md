# Is this safe?

*Everything Argus does to the game and to your machine, spelled out - including the memory read and every endpoint it talks to.*

[← Back to the README](../README.md)

---


**The app changes nothing about the game.** Here is everything it does:

- **No injection, no DLL hook, no write access** to the game process
- **No network interception** — expressly forbidden by Warframe's EULA
- **No automation, no input simulation**
- **No request to Warframe's servers on your behalf.** Argus never signs in, never
  borrows your session, and never speaks to DE's API as if it were the game client.
  The only thing it asks DE for is your **public** profile — the same page anyone can
  open without logging in.
- **Read-only memory access** to the game process, for two things, and **only if you
  switched it on**: the inventory the running game already holds
  (`inventory-scan.js`), and your account ID for the public profile lookup
  (`accountid.js`). Reading only, writing never.
- **Read access to `EE.log`**, Warframe's own log file, for relic rewards. From the last
  byte read onwards, without locking the file.
- **A capture of the screen** during the reward screen, to read the four parts via text
  recognition. The pixels go straight into the recognition — no image file is written,
  nothing leaves the machine — and it can be switched off entirely under Settings, which
  also shuts down the recognition process.
- **A focus change** via `SetForegroundWindow` for cursor mode — a window operation, not
  access to the game.
- **A login to warframe.market**, and only if you use the trading tab. Your password goes
  to warframe.market's own endpoint once and is never stored; only the session token stays
  on this machine. Nothing about this touches the game or your Warframe account.
- **An hourly question to GitHub** — the only request Argus makes without you pressing
  anything: *is there a newer release?* It sends nothing but a user agent, and downloads
  nothing until you say so. Switchable under **Settings → About Argus**, see
  [Updates](../README.md#updates).

## What the memory read actually does

Your public Warframe profile contains no inventory, and since Update 38.0.8 it cannot
even be looked up by name. Anything that shows you an inventory either reads the game's
memory or logs in with your credentials. Argus takes the first route — and takes it all
the way: it reads the **inventory itself** out of the game's memory, rather than reading
a session key and then asking DE's servers with it.

Concretely: when the game loads a zone, it receives your inventory and holds it as plain
JSON on the heap — about 1.1 MB of it. Argus searches for it, reads it, checks that it is
complete, and that is the whole operation. It opens the process with `PROCESS_VM_READ`
and `PROCESS_QUERY_INFORMATION` — read rights, no write rights. There is no injection, no
DLL, no hook, no input simulation and no traffic interception.

Alongside it, the same read finds your **account ID** — 24 hex characters, the same
string you would otherwise copy off warframe.com by hand. That is what the public profile
lookup needs. No password is involved, and since the inventory no longer travels over the
network, **no session key is read at all any more.**

Two consequences worth knowing:

- **It needs a zone load.** The game only puts the inventory in memory when it loads a
  zone. If you have been in your orbiter for a while, travel to a relay or your dojo and
  back, then fetch. Without that, Argus finds nothing and simply keeps the last known
  state.
- **All or nothing.** Older, partly overwritten copies of the inventory also linger in
  memory. Argus checks every candidate for all 24 fields it needs and refuses anything
  incomplete rather than showing you an inventory that is quietly missing half your mods.

**It is a permission, and it can be withdrawn.** The switch sits under
**Settings → Inventory access**. With it off, nothing touches the game process at all —
and everything except the Inventory tab works regardless. Choosing *Enter your account ID
instead* during setup never turns it on in the first place.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `api.warframe.com/cdn/getProfileViewingData.php` | your public profile |
| `cdn.jsdelivr.net/.../warframe-exports-data` | DE's item catalogue + images |
| `api.warframestat.us` | world state, cycles, fissures, syndicate augment locations |
| `drops.warframestat.us` | DE's drop tables for relics, mods and arcanes |
| `api.warframe.market/v2` | platinum prices and ducat values |
| `wiki.warframe.com` | arcane images, mod frames, polarity symbols |
| `overframe.gg` | build import, button press only |
| `api.github.com/repos/Kr3akz/Argus/releases/latest` | update check, hourly, switchable |
| `github.com/Kr3akz/Argus/releases/download/…` | the update itself, button press only |

Your inventory is **not** in this table any more, and that is the point: it never leaves
your machine, so there is no endpoint to name.

## ⚠️ Important: do not refresh the profile too often

DE throttles **per IP address**, not per endpoint. Too many requests mean you **cannot
log in to Warframe** any more ("too many logins") — an IP block of up to 24 hours. Not an
account ban, but a nuisance.

So this is built in:

- The profile is fetched **only on a button press**, never automatically
- At least **10 minutes** between two fetches
- After being throttled, a **3 hour pause**, with no retry

The inventory used to share that budget, because it went to the same servers. It does not
go anywhere any more, so it does not count against anything — the whole allowance belongs
to the profile now.

## Where this stands with Digital Extremes

DE publishes a policy on third-party software, and its golden rule is short: *if you use
external software in conjunction with Warframe, you do so at your own risk.* There is
deliberately **no list of approved tools** — not for Argus, not for anything else. What
DE bans hard is altering game files, cheating, exploiting and AFK farming, none of which
Argus does or could do.

So the honest position is this: **nothing here is approved, it is tolerated.** Tools
that read the game's memory and its log file the way Argus does have been in wide use for
years without a single documented ban, and Argus deliberately stays on that side of the
line — nothing is changed, nothing is automated, nothing is sent to DE. But "no approval,
use at your own risk" is DE's stated position, and a stated position can change. If it
ever does, that is a decision made in Ontario, not in this repository.

---
