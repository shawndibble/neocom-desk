# Scope decisions — Stops rows reorder by menu as well as drag (issue #6557)

_Recorded 2026-11-22 · issue #6557._

- **A Travel stop row with two or more stops carries a ⋮ row menu: Move up, Move down, Remove, and no ✕ button.** Drag alone fails WCAG 2.5.7 for a single pointer. Unlike Skill Plan rows (20260925-233737, which rejected a Move control for phone crowding), a stop row has no milestone menu, so the ⋮ replaces the ✕ instead of adding a slot; Remove sits in the menu so the ⋮ clears §6c's two-real-actions test. A lone stop keeps its ✕ (nothing to move).
