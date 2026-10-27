# Scope decisions — Variations Compare is the Compare drawer's Attributes view; Compare hubs stays Appraisal's (issue #1425)

_Recorded 2026-09-24 · issue #1425._

- **`VariationsCompareModal` is deleted; the Variations table's "Compare"
  button and "Compare Variations" row action now add their rows to the
  **Compare Set** and open the **Compare** drawer on a new Attributes view,
  instead of opening a separate `Modal`.** Round 24 (`20260902-102845`)
  accepted "Compare names two things" as tolerable and round 8
  (`20260831-140406`) ruled out a modal or tab for the drawer because either
  would hide the order book the user is cross-referencing — the Variations
  modal was exactly the shape round 8 ruled out, just under a different name.
  This ticket supersedes round 24's "two Compares accepted" and "modal"
  points; round 8 itself still stands and is what the new Attributes view
  follows. The drawer gets a Prices/Attributes switch in its header; Prices
  is today's order-book summary table, Attributes is the old modal's dogma
  matrix (`CompareAttributesMatrix.tsx`), fed by the same Compare Set rather
  than its own implicit, capped item list.

- **Opening from Variations merges into the existing Compare Set rather than
  replacing it, and includes the selected item alongside its variants.**
  Nothing the player already built into the set is thrown away by a
  Variations "Compare" click, and the attribute union handles a mixed set of
  items fine. The selected item was excluded from the old modal because it
  wasn't a row in the Variations table, but once the compared set is the
  same Compare Set an item can be added to from anywhere, "this vs its
  variants" is what a player opening the drawer from Variations most likely
  wants. The rows added are the same `VARIATIONS_LIMIT`-capped set the table
  already shows, not the uncapped variation group — the cap exists so the
  table itself stays a scan rather than a scroll, and lifting it here would
  fetch dogma for every variant just to feed a comparison nobody asked to see
  in full.

- **Estimated Price in the Attributes view reads the drawer's own order-book
  location, not the Variations table's `stationFilter`.** The two already
  agree when no station filter is set (both read `loadOrderBookView` off the
  same cache), and one number per item that holds across both drawer views is
  worth more than an Attributes column that would silently disagree with the
  Prices view's own Best Sell column whenever a filter is active. Threading
  `stationFilter` into `useCompareRows` would change the Prices view's
  numbers too, for every Compare Set item, not just ones opened from
  Variations.

- **Appraisal's Compare hubs is untouched and keeps its name.** Its axis is
  hubs, not items — one pile priced at each of the five trade hubs, from
  Fuzzwork's station aggregates, not an ESI order book. #726 already weighed
  folding a multi-hub mode into the Compare drawer and rejected it (five
  regions × per-type paginated ESI books) in favor of a Quickbar → Appraisal
  handoff, and `20260908-164742` keeps Appraisal hub-only for the same cost
  reason. Rebuilding Appraisal's Fuzzwork parsing inside the drawer, or
  multiplying its ESI calls fivefold to match, buys nothing this ticket
  needs.
