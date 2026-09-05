# Scope decisions — Hand-build ARIA comboboxes rather than buy Radix (issue #505)

_Recorded 2026-09-05 · issue #505._

- **A text-input-attached listbox (arrow keys, `Home`/`End`, `Enter`,
  `Escape`, `aria-activedescendant`) is hand-built directly on the input and a
  `role="listbox"`/`role="option"` list, not bought from Radix.**
  `docs/DESIGN.md` says to reach for a Radix primitive before hand-rolling
  focus/keyboard/portal behavior for a new composite control, and
  `docs/plans/feature-parity/briefs/K-libraries.md` §4 names this exact shape
  — "a true single-select listbox with roving tabindex, typeahead, and
  `aria-activedescendant`" — as the one case on its list where a primitive
  earns its cost, concluding "if you must buy, buy Radix, not Base UI." Both
  read, on a first pass, like a directive to install something here. Neither
  is: Radix ships no Combobox or listbox-on-a-textbox primitive. The single
  `radix-ui` package (ADR 0004/0008) covers `ContextMenu`/`DropdownMenu`/
  `Select`/`Tooltip` — all trigger-opens-overlay controls — and none fit an
  always-visible list that grows under an input the user is still typing
  into. What K-libraries.md actually measured and priced under "buy Radix"
  was `@radix-ui/react-popover`, bought for its floating-overlay placement
  and collision detection. This ticket's result list renders inline, in
  normal document flow, directly under the input — there is no floating
  position to solve, so the one thing that primitive buys is not needed here.
  ARIA-APG's combobox-with-listbox-popup pattern (`role="combobox"` on the
  input, `role="listbox"` on the list, `role="option"` per row,
  `aria-activedescendant` tracking the highlight, no DOM focus movement) is
  implemented directly against that spec.

- **This is the shape to reuse, not re-derive, at the other two hand-rolled
  result lists the same code-review pass found:** `BlueprintPicker.tsx` and
  `SkillPicker.tsx` (`src/features/skills/planner/`) render the identical
  `<ul>`-of-`<button>`s pattern with the same missing keyboard support. Fixing
  those should copy this ticket's combobox wiring (and `comboboxNav.ts`'s
  pure highlight-index math, which has no per-feature state and can be
  imported as-is) rather than reopening the build-vs-buy question.
