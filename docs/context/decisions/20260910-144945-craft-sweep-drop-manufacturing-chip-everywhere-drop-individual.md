# Scope decisions — Craft Sweep: drop Manufacturing chip everywhere, drop individual plan's Planetary chip and Apply button (issue #778)

_Recorded 2026-09-10 · issue #778._

- **The single-plan Craft Sweep control (`BuildPlanCraftSweepControl.tsx`)
  drops its Planetary chip and its labeled Apply button.** This supersedes
  the Planetary and Apply bullets in
  `20260910-082156-individual-build-plan-craft-sweep-drops-depth-confirmation.md`
  for this surface only. Changing the Sweep Strategy select now applies
  immediately, with no overwrite confirmation — a single plan's `buildHere`
  is cheap to hand-correct afterward. The Build Group's `CraftSweepControl.tsx`
  is unchanged: it still shows the Planetary chip and still requires an
  explicit Apply behind the overwrite confirmation, because one press there
  rewrites every member plan — a blast radius the individual control never
  has.

- **The single-plan control keeps a small icon-only re-run button
  (`Icon.Run`, `IconButton`) beside the select, despite dropping the
  labeled Apply button above.** A controlled `<select>` — Radix's own or a
  native one — never fires a change event for reselecting its
  already-shown value (`useControllableState`'s `if (value2 !== prop)`
  guard); without any button at all, the default Cost-effective strategy
  would be unreachable for any plan whose owner never touches the dropdown,
  and re-running the same strategy after hand-editing `buildHere` would be
  unreachable too. The icon button has no confirmation and no visible
  label — it stays far lighter than the group control's Apply-behind-a-
  confirm — but it is a genuine, if quiet, explicit press. On direct
  instruction once this gap surfaced during implementation. `Icon.Run` is a
  new export (`icons.tsx`), deliberately not `Icon.Refresh` — that glyph is
  documented as "re-fetch from ESI," and this button fetches nothing; it
  re-runs a local calculation.

- **`CraftScopeChips` (`craftSweepShared.tsx`) drops the Manufacturing chip
  entirely, on both surfaces.** `craftScope()` always includes
  `'manufacturing'` — every sweep, on every surface, includes it
  unconditionally — so the chip could never actually say anything; it only
  ever repeated what "Craft Sweep" already implies. Only the Reactions chip
  (and, where shown, the reserved Planetary chip) remain.

- **The Reactions chip always carries a tooltip, lit or not.** Previously
  only the disabled state had one ("Turn on Include Reactions to use this");
  the lit state now has its own ("Reaction materials are included when the
  sweep runs"), so a viewer doesn't have to guess what the chip means once
  it's active. Eligibility itself is unchanged — `craftScope()` lights it up
  when the plan's own activity is already a reaction, or when the plan's
  "Include Reactions" toggle is on; it has nothing to do with whether the
  plan's tree happens to contain reaction materials.
