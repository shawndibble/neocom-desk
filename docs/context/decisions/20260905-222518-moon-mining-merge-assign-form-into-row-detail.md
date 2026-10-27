# Scope decisions — Moon Mining: merge Assign form into row detail, editable existing Assignments (issue #523)

_Recorded 2026-09-05 · issue #523._

- **`RowDetailModal` and the old standalone `AssignDialog` are now one modal,
  not two.** Direct user feedback: "can we merge the edit record and the
  assign record into one? ... it shows all the pertinent information but can
  be changed and adjusted, but you can hit assign to save or dismiss or
  cancel." Opening any row but a Dismissed one now shows the Assign/edit
  form directly — no more read-only stop that then opens a second dialog.
  `AssignDialog.tsx` lost its own `<Modal>` wrapper and became a plain form
  component keyed on `assignment: MiningTaxAssignmentRecord | null` (`null`
  creates a new Assignment; a record edits that one), rendered inside
  `RowDetailModal`'s single `Modal` so its `Select`'s portal still targets
  the right `PortalContainerProvider`.
- **An existing Assignment's Payee, tax %, estimated value and tax owed are
  now editable after the fact**, via a new `updateAssignment` in
  `assignments.ts` (mirrors `payees.ts`'s `updatePayee`) — this was asked for
  twice in this session ("I need to be able to modify records in case the
  taxes or estimated value are wrong" earlier; "can be changed and adjusted"
  now), not just at Assign time. Deliberately narrow: it touches exactly
  those four fields.
  - `oreLines` stay fixed on an edit. Line membership is what the
    sole-vs-split ownership rule (`engine/miningTax/rowStatus.ts`,
    `20260905-212452-...`) keys off; making it editable here would reopen
    that invariant. Splitting a record still goes through Undo + a fresh
    Assign. Line checkboxes in the merged form only appear when creating.
  - `status` and `paidAt` stay untouched on an edit, so correcting a Paid
    row's ISK doesn't silently un-pay it. Mark as paid / Resolve / Undo
    remain separate, dedicated actions (rendered as the form's
    `extraActions`, alongside Assign and Cancel) rather than something a
    field edit can trigger as a side effect.
  - Dismissed stays read-only (no Payee to edit, no `taxPct`/value worth
    correcting on a zero-tax record) — its only move is still Undo.
- **This narrows one clause of `20260905-212452-...`**: "every row is a click
  target that opens a detail modal ... and that modal is where every action
  for that row's status lives" still holds, but that modal's content is now
  the editable Assign form itself for every status except Dismissed, not a
  read-only summary beside the actions.
