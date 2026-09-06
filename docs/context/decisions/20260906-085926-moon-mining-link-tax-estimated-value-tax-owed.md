# Scope decisions — Moon Mining: link Tax %, Estimated value, Tax owed in the Assign form (issue #523)

_Recorded 2026-09-06 · issue #523._

- **The Assign form's three ISK/rate fields now stay mutually consistent as
  the pilot edits any one of them**, per `taxOwed = estimatedValue * taxPct /
100`. Direct request: "if I edit the taxes owed, it should calculate the
  estimated value from that and the tax %. Likewise if I edit the estimated
  value, it should update the tax owed. if I edit the tax %, it should update
  the tax owed." Previously each of Estimated value/Tax owed independently
  tracked its own Jita-priced default until manually overridden, with no
  cross-linking — editing one never touched the other.
- **Tax % is treated as the one figure that doesn't get back-solved.**
  Editing Tax % or Estimated value both recompute Tax owed from the other two
  (forward direction); editing Tax owed instead back-solves Estimated value,
  holding Tax % fixed — a pilot correcting Tax owed against a number they
  were actually told to pay is trying to reverse-engineer what got taxed, not
  guessing a new rate. Editing Tax owed when Tax % is 0 doesn't back-solve
  (division by zero) — the rate itself is left for the pilot to fix first.
- **Clearing a value field back to empty resets _both_ Estimated value and
  Tax owed to tracking their computed defaults together**, not just the one
  that was cleared — since the two are now linked, leaving one pinned to a
  stale manual figure while the other resumes tracking the Jita price would
  immediately re-diverge them.
- No `engine/miningTax/valuation.ts` change: `computeAssignmentValue`'s
  formula was already exactly this relationship — the gap was in
  `AssignDialog.tsx`'s own override bookkeeping, not the underlying math.
