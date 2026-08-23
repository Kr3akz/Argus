# Controls, windows and settings

*How the two windows work together, what the hotkeys do, and everything under Settings.*

[← Back to the README](../README.md)

---


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

## Two windows

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

## Pulling the cursor into the overlay

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

---

## Settings

Under **Settings** are the things that always apply:

- **Hotkeys.** Click the button, press the combination, done. It must include at least
  Ctrl, Alt or Shift — a single key would be captured system-wide by Argus, including in
  chat. If the combination is already taken by another program (Discord, GeForce
  Experience, another overlay), the app says so and keeps the previous one.
- **Inventory access** — off by default, see below.
- **Notifications on/off**, sound, and Windows desktop toasts.
- **About Argus** — which version is running, which commit it was built from, and the
  switch for the hourly [update check](../README.md#updates). The commit is there because a version
  number alone does not say *which* state you have in front of you when something looks
  different from the changelog.

**Which** fissures get reported — tiers, mission types, Steel Path, Railjack — stays in
the live tracker under *Void fissures → Notifications*. That choice belongs with the list
it filters: the preview there shows immediately how many fissures currently match.

---
