# Scope decisions — Open prices at the hub station, not region-wide (issue #4279)

_Recorded 2026-10-19 · issue #4279. Supersedes the region-level part of
20261018-121126-price-history-draws-daily-open-buy-and-sell and
20261018-164126-open-prices-one-document-per-type-every-hub, and the
"Open Price is region-wide" contrast in 20261018-233051._

- **An Open Price is the hub station's, for every type.** Price History's Buy
  and Sell lines are the highest buy and lowest sell among orders placed _at_
  Jita 4-4, Amarr VIII, Dodixie IX-20, Rens VI-8 and Hek VIII-12, the price
  pilots trade at, not the best anywhere in the hub's Region. The fold is
  #4277's `StationPriceFold` (moved to `functions/src/marketOpenPrices.ts`,
  with `SNAPSHOT_HUBS`), run with no type filter, in the same single pass over
  EVE Ref's final daily snapshot. The range rule is #4277's: a buy order's
  `range` is ignored. The mining objects keep only the 555 mining types of the
  same fold (`stationFoldWrites(..., MINING_TYPE_IDS)`), so their output is
  unchanged.
- **Region-wide prices are no longer stored.** Nothing else read them (the
  client reader is the only consumer of `open-prices/`). The region fold still
  runs in the pass, only for the plausibility guards (`implausibleReason`,
  `shrunkRegion` and the `marketOpenPricesMeta/lastRun` counts), which keep
  their region semantics.
- **Object shape:** `open-prices/<typeId>.json` =
  `{ typeId, dates, stations: { <stationId>: { buy, sell } } }`, arrays
  parallel to `dates`, 400 days, same `mergeDays` semantics. During the
  transition an object may also hold `regions: { <regionId>: { buy, sell } }`
  over the same `dates`.
- **Transition: keep both until the backfill re-run; each date holds one
  shape.** The daily job will write station days into objects the old backfill
  wrote in the region shape. `mergeDays` keeps a stored region day as a region
  day (null in `stations`) rather than dropping it, so no history is lost while
  the backfill has not been re-run; a station day for the same date replaces
  it, and `regions` is omitted once no region day remains (or the cap ages
  them out). The backfill re-run writes with `rewriteDays`, which drops every
  stored region day of each object it writes, so every type with a station
  price in the run leaves in the station shape (a day with no station order
  then has no point). A type with no station price in the whole run is not
  written and keeps its region days; once the client's old-shape read is
  removed it simply draws its average line, as a type with no hub orders
  should. Dropping region days on the first daily write was rejected: every
  chart would collapse to one day until the re-run.
- **The client reads both.** A hub region gets its station's series; an old
  object its region-wide series (labelled as before); a mixed object (between
  deploy and the backfill re-run) the two spliced by date under the station's
  name, so the lines neither lose their history nor stop at the deploy date
  for the hours the window lasts. The `regions` read is removed in a later cleanup
  once the re-run has finished.
- **Labels name the station.** A station series' Buy and Sell lines, legend,
  tooltip, table columns and CSV headers read "Jita 4-4 buy" whether or not
  regions are compared (`TradeHub.stationLabel`). Volume, order count, the
  daily range band and the average stay regional (ESI).
- **Job duration.** Folding every type per station adds one map lookup per row
  and holds about as many pairs as the region fold already did; a type priced
  only away from the hub stations gets no new day, so the job writes no more
  objects than before. The 540 s timeout stays.
