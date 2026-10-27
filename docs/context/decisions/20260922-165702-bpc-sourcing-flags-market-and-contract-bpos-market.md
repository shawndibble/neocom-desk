# Scope decisions — BPC Sourcing flags market and contract BPOs; market lookup is lazy and capped (issue #1241)

_Recorded 2026-09-22 · issue #1241._

- **Market BPO Order Books are fetched lazily and capped: the chosen blueprint, else the 10 closest name matches of a typed search, else nothing.** ESI has no multi-type filter, so each type is its own request, and the tab's results can span thousands of types. A 300ms debounce keeps typing from starting a fan-out per keystroke; at most `ORDER_BOOK_FANOUT_CONCURRENCY` books are in flight. When more than 10 blueprints match, the tab says so. Rules out fetching for every type on screen. Contract BPOs need no fetch, so every copy row gets their badge.

- **The market lookup matches names across the whole SDE, not only the listed types.** An NPC-seeded BPO nobody has contracted is the case the issue exists for, and the listed-type search would never reach it.

- **With the Region filter on "All regions", market BPOs are read from the pilot's market hub region, and the tab names that region.** An Order Book is one region's. Contract BPOs follow the Region filter as-is, so "All regions" means every region for them. Orders at a Trade Hub's own station are marked.

- **"BPO may be cheaper" compares one row's own ask with the cheapest BPO's full price, and nothing else.** It holds when BPO price ≤ the copy's effective price. It never holds for a multi-type bundle or a zero-price barter, since neither has a price of its own. A no-buyout auction is judged on its starting bid, which the eventual price can only exceed. Runs are not compared and nothing is amortised. On a tie between a contract and a market BPO, the contract is named, because it may be researched. The badge's BPO follows the Region filter only. The ME/TE, runs, price and Space filters narrow the rows, not which BPO a row is compared against.

- **Market BPOs and Contract BPOs are two new Source toggles, both off by default.** The tab stays a copy search unless the pilot asks. BPO rows lead the list ahead of copies, so the copy snapshot's size never pushes them behind "Show all". The market source is labelled "Market (incl. NPC-seeded)" in the badge: ESI names no seller.

- **`contractOfferRows`, `marketSellRows` and `cheapestRow` stay in `features/industry/blueprintAcquisitionSources.ts` and are imported from there.** That module also depends on ESI and `features/market` types, so moving it into `src/engine` would not be a clean move.
