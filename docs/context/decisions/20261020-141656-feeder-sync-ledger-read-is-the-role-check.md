# Scope decisions — Feeder sync: ledger read is the role check, stale clock runs from pointers (issue #4509)

_Recorded 2026-10-20 · issue #4509._

- **The ledger read is the feeder's role check.** The feeder grant carries only the mining scope, so the roles endpoint is unreachable. A 403 on the observer list or a ledger stands for a lost role, a revoked token or a holder who left; it marks the feeder stale and keeps the token (the role can come back). Calling any other endpoint with that token would only burn the shared ESI error budget.
- **The stale clock runs from the feeder → Collector pointers, not the grant docs.** A dead token deletes the grant doc, but the 30-day disconnect window must keep running, so the feeder pass iterates `corpTaxBookFeederOf`.
- **Disconnect keeps the pointer and the record.** Coverage closes on the last fully synced day, the token is deleted and revoked, nothing else is removed. Reconnecting (a new coverage period) belongs to the onboarding ticket.
- **A feeder's days are Billable off the feeder's own `lastReadWellAt`, not the book's `lastSync`.** The whole miner-day is withheld, so no miner is billed off a partial day. One stale feeder never holds the book or another feeder.
- **Feeder pulls never touch the Collector book's `lastSync` or gaps** (`mergeObservedInto`), which would make the Collector's own days look freshly synced.
