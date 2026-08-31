# Known limits

*What Argus cannot do, and where the data it shows stops being reliable.*

[← Back to the README](../README.md)

---


- **The MR display can be off by one.** MR XP per star chart node is not publicly
  documented; the calculation assumes 100. The item lists and the MR gains per item are
  **not** affected — those come straight from your profile data.
- **Prime Resurgence is invisible to the vault check.** Argus reads which
  relics currently drop and works out from there which prime parts are still
  farmable. Varzia's monthly Aya offering is not in any drop table, so a part
  marked `0/4` may well be buyable from her this month. "Vaulted" here means
  precisely: *it drops nowhere.*
- **Baro's next offer is not knowable.** DE publishes his manifest only once he is
  standing in the relay; for the other twelve days of the fortnight there is no list at
  all. Argus keeps a copy of the last one it saw and labels it as that — it does not
  guess, and no source can. → [details](baro.md)
- **The crafting chains only know what is in a recipe.** A weapon that requires another
  weapon appears; a weapon that merely *replaces* one (a Wraith or Vandal variant, an
  incarnon adapter) does not, because DE's recipes do not link them. Both are separate
  mastery either way, so nothing is lost — but the list is "what eats what", not "what
  supersedes what".
- Zaw/kitgun/amp parts are roughly classified.
- **Mod ownership needs the inventory.** The public profile contains no mod data
  whatsoever — ownership comes from the authenticated inventory fetch. Until that has run
  once, you tick mods off yourself.
- **Arcanes are not imported from Overframe.** They have their own slots and their own
  editor, but an imported build lists them as "unmatched" — Overframe's build API returns
  mod IDs only, and arcanes live in a different export file (`ExportRelicArcane`).
- **Which arcane fits which item is a guess from its name.** "Primary …", "Melee …",
  "Exodia …" and so on are DE's own naming, and the editor sorts by it. It only affects
  the order of the search results, never what you can pick.
- **Auction writing is still unverified.** Orders are measured end to end against a live
  account — create, edit, hide, mark sold, delete. Changing and closing *auctions* is not:
  it follows warframe.market's v1 pattern but has never run against a real auction. Where a
  path is inferred rather than measured, the code says so at the call.
- **Which fields an order needs depends on the item, and getting it wrong costs the whole
  request.** None of this is documented; all of it was measured against real orders:

  | The item has | Then | Otherwise |
  | --- | --- | --- |
  | `bulkTradable` (relics, arcanes, fish) | `perTrade` is **required**, and on create it must divide the quantity evenly | `perTrade` is **forbidden** |
  | `subtypes` | `subtype` is **required** — relic condition, fish size, mod variant | must be omitted |
  | `maxRank` | `rank` is **required** | must be omitted |

  A field that is forbidden *or* missing makes warframe.market discard the entire request, so
  a price change riding along with a stray `perTrade` is lost with it. Argus derives the rules
  from the item and shows only the fields that apply.

- **The API does not report all field errors at once.** A create request with one deliberately
  broken field came back naming only that field, leaving an unrelated forbidden field
  unmentioned — which read as acceptance and sent this implementation down a wrong path for a
  while. The absence of an error is not evidence that a field is allowed. Test one rule at a
  time, against a real order.
- **Trade history carries no trading partner.** `closed_orders` records item, quantity,
  unit price and the closing date — not who you traded with. Rows from warframe.market
  therefore show no partner, while rows you add yourself can.
- **Trade history needs a profile name.** It hangs off `/v1/profile/{name}/statistics`, so
  an account with no in-game name set on warframe.market has nothing to fetch. The tab says
  *local only* in that case rather than showing you an empty list.
- **Warframe.market can close the v1 door too.** The sign-in only works because their older
  endpoint has no app-identity check. If they add one there as well, third-party sign-in
  ends — not just for Argus, for every tool of this kind. Nothing in this repo can work
  around that, and nothing should try.
- **Auctions can be edited, not created.** A new riven auction needs weapon, attributes,
  rolls, mastery and polarity — that is its own form, and it is not built yet. Create the
  auction on the website; Argus picks it up from there.
- **Trading is warframe.market, not the game.** Argus cannot see whether a trade actually
  happened in game. *Sold* is you telling it, and the history is only as accurate as your
  clicking.
- **Endo without an Overframe source is estimated.** The built-in formula (doubling per
  rank) lands about a factor of 2 below Overframe's value, probably because duplicate
  mods are counted there. For imported builds the exact source value is used.

---
