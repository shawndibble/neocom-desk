# Scope decisions — Build Plan material price basis: sell or buy orders

_Recorded 2026-09-05._

- **A Build Plan picks which side of its hub's order book its materials are
  costed at.** Stored as `materialPriceBasis` on the record: `'sell'` (fill
  the lowest sell orders, pay now) or `'buy'` (place buy orders at the highest
  bid and wait). Absent means `'sell'`, which is how every plan priced
  materials before this existed, so no stored plan changes meaning. Additive
  and unindexed — no schema version bump, same as `materialSourcing` beside
  it.
- **The product is never priced from the basis.** It stays on the hub's lowest
  sell whichever side the materials use, because an **Acquisition Verdict**
  asks what buying the product _outright_ costs, and buying outright fills a
  sell order. Pricing the product off the buy side would silently answer a
  different question — "what could I sell it for instantly" — under the same
  label. `buildVsBuy` therefore takes two maps, `hubPrices` and an optional
  `materialPrices`, and never learns the word "basis".
- **One plan, one basis.** The chosen map feeds the plan's own cost lines, its
  sub-build inputs, and its make-or-buy verdicts alike. A verdict's "buy it
  instead" side is a material purchase like any other on that plan, so quoting
  it at the sell side while the table quoted the buy side would have made the
  advice disagree with the numbers beside it.
- **A material with no buy order at the hub is unpriceable, not silently
  re-quoted at sell.** It joins `unpricedMaterials` exactly as a material with
  no listing at all already did. Falling back to the sell side would total a
  basket at two different bases and report it as one number — a plan that
  reads cheap because part of it quietly wasn't. Blank-with-a-reason beats a
  confident wrong total.
- **Switching basis re-computes, it never refetches.** One Fuzzwork aggregate
  already carries `sellMin` and `buyMax` together, so both maps are in hand
  from the same snapshot. The basis is deliberately absent from
  `BuildPlanDetail`'s `snapshotKey`; putting it there would spend a request
  and flash a loading state to read a number already loaded.
- **"Use all" moved next to Owned Material Source and dropped "detected" from
  its label.** The bulk fill spends exactly the stock that control scopes, and
  sitting a row apart in the Materials toolbar the two did not read as one
  thing. `OwnedStockScopeControl` takes it as an `action` slot rather than a
  prop pair, so it still knows nothing about sourcing patches.
