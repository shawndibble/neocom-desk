# Scope decisions — Rows get controls by context, not by rule: ⋮ only for ≥2 real actions

_Recorded 2026-10-05._ The rules live in `docs/DESIGN.md` §6c, "Restraint:
decide by what is already there".

- **Why.** The interaction-grammar rollout applied "a table with a row menu
  always shows the ⋮" everywhere. Result: ⋮ on rows whose click already did
  the action, a ⋮ mid-row, a ⋮ beside a › caret, two controls on one line, a
  ⋮ on read-only data tables, and display tables turned into cards on phones
  where reading across columns was the point. Controls were added where the surroundings already carried the
  intent.
- **Check what is already there.** Row click, a visible link or name, a
  header or bulk action and the detail view come first. If one gives the
  action, add nothing.
- **A ⋮ needs two or more real actions** not reachable elsewhere in one tap.
  Show info, Copy, View in Market and duplicates of a visible control or the
  row click don't count.
- **One trailing control cluster**, right edge, never mid-row. Drop a › caret
  beside a ⋮. A destructive × beside a ⋮ goes into the menu as a danger item,
  or is separated.
- **Read-only display tables** get no ⋮, caret, actions or row menu, and skip
  `exportable` when export means nothing.
- **Cards vs table on a phone** is decided by how the table is read, not by
  interactivity. Compare tables, matrices, rosters and wide numeric tables
  stay tables (`responsive="table"`, horizontal scroll, key column pinned
  with `stickyStart`). Cards are for records read as a unit (mail, order,
  contract, offer) with text-heavy columns.
- **Duplicates:** keep the visible control, drop the menu item.
- **A removed control names its new home** in the PR.

Consequences:

- A menu with nothing worth a ⋮ is deleted outright (`RowActionsMenu`,
  `rowContextMenu`), not hidden. A row without a ⋮ has no custom right-click
  or touch-and-hold menu; the browser's native menu still copies text.
  Touch-and-hold opens a menu only wherever one exists.
- Menus that only held Show info / Copy / View in Market go away. Their
  actions stay reachable through the row click, the entity link and the
  detail view.
- Guards: `interactionGrammar.test.ts` no longer demands a `rowMoreActions`
  twin for every `rowContextMenu`; it lists the files that hand-place
  `<RowMoreActions>` so a new one needs a review. `RowActionsMenu` and
  `RowMoreActions` warn in dev under two real actions.
- Follow-up fix PRs delete the over-applied controls and shrink the audited
  list.
