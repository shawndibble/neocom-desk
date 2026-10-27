# Scope decisions — Yesterday closes at 00:30 UTC: 30-minute grace and a 00:35 sync tick (issue #5312)

_Recorded 2026-10-26 · issue #5312._

- **Yesterday closes at 00:30 UTC.** The default grace is 30 minutes (`DEFAULT_GRACE_HOURS` 0.5, mirrored by `BOOK_DEFAULTS.graceHours`), and `syncCorpTaxBooks` runs at 00:35, 06:35, 12:35 and 18:35 UTC (not :30: a scheduler fire a hair before 00:30:00 would leave yesterday waiting until 06:30). The 00:35 read is stamped after the day closes, so `lastReadWellAt >= dayClosesAt` holds and the day is Billable at once. A book that set `graceHours` keeps it; only the default moved. Supersedes the 6-hour default in the Day closing decision (`20261018-134401`) and the 6-hourly wording of ADR 0025 (cadence is still every 6 hours).
- **Risk accepted: late ore.** ESI caches the mining ledger for up to about an hour, so the 00:35 read can miss the last ~45 minutes of ore. That ore arrives after the day closed: a labelled correction on the next Statement (D22 for paid days). More common than with the 6-hour grace.
- **Existing books.** Books that never set a grace close days earlier. Additive, no data migration. Dev and prod share one Firebase project. The schedule change needs a manual `firebase deploy --only functions:syncCorpTaxBooks`.
