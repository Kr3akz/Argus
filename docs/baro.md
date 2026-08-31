# Ducats, Baro and what not to melt

*The ducat tab answers one question — what should I hand over, and what should I keep — and
it needs three different kinds of context to answer it honestly.*

[← Back to the README](../README.md)

---

Every prime part you own carries two prices at once: a ducat value at Baro Ki'Teer, and a
platinum price on warframe.market. Argus puts both on the card and divides one by the
other, so **11.3 duc/p** on a part means eleven ducats for every platinum you give up by
melting it instead of selling it.

That ratio is the whole trade in one number. Above ten, the part is prime junk — melt it
without a second thought. Below seven, or above 15 platinum outright, it is worth more on
the market than in Baro's pocket. In between it is a coin toss, and the chip says so.

---

## Two marks that the numbers cannot show

A ratio is a fact about the part. It is not a fact about **your** part, and twice that
difference decides the trade:

### Vaulted

The part drops nowhere in the game right now. Melting it for 15 ducats does not mean
"farm another one" — it means buying it back for platinum, which is regularly worth many
times what you got. Roughly half of a long-standing account's prime parts are in this
state, and none of it is visible in the game.

How it is worked out is described under [vaulted prime gear](foundry.md); the mark here
asks the same question one level down — not *can I still farm this set*, but *can I still
farm this one part*.

### One part to a set

The set this part belongs to is a single part short of complete, and a full set sells for
noticeably more than the sum of its pieces. The tooltip names what is still missing, so
the mark is also a farming target: *Lavos Prime: 3/4 parts — still missing Neuroptics
Blueprint.*

Both marks are **remarks, not locks.** The decision stays yours; you just stop making it
blind. Two filter chips narrow the list to either of them.

---

## The set behind a part

A flat list of parts cannot answer the question you are actually holding: *what does this
belong to, and what is still open there.* "Lex Prime Barrel ×1" does not say whether it is
the last missing piece or the third duplicate.

So every card carries a **`Set 3/4`** chip — it shows the state and opens the set. The chip
turns gold when a single part is missing, which is the same warning as before, in one place
instead of two. Clicking it unfolds the whole set full width under that row:

- **every part, including the ones you do not own**, each with its own numbers — ducats,
  platinum, the ratio between them, how many you hold against how many the recipe wants,
  and its own vault mark
- the part you came from is highlighted, so you find your own row in a five-part set
- what the **full set** trades for against **the sum of its parts** — warframe.market
  handles a finished set as its own listing, and the two prices are regularly not the same.
  A Dual Zoren Prime set goes for 30p while its parts add up to 44p; that is 14 platinum
  for the trouble of selling them one by one. The line only appears when every price is
  known — a comparison with a guessed half is a guess.
- the ducat value of what you actually hold from that set, since that is the currency this
  tab is counting
- a closing line naming what is still missing, and whether any of it is out of reach

Prices for the parts you do **not** own are fetched the moment you open a set. They are
in no inventory, so nothing had ever asked for them — it is half a dozen lookups, on your
click alone.

---

## Baro's shopping list

Baro stands in a relay for two days out of every fourteen and brings a dozen or two items
with him. His list in game shows prices and names — never whether you already own the
thing. Checking means leaving the vendor, walking into the arsenal and searching by hand,
per item.

The **Baro's offer** mode lines his manifest up against your inventory and splits it in
two: what you do not own, and what is already yours. Above it stand the numbers that decide
the visit — how many items you are missing, what they cost in ducats and credits together,
and whether your purse covers it or how far short you are.

Items you have never levelled that would give mastery carry a **new mastery** mark. A
weapon you only hold the blueprint for says so rather than counting as owned.

**The match runs on paths, not names.** The world-state source gives a `uniqueName` with
every item on the manifest, and that is the only reliable coupling: DE writes the same
scarf as "Prime Revenant Cape" in the shop and "Revenant Prime Cape" in your wardrobe, and
cosmetics have no export you could resolve names against at all. The one wrinkle is a
`/StoreItems/` segment that the shop path carries and the inventory path does not — it is
dropped on both sides before anything is compared.

### While he is travelling

DE publishes the manifest **only once Baro has arrived.** For the other twelve days there
is no list — not next week's, none at all — and a guessed one would be worse than nothing.

So Argus keeps a copy of the manifest whenever it sees one, and shows it while he is away,
labelled as what it is: the offer from his last visit, not a promise about the next. Open
the tab once while he is in the relay and the list is there for the fortnight after.

---

## What this does not know

- **Prime Resurgence.** Varzia rotates vaulted relics back into reach for Aya every month
  and DE publishes no drop table for it, so "vaulted" here means precisely *it drops
  nowhere*. See [known limits](limits.md).
- **What Baro brings next.** See above — nobody knows until he lands.
- **Platinum prices for Baro's wares.** His items cost ducats and credits; they are not
  traded for platinum, so there is no market price to put beside them.

---

## Checking it yourself

```bash
npm run baro-test
```

Builds an offer out of your own inventory — things you demonstrably have and things you
demonstrably do not, both rewritten into shop notation — so the right answer is known
before the comparison runs. Then it checks the live source still carries a path with every
item, which is what the whole match hangs on. If Baro is travelling, Varzia stands in: same
source, same shape.
