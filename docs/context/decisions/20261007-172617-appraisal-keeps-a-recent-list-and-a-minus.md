# Scope decisions — Appraisal keeps a Recent list and a Minus owned setting, not named lists (issue #2868)

_Recorded 2026-10-07 · issue #2868._

- **Appraisal auto-saves its last 5 pastes as a Recent list; no named lists.** Re-pricing raw text keeps EFT fits as fits and costs nothing to store. Rules out list names, sharing, per-list hub or percent, and cross-device sync (local Dexie only).
- **"Minus what I own" counts station-level assets of every Character at one Trade Hub station (default: the header hub).** Containers and corp hangars are out of v1 (container scope is #2869). Needs the assets scope; disabled with a grant note otherwise. `subtractOwned` is a pure helper Fittings Copy multibuy (#2829) reuses.
- **The Hold bar compares packaged volume with the total of all Hauling Cargo Space holds, and shows only when a Cargo Space is set.** It does not model which Specialised Hold takes which item.
