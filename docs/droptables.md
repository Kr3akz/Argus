# Drop tables

*Every drop DE publishes, searchable in three directions — and what changed with the last update.*

[← Back to the README](../README.md)

---

The **Drop tables** tab holds the raw material behind everything else in Argus: every
reward table DE publishes, about 44,000 rows of them. Where the farming guide picks the
best nodes for fifty resources, this tab has *all* of it — every mod, blueprint, relic,
arcane and resource, at every node, bounty, enemy and syndicate.

## Three ways to search

- **By item** — *where does Serration drop?* Every place it comes from, best match first.
- **By location** — *what does Apollodorus give?* A node reads like its table in game:
  Rotation A, then B, then C. Works for bounties (`cetus 40`), special missions
  (`Arbitrations`, `Void Storm`) and relics (`Axi A1`) too.
- **By enemy** — *what does the Stalker drop?* The same search, narrowed to enemies.

Click an item in the list to see everywhere else it drops; click a location to see
everything that drops there.

## Filters

Source (missions, special missions, bounties, enemies, relics, syndicates, keys & vaults,
sortie), rarity, rotation A/B/C, region — planets, open worlds and relic eras listed
separately — mission type and a minimum chance. Each chip shows how many rows it would
leave, counted before the other filters, so a chip never disappears just because you
clicked its neighbour.

The search box may stay empty: filters alone are enough to browse — *every Rotation C
reward on Survival nodes*, for example.

**Relics** show Intact by default; pick another refinement, or *All four* to see the four
chances of a part next to each other. **Farmable now** hides relics that no longer drop
anywhere. Vaulted rows stay in the list but fade back, so you can still see what a relic
held.

## What the numbers mean

- **Enemy drops are two rolls.** First the enemy has to drop a mod or blueprint at all,
  then it has to be this one. The list shows the product — the Stalker drops the Dread
  blueprint at 32.4 %, not the 64.8 % the second roll alone would suggest — and the two
  factors sit next to it.
- **Average effort.** Every row says how many rotations, kills, cracks or bounties it
  takes on average. Hover it for the number that gets you there nine times out of ten:
  at 5 % that is 20 on average, but one player in ten needs 45 or more.
- **Relic rarity is worked out, not copied.** DE's tables label the three most common
  parts of every relic as *Uncommon*. Argus reads the rarity off the relic itself: the
  three chance tiers of an Intact relic are Common, Uncommon and Rare, and the other
  refinements follow the same part.
- **Syndicate offers** have no chance — you buy them. They show their standing cost
  instead.

## After an update

Argus asks for a small fingerprint of the tables when it starts and every six hours, and
downloads the full tables only when that fingerprint has changed. The refresh button at
the top asks right away and says whether anything was new.

When the tables did change, the tab says so at the top: how many drops are new, which
chances moved, what was removed, and which relics started or stopped dropping.
*Show changes* — or the *Last update* filter — narrows the list to exactly those rows.
New drops carry a *New* tag, changed ones their old chance (*↑ was 5 %*), and removed
ones stay visible, faded, with a *Removed* tag. The comparison is worked out once, the
first time you open the tab after the update, and kept until the next one.

## Where the data comes from

The tables are DE's own, as published on warframe.com/droptables, in the structured form
`drops.warframestat.us` makes of them. A handful of syndicate augments that DE lists
nowhere come from the item data of `api.warframestat.us`; they show up under *Other*.
Neither source is asked for anything about you — see [Is this safe?](security.md).
