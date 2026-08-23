# Is this safe?

*Everything Argus does to the game and to your machine, spelled out - including the memory read and every endpoint it talks to.*

[← Back to the README](../README.md)

---


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

## Endpoints

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
| `api.github.com/repos/Kr3akz/Argus/releases/latest` | update check, hourly, switchable |
| `github.com/Kr3akz/Argus/releases/download/…` | the update itself, button press only |

## ⚠️ Important: do not refresh too often

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
