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
  The only things it asks DE for are public: your **public** profile — the same page
  anyone can open without logging in — and the world state, the same public file the
  game itself reads, with nothing about you attached.
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
- **An hourly question to GitHub** — the only request to GitHub Argus makes without you
  pressing anything: *is there a newer release?* It sends nothing but a user agent, and
  downloads nothing until you say so. Switchable under **Settings → About**, see
  [Updates](install.md#updates). The public game data Argus keeps current by itself —
  world state, drop tables, prices — is listed under [Endpoints](#endpoints).
- **Your phone, only if you pair one:** notifications through the phone's own push
  service, end-to-end encrypted, and a small server inside your own network that lets the
  phone read your foundry, goals, inventory and prices. Both are off until you pair a
  phone under **Settings → Phone** — see [Your phone](#your-phone).

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

- **It needs a zone load or a finished mission.** The game puts a fresh inventory in
  memory when you log in, when it loads a zone and when it saves a finished mission — and
  says so in its log, which is when Argus's auto-sync reads it. If you have been in your
  orbiter for a while and fetch by hand, travel to a relay or your dojo and back first.
  Without that, Argus finds nothing and simply keeps the last known state.
- **All or nothing.** Older, partly overwritten copies of the inventory also linger in
  memory. Argus checks every candidate for the fields it cannot do without and refuses
  anything incomplete, rather than showing you an inventory that is quietly missing half
  your mods. That list holds only what every account has — things you may simply not own
  yet, like a sentinel or the Helminth, are read when present and never demanded.
- **When it will not work, you can see why.** *Scan log* under
  **Settings → Inventory access** records what each attempt did — which parts of memory
  were read, how much, how long, what was found and why it was rejected. It contains no
  account ID, no inventory contents and no names, so it can be shown to anyone helping
  you work out what is wrong.

**It is a permission, and it can be withdrawn.** The switch sits under
**Settings → Inventory access**. With it off, nothing touches the game process at all —
and everything except the Inventory tab works regardless. Choosing *Enter your account ID
instead* during setup never turns it on in the first place.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `api.warframe.com/cdn/getProfileViewingData.php` | your public profile |
| `cdn.jsdelivr.net/.../warframe-exports-data` | DE's item catalogue + images |
| `api.github.com/repos/Aericio/warframe-exports-data/commits/HEAD` | whether DE's item catalogue has changed — 40 characters, at start-up and every six hours |
| `raw.githubusercontent.com/Aericio/warframe-exports-data/…` | the catalogue's checksums (under 1 KB) after that, and the catalogue itself only when one of them changed |
| `api.warframe.com/cdn/worldState.php` | the world state as the game sees it — fissures, bounties, sortie, archon hunt, invasions, Baro, Darvo, Nightwave; at most every 30 seconds, while something in Argus shows it |
| `api.warframestat.us` | the names for that world state, the parts DE's feed does not carry (Steel Path, events, Varzia, the Circuit), the node table, syndicate augment locations — and the whole world state if DE's feed does not answer |
| `api.tenno.tools` | void fissures, and failing that its whole world state — only when DE's feed does not answer and warframestat.us lags behind or is down |
| `browse.wf/arbys.txt` | the arbitration schedule — at most once a week, only the next 60 days are kept |
| `browse.wf/sp-incursions.txt` | the Steel Path incursion schedule — at most once a week, only the next 60 days are kept |
| `raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/…/ExportRegions.json` | how much mastery each star chart node gives — at most once a week, only the nodes that give any are kept |
| `drops.warframestat.us` | DE's drop tables for relics, mods, arcanes and the Drop tables tab — a small fingerprint at start-up and every six hours, the full tables only when it changed |
| `api.warframe.market/v2` | platinum prices and ducat values |
| `wiki.warframe.com` | arcane images, mod frames, polarity symbols |
| `overframe.gg` | build import, button press only |
| `api.github.com/repos/Kr3akz/Argus/releases/latest` | update check, hourly, switchable |
| `github.com/Kr3akz/Argus/releases/download/…` | the update itself, button press only |
| `web.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com` | notifications to a phone you paired — only then, end-to-end encrypted (see [Your phone](#your-phone)) |

Your inventory is **not** in this table any more, and that is the point: it never goes out
to the internet, so there is no endpoint to name. The one place it can go is a phone you
paired yourself, inside your own network — see below.

## Your phone

Pairing a phone (**Settings → Phone**) adds two things, and both stay off until you pair
one. The user guide is [Argus on your phone](mobile.md); this is what happens underneath.

**Notifications** leave the PC through the phone's own push service — Apple's for an
iPhone, Google's for Chrome, Mozilla's for Firefox. There is no way around that service for
a notification that arrives while the app is closed, and no server of Argus' own in
between. Each notification is encrypted for the one phone it is meant for
([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291)): the push service sees *that*
something arrived, when, and how big it is — not the fissure, not the whisper. Each PC
signs with its own key ([VAPID](https://www.rfc-editor.org/rfc/rfc8292)); a phone only
accepts notifications signed by the PC it paired with. The code is `src/core/webpush.js`,
and `src/cli/webpush-test.js` checks it byte for byte against the worked example in the
RFC.

**Phone access over Wi-Fi** is a small web server inside Argus on **port 47120**
(`src/core/phone-server.js`). It is what the phone talks to at home, and how pairing gets
back to the PC.

- It answers **only addresses from your own network** (192.168.x.x, 10.x, 172.16–31.x and
  their IPv6 equivalents) and refuses everything else.
- It answers **only a paired phone**. The pairing is a random 256-bit key; on disk Argus
  keeps only its hash (`data/phone.json`). A pairing code nobody used expires after 15
  minutes, and **Remove** voids a phone's key at once. The same file holds the PC's signing
  key and each phone's push address — treat it like the rest of `data/`: with both,
  someone could send notifications to your phone.
- It **only reads**: the live tracker, foundry, goals, inventory summary, prices and drop
  search — the same answers the Argus window gets, trimmed for a small screen
  (`src/core/phone-views.js`). The only thing a phone can change is which notifications it
  wants. Your account ID, your warframe.market session and anything that changes data are
  not reachable from it.
- It sends no CORS headers and checks the `Host` header, so a web page you visit cannot
  read it — not even one that points its own name at your PC's address.
- After 20 wrong keys from one address it stops answering that address for ten minutes.
- **The connection inside your Wi-Fi is not encrypted.** There is no certificate a phone
  would accept for a home address, and installing your own root certificate on a phone
  would be the riskier trade. Someone on the same Wi-Fi who records its traffic could see
  what your phone asks Argus — your inventory summary, your goals. Notifications are not
  affected; they are encrypted end to end. On a network you do not trust, leave **Phone
  access over Wi-Fi** off: notifications keep working without it.
- Windows asks once whether Argus may communicate on private networks. Without that,
  the phone cannot reach the PC — nothing else depends on it.

**The app itself** is a static page on GitHub Pages
([kr3akz.github.io/Argus/app](https://kr3akz.github.io/Argus/app/)), built from
`src/mobile` by `.github/workflows/pages.yml`. It holds no data. The pairing code sits after
the `#` in the link the QR code opens — the part of an address a browser never sends to a
server, so GitHub never sees your PC's address or the key. On the go the app asks
`api.warframestat.us`, `drops.warframestat.us` and `api.warframe.market` itself, the same
public sources Argus uses on the PC; it never contacts DE.

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
