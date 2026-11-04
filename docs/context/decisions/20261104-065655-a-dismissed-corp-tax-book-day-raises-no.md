# Scope decisions — A dismissed Corp Tax Book day raises no Conflict

_Recorded 2026-11-04._

- **A charge the corporation dismissed is never a Conflict, and carries no overlap.** Before, the conflict check ran ahead of the dismissal, so ore the member gave a Payee showed as a Conflict that "resolves to the corp" in 14 days, even though the corporation had said nothing is owed. It resolved to a 0 ISK dismissed day, and the notice's advice (unmark your payment, take the ore off your entry) would have wiped a real payment record for nothing. The Payee keeps the ore; the day reads Dismissed.
- **A Conflict row says why the records clash (`conflictCause`):** `otherPayee` (the member gave the ore to a Payee that is not this corporation's) or `overListed` (the member's entry for the corporation's own Payee lists more ore than the book recorded, so it can't stand in for the book's line). The detail's notice names the clashing entry, gives that reason, and offers both ways out: the book is right (unmark, then take the ore off the entry) or the entry is right (ask an officer).
