# Scope decisions — Miner totals: frozen part only, recomputed per touched Miner, verifier repairs (issue #5255)

_Recorded 2026-10-26 · issue #5255._

- **`minerTotals/{minerId}` holds only what stored records fix.** Billed, paid, dismissed, tolerance and officer write-offs, credit, balance, owed, lifetime mined units/value/tax (from frozen Statement lines), last paid, `overdueAt`, open declarations, character ids. Unbilled vs pending, overdue days and paused depend on prices and the clock, so the device computes them from the open set (ADR 0032 "phase 1 decides"). Standing is never stored.
- **A Miner's totals are recomputed from that Miner's records, not patched by deltas.** An event names the touched Miners (`editScope`); only those are recomputed and rewritten if changed. Deltas would duplicate FIFO payment allocation and drift. The property test proves the touched-Miner rule equals the full recompute.
- **Regroup does not move totals.** The engine keeps Statements and payments under the Miner id they were issued with, so totals follow stored ids; a regroup refreshes the affected docs (character ids, absorbed docs pruned).
- **Extraction changes are repaired by the verifier, not on the event.** Extractions only decide which Statement lines a moon or extraction dismissal waives; the daily verifier re-plans every Miner.
- **The verifier runs inside `dailyHousekeeping`**, not a new scheduled export; it writes `meta/minerTotalsHealth`, an audit entry on any mismatch or overlapping pulls, and repairs the docs.
