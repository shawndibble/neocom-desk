# Scope decisions — Miner page read-model path reads all of a Miner's Statements and the ledger since the newest one (issue #5258)

_Recorded 2026-10-26 · issue #5258._

- **Read every Statement, payment, write-off, adjustment and declaration of the open Miner, not a page of Statements.** Payments allocate oldest-first across all Statements, so a partial set mis-states what is paid. Cost is one Miner's records (tens), never the ledger. "Load older" still pages the display by 10 rows.
- **Ledger rows are read only since the newest Statement's first day.** Older days are rebuilt from frozen Statement lines (D22), so they need no ledger row and no price. Rules out: late write-offs on Statements older than that, and dismissed or unrated days older than that, are not listed on the Miner page in the read-model path.
- **Header owed, credit and last payment come from the `minerTotals` doc when it exists and has the known schema;** otherwise the computed figures. A missing doc or index costs reads, never the page.
- **Needs a composite index on `observed` (characterId, date), deployed by hand with the functions and rules.** Without it the read falls back to the Miner's characters' whole ledger, filtered on the device.
