# Scope decisions — Payments to link come before Settle up on the Tax tab

_Recorded 2026-11-16._

- **"Payments to link" is drawn before the owed Payee cards, not after them.** The
  "owed first" ordering (20261004-135551) put every prompt below the balances. That is
  right for Unassigned entries, which only add to what is owed, but wrong for a payment
  the pilot has already sent: until it is linked, every owed figure beside it is
  overstated, so Settle up offers to pay something twice. This narrows "owed first" to
  "owed before work that increases it", and rules out treating the two prompts alike.

- **A Payee with an unlinked payment keeps Settle up, as `ghost`.** The same rule an
  uncredited donation already follows (`warnUncredited`): the control stays reachable —
  paying again is sometimes right — but stops being the card's loudest action, and the
  card says in words what is unaccounted for. This rules out disabling or hiding it,
  which would strand a pilot whose payment genuinely was something else.

- **The warning is per Payee, not per tab.** `LinkSuggestion` already carries the
  `PayeeBalance` it was matched to, so a payment suggested for one Payee never dims
  another's Settle up. This rules out the global `unlinkedPaymentCount` as the signal
  for anything but the tile's own count.

- **A Corp Tax Book Payee is excluded.** Its card hides Link payment (the book credits
  itself from the corporation's wallet journal), so the note would point at a control
  that is not there; `uncreditedOf` already says the same thing in the terms of that
  book. This rules out one shared "unaccounted ISK" note across both kinds of Payee.

- **A Conflict the member has acted on leaves the Conflicts prompt.** Once "Tell {corp}"
  has been sent, or an officer has waived the disputed ore's tax, the member cannot move
  the day; a prompt headed "Review" asking them to review it is asking for work they
  cannot do. The row keeps its place in the ledger and reads `Sent` or `Tax waived`
  instead, so it stays findable. A `rejected` day is deliberately kept: the officer
  handed it back, so it needs the member again. This rules out clearing the flag as a
  resolution — nothing about what the book bills has changed.
