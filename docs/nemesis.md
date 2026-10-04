# Liches & Sisters

*Work out your Kuva Lich's or Sister's requiem sequence in as few stabs as possible, keep your requiems charged, and look back at the ones you have beaten.*

[← Back to the README](../README.md)

---

## The tab

Three views:

- **Hunt** — your adversary, the stab Argus suggests next, a place to log how each stab
  went, what you know about every requiem and slot, and the stabs so far.
- **Requiem mods** — the charges left on every requiem, what to restock first, the requiem
  relics you own and what is in them.
- **Past hunts** — every Lich, Sister and Technocyte Coda you have defeated, with the stabs
  Argus logged for them.

Your adversary, your requiems and your past hunts come from your last inventory fetch. The
stabs you log are kept on your PC in `requiem.json`, next to your goals. Without an
inventory — on console, or with the game closed — you can track a hunt **by hand**: the
suggestions work exactly the same, only the charges and the adversary card are missing.

## How a stab works

Every Lich and Sister carries a secret sequence of **three different requiems** out of
eight, in a fixed order — 336 possibilities. You equip three requiems on your Parazon and
stab. The game checks them **from left to right and stops at the first wrong one**, so a
stab tells you exactly one of four things:

| You see | What it means |
|---|---|
| Failed on the 1st | the 1st requiem is wrong — nothing else was tested |
| Failed on the 2nd | the 1st is right, the 2nd is wrong |
| Failed on the 3rd | the 1st and 2nd are right, the 3rd is wrong |
| It worked | all three are right |

**Murmurs** from Thralls and Hounds name requiems that are in the sequence, never their
slot. Mark them under *What you know* as they come in. **Oull** fits every slot: it always
passes, without telling you which requiem belongs there.

## The suggestion

After every entry, Argus goes through all 336 sequences and keeps those that match
everything you logged. From that it shows, for every requiem, how likely it sits in each
slot, and picks the next stab:

1. the stab **most likely to work right now**, and among equally likely ones
2. the one that **tells you the most when it fails** — the one that leaves the fewest
   sequences standing, on average.

The rules of thumb you would otherwise learn the hard way fall out of that by themselves:
test the requiems you know on their possible slots first, and put Oull on the first slot you
do not know yet — then a stab tests the slot behind it without you having to know the one in
front. Between two otherwise equal stabs, the one without Oull wins (Oull loses a charge
like any other requiem when a stab works), and so does the one built from requiems you
actually have charges on.

**At most N stabs, about M on average.** The same rule, played through against every
sequence still possible, gives the most stabs it can still take and the average. Checked
against every one of the 336 sequences: with nothing known it needs at most 19 stabs
(18 failed ones and the one that works), 14 with one requiem known, 9 with two, 4 with all
three — the worst cases the Warframe wiki gives for playing it perfectly. With Oull, the
same hunts take at most 14, 9, 4 and 4.

**If a requiem has no charges,** the card says so, and shows the best stab you can make
with what you own. Sometimes no such stab can work — every remaining sequence needs the
requiem you lack — but it can still narrow things down, and it says that too.

**If nothing fits,** one entry was most likely logged with the wrong slot. Argus names the
stab (or murmur) without which everything fits again, and marks it in the log. A second
click on × removes a stab.

**Use Oull in suggestions** is on by default and only counts when you have an Oull with a
charge left. With it off, the card tells you how much an Oull would have saved.

The draft under *Record a stab* is already set to the suggestion. If you follow it, the
only thing left after the stab is one click on how it went. Clicking a slot and then a
requiem changes it; picking a requiem that is already on another slot swaps the two.

## In the overlay

While a hunt is running, the overlay window shows the next stab with its chance, and four
buttons — failed on the 1st, 2nd or 3rd, or worked — that log exactly that stab. A stab
logged there shows up in the tab at once, and the other way round. If you equipped
something other than the suggestion, log it in the tab instead.

## Requiem mods and charges

A fresh requiem has **three charges**. A stab only costs charges when it **works**: then
each of the three equipped requiems loses one. Failed stabs cost nothing but time. At zero
charges a requiem is **defiled** and can no longer be equipped — four requiems of any kind,
defiled ones included, transmute into a random fresh one.

In your inventory, unused requiems sit in a stack, and every requiem you have ever equipped
is its own copy with a rank — rank 0 is three charges, rank 3 is defiled. Checked against a
real inventory: the ranks of all requiems, Oull included, added up to exactly fifteen, and
the account had beaten five Kuva Liches — three charges each.

The view shows every copy as three dots, and above them:

- **How many more Liches or Sisters your charges cover for sure, whatever their sequence.**
  Worst case, every adversary wants the three requiems you have the fewest charges on; Oull
  can stand in for one of them per adversary.
- **Restock first** — requiems that are in your current sequence and empty, then empty
  ones (each new adversary needs any given requiem with a 3 in 8 chance), then those with a
  single charge left. Each with the price of a fresh copy on warframe.market and the
  requiem relics you own that drop it.
- **When the sequence is found**, use the copies with the fewest charges first — full ones
  trade better, and the card says which.

Prices are those of a fresh copy (rank 0) on warframe.market. Missing ones are fetched in
the background once per session.

The antivirus mods for the **Technocyte Coda** are listed too, read the same way. The Coda
has no requiem sequence to work out, so the hunt view only shows it.

## Past hunts

Every defeated adversary from your inventory: when it was created, its progenitor, the
level it ended on, and — if you tracked it in Argus — how many stabs it took and the
sequence that worked. Hunts you tracked by hand show up here once you end them.

## Not measured yet

- **Logging stabs by itself.** The game shows your stabs in the Lich's profile, so it keeps
  them somewhere — but no inventory fetched so far had a Lich with a stab or a murmur on it,
  so it is not known how. When your inventory carries fields Argus does not know, it writes
  them to `argus.log` (`[Requiem] Unbekannte Felder am Nemesis`). Lines about your Lich in
  the game's log go there as well (`[Requiem] Log:`). Both are there to find out whether a
  later version can log stabs without a click.
- **Murmurs reveal requiems in random order.** Argus treats every sequence that fits what
  you logged as equally likely; if the game revealed requiems in a pattern, the chances
  shown would be slightly off. The ruling-out itself does not depend on it.
