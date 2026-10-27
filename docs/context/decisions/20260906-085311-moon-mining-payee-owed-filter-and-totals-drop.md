# Scope decisions — Moon Mining: payee-owed filter and totals, drop redundant status chips (issue #523)

_Recorded 2026-09-06 · issue #523._

- **Added a Payee filter (multi-select dropdown, same pattern as the existing
  Character filter) to the Moon Mining table.** Direct request: "I also want
  to be able to see how much I owe to individual payees, like filter by
  payee and it shows the total I owe them, that way i can pay them in one
  lump sum." Selecting one or more Payees narrows the table (an unassigned
  or dismissed row has no Payee, so it drops out as soon as a specific Payee
  is selected) and surfaces a dedicated "Owed to X" panel showing the sum of
  `taxOwed` across that selection's currently-`outstanding` Assignments —
  deliberately _not_ the same figure as the existing "Total tax owed" card,
  which sums `taxOwed` across every status (a running total, not a
  currently-owed balance).
- **The owed panel's "Select N for bulk pay" button feeds the existing
  bulk-pay flow** (`bulkPaySelection` → `BulkPayConfirmDialog`) rather than
  introducing a second payment path — "pay them in one lump sum" is exactly
  what that dialog already does; the new button is just a fast way to
  populate the selection from a Payee filter instead of hand-picking
  checkboxes.
- **`bulkPayRows` is now sourced from every display row (`allDisplayRows`),
  not just the currently `visibleRows`.** A selection made under one
  Payee/status filter combination must still resolve correctly if the user
  changes the filter afterward without clearing the selection — the bulk-pay
  action button's own label and enabled state now read `bulkPayRows.length`
  for the same reason, not the raw `bulkPaySelection.size`, so switching
  Payee filters after selecting can't leave a stale "Mark N paid" button
  bound to a different Payee's rows.
- **Removed the standalone status `FilterChip` row beneath the two filter
  dropdowns.** Direct request: "we have a status drop down, I don't need the
  additional unassigned, needs review, outstanding, paid and dismissed
  buttons" — the dropdown already exposes every status as a checkbox; the
  per-status counts that lived on the chips move inline into the dropdown's
  own item labels (`Status (n)`) instead of disappearing.
