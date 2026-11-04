# Scope decisions — Accelerator severity warns only in its last 2 hours

_Recorded 2026-11-04._

- **A running Accelerator is `clear` until its last 2 hours, then `warning`.** It can't
  be stacked or replaced until it ends, so the shared 3-day ladder showed an amber
  triangle days ahead with nothing to act on. This is a deliberate, single-kind
  exception to "one `severityForRemaining` ladder, called by every source"
  (the corp ops board and Calendar decisions): the Accelerator is the one clock
  nobody can act on early. It applies everywhere the Overview Training card's
  accelerator is shown (row tone, Coming Up deadline, board ordering). No other
  clock gets an exception from this decision.
