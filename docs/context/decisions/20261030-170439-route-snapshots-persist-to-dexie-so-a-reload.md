# Scope decisions — Route snapshots persist to Dexie so a reload opens on cached data

_Recorded 2026-10-30._

- **A view's last snapshot is also kept in Dexie (`routeSnapshots`), so the
  first visit after a reload renders it instead of a spinner.** Supersedes the
  "in memory, never in Dexie" bullet of decision 20260905-151444. In memory
  only, every page's first visit after a reload spun while its loader re-ran
  its whole chain (ESI reads past their window, Fuzzwork prices, SDE JSON) —
  reported on Market › Open orders and many other pages. Rendering the last
  snapshot and refreshing behind it is the app's promise everywhere else.

- **Freshness: the snapshot is only ever a first frame.** The loader still runs
  on every mount exactly as before and replaces it; `loading` stays true
  meanwhile. A row is dropped on read when another build wrote it
  (`__APP_VERSION__`, so a changed snapshot shape never reaches new code) or it
  is older than 7 days. The ages a page shows come from the data itself (ESI
  fetch times), so a revived snapshot shows its real age, not "just now".

- **Purge mirrors the memory copy exactly.** The `onCachePurged` signal that
  forgets the memory copy deletes the Dexie rows too (that Character's and the
  account-wide id 0's; every row for a cache-wide purge), and removing a
  Character deletes its rows with its other tables. A per-Character purge epoch
  drops any hydrate or write that started before the purge, so a late write can
  never bring a previous owner's rows back.

- **Only plain data is persisted.** IndexedDB's structured clone keeps a class
  instance's fields but loses its methods. A snapshot holding anything but
  primitives, arrays, plain objects, `Map`, `Set` or `Date` stays in memory
  only (one dev warning per view), as before.

- **Writes run when the browser is idle, coalesced per view.** Cloning a large
  snapshot (Assets) into IndexedDB runs on the main thread, so it never runs on
  the load's own frame, and an unchanged reference is not written again.

- **Reads stay synchronous.** A Character's rows load into memory with one
  query the first time a view misses for them; the view re-renders when that
  resolves, and every later view of the session reads memory as before.

- **Tests opt in.** Persistence is off under Vitest
  (`setRouteSnapshotPersistence`), so one test's snapshot can never come back
  in another through hydration.
