# Rivens

*Your rivens with the numbers the game shows, a grade for each of them, the riven finder, and the panels on the cycle screen.*

[← Back to the README](../README.md)

---

## The tab

Three views:

- **Unveiled** — every riven you own as a card: its stats at your rank, how well each one
  rolled between the lowest and highest value it can have, rerolls, polarity, drain — and a
  grade. Search by weapon or stat, filter by class, sort by grade, roll, rerolls or rank.
- **Veiled** — rivens with a challenge, grouped by challenge with your progress, and the
  ones you have not revealed yet, by type.
- **Riven finder** — riven auctions on warframe.market, searched by weapon and stats.

Everything except the finder comes from your last inventory fetch. The finder works without
one.

## Grades

Every riven gets a grade from **S** to **F**, and every stat on it a letter of its own.

### What a weapon wants comes from the market

The obvious guess — a weapon with high critical chance wants crit stats — is wrong exactly
where it matters. Measured on 29 September 2026: Torid (15 % base crit), Dual Toxocyst
(5 %), Hek (10 %) and even Scourge (2 %) all *sell* with Critical Chance, Critical Damage
and Multishot. What a riven is worth is decided by what people pay for, not by the weapon's
stat sheet.

So Argus asks warframe.market. For each weapon it takes the riven auctions, sorted by price,
keeps the **priciest quarter** and counts which stats they carry:

| Weapon | Stats on the priciest quarter |
|---|---|
| Torid | Critical Chance 92 % · Critical Damage 89 % · Multishot 81 % |
| Ocucor | Multishot 91 % · Critical Damage 82 % · Toxin 54 % |
| Hate | Critical Damage 84 % · Attack Speed 51 % · Critical Chance 48 % |
| Vectis | negative Magazine Capacity on 52 % — the gun holds one round anyway |

Prices below 5 platinum ("1p, bids welcome") and joke prices (888,888) are left out before
counting. From those shares:

- **best** — up to three stats with at least 25 % *and* at least 55 % of the strongest one.
  The second condition is what makes thin markets work: on Galariak Prime (122 usable
  auctions) the leader is Damage at 39 %, and a fixed bar would have left it wanting nothing.
- **good** — the next up to four with at least 15 % and 20 % of the strongest.
- **harmless negatives** — negatives carried by at least 10 % of the priciest rivens that
  have one. A stat the weapon wants is never harmless as a negative.

Reading only the pricier half of a weapon's auctions (one search returns at most 500) gives
the same top stats as reading all of them — checked on Torid, Ocucor, Hate and Cedo. One
search per weapon is enough, and it is kept for **a week** in `data/riven-market.json`.

### Without market data

Until a weapon's data has arrived — or offline, or when a weapon has fewer than 20 usable
auctions — it is graded by what rivens of its **class** sell with, averaged over 22 measured
weapons (every weapon counting once): rifles, shotguns, pistols, melee, kitguns, zaws and
arch-guns each have their own table. Such a grade has a **dashed frame**, and its tooltip
says so.

### The grade itself

Which stats a riven has counts for more than how well they rolled. A roll only moves a stat
between 90 % and 110 % of its middle value, while the difference between a stat the weapon
wants and one nobody searches for is the difference between sold and not sold.

- A **wanted** stat keeps at least 75 % of its weight with the worst possible roll.
- A stat the weapon does not want is worth about a third of a wanted one, however well it
  rolled.
- A **harmless** negative costs nothing — it lifts the positives by a quarter. A negative on
  a wanted stat costs the most.

Three wanted stats with average rolls and a harmless negative land at **A**; a riven without a
single wanted stat lands at **F**. Hovering a grade explains where the weapon's wishes come
from; hovering a letter says what that stat means for the weapon.

## The finder

Pick a weapon, then up to three positive stats and a negative — or *must have a negative* /
*no negative*. The weapon's wanted stats sit next to it as chips; a click puts one into the
next free slot, and *Search with the best stats* does all three at once.

warframe.market filters weapon, stats and rerolls itself. Price, online status and the 1p
placeholders are filtered by Argus afterwards — there are no parameters for them. Values are
shown **at rank 8** so offers of different ranks compare; the listed value is in the tooltip.
Each result has a *Whisper* button (copies a chat line, nothing is sent) and a link to the
auction.

**Rank 0 with rank-8 values.** Sellers often list a riven at rank 0 but type in the numbers
from a maxed card — 836 of 3,089 low-rank auctions across 22 weapons did. Scaled up once more
they turn into nonsense (+1,798 % Critical Chance on a Torid). So before scaling, Argus
works out the most a stat can reach at rank 8 on that weapon — the base value from the riven
template, the weapon's disposition and the best possible roll, the same arithmetic as the
cards in *Unveiled* — and leaves an offer as listed when scaling would overshoot. Against
21,012 real rank-8 values, that limit was exceeded by 0.38 %, all of them typos. Such offers
say *values as at R8*.

**Similar** on one of your own rivens opens the finder with that weapon and the stats on it
that the weapon wants, and ranks the results by how many of your riven's stats they share.

## On the cycle screen

With *Compare riven rolls while cycling* on (Settings → Overlays), the panels on the cycle
screen show the grade of the current and the new roll, a letter on every stat, and — in the
left panel — which stats the weapon wants and which negatives barely matter. If the weapon's
market data is missing, it is fetched the moment the screen opens, ahead of anything waiting
in the background.

## warframe.market's limit

Auction searches are rate limited far more strictly than the rest of warframe.market: after
10 to 11 searches within a minute, Cloudflare answers with *429 / error 1015* and a wait of
up to 60 seconds — measured with searches 3 seconds apart as well as back to back, so spacing
does not help. The block applies to your whole address, including your browser.

Argus therefore keeps a budget: at most 8 searches a minute for what you start (finder,
comparable auctions in Trading), at most 5 for what it loads by itself. Your searches go
first. If a block happens anyway, Argus waits exactly as long as the server says. The first
time the tab opens with 14 rivens, their market data takes about three minutes to arrive;
the grades update as it does.
