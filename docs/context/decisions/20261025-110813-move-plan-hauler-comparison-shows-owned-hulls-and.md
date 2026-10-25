# Scope decisions — Move plan hauler comparison shows owned hulls and jumps (issue #5166)

_Recorded 2026-10-25 · issue #5166._

- **Owned hulls are the pilot's own assembled ships only.** Packaged hulls, ships in containers or in space, and corporation hangars are left out: only a top-level station or structure copy has a place to measure from.
- **Distance is from each character's Current System to the nearest owned copy, on the saved Jump Basis, local graph only.** An unresolved system leaves the hull marked Owned with no count; an unreachable or unknown route reads "jumps unknown", never 0. The row's accessible label names the character the count is from.
- **The engine only carries the count (`MoveHull.ownedAt`).** The feature layer computes it. The planner's ranking is unchanged.
- **"Owned first" is a `FilterChip` toggle beside the Hauler picker.** It reorders the comparison list and the picker options, owned group first, ranking kept inside each group. Off by default.
