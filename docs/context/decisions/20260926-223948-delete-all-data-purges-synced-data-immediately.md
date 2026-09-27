# Scope decisions — Delete all data purges synced data immediately

_Recorded 2026-09-26._

- **Two ways remote sync data is deleted, and only two.** "Delete all data"
  (Settings → Data & storage → This device) deletes it right away; the
  `purgeStaleAccounts` inactivity purge deletes it after 90 days without a
  sync. Supersedes "Immediate server deletion is by request only (the public
  Delete Your Data page)" in the removal decision (`20260926-220722-…`): the
  public page now points at the button instead of offering a manual request.
- **Removing one Character still leaves remote data alone.** Only the
  whole-device action purges; the removal decision stands otherwise.
- **The purge covers every Character logged in on this browser.** Each one's
  docs under `characters/{uid}` go, one Character at a time (the Firebase
  session is shared). The parent heartbeat doc is not client-deletable and is
  left to the inactivity purge.
- **A purge that can't run is not retried.** No pending-purge marker (the
  removal decision dropped that machinery). The dialog names the Characters it
  failed for and says their synced data waits for the 90-day purge; Cancel is
  gone at that point, since the others are already purged.
- **Syncing halts for the page's life before the purge.** A sync after it
  would push the purged rows straight back.
- **Then every browser store goes**: the app's IndexedDB databases, web
  storage and runtime caches, keeping only the Workbox precache so the app
  still opens offline. Settings such as theme and trade hub reset. The page
  reloads, and other open tabs reload when the database is deleted.
