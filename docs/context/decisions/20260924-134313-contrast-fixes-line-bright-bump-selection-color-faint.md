# Scope decisions — contrast fixes: line-bright bump, selection color, faint-token audit (issue #1491)

_Recorded 2026-09-24 · issue #1491._

- **`line-bright` moved from `#3d4c5f` to `#586c86` and now doubles as every
  field's resting border.** `line` was only 1.35:1 against `panel-2`, below
  the 3:1 floor for a visible edge; `line-bright` at its old value was only
  1.94:1, also short. Rules out adding a third, input-only border token —
  `line-bright`'s own meaning ("emphasized separator") already covers a
  resting field edge, and every other place it's used only gets more visible,
  never less.
- **Placeholder text moved from `text-faint` to `text-dim` app-wide**
  (`fieldBaseClassName`). `text-faint` is ~3.1:1 on the field fill; `text-dim`
  clears 6.5:1+ there. `Select.tsx`'s `data-[placeholder]` variant already did
  this — the fix just brings the plain-input path in line with it.
- **`::selection` background moved from `accent-dim` (`#2e7da3`, 3.7:1 with
  `text`) to a new `selection` token, `#276c8d` (4.64:1).** `accent-dim`
  itself is documented fills/borders only, never text — darkening it further
  for text selection needed a value nothing else uses, so it got its own
  token rather than a bare hex sitting outside `@theme`.
- **Every "meaningful" `text-faint` site found by grepping the whole app
  (not just the ticket's named examples) was moved to `text-dim`, not just
  the ones the ticket named.** The acceptance criterion ("remaining uses are
  decorative or disabled only") is global, so a partial pass would leave
  the same bug elsewhere under a different component name. Icons marked
  `aria-hidden`, `::marker` bullets, drag-handle grip icons, and
  `disabled:`/`data-[disabled]:` variants were left alone — those are the
  decorative/disabled carve-out the token's own doc comment describes.
- **Where two tiers of a hierarchy both landed on `text-dim` (EntryList's
  priority pill `low`/`normal`, DirectiveRow's tone `quiet`/`muted`), the
  fainter tier kept `text-dim` plus `italic` instead of reusing `text-faint`
  for contrast.** Preserves the visual hierarchy the component's own comment
  calls out, without a color pairing that fails AA.
- **AdvisorSummary's legend bullet (`■` glyph in `text-accent-dim`, 3.7ish:1)
  became a small bordered fill swatch (`bg-accent-dim` + `border-line-bright`,
  `aria-hidden`) instead of colored text.** `accent-dim` is fills/borders
  only per DESIGN.md — this stops using it as text rather than picking a
  different color that would break the "swatch matches the bar segment it
  labels" intent.
- **Every `opacity-50`/`opacity-60`/`opacity-70` site that faded real text
  below AA was found and fixed, not just Contracts** (an earlier pass here
  claimed Contracts was the only one — wrong; corrected after review caught
  two more):
  - Contracts' lapsed-row dimming (`opacity-50` on the whole `<tr>`, cutting
    both primary and secondary text below AA) → full-contrast row plus a
    `Warn` icon next to the existing stale-status tooltip. No opacity.
  - OpenOrdersPanel's zero-count problem chip (`opacity-50`, ~2.65:1) → the
    fade dropped outright. The chip's own `0` is the non-color cue the ticket
    asks for; no replacement styling needed.
  - AdvisorPanel's `UncolonisableCard` (`PlanetCard`'s `dim` prop,
    `opacity-70`, computed ~4.09:1 — just under AA) → the `dim` prop and its
    `opacity-70` class were deleted from `PlanetCard` entirely (it had this
    one caller). The card's own hint text already differs from its sibling
    `UnknownTypeCard`; the fade added nothing content couldn't already carry.
  - Industry chip's `opacity-60` (the "reserved" auto-build chip) → dropped
    outright — `text-dim` at full opacity already reads as visually muted
    next to the accent-colored active chip (different border, different text
    color), so no replacement fade was needed.
  - Checked and left alone: Worklist's rebuild-row `opacity-80` computes to
    ~5.6:1 even for its `text-dim` secondary line (text at 100% is ~6.6:1;
    80% of that plus a near-black background floor doesn't cross the 4.5:1
    line the way 50-60% opacity does) — no fix needed, and the rows already
    sit under an explicit "Rebuilds" label band.
- **`docs/routes/Styleguide.tsx`'s DataTable demo used the exact `opacity-50`
  row-dimming pattern this issue removes, right next to `DataTable.tsx`'s own
  doc comment now forbidding it.** Swapped for a `bg-danger/5` fill — same
  demonstrated capability (a row gets a class based on its data), no faded
  text.
- **DESIGN.md §7's "hairlines are decorative" line was stale once
  `line-bright` became a load-bearing 3:1 field border** — added the
  exception plus `line-bright`/`selection` rows to the measured-ratio table,
  so the doc's own accessibility section doesn't contradict its token table.
