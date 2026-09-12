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
- **A tab re-syncs every Character when it becomes visible, and never on a
  timer.** `App.tsx`'s existing trigger covers the active Character at boot and
  on switch, which is enough to publish but never pulls again — a desktop tab
  left open all day never learns that the phone dismissed something. The sweep
  is on `visibilitychange` rather than an interval because
  `sync/syncAuth.ensureSignedIn` mints a Firebase custom token per Character and
  leaves the session signed in as the last one: N Characters is N callable
  invocations per sweep. A hidden tab has nobody reading its alerts, so it buys
  nothing; `BACKGROUND_SYNC_MIN_GAP_MS` then keeps alt-tabbing from turning the
  sweep into a mint storm. Rules out a polling interval unless real usage shows
  a tab that stays visible and stale for hours.
