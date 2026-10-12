# Scope decisions — Local history kept a year

_Recorded 2026-10-12._

- **Supersedes `20260922-204846-mining-overview-keeps-90-days-of-ledger-history.md`.**
- **The mining ledger, the Jita price snapshots and the Overview's net worth chart reach back a year (365 days), up from 90 / 90 / 30.** Device-only change; the Mining Overview gains a 1y range so the extra history is reachable. Net worth snapshots were never pruned locally (the 30 days was the widget's display window), so they still are not. Server-side limits are untouched: shared market history in `functions/src/marketSnapshot.ts` still keeps 90 days, so ledger days older than that can only be priced from a saved snapshot.
- **Help › FAQ answers "How long is my data stored?"** from `RETENTION_GROUPS` in `features/faq/whatWeStore.ts`, for both the device and the server.
