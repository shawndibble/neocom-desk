# Scope decisions — Moon Mining: join two selected rows via the existing bulk-action checkboxes (issue #523)

_Recorded 2026-09-06 · issue #523._

- **The table's checkbox column now also drives "join"**, not only bulk-pay.
  Direct request: "since I can mark multiple paid at the same time, using
  that same checkbox to show a combine button should works too." A row is
  selectable when either action could apply to it — Outstanding-and-assigned
  (bulk-pay) or Unassigned (join) — one shared checkbox column rather than
  two separate selection UIs.
- **Selecting exactly two join-eligible rows (Unassigned or Outstanding, not
  already part of a group) shows a "Join selected" button**, gated by the
  same compatibility rule `JoinAssignDialog`'s picker already enforces: same
  character, same solar system, and — when both already have an Assignment
  — the same Payee and tax %. Selecting exactly two that fail this check
  shows a hint explaining why, rather than silently doing nothing.
- **This reuses `JoinAssignDialog` unchanged** — the button just pre-selects
  the second row as the dialog's sole candidate
  (`joinCandidateOverride`), skipping the picker list `RowDetailModal`'s
  "Join with another entry" button opens when there's more than one
  compatible option. Both entry points funnel into the same dialog and the
  same `joinAssignments` call.
- **`bulkPaySelection` is the one selection state for both actions** — it
  was already surviving filter changes (an earlier round's fix), so no new
  state was needed beyond the one-off `joinCandidateOverride` pin. A
  successful join clears the selection, the same as a successful bulk-pay
  does.
