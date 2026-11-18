# Scope decisions — Build Plan sale price overrides the hub price (issue #6391)

_Recorded 2026-11-18 · issue #6391._

- **A plan's Sale price replaces the hub's lowest sell for the product everywhere.** Revenue, margin, break-even, the Acquisition Verdict, the plan list, Group Rollups and Compare all read it; blank keeps the hub price. It is applied to the market snapshot, so no figure can disagree. It is per unit, ISK, and skips the troll-price cap, since it is the pilot's own number. Compare re-pricing at another hub keeps it fixed. Rules out per-region prices and selling across several hubs. The field is additive (`productSalePrice`), so dev and prod stay compatible.
