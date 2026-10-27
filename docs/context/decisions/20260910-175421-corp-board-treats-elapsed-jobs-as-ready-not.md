# Scope decisions — Corp board treats elapsed jobs as ready, not just ESI status (issue #795)

_Recorded 2026-09-10 · issue #795._

- **`buildCorpBoard`'s `jobDelivery` filter treats a job as ready for pickup
  once either ESI reports `status: 'ready'` or the job's `endMs` has already
  passed, unless the job is in a terminal non-ready state
  (`cancelled`, `delivered`, `paused`, `reverted`).** ESI frequently leaves a
  finished job's `status` at `'active'` past its `end_date`, the same lag the
  Industry tab already works around via `isJobDone`. Without this, a
  finished corp job could sit undelivered for days without ever surfacing on
  the corp board. This rules out ever adding a new non-ready, non-terminal
  ESI job status without deciding whether it should also be treated as
  time-elapsed-ready.
