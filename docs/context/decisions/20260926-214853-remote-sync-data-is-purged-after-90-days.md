# Scope decisions — Remote sync data is purged after 90 days without a sync (issue #2065)

_Recorded 2026-09-26 · issue #2065._

- **Remote sync data is retained by inactivity, not by Character removal.** A daily
  `purgeStaleAccounts` Cloud Function deletes every subcollection under
  `characters/{uid}` (and the parent doc) once the account's last successful sync
  is more than 90 days old. The client's purge on Character removal stays for now.
- **"Last synced" is a heartbeat, not document `updatedAt`.** Each successful
  `syncCharacter` stamps `lastSyncedAt` on the `characters/{uid}` parent doc; the
  rules let only the owner write that single field. An account that syncs daily
  without edits is never purged.
- **Existing data is seeded, never deleted on first sight.** An account with no
  heartbeat is stamped with the run's `now` and only purged after a full 90 days
  from then (safer than trusting old document `updatedAt`s).
- **No second collection list.** The function enumerates the account's
  subcollections at run time (`listCollections()`), so it covers whatever the
  synced collection registry has written; `functions/` cannot import the registry.
