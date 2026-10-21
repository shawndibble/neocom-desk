# Scope decisions — Price fallback when Fuzzwork is down

_Recorded 2026-10-21. Amends ADR 0002._

- **Fuzzwork stays the primary price source; two sources sit behind it.** A lookup that throws, or whose whole batch comes back with no price on any type, falls through to (1) ESI region orders folded to the station, then (2) the daily open prices in R2. One seam: `fetchAggregatesWithFallback` in `src/market/priceFallback.ts`, called from `prices.ts`. `fuzzwork.ts` is unchanged.
- **ESI step: exact and live, but small.** One `GET /markets/{region}/orders?type_id=` per type, at most 50 types and 4 at a time. Orders are filtered to the station (`location_id`), so the result matches Fuzzwork's station aggregate. All or nothing: a failed or truncated book abandons the step, because a partial book quotes a wrong best price. A non-hub station resolves to its region through the SDE snapshots; a player structure or an unreadable snapshot skips the step. Region scope (`getRegionSellPrices`) uses the same step unfiltered.
- **R2 step: yesterday's close, hub stations only, flagged stale.** The last day of `open-prices/<typeId>.json`; no volumes (0). Never used for region scope (it holds the hub station's price, not the region's lowest). A type is `stale`, not cached in memory or Dexie, so the next ask retries Fuzzwork.
- **`PricesWithStatus.stale`.** `unreachable` now means no source answered. The Appraisal shows one amber line (`market.appraisal.pricesFromYesterday`) when its prices are stale. Other pages do not label it yet; they show the figure as before.
- **Callers that compare with a live order refuse stale prices.** Price alerts, the market-orders poll and the undercut/competition read pass `allowStale: false`; a stale type reads as unreachable there, so yesterday's close cannot fire a false alert or undercut.
- **Outage is remembered for 60 s.** After Fuzzwork throws, lookups go straight to the fallback so each ask does not wait out the 15 s timeout.
- **Order counts have an ESI step only** (`fetchOrderCountsWithFallback`): R2 holds no counts.
- **Not changed:** the nightly SDE refresh still reads Fuzzwork's CSV dump; a failure there leaves the baked data in place and shows nothing to users. Janice, EVE Tycoon and Adam4EVE stay rejected (ADR 0002: no CORS or a key in the bundle).
