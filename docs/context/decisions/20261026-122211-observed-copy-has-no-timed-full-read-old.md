# Scope decisions — Observed copy has no timed full read; old rows are stamped once (issue #5243)

_Recorded 2026-10-26 · issue #5243._

- **The officer's `observed` copy never does a timed full read.** `OBSERVED_FULL_REFRESH_MS` is gone. A full read happens only with no copy, no watermark, a clock that ran backwards, or a book whose `createdAt` differs from the copy's (deleted and turned on again while the device was away; the copy stores `bookCreatedAt`). A copy from before `bookCreatedAt` was stored reads in full once. Amends ADR 0031.
- **The server stamps old rows once.** `backfillObservedUpdatedAt` (functions/src/corpTaxBookObservedBackfill.ts) runs from the sync (officer's and scheduled), stamps every `observed` row without `updatedAt` with the epoch (older than any real write, so a device already holding the row never sees it as changed), and marks the book in `meta/observedStamped`. Best effort: a failure never fails the sync. No new callable, no deploy step beyond the usual functions deploy; additive.
- **No separate "unsettled tail" read on open.** A write to a recent day stamps `updatedAt` and the stamp moves, so the delta already returns exactly the changed tail; a re-read of the last days each open would cost reads for nothing.
- **`readAudit` is always limited.** It supersedes the earlier "export reads the audit log whole" call: the export carries the newest 2000 entries (`EXPORT_AUDIT_LIMIT`).
- **Deferred to a follow-up on #5243:** the member-side delta read (`corpBookStore.ts`), which needs its own Dexie table for the member's own lines.
