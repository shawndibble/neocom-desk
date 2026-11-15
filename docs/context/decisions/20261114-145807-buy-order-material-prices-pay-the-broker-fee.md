# Scope decisions — Buy order material prices pay the broker fee for placing the order (issue #6167)

_Recorded 2026-11-14 · issue #6167._

- **On a Build Plan's Buy order basis, a material costs the hub's highest buy
  order plus the broker fee for placing that order.** Placing a buy order is
  listing an order, and CCP charges the broker fee on it exactly as on a sell
  order. Before this the basis quoted the bare bid, so a plan read 1.5–3%
  of its material cost cheaper than it is, on the basis cost-conscious
  builders choose. Buy now is unchanged: filling a sell order is instant and
  pays no broker fee.
- **This amends `20260902-202708-make-or-buy-marker-planetary-recipes.md`.**
  Its "sales tax and broker fee are not [included], since a material is
  consumed by the parent job and never listed" still holds for _selling_ a
  material, which a Build Plan never does. It never covered _buying_ one by
  placing an order, which is what Buy order means.
- **The rate is the product side's own rate.** The plan Character's Broker
  Relations, its base standings toward the hub's owner, and the hub's
  Safety Tax (Manifest's 5% is charged on non-instant buy orders too), all
  through `brokerFeePct`. A token without the standings scope falls back to
  zero standing, as the product side already does. Plan hubs are NPC trade
  hubs, so there is no hand-entered structure fee to apply.
- **It is folded into the one material price map** (`materialPricesFor`, per
  `20260905-223106`), so the plan's cost lines, sub-build inputs, make-or-buy
  verdicts, Build Groups, Opportunities and the shopping list all pay it
  alike. In a make-or-buy verdict both sides are buy-order purchases, so the
  fee mostly cancels there; keeping it rather than special-casing it avoids
  two prices for one material on one plan. A material with no buy order
  stays unpriced; the fee never invents a price.
- **One placement, so a floor.** Outbidding means modifying the order, and
  every modification pays again; the app cannot know how many times. The
  tooltip and the Calculation breakdown say the figure is at least this.
- **Left out:** the 100 ISK per-order minimum (prices are per unit, and an
  order is never one unit's worth), relist and modify fees, and the product
  side, which already paid its fee.
