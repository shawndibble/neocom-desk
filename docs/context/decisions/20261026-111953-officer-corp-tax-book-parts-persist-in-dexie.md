# Scope decisions — Officer Corp Tax Book parts persist in Dexie under their version stamps (issue #5243)

_Recorded 2026-10-26 · issue #5243._

- **The officer's other book parts (miners, statements, payments, dismissals, extractions, declarations, adjustments, writeOffs, feeders with payouts, meta, rebills) persist in Dexie (`corpBookParts`), keyed by Character + corporation + slot, each with its version stamp.** A reload with unchanged stamps reads the head doc and `meta/paid` only. Same privacy rules as ADR 0031: every wipe path of the `observed` copy (refused `meta/paid`, refused officer check, deleted book, Character removal, other-book switch, logout-all) wipes these too. Rules out a separate wipe path that could drift.
- **`BOOK_CACHE_MAX_AGE_MS` is 24 h, not 1 h.** The stamp forces any reload on change; the age guards only a stamp the server failed to write. Applies to the in-memory copy, the Dexie parts and the `observed` check.
- **`readRebills` goes through the stamped cache** (`openBook`, so it also waits on `meta/paid`). `ExportBook` still reads the audit log whole (`count = null`): it is a one-off export the officer asked for, and a cap would silently drop entries.
- **Deferred to follow-ups on #5243:** the server `updatedAt` backfill, dropping the 24 h full `observed` re-read (needs the backfill first), and the member-side delta read (`corpBookStore.ts`).
