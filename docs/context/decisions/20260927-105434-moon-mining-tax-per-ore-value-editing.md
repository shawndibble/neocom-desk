# Scope decisions — moon mining tax per-ore value editing

_Recorded 2026-09-27._

- **`computeAssignmentValue` grows a 4th, optional `oreLineValues` parameter**
  (`ReadonlyMap<number, number>`, typeId → total ISK value) that replaces
  `quantity * unitPrice` for the lines it names, leaving every other line
  priced as before. Every existing caller is unaffected (the parameter is
  optional and none of them pass it). Rules out a parallel valuation
  function — the invoice-time snapshot semantics stay in one place.
- **A new optional field, `MiningTaxAssignmentRecord.oreLineValues?: Record<number, number>`**,
  holds the pilot's per-ore-type total-value corrections, additive (no Dexie
  schema version bump, following this table's own established convention)
  and threaded through `MINING_TAX_ASSIGNMENTS`'s existing sync collection —
  it piggybacks on the same Firebase-backed mechanism Assignments already
  use, not a new synced table. Rules out a separate table for the same data.
- **Per-ore editing only ever applies to an _already-assigned_ row (any
  status, including Paid — see the lock below), never to a still-unassigned
  one.** An unassigned row has no Assignment record to attach a correction
  to; teaching the app to create one implicitly, or building a second synced
  mechanism just for the unassigned case, is real scope this decision
  deliberately defers. Correcting an unassigned row keeps today's read-only
  computed total until a later pass.
- **Per-ore editing only ever targets the row's own primary Assignment.** A
  "joined group" (2+ Assignments merged into one displayed row) already only
  ever edits the group's primary member through this same dialog — this
  is unchanged. A row that has been _split_ across two Payees is out of
  scope for v1 for the same reason: both are real redistribution problems
  layered on top of an already-large feature, worth their own pass.
- **A "Paid" Assignment locks every editable field in the Assign/edit form —
  old whole-row fields and the new per-ore ones alike — until the pilot
  explicitly unlocks it** (`unlockPaidAssignment`, `assignments.ts`). This
  reverses a real, pre-existing gap: before this change, `updateAssignment`
  already silently overwrote a Paid record's value/tax with no guard at all.
  Unlocking reverts `status` to `outstanding` and clears `paidAt`, but
  deliberately keeps `payment` (the recorded amount/method/date and any
  matched wallet-journal or contract reference) untouched — the pilot is
  correcting a data-entry mistake, not reversing a real payment, and losing
  an already-matched reconciliation over a routine ore-value fix would be a
  real chore. Re-marking the corrected record paid again reuses that same
  retained payment.
- **"Edit ore values individually" is a synced Settings toggle**
  (`sync.miningTaxOreValueMode`, off by default), not a per-row choice or a
  device-local preference. Off (default): the existing single Estimated
  Value/Tax Owed/Tax % fields, exactly as before this change. On: the
  Assign/edit form (only when editing an existing Assignment — see above)
  shows one editable total-value box per ore line instead, and Estimated
  Value/Tax Owed become plain calculated totals derived from those boxes;
  Tax % stays editable in both modes. The two modes are mutually exclusive
  views — there is no "convert a whole-row edit into per-ore boxes"
  reconciliation problem, because only one set of fields is ever an input at
  a time.
- **A per-ore box's invalid-input handling deliberately diverges from the
  existing whole-row `IskField`.** A negative number or non-numeric entry is
  rejected outright and the field snaps back to tracking the computed
  default immediately, rather than `IskField`'s "leave the raw text, disable
  Save" pattern — reconciling several ore lines against a corp's own tool
  line by line means a box silently holding an un-savable value while its
  neighbors look fine would be easy to miss.
- **A per-ore box shows a small info-tooltip (original vs. corrected value)
  whenever it holds an override.** Scoped only to this new per-ore surface,
  not retrofitted onto the pre-existing whole-row fields — there is no
  reliable signal there for "this was corrected after the fact" versus "this
  was the figure chosen at assignment time," and inventing one was not asked
  for.
- **`splitAssignment` and `resolveNeedsReview` now explicitly drop
  `oreLineValues` on the record(s) they re-snapshot.** Both change which ore
  lines a record covers (a split moves units to a new record; a resolved
  review can add or resize lines) — a carried-over override would name a
  typeId against a line set that no longer matches, either dangling
  uselessly or silently mispricing a line the pilot never corrected for that
  new snapshot.
- **A wallet-transaction link/deep-link on a Paid record ("open a paid row,
  see and jump to the matching wallet transaction") was raised in the same
  design conversation and is deliberately _not_ part of this change** — a
  real, separable feature for its own pass, not folded in here.
