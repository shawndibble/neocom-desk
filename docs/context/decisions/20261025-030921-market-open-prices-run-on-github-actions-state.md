# Scope decisions — Market open prices run on GitHub Actions, state in R2 (issue #5070)

_Recorded 2026-10-25 · issue #5070._

- **The daily open prices fold runs as a GitHub Actions job (`public-data-market-open-prices.yml`, 00:45 UTC plus 01:30 and 02:15 slots), not the `syncMarketOpenPrices` Cloud Function.** Same `open-prices/<typeId>.json` objects, so the client is unchanged. The later slots read the state object and exit once the day is published; they replace Cloud Scheduler retries. The shrink guard's last-run record moves from Firestore `marketOpenPricesMeta/lastRun` to R2 `open-prices-state/last-run.json`, which starts empty (the first run has no shrink comparison). Guard trips and thin snapshots now fail the run instead of logging, so they show red. Rules out any Firestore access from the job; the function export is gone, so deploy order matters (see the PR).
