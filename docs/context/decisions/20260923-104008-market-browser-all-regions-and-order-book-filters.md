# Scope decisions — Market Browser All regions and order book filters

_Recorded 2026-09-23._

- **Market Browser's region picker gains "All regions".** User request. Stored
  as `regionId: 'all'` in the Location Mode setting and `?region=all` in the
  URL — a sentinel apart from `null`, which still means "not picked, read the
  hub's region". Default stays Trade Hub mode.
- **Only the selected item's own order book fans out.** ESI has no
  cross-region order endpoint, so All regions costs one request per Market
  Region (~65) per item, each through `getOrderBook`'s 300s cache and
  coalescing, `ORDER_BOOK_FANOUT_CONCURRENCY` at a time
  (`fetchOrderBookAcross`). Variations, Compare, Item Detail and price
  history would multiply that per row, so in All regions they read the Trade
  Hub's region instead and one note under the item tabs says so.
  `OrderBookLocation.regionId` stays a plain number, so no single-region
  reader can receive `'all'`. A Global Market Region item still reads its one
  region.
- **A region that fails to load is named, never dropped silently.** Some
  failed: the rest show, with a count note. All failed: the failed-book state.
  Refresh clears the type in every Market Region.
- **Jump Range limits which regions All regions fetches.** Once a range is
  measurable only regions holding an in-range system are fetched
  (`regionsForSystems`); while the range is still resolving the fetch waits,
  rather than firing every region and then a few. With no origin or no
  stargate snapshot it fetches every region, matching the range's "filters
  nothing and says so" rule.
- **The order book gets a funnel `FilterBar` like the other search pages:**
  Distance (the Jump Range), Security (the four `SPACE_KINDS` chips), Min
  quantity (`volume_remain` ≥ n) and NPC stations only (drops player
  structures). URL params `browser.jumps`/`sec`/`minQty`/`npcOnly`, written
  as one group. All apply inside `buildOrderBookView`, so summary, best
  price, spread and row cap match the table. Trade Hub mode shows and applies
  only Min quantity — the hub is already one NPC station. The filters narrow
  the main book only, like the Jump Range before them; Variations rows keep
  following just the station filter.
