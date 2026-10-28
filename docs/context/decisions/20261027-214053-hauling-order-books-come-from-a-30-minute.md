# Scope decisions — Hauling order books come from a 30-minute R2 snapshot, so the 40-item book cap is gone

_Recorded 2026-10-27._

- **The hauling scan's order-book pass reads each Trade Hub station's books from a 30-minute R2 object, not ESI per item.** ESI has no multi-type order endpoint, so each item cost a request and only the best 40 got books. The `public-data-hauling-books` job streams EVE Ref's latest market-order snapshot and writes `hauling-books/<stationId>.json` (`{ stationId, lastSyncedAt, asOf, types }`, each type `[sell, buy]` levels `[price, units, orders]`, best 10 per side). With the objects for every station the lanes use, every item that passes the price and demand checks gets books and the 40 cap is gone; list and instant modes alike. Rules out raising the cap on ESI.
- **The books are up to about an hour old** (EVE Ref's publish lag plus the 30-minute job). Prices in pass 1 stay Fuzzwork. The footer says how old the snapshot is. Only the best 10 price levels per side are kept, so a very large plan can be capped by the ladder's depth.
- **Missing or over 3 hours old falls back to ESI books for the best 40, cap included.** All-or-nothing across the stations a scan uses, as for demand, so one lane never mixes sources. When the snapshot is used and the ESI history fallback still cut the list, the footer says so (`cappedLineHistory`).
- **The job skips an unchanged snapshot with a HEAD request on `last-modified`** before the 20 MB download, and publishes nothing when a hub has under 1,000 types.
