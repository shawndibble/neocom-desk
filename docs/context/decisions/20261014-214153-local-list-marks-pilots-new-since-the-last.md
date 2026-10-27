# Scope decisions — Local list marks pilots new since the last paste (issue #3796)

_Recorded 2026-10-14 · issue #3796._

- **A pasted Local list tags pilots who were not in the previous paste, only when at least half of its names were.** Below `MIN_LOCAL_OVERLAP` (0.5 of the new paste, names compared case-insensitively) the two pastes are different systems, so no marker and no count; the first paste ever has nothing to compare with. A small "New" text tag follows the name (amber for a Dangerous or Active pilot, muted otherwise) and a header line reads "N new since last paste". It never changes grouping or row order. Rules out marking departed pilots, alerts, chat logs and cross-device sync.
- **The previous paste is the names only, kept under the device-local Dexie key `local.lastPaste`.** No `sync.` prefix, so it never reaches Firestore, and it is never logged. Re-pasting the same names leaves it untouched (`src/features/travel/lastLocal.ts`, the D-Scan `lastScan` pattern).
