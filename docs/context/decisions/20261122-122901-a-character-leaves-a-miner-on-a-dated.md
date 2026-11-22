# Scope decisions — A Character leaves a Miner on a dated day (issue #6545)

_Recorded 2026-11-22 · issue #6545._

- **Only `unlink` takes a date (`leftOn`).** Grouping, decline and confirm stay undated, so `snapshotDropper` still serves them. The date defaults to today and is never before the lock date (`refuseLocked`).
- **The old Miner records it:** `leftOn.<characterId>` on its doc (optional, additive, so dev and prod share Firebase safely). The Character leaves `characterIds` at once, and the Miner doc and account stay even if one Character is left, because it still owes the earlier mining.
- **`minerIdFor(character, miners, date)`** is the one rule: a grouping with `leftOn[character]` holds it for days before that date; otherwise `characterIds` decides. Mining entries and donations pass their own day; without a date it reads the current grouping.
- **A dated unlink clears no snapshot,** since no locked day changes. The pilot's "counts as yours" warning reads `characterIds`, so it drops a left Character on its own.
