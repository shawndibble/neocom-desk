# Scope decisions — Routes render their last snapshot instead of a spinner

_Recorded 2026-09-05._

- **A view spins only when it has nothing to show, never merely because a load
  is in flight.** `esi/cache.ts` already kept every surface in Dexie and served
  it without a network call inside `STALE_AFTER.default`, but
  `useRouteSnapshot` held its result in `useState` — which React Router throws
  away when it unmounts the route. Every tab visit therefore restarted from
  `data === null` with `loading` true, and every view branched on `loading`
  alone, so the app showed a spinner over data it already had. The rule is now
  `loading && !data`: `loading` stays honest (it still disables Refresh), and
  the spinner is reserved for a genuinely cold view.

- **The retained snapshot is keyed by an explicit `cacheKey`, not by the
  loader's identity.** Several call sites pass an inline arrow (`Corp.tsx`
  closes over `capabilities`), whose identity changes every render — keying on
  it would compile, run, and silently never hit. An explicit per-view string is
  the only key that cannot rot that way.

- **It lives in memory (`lib/routeSnapshotCache.ts`), never in Dexie.**
  `esiCache` is already the durable copy with its own freshness and purge
  rules; a second persisted copy would need to restate both. This one answers
  only "what did this tab render last time", so a page reload rightly starts
  empty.

- **`useCorpSnapshot` gets the same treatment, opt-in the same way.** It is a
  second copy of the same `useState`-dies-on-unmount defect, behind Wallet's
  and Industry's corp switch. It takes `{ name, characterId }` and folds its
  existing `key` (character + corporation + division) into the retained name,
  so two divisions retain separately and a corp change cannot read the previous
  corporation's rows back out.

- **The purge has one trigger, not two.** `esi/cachePurge.ts` gained an
  `onCachePurged` signal in the same publish/subscribe shape as
  `onCacheRevalidated` — `esi` publishes, the React layer subscribes — so
  whatever revokes consent for a character's Dexie rows (scope removed, owner
  changed, character removed) takes the in-memory copies of those same rows
  with it. Without it a purge would leave the previous owner's wallet on screen
  until a reload. `purgeCorpScopedCache` emits it too, and just as bluntly: it
  deletes only the `corp:` prefix in Dexie, but a retained snapshot is a whole
  rendered board, so a surgical forget is not expressible — and forgetting too
  much costs one Dexie re-read, while forgetting too little puts the previous
  corporation's board, roster and assets back on screen. The `db.esiCache.clear()`
  fallback tier emits `null`, meaning every Character.

- **A failed load keeps the retained rows and reports the error.** Same
  contract `staleWhileRevalidate` already had for a failed refresh: the views
  branch on `error` before `data`, so nothing stale is ever presented as the
  fresh answer.

- **Employment History joins `PREFETCH_TASKS`.** It was the one Character
  overview tab with no warmed key, so it was cold on first open no matter how
  long the session had run. Being a public endpoint, it is also the first task
  that survives an empty scope set.

- **Name lookups become cache-first, because they were never cached at all in
  the sense that matters.** `resolveNames` and `typeNames.resolveViaEsi` both
  POSTed `/universe/names` _first_ and consulted `esiCache` only as an offline
  fallback — so every render of Mail, Contracts, Contacts, Assets, Employment
  History and the corp views blocked on a live round-trip, warm session or not,
  and a retained snapshot could not help the first visit of a session. They now
  read the cache first and ask only for ids they have no name for. A lapsed
  name (`STALE_AFTER.static`) is returned at once and refreshed behind the
  caller; an unknown one still blocks, because there is nothing to show
  instead.

- **`STALE_AFTER.static` keys keep their blocking read in `loadPastWindow`.**
  A lapsed static row still plain-awaits rather than racing the 250ms grace.
  That path is not the one the spinners came from — every `staleAfterMs:
STALE_AFTER.static` loader already serves from its window without a request —
  and giving it the grace race would trade a documented decision for a
  stale-then-swap flash across a whole asset list.
