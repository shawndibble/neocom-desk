# Scope decisions — Moon owner view shows ore and quantity, never ISK value, rate or due (issue #5261)

_Recorded 2026-10-26 · issue #5261._

- **The moon owner's view holds ore and quantity per day line, never an ISK value, rate or due.** The owner sees what the in-game ledger shows; the accounting corporation's pricing stays its own. Per-day `valueIsk`, `dueIsk`, `pct`, `billable` and per-line `valueIsk` are no longer written; `typeId` and `quantity` are added, and `volume` stays (older clients read it). The summary totals (mined volume and value, accrued, paid, balance) stay.
- **No exception branch for a corp that is its own accounting corp.** The feeder view is only built for a feeder corporation under a collector; a corp's own book is the officer view and is untouched.
