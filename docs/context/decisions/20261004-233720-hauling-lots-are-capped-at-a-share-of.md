# Scope decisions — Hauling lots are capped at a share of demand

_Recorded 2026-10-04._

- **A suggested lot is a quarter of a week's unmet sales, not all of it.** `HAULING_THRESHOLDS.ownShareOfDemand` (0.25) scales `(week's units sold − units ahead)` in `estimateSale`. A week of sales assumed one hauler wins every sale; on a fast seller (1M+ units a day) that suggested lots of hundreds of thousands of units, which no one moves in one trip because other sellers undercut and region volume includes trades a listing never sees. The figure is a placeholder like the other thresholds. Days to Sell is unchanged and still uses a one-day reference lot rather than the suggested quantity.
