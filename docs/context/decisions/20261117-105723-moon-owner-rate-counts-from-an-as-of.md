# Scope decisions — Moon owner rate counts from an as-of day, never reaches back (issue #6347)

_Recorded 2026-11-17 · issue #6347._

- **Setting a rate takes an as-of day; the rate counts from it only.** Default today. Allowed
  window: 30 days back at most, never before the moon owner's first day, never in the future,
  judged on the server clock (`resolveAsOf`). Days before the as-of day stay unpaid, the same as
  "Not set". "Not set" stays valid: nothing is owed while no rate is set.
- **Marked additively with `noBackdate: true` on the agreed entry.** `effectiveOwnerRate` reaches
  back over earlier days only when the first agreed entry lacks the mark. Entries stored before
  this change have no mark and keep reaching back, so no live book's owed totals move (dev and
  prod share data); stored history is never rewritten. Rejected: a stored schema version or a
  rewrite of old entries.
- **Invite offers carry no as-of field.** An accepted invite dates the rate the join day (a moon
  owner has no earlier days), and the entry is marked `noBackdate` like any new one. The invite
  dialog stays as it is; the ticket's as-of field there has nothing to choose.
- **An as-of day before the first agreed entry makes the new entry the first.** Days before it
  stay unpaid, even where an older unmarked entry used to reach back over them. That is the
  officer's explicit choice. Back-dating inside a paid stretch recomputes owed for those days;
  a payout is a running balance, not frozen days, so it moves the balance, not the payments.
- **Repeating the rate in force adds nothing,** unless the as-of day is before the entry in force.
- **The Cloud Function keeps its own `MAX_AS_OF_DAYS_BACK`**, pinned equal to the engine's by
  `functionsMirror.test.ts`.
