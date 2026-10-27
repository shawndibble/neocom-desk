# Scope decisions — Damage Profile selection is global and synced, not per Fitting (issue #1545)

_Recorded 2026-09-24 · issue #1545._

- **The selected Damage Profile is one global, synced choice, not stored per Fitting.** It is the pilot's lens on every fit ("what am I tanking tonight"), so it carries across fits and devices (`sync.fittingDamageProfileId`, next to the custom list in `sync.fittingDamageProfiles`). It stays out of the `?f=` Share Link and out of saved Fittings — a shared link opens under the recipient's own profile. A stale or deleted selection falls back to uniform.
- **A running Reactive Armor Hardener adapts to the selected profile, so armor resists can move with it.** The engine models the adaptation; the Defense section labels the armor layer and shows the RAH's own adapted resists. Every other resist, and all raw HP, stay unchanged.
