# Scope decisions — A book with moon owners syncs without refineries of its own (issue #4616)

_Recorded 2026-10-20 · issue #4616._

- **An empty observer list is a successful sync once the book holds any moon owner record.** This narrows 20261020-103802. A book that only collects for others has no refineries by design. Treating its empty list as `no-refineries` skipped the scheduled run before the journal read, so it got no `lastSync`, no donations, no settling and no payout reconcile. The health strip's "needs refineries" warning is hidden for such a book too. A book with no moon owner record keeps the old `no-refineries` outcome.
- **A departed moon owner counts.** A record with status left, removed or disconnected still has payouts to reconcile against the wallet, so any record in `feeders` qualifies, not only active ones.
- **A 403 on the observer list stays `esi-refused`** for every book, as before.
