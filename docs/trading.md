# Trading on warframe.market

*Orders, contracts and a local trade ledger - plus what happens to your password (nothing).*

[← Back to the README](../README.md)

---


The trading tab is your warframe.market order book, without the browser. Three lists,
one place: what you are offering, what you are auctioning, and what actually sold.

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

**The suggested price differs by direction, on purpose.** Selling anchors on the cheapest
current seller — that is the competition. Buying anchors on the **median** of the best buy
offers rather than the highest: a single bidder far above the field is not a market price, and
prefilling it would mean accidentally outbidding them. One real set had offers of 175p, then
69, 60, 60, 57 — the suggestion is 60.

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
