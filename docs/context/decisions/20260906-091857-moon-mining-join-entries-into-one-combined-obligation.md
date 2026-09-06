# Scope decisions — Moon Mining: join entries into one combined obligation (issue #523)

_Recorded 2026-09-06 · issue #523._

- **Added a "join entries" feature**: two Mining Ledger Entries in the same
  system (any dates) can be folded into one combined obligation, matching
  the user's corp billing ledger, which reports a mining session spanning
  midnight UTC as a single line even though ESI's per-day ledger reports it
  as two separate entries. Direct request, with two scope answers given via
  `AskUserQuestion`: joins are **same-system-only**, and — verbatim —
  "I would like to assign 2 unassigned entries. If I try to assign anything
  that is already assigned, it needs to be to another unassigned entry or
  the two need to be to the same payee with the same tax value."
- **Data model: `MiningTaxAssignmentRecord.groupId?: string`, additive.**
  Considered and rejected an alternative where one Assignment record carries
  multiple dates (via a `date` field on `MiningTaxOreLine`) — that shape
  would have required every consumer of `oreLines` (`reconcile.ts`,
  `snapshot.ts`'s unassigned-residual calc, `resolveNeedsReview`,
  `linesOwnedByAssignment`) to filter by date, on a TDD'd engine layer whose
  sole-vs-split invariant already assumes one Assignment = one ledger entry.
  With `groupId`, joining two entries stays two ordinary Assignment records
  that merely share a tag — `reconcile.ts`, `snapshot.ts`,
  `unassignedOreLines`, `linesOwnedByAssignment`, and `resolveNeedsReview`
  needed **zero changes**. No Dexie version bump: schema versions are about
  indexes, and this is a plain optional field.
- **A `groupId` shared by only one surviving Assignment renders as an
  ordinary ungrouped row** (`flatten` in `groupRows.ts`), not a broken group
  of one. This is the answer to two real cases at once: Undo/delete on one
  member of a two-member group (no explicit "ungroup" action needed — losing
  a sibling just falls back to this rule) and a sync race delivering one
  member before the other.
- **`joinAssignments` (assignments.ts) never recomputes an already-assigned
  member's value or re-verifies the same-Payee/same-tax rule** — it trusts
  the caller (`JoinAssignDialog`, which only ever offers compatible
  candidates) to have already established that. A still-unassigned member
  gets a fresh Assignment, valued from its own ore lines at the current
  Jita price — never a blended value across the group's dates.
- **No editable value fields in the join dialog itself.** `AssignDialog`'s
  Tax %/Estimated value/Tax owed linkage (this ticket's prior round) applies
  to one Assignment; a join spans two, and a single hand-typed total has no
  obvious way to apportion across two independently-priced dates. Joining
  only picks a Payee and tax % (or adopts an already-assigned side's); a
  value correction afterward goes through the ordinary single-Assignment
  editor for that one member.
- **`AssignDialog.tsx` is untouched.** A `members[]` generalization was
  considered and rejected — it would have made the single-row path (the
  overwhelming common case, and the linked-fields editor just shipped)
  carry complexity for the join path. `JoinAssignDialog.tsx` is a separate
  component that reuses `IskField`-adjacent pieces where it can but owns its
  own state and submit.
- **Clicking a joined row opens a read-only `GroupSummaryModal`** (date
  range title, one line per member — date, ore, value, tax owed, status —
  plus a combined total and a "Mark all as paid" shortcut), not the ordinary
  editable `RowDetailModal`. Per-member "Edit" opens the standard
  `RowDetailModal` for that one Assignment, so editing a joined group's
  figures is never a special case — it is exactly the same single-Assignment
  edit as any other row.
- **Combined-row bookkeeping in `MoonMiningTax.tsx`**: the totals cards,
  Payee filter, and bulk-pay flow all iterate `allMembers(dr)` rather than
  reading `dr.assignment` alone, so a joined group's `estimatedValue`/
  `taxOwed` sum across every member exactly once (not once per member, and
  not zero if only the group's combined row is visible). The group's
  combined status is the worst among its members
  (needs-review > outstanding > paid > dismissed) so a mixed-status group
  (possible only via the two-already-assigned merge path) still surfaces as
  needing attention; `unpaidCount` counts such a group once, as one
  obligation, and bulk-pay expands the selection back out to only the
  members that are _actually_ still outstanding.
- **Grouping/flatten logic lives in `groupRows.ts`**, pulled out of the
  route component specifically so it's unit-testable without the route's
  ESI/Dexie-backed snapshot loading (`groupRows.test.ts`).
