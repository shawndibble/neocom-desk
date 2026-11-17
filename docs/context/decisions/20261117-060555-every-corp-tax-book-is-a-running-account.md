# Scope decisions — Every Corp Tax Book is a running account

_Recorded 2026-11-17 · issue #6294._

- **Every book is a running account, with no switch.** This supersedes the per-book, Director-only
  switch-over of decision 20261117-033049. A book that stored no `runningAccountFrom` reads
  `RUNNING_ACCOUNTS_FROM` (this release), so members of every book stop seeing "credit … goes on
  your next Statement" for money that already paid their days, and officers see Paid through /
  Owes and late notices everywhere. Statements issued before stay as they are and are paid first;
  nothing is migrated or rewritten. Book settings keep the notice rules and day tolerance and say
  how billing works; the switch-over control is gone. The server's `switchToRunningAccount` stays
  accepted (a stored instant changes nothing now) so an older client's call still succeeds.

- **The server treats every book as running where it can tell.** `recordAccounts` takes any book,
  close-account takes the officer's running credit whenever it is sent, and the verify link shows
  "Owed now" whenever an account was recorded. Refusing a calendar Statement still keys on a stored
  instant: the current client never issues one, and refusing it everywhere would refuse every
  calendar Statement an older tab still tries until that tab reloads.
