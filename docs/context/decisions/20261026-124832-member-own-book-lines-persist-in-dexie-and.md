# Scope decisions — Member own book lines persist in Dexie and observed reads as a delta (issue #5243)

_Recorded 2026-10-26 · issue #5243._

- **A member's own book lines persist in Dexie (`corpBookParts`, slot prefix `member:`), each part under its version stamp.** A reload with an unchanged book reads the head doc and pointer only. Unlike an officer's copy they are not one-book-at-a-time (own lines only, so no privacy reason to drop a sibling Character's copy); they leave with Character removal and logout, and when the book turns hidden. A Character that moved corporation drops its old book's lines on the next save.
- **A member's `observed` rows are read as a delta on `uid == me` + `updatedAt >= watermark - 10 min`.** An `updatedAt` watermark, unlike the date window rejected in 20261024-230007, is not fooled by edits that rewrite past days. Needs composite index `observed(uid, updatedAt)` (`firestore.indexes.json`, additive; deploy with `firebase deploy --only firestore:indexes`). Until it is deployed the delta query fails and the read falls back to all own rows. No watermark, or a recreated book (`createdAt`), reads all own rows.
