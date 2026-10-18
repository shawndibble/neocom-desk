# Scope decisions — Price history draws daily open buy and sell prices from a Firestore snapshot

_Recorded 2026-10-18._

- **The history chart gets separate Buy and Sell lines, not one daily average.**
  ESI's `/markets/{region}/history` only records trades (average, high, low,
  volume, order count), so it cannot say what the buy and sell orders stood at.
  A new series of daily _open_ prices does: the highest buy order and the lowest
  sell order standing at the end of each UTC day. ESI history stays the source
  of the volume bars, the per-day tooltip and the table; the open series adds
  the lines. Where a region or item has no open series (an untracked region, or
  before the backfill reaches it) the chart falls back to ESI's average line as
  today.
- **Source: EVE Ref's twice-hourly market order snapshots**
  (`data.everef.net/market-orders/`, every order in every region). Fuzzwork has
  no history endpoint (only current aggregates), and ESI's own order endpoint
  is the live book, not a past day. One snapshot per UTC day is read: the last
  one of the day, so the figure is that day's final price.
- **A scheduled function `syncMarketOpenPrices` (daily) folds that snapshot
  into Firestore; a one-off backfill script seeds the past.** Tracked regions
  start as the five Trade Hub regions (The Forge, Domain, Sinq Laison,
  Metropolis, Heimatar) in one constant, so widening it is a one-line change. A
  region outside it still draws on the chart from ESI history alone. The
  backfill script is deleted once it has run (it lives under `scripts/` with a
  header saying so).
- **Layout: one document per region and type.** _Superseded by
  `20261018-164126-open-prices-one-document-per-type-every-hub.md`: one
  document per type in `marketOpenPricesByType`, every hub region in it._ Collection `marketOpenPrices`,
  document id `<regionId>_<typeId>`, fields `regionId`, `typeId`, `dates`
  (ascending `YYYY-MM-DD`), `buy` and `sell` (parallel arrays of price or
  `null`), capped at 400 days. Firestore forbids arrays of arrays, hence the
  parallel arrays. One document read gives an item's whole history in a region,
  which is all the history panel asks for. Public read, admin-only write. About
  60,000 documents written a day for five regions.
- **The history panel gets a series select, "Buy / Sell", "Buy", "Sell".** With
  several regions compared, two lines per region quickly crowds the chart;
  picking one side halves it. The Market tab in Show info and the Market
  Browser's Price History are the same component, so both get it.
- **Item Detail's Market tab has no hub picker.** Compare regions picks the
  regions outright: the first pick is the main line and the summary, the rest
  overlay it.
- **Cost:** `syncMarketOpenPrices` is one more Cloud Scheduler job past the free
  three (eleven scheduled functions in the deployment).
