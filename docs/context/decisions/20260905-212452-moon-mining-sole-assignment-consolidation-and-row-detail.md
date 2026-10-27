# Scope decisions — Moon Mining: sole-assignment consolidation and row-detail UI (issue #523)

_Recorded 2026-09-05 · issue #523._

- **A sole Assignment now owns its whole Mining Ledger Entry, including ore
  types that show up after it was made — not just growth in types it already
  named.** Direct user feedback: continuing to mine the same system on the
  same day after assigning must fold into that one record, editable later if
  it turns out to need splitting, rather than spawning a second
  "Unassigned" row for every new moon-goo type that turns up mid-session.
  `engine/miningTax/rowStatus.ts`'s `unassignedOreLines` and the new
  `linesOwnedByAssignment` both branch on how many Assignments cover an
  entry: exactly one means "owns everything, including a brand-new type";
  two or more (the two-corps-one-system-one-day split case) keeps the
  original presence-based, per-type restriction, since a brand-new type has
  no obvious owner among several Payees. `reconcileAssignments` and
  `resolveNeedsReview` both take the sibling count into account for the same
  reason. This is strictly a widening of what "more ore" already meant
  (decision doc's "never silently absorbed") — a sole Assignment's growth
  still flips to `needs-review` with an explicit diff and still needs an
  explicit Resolve, it just no longer excludes a brand-new type from that
  diff.
- **Per-row action buttons (Assign/Dismiss/Resolve/Undo) are gone from the
  table; every row is a click target that opens a detail modal
  (`RowDetailModal.tsx`) instead, and that modal is where every action for
  that row's status lives** — including a new one-row "Mark as paid" for an
  Outstanding row, which previously only existed via the bulk-pay flow. User
  feedback: "if we make each row clickable then we don't need the action
  buttons." The bulk-pay select checkbox stays in the table (it isn't a
  per-row _action_, it's a _selection_ mechanism for the itemized bulk-pay
  flow), stopping its own click from bubbling into the row's.
- **The table drops the Character column when only one character is in view,
  and drops the Ore column entirely (the detail modal is the only place ore
  lines are listed).** Estimated value came back after briefly being cut too
  — user feedback settled on keeping it visible in the table (nowrap, like
  Payee and Tax owed) while Ore stays modal-only, since ore lines don't
  summarize into one line the way a single ISK figure does.
- **A trailing, non-interactive pencil-icon column (`Icon.Rename`) signals
  that a row opens something editable**, now that the row itself (not a
  visible button) is the click target — a plain click target with no visual
  affordance was worth a small, deliberate hint.
- **The user-facing name drops "Tax": nav label and page title are "Moon
  Mining", not "Moon Mining Tax".** Internal names (the route path
  `/moon-mining-tax`, the `features/miningTax`/`engine/miningTax` module
  folders, `MiningTaxAssignmentRecord` and friends, the `miningTax` i18n
  namespace) are deliberately left alone — renaming those is a large,
  purely-cosmetic refactor across ~20 files for no functional change, and the
  request was about what a user reads, not internal plumbing.
- **The page-header "Payees" button matches the Refresh icon button's
  default (`md`) size instead of `sm`**, and its label shortened from "Manage
  Payees" to "Payees" — both direct user feedback on the header's visual
  balance.
