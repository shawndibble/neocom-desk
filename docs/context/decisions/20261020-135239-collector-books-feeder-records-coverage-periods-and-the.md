# Scope decisions — Collector books: feeder records, coverage periods and the feeder grant kind (issue #4507)

_Recorded 2026-10-20 · issue #4507._

- **A feeder's mining-only offline grant is the second narrow grant kind of ADR 0025.**
  It is a `corpTaxBookSyncGrants/{feederCorp}` doc with `kind: 'feeder'` and
  `collectorCorporationId`, one holder per corporation, one scope
  (`esi-industry.read_corporation_mining.v1`). Absent `kind` means a book grant, so
  existing docs stay valid. The scheduled book sync skips feeder grants; the save
  callable refuses to overwrite one. Like the Alerts Grant, this is a named exception
  to "refresh tokens live in Dexie only" (CLAUDE.md). The callable that saves it
  arrives with the feeder sync ticket.
- **Coverage is UTC day ranges, `from` and optional `to`, both inclusive.** Leaving
  effective day D ends the period on D-1; a period that would end before it began
  (left the day they joined) is dropped. A rejoin appends a period on the same
  record and may start the very day the last one ended (back-to-back); overlapping
  or reopening while one is open is refused. Rows outside coverage owe nothing
  (`filterCovered`); billing wires it in later.
- **Invite links are single-use, revocable and have no expiry.** Only the SHA-256 of the
  code is stored (`corpTaxBookFeederInvites/{hash}`), so a Firestore read never yields a
  usable link. A rejoin needs a fresh link. One book holds at most 20 open links. The
  offered owner rate is stored on the link and copied to the record; the rate history
  itself is another ticket.
- **Create and revoke need the edit role (CEO, Director or Accountant), checked live;
  accept needs the same role in the feeder's own corporation.**
- **A corporation feeds one book or runs its own, never both,** enforced on both sides:
  accept refuses a corporation with a book (`own-book-exists`) or already feeding
  (`already-feeder`); turning a book on refuses a feeder (`is-a-feeder`). A function-only
  pointer `corpTaxBookFeederOf/{feederCorp}` makes "is this corporation a feeder?" a
  plain read. It exists while the corporation feeds; the leave/removal tickets must
  delete it, and accept re-creates it on a rejoin.
- **Feeder records are officer-readable, never client-writable.** Invites and the
  pointer are function-only.
- **Failures are stable `reason` codes** (`invite-invalid`, `invite-revoked`,
  `invite-used`, `own-book-exists`, `already-feeder`, `feeder-active`, `collector-gone`,
  `not-an-editor`, `too-many-invites`, `is-a-feeder`); no player-facing text is added.
