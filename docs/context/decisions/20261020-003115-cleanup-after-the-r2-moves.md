# Scope decisions — Cleanup after the R2 moves (issue #4293)

_Recorded 2026-10-20 · issue #4293._

- **The open-prices client reads stations only.** The `regions` read, the region/station splice and the mining `historical` tier feed (`loadHubSnapshotRange`) are gone now the backfill re-run has finished. The pure `TaxPriceSource` `'historical'` tier in `src/engine/miningTax/priceBasis.ts` stays: nothing feeds it any more, but removing it is an engine change outside this cleanup.
- **The `marketHistory:` esiCache prune rule stays for now.** Mining prices stopped writing those rows on 2026-10-19 and the rule's retention is `MARKET_RETENTION_MS` (7 days), so a browser can still hold a row until about 2026-10-26. Drop the rule after that.
- **`MARKET_HISTORY_USER_AGENT` is `PUBLIC_HOST_USER_AGENT`.** It is the User-Agent for every public data host, not market history alone.
- **`openSideLabel`'s `region` param is `place`.** It is passed a station or a region name. The i18n keys and `{{region}}` variable are unchanged.
- **`chunkedSnapshot` is `r2Snapshot`.** Nothing is chunked any more; R2 is the only store (ADR 0019).
- **`ContractSearchPanel` has no "full snapshot" branch.** `loadPublicContractOffers` returns no rows, so the panel always reads the index plus the per-type objects.
