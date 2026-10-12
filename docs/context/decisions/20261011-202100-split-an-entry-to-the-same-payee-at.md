# Scope decisions — Split an entry to the same Payee at a different rate

_Recorded 2026-10-11._

- **Split's "Move to" lists every Payee, including the current one.** One landlord can charge 5% at one moon and 8% at another in the same system on the same EVE day, and ESI gives no structure identity, so the second slice must be billable to the same Payee without creating a duplicate Payee. Rules out duplicate Payees as the workaround.
- **Same Payee at the same rate is refused.** `coalesce.ts` keys on `payeeId:taxPct`, so such a split would silently re-fuse on the next load; the dialog warns and disables the action instead.
- **Rates previously billed to a Payee (plus its default) are quick-pick chips** beside the Tax % box, learned from the pilot's own Assignments (`payeeRates.ts`).
