# Scope decisions — Miner page read-model path reads all of a Miner's records and the ledger back to their oldest unpaid day (issue #5258)

_Recorded 2026-10-26 · issue #5258._

- **Read every Late notice, payment, write-off, adjustment and declaration of the open Miner, not a page of them.** Payments pay the oldest days first across the Miner's whole account, so a partial set mis-states what is paid. Cost is one Miner's records (tens), never the ledger. "Load older" still pages the display by 10 rows.
- **Ledger rows are read back to the Miner's oldest unpaid day** (decision 20261117-033049), and no further than the closed-through checkpoint (decision 20261120-235011). This first read back only to the newest calendar bill's first day, rebuilding older days from its frozen lines; the calendar bill is gone. Older days need no ledger row and no price, so late write-offs, and dismissed or unrated days, older than that are not listed on the Miner page in the read-model path.
- **Header owed, credit and last payment come from the `minerTotals` doc when it exists and has the known schema;** otherwise the computed figures. A missing doc or index costs reads, never the page.
- **Needs a composite index on `observed` (characterId, date), deployed by hand with the functions and rules.** Without it the read falls back to the Miner's characters' whole ledger, filtered on the device.
