# Scope decisions — Hauling is a hub price gap and a distance, not a costed net

_Recorded 2026-09-06._

- **"Haul to another trade hub" ships as a price gap and a jump count, never as
  a net per unit.** The earlier deferral held that hauling could not be priced
  because no hub prices were loaded. Hub prices turn out to be cheap — one
  Fuzzwork aggregate per hub station, the call the page already makes for every
  order's own station. What stays unknowable is the cost of moving the stock:
  a courier charge varies by route, volume and collateral, and no ESI endpoint
  carries it. So the section states what each hub bids, what that is worth over
  selling here, and how far away it is, and says outright that the hauling cost
  is not in the number. This rules out an ISK/m3 rate the player types in,
  which would have made this the first row in the section built on a value the
  app cannot check.
- **The comparison is against the best IMMEDIATE local exit, not the best exit
  overall.** A hub is offered only when it bids above the best buy order at the
  player's own station, or — when there is none — above the price this order is
  already asking. Measuring against `hold` instead would suppress real rows: an
  optimistic ask that may never fill is not something a hub has to beat.
- **A hub row survives a missing Order Floor, unlike every `OrderExit`.**
  `orderExits` returns nothing without a floor, because every exit it prices is
  a profit against a cost basis. "Amarr bids more than anyone here" is true with
  or without a linked build, so `hubHaulGaps` is a separate function and the
  rows render beside the "link a build" prose rather than instead of it. Most
  open orders have no linked production run; gating this on one would have made
  the feature invisible on the orders that most need it.
- **Hub prices are read per hub STATION, never per hub region.** Same
  restriction `orderExits` already applies to the player's own station: a buy
  order carries a range this app does not read, so one elsewhere in The Forge
  may not reach Jita 4-4 at all. Fuzzwork's `?station={id}` gives exactly the
  station-scoped aggregate this needs.
- **A hub keeps its row when the distance cannot be resolved.** An order parked
  in a player structure has no system this app can route from, so the jump count
  is blank there while the price gap still stands. The price is the part that
  decides whether hauling is worth thinking about.
- **A failed hub lookup says so; it never leaves "checking…" standing.** The
  refine comparison can fail quietly because its consequence is a greyed row.
  A sentence claiming a check is in progress when nothing is in flight is a
  claim the section's own honesty rule would not allow, so the failure is
  flagged and the next open of that order retries.
