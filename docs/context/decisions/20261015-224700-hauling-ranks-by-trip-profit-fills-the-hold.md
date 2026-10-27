# Scope decisions — Hauling ranks by trip profit, fills the hold until full, max price and max spend filters (issue #3894)

_Recorded 2026-10-15 · issue #3894._

Supersedes the shortlist order in `20260926-161750-hauling-opportunities-v1-scope.md` (the passes, caps and ESI budget stay) and the one-scan fill in `20261015-200102-hauling-trip-rail-fill-from-other-categories-item.md`.

Measured live, Amarr → Jita, 64,500 m³ general hold, default filters: ranked by price ratio, Ammunition & Charges planned 34,776 m³ and Everything 9,444 m³ (most lines stopped by "all that is worth buying" on high-ratio, thin-stock items). Ranked by trip profit, both filled the hold (64,500 m³ / 64,497 m³).

- **Both cheap passes rank by what the trip can earn, not by price ratio.** Pass 1 (hub aggregates): the ISK gap after a rough fee times the units listed at both ends (the smaller), a liquidity proxy from the same call. Pass 2 (history): the unit profit at the recent sale price times the units a lot could take — the share of a week's sales capped by what the origin lists. The minimum-gap filters stay; only the order changes. Applies to every scan: each category, Everything and the fill.
- **More of the market is scannable.** The Hauling categories add Manufacture & Research, Structures, Structure Modifications and Structure Equipment (minerals, planetary commodities, fuel blocks, ice products, deployables, rigs). Ships, blueprints, skills, SKINs, apparel and other no-volume groups stay out.
- **The fill keeps going until the hold is full.** One press of the fill scans every Hauling category except the rows already in the table, in batches (each a normal scan of the next-best items). It stops when the free space is (nearly) gone, a batch adds nothing, nothing profitable is left, the budget or max price binds, a batch cap is reached, or the user presses Stop — and says which. It works with Everything too. Each batch costs a scan's ESI budget; the ESI client's rate-limit handling applies.
- **Two filters: Max price per item and Max spend.** Max price per item hides rows whose origin unit price is above it, in the table and in the fill. Max spend is the Trip Plan's ISK budget, moved from the Cargo Space popover into the filters (one control, one store). Both are remembered like the other filters; a link's own value wins.
