# Themes

*Nine looks to pick from, your own on top, and a line of text to share them — in the main
window and in everything Argus draws over the game.*

[← Back to the README](../README.md)

---

## Picking one

**Settings → Appearance.** Every theme is a card with a small window drawn in its own
colours. One click and it applies everywhere at once: the main window, the overlay, the
price tags on the reward screen, the relic recommendation and the riven panels.

| | |
|---|---|
| **Argus** | The original: blue on deep night |
| **Orokin** | Pale gold on warm black |
| **Void** | Violet on indigo |
| **Corpus** | Cyan on cold slate |
| **Grineer** | Rust on scorched metal |
| **Infested** | Acid green on dark moss |
| **Midnight** | True black, for OLED screens |
| **High contrast** | Pure black and white, cards that stand out more |
| **Red–green safe** | Blue and orange instead of green and red |

## Making your own

**Customize**, below the cards, always edits the theme you are using. Presets never
change: your first edit to one makes a copy — *Void custom* — and carries on there. Rename
it, duplicate it, reset it to the preset it came from, or delete it (two clicks, so a slip
does not cost you a theme). You can keep up to 50.

A theme is six colours:

| | |
|---|---|
| **Accent** | Buttons, the active tab, links and highlights |
| **Background** | The window behind everything — the raised panels and menus follow from it |
| **Surface tint** | Cards, lines and hover states are this colour at low opacity |
| **Text** | Headings and body text — the dimmer greys follow from it |
| **Positive** | Owned, done, profit, a good roll |
| **Negative** | Missing, vaulted, loss, errors |

and four settings for shape and effects: **corners** from square to round, **surface
contrast** (how far cards stand out), the **glow** at the top of the window, and the
**blur** behind the sidebar and dialogs.

Everything else — the panel greys, the second and third shade of text, the lighter tints
of the accent, the lettering on an accent button — is worked out from those six, keeping
the spacing the default theme uses. That is why a theme cannot make text unreadable by
accident: the dimmer greys are placed by *contrast* rather than by a fixed mix, and the
lettering on an accent button turns light as soon as the accent gets dark. Where a choice
is still hard to see — an accent that fades into the background, positive and negative
that look alike — a line under the editor says so.

Changes apply while you drag and are saved as you go.

### The colour picker

A square for saturation and brightness, a hue slider, and a hex field. The square only
shows the brightness range that makes sense for the colour you are editing and shades out
the rest — see below. Arrow keys move the marker; Shift moves it further.

### Only dark themes

Argus draws its cards, lines and hover states *light on dark*, everywhere. The picker
therefore offers only dark tones for the background and only light tones for text and the
surface tint. A pasted code that asks for something else is pulled into range, not
refused.

### What stays the same in every theme

Some colours mean something in the game, and a theme leaves them alone:

- **Gold** — ducats, Prime, the *Rare* rarity, and *buying* on warframe.market.
- **The second blue** — platinum and *selling*, gold's counterpart. With a gold accent,
  buy and sell would otherwise look the same.
- Relic eras, bronze and silver rarity, riven purple, the day and night colours of the
  open worlds, element colours, and the mod cards themselves.

If your accent comes close to that gold, the editor mentions it.

## Sharing

**Share → Copy code** puts the theme you are using on the clipboard as a single line
starting with `argus-theme:`. Whoever pastes it under **Add a shared theme** gets it
straight away, added to their own themes. A code carries nothing but a name, six colours
and the four shape settings, and Argus checks every value before any of it reaches the
screen.

Argus never reads your clipboard — pasting is done by you, into the field.

## Interface size

90, 100, 110 or 125 % for the main window. The panels over the game keep the size you
gave them under **Overlays → Arrange overlays**. The window's minimum size grows with the
setting, so the layout never gets less room than it has at 100 %.

The size is not part of a theme and does not travel in a code: it belongs to your screen,
not to a look.

## Where it is kept

In `config.json` in Argus' data folder, key `appearance`, like every other setting. A
damaged entry falls back to the default theme instead of keeping Argus from starting.
