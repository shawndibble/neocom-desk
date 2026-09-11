# Scope decisions — Build Group Craft Sweep: drop Sweep Depth choice, drop reserved Planetary chip

_Recorded 2026-09-10._

- **The Build Group's Craft Sweep control (`CraftSweepControl.tsx`) drops its
  Sweep Depth select entirely.** A sweep now always walks each member's whole
  material tree, the same behavior the single-plan control
  (`BuildPlanCraftSweepControl.tsx`) has had since
  `20260910-082156-individual-build-plan-craft-sweep-drops-depth-confirmation.md`.
  This removes the last behavioral difference in _scope_ between the two
  surfaces — the group control still requires an explicit Apply behind an
  overwrite confirmation, because one press there rewrites every member plan,
  a blast radius the single-plan control never has. `maxDepth` still bounds
  the group's Apply button (`disabled` when a group has nothing to sweep) and
  is passed straight through to `applyGroupCraftSweep` as the sweep's depth —
  only the player-facing choice of a shallower depth is gone.
  `BuildGroupCraftSweepDefault.depthChoice` (`buildGroups.ts`) is removed from
  the persisted per-group default alongside it; an older synced record that
  still carries the field is read with it simply ignored, not dropped
  wholesale — `usableCraftSweepDefault` now validates only `strategy`.

- **`CraftScopeChips` (`craftSweepShared.tsx`) drops the reserved Planetary
  chip and the `includePlanetary` prop that gated it, on both surfaces.**
  Planetary was never actually sweep-eligible (`craftScope()` never returns
  it), so the permanently-disabled chip repeated `20260910-144945-craft-
sweep-drop-manufacturing-chip-everywhere-drop-individual.md`'s own
  reasoning for dropping the Manufacturing chip: a chip that can never light
  up never carries information. The Reactions chip is now the only chip
  either surface renders. A future sweep-eligible Planetary method should add
  the chip back rather than un-reserve this one — nothing here assumes the
  glyph or copy survive unchanged.
