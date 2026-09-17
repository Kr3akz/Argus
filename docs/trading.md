# Trading on warframe.market

*Orders, contracts and a local trade ledger - plus what happens to your password (nothing).*

[← Back to the README](../README.md)

---


The trading tab is your warframe.market order book, without the browser. Four lists,
one place: what you are offering, what you are auctioning, what actually sold — and what
everyone else is asking, for the times you are the one buying.

## Orders

Every sell and buy order on your account, with the same button row the website uses —
so the muscle memory carries over:

| Button | What it does |
| --- | --- |
| **Sold** | One traded. Counts the quantity down, deletes the order when nothing is left, and writes the trade into your history. |
| **Edit** | Price, quantity and whatever else the item needs — next to the ten most recent offers from other players. |
| **+1** | One more in stock. |
| **Visible** | Takes the order off the market without deleting it. Click again to bring it back. |
| **🗑** | Deletes it. Asks once. |

**The offer list is the point of editing in Argus rather than on the site.** When you open
an order, the ten most recent offers for that item load next to your own price, and each
one is labelled with how it compares — `−6p vs. yours`, `+12p vs. yours`. You can filter
by sell/buy, by platform, by *online only*, and sort by recency, price or reputation.

For items with a condition — relics above all — the comparison follows the condition you have
selected, because an intact relic and a radiant one are different goods at different prices.
Switching the dropdown reloads the list.

*Online only* matters more than it looks. Warframe.market lists roughly a thousand offers
for a popular item; sixty of those belong to someone actually in game. An offer from
somebody who last logged in three days ago is a number, not a price.

Creating an order searches the market's own item list — 3,800-odd tradeable things,
including mods and arcanes with their rank. Pick one and Argus loads the current cheapest
offers and pre-fills the price, so you are not guessing.

## Straight from the inventory

Every tradable set in the inventory's **My sets** view carries a **WTS** and a **WTB** button.
One click takes you to the trading tab with the order already filled in — item, direction,
quantity and a price — so the only thing left is *Create order*.

**WTS knows how many you can actually sell.** It uses the number of *complete* sets you own,
not the number of parts, and the button shows it (`WTS 2`). With no complete set it stays
visible but disabled rather than vanishing, so the card does not change shape depending on
what you happen to own; the tooltip says why.

Base sets have no button at all, because their parts are not tradable and warframe.market has
no listing for them.

**What you already have listed says so, on the thing itself.** A part you are currently
selling carries its own price on its chip (`Systems Blueprint ×1 · 16`), the card around it
picks up the trade colour, and the WTS button turns into **Listed 16p** — one click away from
the order rather than from a second order for the same thing. The same holds on mod and
arcane tiles, in their data sheets, and in a part's own sheet.

This used to ask the wrong question. It compared your orders against the *set* slug —
`mirage_prime_set` — while almost everybody trades single parts, and two real orders on
`mirage_prime_systems_blueprint` and `pyrana_prime_barrel` therefore matched nothing. The
marking existed and could never fire; from the outside it looked like it did not exist. It
now counts a set as listed when anything from it is out there, whole or in pieces.

**On a mod the rank has to match, or the button lies.** An order for a rank-10 Primed
Continuity has nothing to do with the unranked card, and a `Listed` button on the wrong rung
would lead you to an order about different goods. Pick rank 0 with a rank-10 order running
and you get **WTS** back, as you should. Where a tile shows a price for one rank and your
order sits on another, the badge says which (`118 r10`).

**The suggested price differs by direction, on purpose.** Selling anchors on the cheapest
current seller — that is the competition. Buying anchors on the **median** of the best buy
offers rather than the highest: a single bidder far above the field is not a market price, and
prefilling it would mean accidentally outbidding them. One real set had offers of 175p, then
69, 60, 60, 57 — the suggestion is 60.

**And it counts only the people who are in game.** On a common prime part the great majority
of listings belong to players who last logged in days ago; theirs is the cheapest number on
the board, and anchoring to it means undercutting a market that is not there. Only sellers
showing as *in game* are counted. If none of them is, the line falls back to everybody and
says so — an empty hint would be a false statement about an item with dozens of offers.

**A mod's rank goes into the question too.** Rank is not a property of the goods, it is the
goods, the same way an intact relic is not a radiant one; a maxed card and an unranked one
in one price list are not a comparison. Change the rank in the form and Argus asks again.

## Looking up what something costs

The **Market** tab sits next to Orders, because it is the same motion from the other side:
what does this cost, and what am I asking. Type an item name — Nidus Prime Blueprint,
Serration, Axi A1 Relic — pick it from the hits, and the ten offers standing at the top
appear: cheapest first, and by default only from people who are online or in game right now.

Changing the search brings the item list straight back. There is no button to press to look
up something else; the field you typed in is the way back out.

**The little badge on each picture is doing real work.** Warframe.market draws every part of
a Prime with the same illustration — the whole frame — and distinguishes them with a small
mark in the corner: a blueprint, a helmet, a chassis. Without it, five entries called
"Nidus Prime …" look identical and the choice rests entirely on reading the text.

*In game only* is on to begin with, and that is the point rather than a default worth
changing lightly. Warframe.market lists hundreds of offers for a popular part; the cheapest
one belongs to somebody who last logged in on Tuesday. An offer nobody is behind is a
number, not a price.

**Rank and condition are part of the price, so they are part of the search.** Serration at
rank 0 goes for 2 platinum and at rank 10 for around 49 — a single list holding both, sorted
by price, is not a price comparison but a misunderstanding with numbers in it. Mods get a
rank picker, relics and arcanes their condition, and the choice carries into the message you
copy so the other side knows which one you mean.

## Copying the whisper

Each offer has a **Copy** button. It puts a line like this on your clipboard:

```
/w RRPrimeKnight Hi! I want to buy: "Serration" (rank 10) for 49 platinum. (warframe.market)
```

Paste it into Warframe's chat yourself. **Argus never sends it** — it cannot; nothing in it
talks to the game's chat, and nothing ever will. A program that writes to strangers on your
behalf is a bot, including when it is polite about it. The clipboard is the line where a tool
stops and you start.

The direction flips with the list you are looking at. Under **Sellers** you are the one
buying, so the message says *I want to buy*; under **Buyers** it says *I want to sell*. That
is the most common thing to get backwards, and it only shows up once both of you are already
in the trade window expecting different things.

You do not need to be signed in for any of this. Other people's offers are public on
warframe.market, and what you do with the copied line happens in the game, not here.

## Contracts

Riven, Kuva Lich and Sister of Parvos auctions. They are a different thing from orders and
warframe.market keeps them in a separate API: an order sells one of many identical items,
an auction sells one specific piece. So there is no quantity here, but a starting price, a
buyout and bids.

Editing a contract shows comparable auctions for the same weapon — the same
compare-to-yours labelling as the orders, filtered by online sellers or buyout-only.

Rivens show their attributes, mastery requirement, rolls and polarity; liches and sisters
show element, damage and whether an ephemera is attached.

## Transactions

**Two books, merged into one list.** Warframe.market records the trades that went through
their confirmation; Argus records what you marked *Sold* here and what you typed in by hand.
Neither covers the other: a trade you agreed in game and settled in the chat window never
reaches warframe.market, and their history goes back further than the day you installed this.

Their half comes from `/v1/profile/{name}/statistics` — the `closed_orders` your profile
records: item, quantity, **unit** price and the closing date. It hangs off your profile name,
so an account without an in-game name set on warframe.market has nothing to fetch there.

Worth knowing if you touch that code: the fields are `closed_date` and `order_type`, not the
`createdAt`/`type` that the v2 endpoints use, and `platinum` is the price **per unit** —
checked against live market prices, a closed row of 28p × 2 sits next to a 29p market price.
Guessing those names wrong is quiet rather than loud: a missing date field fed to
`Date.parse(0)` yields a perfectly valid 1 January 2000, and an unmatched order type silently
turns every sale into a purchase.

So the list shows both, and every row is stamped with where it came from — **market**,
**Argus** or **manual**. A trade that appears in both books is counted once; the matching is
deliberately coarse (item, direction, price and the day) because the two clocks tick
differently, one stamping the confirmation and the other your click.

The list filters by sold/bought and by the last 7 or 30 days, and totals what the current
selection came to. The figure over the tab is deliberately **net platinum, not profit**:
what a part cost you to farm is not something this file can know. Buy for 10p, sell for
30p, and it shows +20p — the honest reading of this data.

The local half keeps working when you are signed out. If warframe.market's history cannot be
reached, the summary line says *local only* rather than quietly showing you less.

## Analytics

The same book as a picture: earned and spent side by side per day, week or month, with the
running total drawn over it on its own scale down the right-hand side. Under it, the eight
items that brought in the most — with what each of them cost you, because for anything you
buy and resell the difference is the whole answer.

The grain follows the range you pick rather than being another switch: up to 45 days it
counts by day, up to 220 by week, beyond that by month — whatever keeps the axis under
about 45 bars. "All time" measures from your oldest trade, so it does not draw a year of
empty months to get to the first one.

**Gaps are filled in.** Three days without a trade are three days at zero. If only the days
with turnover were drawn, a quiet week would look like one busy day next to the next, and
the running total would slope through time that never happened.

**Rows with no date stay out.** Some closed orders come back from warframe.market without a
usable timestamp; putting them somewhere would mean inventing a day. They are counted and
the chart says so underneath.

*Net* is earnings minus spending and is labelled as such. It is not profit — what a part
cost you in missions is not in this file.

## What an item has actually been selling for

Every data sheet — a mod, an arcane, a single prime part — carries a **Market history**:
ninety days of completed trades from warframe.market, as a median price, a direction, and a
curve with the daily turnover underneath it.

**These are closed trades, not standing offers.** The price tag elsewhere in Argus reads
*offers* — what somebody is asking. An offer is a claim; it can have sat there for four
months without ever finding a buyer. This reads what was actually paid, with a date and a
count attached, and that is the only thing from which "is this moving" can be answered.

**Turnover is the other half of the price.** A part at 400p with four trades in a month and
one at 40p with two hundred are not the same kind of thing: the first is a number, the second
is money. So next to the price stands how many change hands per day, and on how many of the
last thirty days anything happened at all. Below eight of thirty the sheet stops quoting a
trend and says so instead — between two isolated sales, a percentage is noise with a decimal
point.

**The rank and the condition go into the question.** warframe.market returns every rank of a
mod in one list, separated only by a field: Arcane Energize trades at 8p unranked and 140p at
rank 5, Primed Continuity at 50p and 115p. Averaging them produces a number belonging to
neither. The sheet asks for the rank you are looking at, and says which one in the heading.
Relics carry the same problem under another name — `intact` against `radiant` — and the panel
names the condition it charted.

**Gaps stay gaps.** Only days with trades come back, and they are placed where they belong in
time rather than spaced evenly. A long flat stretch means nothing happened there; filling it
in with the last known price would draw a calm market over an empty one.

A remembered history appears immediately and dims itself until the fresh one arrives. A few
hours old answers "is this climbing" as well as brand new, and a spinner in place of a curve
answers nothing.

## What is heading for the vault

The **Insights** tab is the only one that looks forward. Everything else in trading shows a
state — what is open, what it costs, what happened. This shows a date.

A vaulted prime drops nowhere. Anybody who wants it afterwards has to buy it from somebody
who farmed it first, and that is what moves the price. The date is known weeks ahead; the
price move is not.

**The estimates are estimates, and the page says so every time.** Digital Extremes does not
announce vaultings. The dates come from the community data behind warframestat.us and follow
the rhythm of Prime Access — which is regular enough that they fall into clean groups of
three, one warframe and two weapons, exactly one Prime Access package:

```
35 days overdue   Quassus Prime, Trumna Prime, Xaku Prime
in 56 days        Cedo Prime, Dual Zoren Prime, Lavos Prime
in 5 months       Daikyu Prime, Kompressa Prime, Yareli Prime
```

Treat them as the order things are due in, not as a promise.

**Overdue is the one that matters today.** Past its date and still dropping means it can go
with the next announcement. Sets in that state also carry a red badge in the inventory, on
the artwork, where it costs the card no height.

**Eight primes are never vaulted and are not listed as late.** Braton, Bronco, Fang, Orthos,
Paris, Burston, Akbronco and Lex Prime sit permanently in the general relic pool. The
community estimate for them is from 2015 and is eleven years overdue; reporting that as
"overdue" would be the opposite of the truth, since they are the only ones certain to stay.
Anything more than a year past its estimate and still dropping counts as permanent.

Three further lists compare the schedule against your own shelves, and they differ in what
you would *do* about them rather than in what they show:

- **You hold** — complete sets whose prime is heading in. After the vaulting they get
  scarcer; selling now means selling before that.
- **Finish before it goes** — sets you have started whose missing parts stop dropping soon.
  The only list with a deadline on it.
- **Already vaulted** — complete sets of things that no longer drop at all.

None of them predicts a price. They sort a known date against a known shelf. What the market
makes of it is in the history curve on the data sheet, not in a claim about next month.

Clicking any row takes you to the sellers for that set, cheapest first — which is the
question that follows "this is going away".

## The check: what your balance actually did

Both halves of the ledger have the same hole. Warframe.market only records what went
through their confirmation, and the local half only what you ticked off or typed in. A
trade settled in the chat window, a weapon slot for 12 platinum, a spontaneous buy — none
of that is in the book. So the figures above are tidy and incomplete at the same time, and
nothing about them says so.

**Your balance does not lie.** It sits in your inventory, and every time Argus reads that
it notes the platinum and ducats down in `wallet-history.json`. Under the chart, the
difference between the two books becomes the actual answer:

```
Balance moved  −1,447   11,464 → 10,017
Ledger accounts for  −1,349   45 trades in that same window
Unaccounted  −98
```

Two things about that number. It is **not** "untracked trades": platinum also goes on
slots, colours and boosters, and the card says so. And the window is the one the
*readings* cover, not the range you picked — from the last reading before the range to the
most recent one — so the dates are printed next to it. A 30-day ledger measured against a
five-day movement would produce a difference that only tells you the two windows differ.

Balances are stamped with **`syncedAt`, not the time Argus read them**. The game only puts
the inventory in memory when it syncs — on login and on zone changes — so "read two minutes
ago" can mean a two-hour-old balance (see [inventory](inventory.md)). The sync time is when
that balance was true, which makes it the right key: opening the tab ten times records one
reading, not ten.

The line between the readings is **dashed on purpose**. Between two measurements nobody
knows what the balance was — it could have gone up and come back down. The dots are the
data; the line just helps you read across them. The axis starts at zero, because a wallet
chart that starts at 4 000 turns a two-percent wobble into a mountain range.

## Ducats are the second currency

Baro Ki'Teer is a trade like any other, just in a different coin, so ducats live in the
same ledger and get the same charts — the chips above the analytics pick which one you are
looking at. **The two are never added together.** There is no exchange rate between them;
only the detour through an item that has both a ducat value and a platinum price, and that
is a different question from what this book records.

Nothing can pick a Baro sale up on its own: he trades inside the game, DE publishes nothing
about it, and an inventory fetch sees the balance, not the movement. Two fetches could be
subtracted, but anyone who sells and then buys in the same visit would only ever see the
difference. So the **Ducats** tab grows a *Sold to Baro* button next to its selection: pick
what you handed over, press it twice, and each part lands in the book as its own line — one
line per part, because a single "Baro sale, 4 500 ducats" would be a bar with nothing to
say. Buying from his stall goes in by hand, through the same *Add transaction* form with
the currency switched over.

Rows written before any of this existed are platinum: there was nothing else.

## Showing up as "in game"

Warframe.market sorts offers by presence, and most people filter for *online only* before
they write to anyone. An offer from someone who last logged in three days ago is a number,
not a price — which cuts both ways: your own orders are just as invisible while your dot
says offline.

The switch next to your account in the trading tab takes care of it. While Warframe is
running, Argus shows you as **in game** on warframe.market. Close the game, or close Argus,
and it is taken back.

**It only ever adds.** Argus never sets you to *online* and never sets you to *invisible* —
the two other states the protocol has do not appear anywhere in its code. Whatever you chose
on the site yourself is still yours; the switch lays *in game* on top of it while you play,
and lifts it off when you stop.

That is not politeness, it is how the protocol works. In warframe.market's v2 API the status
is not a setting that stays put — it hangs on an open connection and lasts exactly as long
as that connection does. So "taking it back" is nothing more than hanging up, and what your
account looks like afterwards is warframe.market's decision, not ours.

**With the game closed, nothing is sent at all.** Switch on and Warframe shut means no
connection, no message, no claim about you. Argus looks at the process list every thirty
seconds, and only then does anything happen. Switch off and even that stops — no timer, no
connection, nothing.

The dot next to the switch says where you stand: grey is waiting for the game, green means
your status is live, red means it did not work and the tooltip says why. The wording next to
it never changes, so you can tell what the switch does without reading its current state
first.

You need to be signed in — the status belongs to an account, so there is nothing to set
without one. Signed out, the switch is greyed out rather than silently doing nothing, and
your setting is remembered for when you come back.

## Signing in

Orders and contracts live on warframe.market, so changing them needs your account there.
Argus sends your e-mail and password **once**, to warframe.market's own login endpoint, and
keeps only the session token it gets back, in `wfm-session.json` in the data directory.

**It signs in through the v1 endpoint, and that is deliberate.** Warframe.market's newer v2
login answers any third-party attempt with `app.auth.appCheckMissing` — a proof of
application identity that only their own official apps can produce, and that no combination
of fields or headers gets you past. The v1 endpoint has no such gate, and the token it hands
out is good for both API versions. Orders still run on v2; only the sign-in takes the older
door.

A second wrinkle worth knowing if you touch this code: v2 accepts that token as
`Authorization: Bearer …` or as a `JWT` cookie, but silently ignores the `Authorization:
JWT …` form that v1 historically used. Argus sends the Bearer header and the cookie
together, so both versions are happy.

**The password is never stored, never logged, and never written to disk.** The field is
cleared the moment you submit, whether it worked or not. Signing out drops the token.

Sign-in lives behind the **account button** next to Refresh, and that button carries the
state: grey dot for signed out, green for connected, amber for *session problem*. The third
one exists because "signed in" is not one truth here — the token comes from v1, the orders
live on v2 — so the account window runs a **connection check** that lists, endpoint by
endpoint, what actually answers.

That check is the only way to find out. Signed out, every path under `/v2/me` returns 401,
including ones that do not exist, because authentication is tested before routing. You cannot
tell a real endpoint from a typo without a valid session.

**Signing in is not the same as being able to trade.** Warframe.market wants two more things
before your account may list anything: an **in-game name** on your profile, and **verification**
of that account. Without them the API answers `app.auth.user.notVerified` — a 401, but not a
session problem, and no amount of signing in again fixes it. Argus tells these apart: the
account button reads *Account setup* rather than *Session problem*, and the connection check
names which of the two is missing along with your verification check code. Both are set on
warframe.market's own site; nothing here can do it for you.

**Argus never signs you out on its own.** A 401 is ambiguous — it can mean an expired token
or an endpoint that will not take this token at all — so the session stays and the tab tells
you what happened. Earlier it discarded the token on the first 401 and put the login form
back, which made a *successful* sign-in look like nothing had happened.

---

