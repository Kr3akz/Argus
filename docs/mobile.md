# Argus on your phone

*Notifications wherever you are, and your foundry, goals, inventory and prices when you are home — as a web app, with no app store, no account and no server in between.*

[← Back to the README](../README.md)

---

Argus on the phone is a small web app at **[kr3akz.github.io/Argus/app](https://kr3akz.github.io/Argus/app/)**.
It does two things:

- **On the go** — anywhere, with your PC off — it shows the **live tracker** (fissures,
  open-world cycles, sortie, Archon hunt, Baro, Nightwave, invasions, bounties, traders),
  searches the **drop tables**, checks **warframe.market prices**, and receives the
  **notifications** Argus on your PC sends: new void fissures, a cycle about to change, a
  finished foundry, a whisper in game.
- **At home** — in the same Wi-Fi as your PC, while Argus runs there — **Open my PC**
  shows your **foundry**, your **goals** with the shopping list, your **inventory** (relics,
  prime sets and parts, valuable mods) with **prices**, and the live tracker with everything
  you already own ticked off.

Nothing has to be installed from a store, and no account is involved.

## Pairing your phone

You pair once. Have the phone in the same Wi-Fi as the PC.

1. On the PC: **Argus → Settings → Phone → Pair a phone**. A QR code appears.
2. Point the **phone's camera** at it and open the link.

### iPhone and iPad

On iOS, notifications only reach web apps on the **home screen** (iOS 16.4 or newer). The
app walks you through it, but in short:

3. Tap **Copy pairing code**.
4. Tap **Share** in Safari, then **Add to Home Screen**.
5. Open **Argus** from the home screen. If it asks, tap **Paste pairing code**.
6. Go to **More**, tap **Turn on notifications** and allow them.
7. Tap **Connect to *your PC***. A small page from your PC opens and says
   *Notifications are on* — close it. A test notification arrives a moment later.

Why the detour with the code: an app on the home screen has its own storage, separate
from Safari. Sometimes iOS carries the pairing over by itself; when it does not, the
copied code does.

### Android

3. Stay in Chrome — installing is optional. **More → Turn on notifications**, allow them.
4. Tap **Connect to *your PC*** and close the page that opens. A test notification
   follows.

To get an app icon anyway: Chrome menu → **Add to Home screen**.

## Choosing what reaches the phone

Each phone has its own switches for **fissures, cycles, foundry and whispers** — on the PC
under **Settings → Phone** (the chips under each device), or in the app at home under
**More**.

*Which* fissures and *which* cycles count is the same choice as for the desktop
notifications: the fissure filter in the live tracker, the cycle bells, the whisper
switches under **Settings → Notifications**. The Windows toast and the phone are
independent — turn the toast off and keep the phone on if you play on a single screen.

Notifications only come while **Argus runs on the PC** — it is the one sending them.

## At home: Open my PC

**More → Open my PC** opens the app as Argus on your PC serves it, with your own data. On an
iPhone it opens in a small browser sheet over the app; **Done** brings you back.

This needs **Phone access over Wi-Fi** to be on (**Settings → Phone**). Pairing turns it
on; you can turn it off again at any time — notifications keep working without it.

## When something does not work

| | |
|---|---|
| **The phone cannot reach the PC** | Same Wi-Fi? On the first pairing, Windows asks whether Argus may communicate on *private networks* — that has to be **allowed**. If you clicked it away: Windows Security → Firewall → *Allow an app through firewall* → Argus, tick *Private*. Windows also has to treat your Wi-Fi as private: **Settings → Network & internet → Wi-Fi → your network → Private network**. Windows 11 marks a new network as public, and then the firewall keeps the phone out even though Argus is allowed. Running Argus from source (`npm start`), the program Windows asks about is called *Electron*. Guest networks and some routers keep devices apart ("AP isolation"); then the phone cannot reach the PC from that network at all. |
| **"Notifications are not connected yet" on the PC** | The phone never reached the PC to hand over its notification address. In the app: **More → Turn on notifications → Connect to *your PC***, and check the row above if the page does not load. It has to be the app from kr3akz.github.io — at the top it says *On the go*. The page your PC serves at home says *At home* and cannot receive notifications; if that one is on your home screen, open it, tap **More → Set up notifications**, add the app that opens to your home screen and remove the other icon. |
| **The bar at the bottom sits too high** | Close Argus completely and open it again. If it still sits too high, remove Argus from the home screen and add it again, then pair once more — an app on the home screen keeps some of its settings from the moment it was added. |
| **The PC has several networks** | VPN, WSL or Hyper-V add addresses that lead nowhere. Pick the right one under **Settings → Phone → Address in your network**, then pair again. |
| **No notifications on the iPhone** | iOS 16.4 or newer, Argus opened **from the home screen**, notifications allowed under iOS **Settings → Notifications → Argus**. Focus modes can hold them back. |
| **"Notifications stopped" on the PC** | The app was removed from the phone, or its notifications were turned off. Pair again. |
| **The phone shows an old address** | Your router gave the PC a new one. It updates with the next notification; otherwise pair again. |
| **Price check fails on the go** | warframe.market may not answer requests from a web page directly. At home it works through your PC. |
| **Port 47120 is in use** | Another program holds it. Close that program and switch **Phone access over Wi-Fi** off and on again. |

## Removing a phone

**Settings → Phone → Remove.** From that moment its pairing is void: it can neither read
from Argus nor get notifications. In the app, **More → Unpair** forgets the PC on the phone's
side.

## How it works

- **Notifications** use the phone's own push service — Apple's on an iPhone, Google's in
  Chrome — as every app on the phone does. Argus encrypts each notification for the one
  phone it is meant for ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291)); the push
  service sees that *something* arrived and how big it is, never what it says. Each PC has
  its own signing key, so nobody else can send notifications to your phone in Argus' name.
- **At home**, Argus answers the phone itself, on port 47120, over plain HTTP inside your
  network — there is no certificate an iPhone would accept for a home address. It answers
  only devices in your own network, only with the pairing, and only by reading.
- **The app** is a static page on GitHub Pages, built from [`src/mobile`](../src/mobile) by
  [`.github/workflows/pages.yml`](../.github/workflows/pages.yml). It holds no data; what the
  phone and the PC exchange never goes through GitHub.

The full picture of what goes where is in [Is this safe?](security.md#your-phone).
