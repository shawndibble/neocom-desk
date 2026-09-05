# Scope decisions — Market order filled covers sell orders only

_Recorded 2026-09-05._

- **`marketOrderFilled` fires for a filled sell order and never for a filled
  buy order.** This reverses CONTEXT.md round 20, which made one event cover
  both directions on the grounds that a completed buy and a completed sell are
  the same thing happening. They are the same thing to the diff and a different
  thing to the person being told. A filled sell order is news: someone bought
  from you while you were doing something else, and there is ISK waiting. A
  filled buy order is the trade you already set up completing on schedule — and
  reported at the same volume as the sells, it buries the one you wanted.

- **The buy side is dropped in the diff, not at derive time.** `is_buy_order`
  now rides on `MarketOrderEntrySnapshot`, and `diffMarketOrderFilled` skips
  bids. Filtering in the polling layer would have been fewer lines and would
  have put the rule where nothing tests it; in the engine it sits beside the
  cases that pin it.

- **The event keeps its id.** Only the copy and the Settings label become
  "Sell order filled". `marketOrderFilled` is baked into stored per-character
  preferences, synced settings, Occurrence Keys and the notification-route map,
  so renaming it would silently reset everyone's preference for it and orphan
  existing feed rows.

- **The copy names the item and, above one, the quantity.** "Someone bought
  250 x Tritanium from Pilot." The name is resolved best-effort through the
  same `loadTypeNames` the Open Orders and Order History panels use — local SDE
  snapshot first, one batched ESI call for the rest, cached — and an id it
  cannot name renders as `#34` rather than holding the notification back.
  A quantity of one is left out: "1 x Tritanium" is noise.

- **Quantity is the order's `volume_total`.** That equals what actually changed
  hands only because a fill is recognised solely at `volume_remain === 0`; a
  partial fill never fires. Anyone adding partial-fill detection has to revisit
  it, which is why the field carries that note.

- **Adding fields to the snapshot deliberately invalidates the stored
  baseline.** `isMarketOrderEntrySnapshot` requires the new fields, so a state
  written by an older build fails validation, `pollerState.ts` parses it as
  `null`, and a diff with no baseline fires nothing. The upgrade therefore costs
  one quiet poll and then a fresh, complete snapshot. The tolerant alternative —
  defaulting the missing fields — would have read every stored buy order as a
  sell order exactly once, firing the notification this change exists to stop.

- **Grouping collapses less than it did yesterday, and that is the trade.**
  `20260904` shipped identical feed rows collapsing into "Market order filled
  x6". Now that the body names the item, six different items are six rows again;
  only the same item at the same quantity still collapses. That is the point —
  the rows are worth reading individually now — but it is a visible change to
  behaviour shipped one day earlier, not an oversight.
