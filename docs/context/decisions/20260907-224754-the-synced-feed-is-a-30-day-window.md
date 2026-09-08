# Scope decisions — The synced feed is a 30-day window, not an archive (issue #582)

_Recorded 2026-09-07 · issue #582._

- **The remote `notificationFeed` collection is a 30-day reconciliation window,
  not a second archive.** CONTEXT.md round 45 said the Notification Feed "never
  deletes" — dismissal is a flag, not a tombstone — and the code took that to
  mean the remote collection too, so nothing but `characterPurge` ever removed a
  row and it grew for the life of the account. That claim is now scoped to the
  _local_ table: the device's 300-row archive (`NOTIFICATION_FEED_LIMIT`) is the
  record of what fired, and the remote collection is only the window through
  which devices reconcile. A remote row whose `firedAt` is older than
  `FEED_SYNC_WINDOW_MS` is deleted remotely during sync. This rules out treating
  a remote row's absence as evidence the occurrence never happened.
- **Still no tombstone.** The purged doc is hard-deleted with no marker left
  behind, which is the whole point — a tombstone per feed row would replace one
  unbounded collection with another. What stops resurrection is not a marker but
  the window itself: the purge cutoff and `pushEligible` are derived from one
  `now` and one `FEED_SYNC_WINDOW_MS`, so a row old enough to purge is already
  outside the push window on every device. This rules out a device re-uploading
  a row another device just purged.
- **Purge and dismissal-reconciliation are exclusive within a pass.** Push-DISMISS
  stays unconditional whenever both sides hold a row, but a row past the cutoff
  is purged instead of reconciled, never both. A row old enough to purge is old
  enough that its dismissal no longer changes anything anyone will see. This
  rules out an ordering where a dismissal write races the delete of the same doc.
- **The window bounds by age here, not by row count.** `rowsWithinSyncWindow` is
  30 days _or_ 100 rows, whichever is smaller, but only the age half is a
  retention rule — the 100-row cap decides which rows a device introduces to
  sync, and purging on it would delete rows other devices are still actively
  syncing. This rules out reading "outside the push window" as "safe to delete
  remotely".
- **Belt-and-braces server-side expiry is a follow-up, not part of this.** An
  account whose devices are all uninstalled leaves rows no client-side rule will
  ever reach; a Firestore TTL policy would catch those, but it needs a real
  `Timestamp` field (`firedAt` is epoch ms) and a production console/Terraform
  change. Tracked as #595 rather than half-shipped here.
