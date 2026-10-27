# Scope decisions — Alert dismissals push on dismiss; a visible tab re-syncs every Character

_Recorded 2026-09-12._

- **A feed write schedules its own sync, at the call site — not inside
  `features/notifications/feed.ts`.** Dismissing an alert is an edit like any
  other synced edit and must reach the other device, but `feed.ts` is imported
  by `sw.ts`, and `@/sync` reaches Firebase. Putting `scheduleSync` in `feed.ts`
  would pull the whole sync driver into the Service Worker bundle to serve a
  caller that has no Firebase session to use it with (ADR 0001). So `feed.ts`
  keeps owning the local write only, and `features/notifications/feedSync.ts`
  owns write-plus-push for page-context callers. A row the Service Worker
  records from a Scheduled Push still syncs — on the next page-context sync,
  which `feed.mergeFeedRecord` already absorbs.
- **`scheduleSync` is called once per Character, not once per dismissed row.**
  The Alerts page lists every Character's rows together and "dismiss all" spans
  them, while `sync/planSync.syncFeed` is per-Character and pushes only the rows
  belonging to the uid it was called for. Same shape as
  `miningTax/assignments.ts`'s bulk writes.
- **A tab re-syncs every Character on a tick and on `visibilitychange`, and
  the throttle is per Character.** `App.tsx`'s existing trigger covers the
  active Character at boot and on switch, which is enough to publish but never
  pulls again — a desktop tab left open all day never learns that the phone
  dismissed something, and a Character the user is not looking through is never
  reconciled on this device at all. `visibilitychange` alone does not close
  that: it does not fire when the user switches to another _application_ and
  the tab stays its window's foreground tab, which is the reported case
  exactly. So both, through one gate. The gate is per Character so a newly
  added one is reconciled at once rather than waiting out a gap some other
  Character started, and `BACKGROUND_SYNC_MIN_GAP_MS` bounds the cost:
  `sync/syncAuth.ensureSignedIn` mints a Firebase custom token per Character
  and leaves the session signed in as the last one, so a sweep is N callable
  invocations. A Character already syncing is skipped for the same reason.
- **The sync status stream is read scoped to the active Character.**
  `sync/status.ts` publishes every Character's status on one stream and keeps a
  "latest from anyone" value, which was harmless while only the active
  Character ever synced. Now that the device syncs Characters nobody is looking
  at, an alt with a dead refresh token would otherwise paint the nav dot red
  and put its error on a page about somebody else, so `app/useSyncStatus.ts`
  filters on `characterId` and seeds from `getSyncStatus` rather than from
  whatever was published last.
