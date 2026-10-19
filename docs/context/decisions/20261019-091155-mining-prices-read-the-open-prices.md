# Scope decisions — Mining prices read the Open Prices

_Recorded 2026-10-19. Supersedes the R2 layout, one-time migration and "client
reads R2 directly" bullets of
20261018-233051-mining-prices-from-the-open-prices-job; its station-level and
end-of-day bullets stand._

- **The Mining Overview, Moon Mining Tax and Corp Tax Book price a day from
  `open-prices/<typeId>.json`.** The `mining-prices/<hubId>/<YYYY-MM>.json`
  month objects held the same station fold for the 555 mining types, but only
  from the day the job started (Jita from 2026-07-22, copied from the retired
  `marketHistory`). The Open Prices backfill covers 400 days, so with one source
  every day it covers is a Jita 4-4 buy/sell day on the mining pages too.
  Before this, older days fell back to ESI's daily average (Overview) or
  today's live buy (both tax ledgers). One source also means the mining pages
  and Price History never disagree on a day's price.
- **One read per priced type, not one per month.** A page fetches the object
  of every type it prices (ores, their compressed forms, refined materials):
  tens of small cached reads instead of one or two. Held for an hour and shared
  with Price History's reader, so a page reopened in that window costs nothing.
  Accepted for the single source; the month layout existed only to keep this
  read count down.
- **Tiers.** A day priced at the hub station feeds `saved`. An object written
  before the #4279 station backfill re-run still holds region-wide days; those
  feed `historical` on dates the station has none. Once the re-run rewrites
  every object, `historical` stays empty and the region read can go with
  #4293's cleanup.
- **`syncMarketOpenPrices` no longer writes `mining-prices/`.** The station
  fold for mining types, the month merge, the `marketHistory` copy and
  `MINING_TYPE_IDS` (and its `build-sde` step) are gone. The maintainer deletes
  the `mining-prices/` prefix and the `marketHistory` collection after the
  functions deploy; nothing reads either.
- **Amounts on unbilled days can change.** A tax row on a day that had no saved
  price was billed at today's live buy; it now prices at that day's buy.
  Already-billed Statements keep their stored amounts, as before.
