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

Your adversary, your requiems, your past hunts — and the stabs you have made — come from your
last inventory fetch. A stab you log by hand counts right away and is kept on your PC in
`requiem.json`, next to your goals, until the inventory has it too. Without an
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
slot. Argus takes them from your inventory; under *What you know* you can mark one by hand
to use it before your next fetch. **Oull** fits every slot: it always passes, without
telling you which requiem belongs there.

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

## Stabs from the game

The game keeps every stab on your Lich, and Argus reads them from your inventory. They show
up in the log marked **Game** — exactly what the Lich's profile in the game shows, and they
cannot be removed. A stab you log by hand is marked **Logged** until the next inventory
fetch, usually when you are back on your ship; then the game's entry takes its place. If
the two disagree, the game wins.

A logged stab the game does not know — though the inventory is newer than the stab — is
greyed out as **Not in game** and does not count. Most likely the requiems were mixed up
when it was logged; remove it and log the right ones.

**A stab that worked needs no logging either.** Once the right sequence is in, the game marks
your Lich as *weakened* — every Lich, Sister and Coda you have beaten carries that mark in your
inventory. With the next inventory fetch Argus sees it, ends the hunt and shows the sequence.
The same mark covers a stab whose code Argus cannot read yet: on a weakened Lich, the last
stab is the one that worked. Logging it by hand still shows it right away, before you are
back on your ship.

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

- **How a stab that gets further is stored.** Measured on two real stabs, as the Lich's
  profile showed them: Lohk, Xata, Oull failed on the 1st and became `6160` in
  `GuessHistory`; Fass, Lohk, Oull failed on the 2nd and became `26629`. Read in groups of
  four bits from the bottom, that is the three requiems in slot order (Lohk 0 … Khra 7,
  Oull 8), and above them two bits per slot, the 1st lowest: 1 wrong, 2 right, 0 not
  checked. A stab that fails on the 3rd and one that works follow from that, but neither
  has been seen yet — nor how Oull is marked once a stab gets to it. Argus shows anything
  that does not fit as *not readable yet* and writes it to `argus.log`; on a weakened
  Lich, the last stab counts as the one that worked (above).
- **The weakened mark on a running hunt.** Seen on every adversary in your history, not yet on
  a Lich that is still active. The first time it shows up, Argus writes it to `argus.log`
  together with the code of the last stab (`[Requiem] Am Nemesis noch nicht gelesen`) —
  along with anything else on your Lich it does not know.
- **Murmurs.** Measured on the first one: the game named Fass, and the inventory then held
  `Hints: [5]` — the same numbering as the stabs (Lohk 0 … Fass 5 … Khra 7). The murmur
  progress (`HintProgress`) counted up to that murmur (6, 27, 34) and started over at 5
  after it; where it tips over is not known, so it is not shown.
- **The game's log** tells how a stab goes while it happens: a line for every right
  requiem (`lich finisher success. passcodenumber: 1`), and the finisher that plays on a
  wrong one ends in the slot's letter (`KuvaLichHackFailB` for the 2nd). At mission start
  it lists the requiems on the Parazon — on both stabs so far in reverse slot order. Argus
  does not use any of it: the inventory has the same once the mission ends. Lines about
  your Lich go to `argus.log` (`[Requiem] Log:`).
- **Murmurs reveal requiems in random order.** Argus treats every sequence that fits what
  you logged as equally likely; if the game revealed requiems in a pattern, the chances
  shown would be slightly off. The ruling-out itself does not depend on it.
