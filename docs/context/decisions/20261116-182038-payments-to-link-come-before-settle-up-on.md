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

- **A Conflict the member has acted on stops being a warning, but is never hidden.**
  Once "Tell {corp}" has been sent, or an officer has waived the disputed ore's tax, the
  member cannot move the day, so a prompt headed "Review" asks for work they cannot do.
  It reads "Waiting on the corp" in plain text instead, and the row's pill reads `Sent`
  or `Tax waived`. It is deliberately still counted in `days` and `amount`: the 14-day
  `CONFLICT_RESOLVE_DAYS` clock does not stop for an open dispute, so the day still
  bills if nobody answers. Dropping it from the summary — the first thing tried here —
  would have let the tab print "No moon mining tax outstanding" right up to the day it
  billed. This rules out treating "the member has acted" as "the matter is closed" while
  the engine still resolves the day on its own clock.

- **A `rejected` day stays a warning.** The officer kept the bill and handed the day
  back, so it needs the member again. This rules out one "has been flagged" state
  covering all three answers.

- **A day is only "waiting" once every book contesting it has been answered.** Two
  corporations can contest one day; one unanswered line still asks the member to look.

- **Pausing the clock while a dispute is open is the open question, not a decision.**
  Until it is answered, the prompt states the deadline rather than hiding it. The
  Overdue flow's bounded pause budget (`overdue.ts`, 14 days per Late notice) is the
  precedent to weigh, since an unbounded pause would let a dispute stall a bill
  indefinitely.
