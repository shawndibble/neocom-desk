# Scope decisions — individual build plan craft sweep drops depth, confirmation, and reactions chip

_Recorded 2026-09-10._

- **A single Build Plan's Craft Sweep control (`BuildPlanCraftSweepControl.tsx`)
  is a separate, simpler component from the Build Group's
  (`CraftSweepControl.tsx`), not a mode of the same one.** The two now
  diverge enough — no header/tooltip, no Sweep Depth, no confirmation — that
  sharing one component would mean threading feature flags through it for
  no shared behavior left worth keeping in common. `CraftSweepControl.tsx`
  is untouched and still backs `BuildGroupPanel`, where a sweep's larger
  blast radius (every member plan) still earns the header, tooltip, Sweep
  Depth choice and overwrite confirmation from the original
  `20260909-212715-craft-sweep-*` decision.

- **The single-plan sweep always walks the whole tree — no Sweep Depth
  control**, on direct instruction. `applyCraftSweep` passes
  `craftSweepMaxDepth` (the plan's own actual tree depth) directly; there is
  no "All levels" sentinel to resolve because there is no shallower choice
  offered. The group control keeps its own Sweep Depth choice unchanged.

- **The single-plan sweep applies immediately on press — no overwrite
  confirmation modal**, on direct instruction. This reverses that bullet in
  `20260909-212715-craft-sweep-*` for this surface only; the group control's
  confirmation stands.

- **The individual control's Craft Scope shows Manufacturing (active) and
  Planetary (reserved) chips; Reactions is not shown at all.** Not a
  multi-select — `resolveMaterial` still only honors a `buildHere` entry for
  a manufacturing recipe (module doc, `materialResolution.ts`), so Reactions
  and Planetary stay non-functional here exactly as in the group control.
  Reactions was dropped from this surface's chip row on direct instruction;
  Planetary stays as a reserved slot, matching the group control's chips.

- **The "Part of {{group}}" hint and its tooltip are gone from the single
  Build Plan view**, along with the `groupName` prop that fed them
  (`BuildPlanDetail`, `Industry.tsx`'s `selectedPlanGroupName`). This
  reverses the "only new UI is a tooltip on the individual plan" bullet in
  `20260909-212715-craft-sweep-*` — that tooltip is judged no longer worth
  the row it occupies; a plan's Build Group is still reachable from the
  group's own panel, which already recomputes live from every member's
  current state on every open.

- **The remaining Sweep Strategy `Select` and the following
  `OwnedStockScopeControl`'s `Select` share one visual treatment** —
  default (`md`) field size and an unstyled (non-dimmed) label — so the two
  stacked rows read as one control family instead of the Craft Sweep row
  looking visually smaller/dimmer than the row immediately beneath it.
