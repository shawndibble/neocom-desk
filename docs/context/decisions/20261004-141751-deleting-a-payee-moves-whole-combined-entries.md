# Scope decisions — Deleting a Payee moves whole Combined Entries (issue #2563)

_Recorded 2026-10-04 · issue #2563._

- **"Move and delete" moves every day of a Combined Entry that has an owed day.**
  Paid, dismissed and needs-review days go too, so a Combined Entry stays
  one obligation under one Payee. This is the same rule as changing a
  Combined Entry's Payee, which already moves every day. Moving only the
  owed days split the group, and coalesce's load-time ejection then broke it
  apart for good. Moved days keep their status, amounts and payment links,
  so a paid day reads as paid under the new Payee. That is accepted.
- **Standalone paid days, and Combined Entries with nothing owed, stay put.**
  They are history under the deleted Payee, as before. "Delete anyway" (no
  move target) still moves nothing.
- **The move and the Payee delete (with its sync tombstone) are one ledger
  action, `ledgerActions.deletePayee`, in one transaction.** A failure leaves
  the Payee and every entry as they were, and the sync is scheduled once,
  after the commit. The delete confirm says how many entries the move takes
  when that is more than the owed count.
