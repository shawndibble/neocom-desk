# Scope decisions — Wallet journal and transactions kept a year on this device (issue #3909)

_Recorded 2026-10-16 · issue #3909._

- **Every journal and transaction fetch upserts into `walletJournalArchive` / `walletTransactionArchive`, keyed by ESI id per Character, 365 days, never capped by count.** Own tables, not `esiCache` rows (replaced whole each fetch, wiped by "clear cache"). Matches `20261012-125835-local-history-kept-a-year.md`. Pruned on each archive write, by the `[characterId+date]` index.
- **The base loaders feed the archive; only the Journal page and Wallet's fill lookup read the union.** The poller's `loadWalletJournalWithStatus` returns ESI's window only, so its snapshot does not grow to a year of rows. Because the poll goes through the same loader, background polls feed the archive too.
- **Coverage is stored as merged `[from, to]` windows (`walletArchiveCoverage`).** A complete journal fetch covers 30 days back (or its oldest entry, if older) to the fetch. A fetch with a failed page covers nothing. A capped transaction cursor walk covers back to its oldest row only. A saved-copy read covers nothing. A gap between windows is shown on the Journal and is unrecoverable: ESI never serves it again.
- **90 days and 1 year appear as buttons beside the "History since" line, only once the earliest window reaches that far.** Hidden, not shown disabled. Personal journal only; the corp journal gets neither.
  - Removed at the owner's request: the buttons are gone; From / To in Filters cover date ranges.
- **Not in the encrypted backup, not synced** (like the mining ledger). Removed with the Character. Listed under both the device store and retention groups in the FAQ.
