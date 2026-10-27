# Scope decisions — Joined groups hold one obligation: eject on a terms edit, fuse same-entry halves

_Recorded 2026-09-12._

- **Editing a joined member's Payee or tax % takes it out of the group.** A
  joined group is one obligation billed to one Payee at one rate (the original
  merge rule), and the ledger draws it as a single row under a single Payee
  name with a combined tax total. `updateAssignment` used to leave `groupId`
  in place, so the row went on claiming ore had gone to the first member's
  Payee after part of it had been moved elsewhere. The edit now drops
  `groupId`; the member stands as its own row, which is what moving part of a
  haul to a second Payee asks for. Rules out a blended multi-Payee group row,
  and rules out per-member Payee columns as the alternative fix — a row that
  bills two parties is not one obligation, however honestly it is labelled.

- **Two Assignments over one Mining Ledger Entry on identical terms are stored
  as one.** Splitting a day to a second Payee and then editing that half back
  leaves one obligation stored as two: the same date listed twice inside a
  group, with no way back to a single line. They are fused — quantities summed
  per ore type, `estimatedValue`/`taxOwed` added, `collectsGrowth` inherited
  if either half held it _and_ something else still covers the entry. Fused
  only when character, EVE/UTC date, solar system, Payee and tax % all match,
  the status is `outstanding`, and neither half carries a recorded payment: a
  genuine split to a second Payee must survive, a fused record cannot be half
  paid, and `paymentLinks.ts` references the ids a fuse deletes.

- **`groupId`s need only be compatible, not equal.** A loose half fuses into a
  grouped one and the survivor stays in the group: that is exactly the state
  "edit the Payee back onto the group it was ejected from" produces, and
  demanding equal ids would leave the pilot looking at one day listed twice
  under one Payee with no way back but a Combine step. Two _rival_ groups over
  one entry still refuse, and so does a loose half sitting beside them — which
  group it belongs to is not knowable, and guessing moves ore between two
  obligations.

- **Both repairs run at load time, not behind a button.** The two states are
  already in stored ledgers, and a button heals only the group a pilot thinks
  to press it on. `features/miningTax/coalesce.ts` runs once per character per
  load, before `reconcileAssignments` (whose growth diff is defined per entry
  and must see one fused record, not two halves). It runs eject, fuse, eject —
  a dissolved group's halves must lose their `groupId` before they can fuse,
  and fusing can leave a group holding one member. Idempotent: a healthy
  ledger writes nothing and schedules no sync. Absorbed halves are tombstoned
  through `markMiningTaxAssignmentDeleted`, never dropped locally, or the next
  pull would resurrect them beside the record now holding their ore.

- **A part payment pre-ticks the oldest entries it could cover, never the whole
  balance.** `suggestLink` identified the Payee, failed to match the amount
  against either the whole in-window balance or a single Assignment, and fell
  back to ticking everything in the window — so a back-tax payment claimed to
  settle far more than was sent. It now ticks the oldest entries in order for
  as long as the next still fits inside the figure paid, which is how a debt is
  actually worked down. Deliberately still not a general subset-sum: "the
  oldest N you could afford" is a reconstruction, "whichever four of seven
  happen to add up" is a coincidence. Offered only once the Payee is
  identified — with nobody identifiable a partial figure is evidence of
  nothing — and a payment in kind, carrying no ISK figure, still offers its
  whole in-window balance.
