# Scope decisions — The feed's transport stamp is a wall clock, and syncedAt says what the remote side holds (issue #1207)

_Recorded 2026-09-22 · issue #1207._

- **A Notification Feed doc's `updatedAt` is stamped when the row is uploaded,
  not derived from the row's own timestamps.** Issue #581 derived it as
  `max(firedAt, dismissedAt)` so that "the value a device compares locally is
  the value it wrote remotely". That reasoning holds only while the derived
  value orders _writes_, and a feed row's timestamps order _occurrences_:
  `occurrenceFiredAt` back-dates a row to a skill's `finish_date`, a journal
  entry's `date` or an EVE notification's `timestamp`, so a row uploaded now
  can carry a stamp days below every other device's pull cursor and be
  filtered out of their incremental pulls until the 30-day full reconcile. One
  account's desktop and phone agreed exactly on every poll-clock event type and
  diverged 9-to-3 and 6-to-0 on the back-dated ones. This rules out reading a
  cursor field as anything but write order, on this collection or any other.

- **`syncedAt` on the local row, not the pull cursor, decides whether a row has
  been introduced to sync.** With a wall-clock `updatedAt` a device cannot
  recompute what it wrote remotely, so the `l && !r` branch can no longer ask
  "is this row at or below the cursor?" — and that question was the bug, not
  the answer: a back-dated row is below the cursor from birth, so it was read as
  reconciled when it had never been uploaded at all. `syncedAt` records the fact
  directly. The read amplification the cursor gate existed to prevent is
  unchanged, since an uploaded row still short-circuits. This rules out
  inferring upload state from any timestamp the row carries about itself.

- **A dismissal recorded after the upload puts the row back through
  push-CREATE.** The remote doc is replaced wholesale and the remote copy is
  not in an incremental window to compare against, so `dismissedAt > syncedAt`
  re-pushes rather than waiting for a push-DISMISS that branch will never
  reach. This rules out treating `syncedAt` as a one-way latch.

- **`pushEligible` still decides what may be introduced, and it is checked
  after `syncedAt`.** A row purged remotely for its age is by construction
  outside the push window, so knowing the remote side no longer holds it does
  not put it back (#582 AC4 is unchanged). This rules out reading `syncedAt` as
  permission to upload.

- **No migration, and no backfill.** Reusing the existing `updatedAt` field
  rather than adding a second one keeps every already-written remote doc
  inside the same range query — a new field would have excluded them all until
  the next full reconcile, which is the very failure being fixed. Rows already
  on a device carry no `syncedAt`, so the first pass after this ships re-uploads
  up to the 100 the window allows per Character; that is the repair, not a cost
  to avoid. This rules out a version gate or a dual-field read.

- **An owner transfer clears `syncedAt` for that Character's rows.** The rows
  themselves survive — they are this device's archive of what it saw — but the
  new owner's remote collection has never held them, so the claim `syncedAt`
  makes is false the moment `ownerHash` changes, and leaving it set would keep
  every one of them off the new uid permanently. This rules out treating feed
  rows as owner-independent for sync purposes while leaving them owner-independent
  for retention.
