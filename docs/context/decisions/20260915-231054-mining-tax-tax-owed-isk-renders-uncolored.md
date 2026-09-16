# Scope decisions — Mining Tax tax-owed ISK renders uncolored (issue #1143)

_Recorded 2026-09-15 · issue #1143._

- **An Assignment's `taxOwed` renders with no status tone anywhere in the Moon
  Mining Tax feature, rather than gaining a `−` sign to justify keeping one.**
  Issue #1143 left the choice open — either tone it and sign it, or drop the
  tone — as long as one rule holds across the feature. Four of the five
  surfaces that print this figure already render it plain (`TaxTab`'s ledger
  column, `GroupSummaryModal`, `SettleUpDialog`, `LinkPaymentDialog`); only
  `SplitDialog`'s preview toned it, so dropping the tone moves one surface
  instead of four. The sign half of DESIGN.md §7's contract is also
  unavailable here on its own terms: `taxOwed` is non-negative by
  construction (`computeAssignmentValue` multiplies a non-negative valuation
  by a 0-100 percent), so a `−` would have to be painted on rather than
  derived from the value, which is exactly the coupling §7 exists to keep.
  This rules out introducing a signed-tone helper for this figure, and rules
  out `SplitDialog` keeping a tone its siblings do not have.
- **The correction is proved by a component test, not by an addition to
  `e2e/miningTaxNarrow.spec.ts`.** The preview line carries no responsive
  variant, so its rendering at 390px and at every width above it is one and
  the same; an e2e case would have to seed a second Payee and an Assignment
  and drive the split dialog open to assert a string jsdom already sees. This
  rules out reading the absence of an e2e case here as an untested viewport.
- **`TaxTab`'s Payee-balance tone and `YieldDetailModal`'s refine-wins tone
  stay as they are.** Both colour genuinely signed or comparative values
  (`balance.owed > 0`, `refineWins`), not `taxOwed`, and #1143 puts every
  other ISK figure in the app out of scope.
