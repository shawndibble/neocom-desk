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
- **The Cloud Function keeps its own `MAX_AS_OF_DAYS_BACK`**, pinned equal to the engine's by
  `functionsMirror.test.ts`.
