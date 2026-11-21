# Scope decisions — Every Corp Tax Book is a running account

_Recorded 2026-11-17 · issue #6294._

- **Every book is a running account, with no switch.** This supersedes the per-book, Director-only
  switch-over of decision 20261117-033049. A book that stored no `runningAccountFrom` reads
  `RUNNING_ACCOUNTS_FROM` (this release), so members of every book stop seeing "credit … goes on
  your next bill" for money that already paid their days, and officers see Paid through /
  Owes and late notices everywhere. Nothing is migrated or rewritten (no book in production had
  issued a calendar bill, decision 20261120-235011). Book settings keep the notice rules and day tolerance and say
  how billing works; the switch-over control is gone. The server's `switchToRunningAccount` stays
  accepted (a stored instant changes nothing now) so an older client's call still succeeds.

- **The server treats every book as running where it can tell.** `recordAccounts` takes any book,
  close-account takes the officer's running credit whenever it is sent, and the verify link shows
  "Owed now" whenever an account was recorded. Refusing a calendar bill keyed on a stored
  instant: the current client never issued one, and refusing it everywhere would have refused
  every calendar bill an older tab still tried until that tab reloaded. Decision 20261120-235011
  removes the calendar bill altogether.
