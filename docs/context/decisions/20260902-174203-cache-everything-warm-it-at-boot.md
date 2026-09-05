# Scope decisions (round 25) — cache everything, warm it at boot

_Recorded 2026-09-02._

- **Every API-derived surface is cached in the browser and warmed on load.**
  Skills, industry, planetary industry, wallet, assets, orders, contracts,
  mail, calendar and contacts (plus clones, an Overview tab) are pulled into
  Dexie at app start and on each Character switch, so network slowness is
  invisible once the app is open rather than showing up as a spinner on
  whichever page is opened first.
- **The warm-up is eager, not tiered.** Assets, wallet journal, wallet
  transactions and order history are multi-page walks a given session may
  never open; warming them anyway was chosen deliberately over a
  cheap-endpoints-only first tier. ESI rate-limits on _errors_, not request
  count, so a burst of successful reads is not itself a hazard, and the
  concurrency cap (`ESI_FANOUT_CONCURRENCY`) bounds the burst regardless.
- **Ten minutes is the app-wide freshness floor**, overriding ESI's own
  shorter cache times (60s–300s on most character endpoints). It is a floor,
  not a ceiling: an endpoint ESI caches for an hour keeps the hour. Game
  constants — universe types, stations, systems, routes, PI schematics,
  structures, a delivered mail's body, an issued contract's item lines — get a
  day instead; refetching those on a ten-minute cadence would spend the
  prefetch budget re-learning things that do not change.
- **No bulk endpoint exists to shrink this.** ESI is one route per resource
  per Character with no batch form and no tunable page size; `POST
/universe/names` (already used) is the only bulk call in the API surface the
  app touches. Replaying **ETags** so a repeat fetch answers `304` with no
  body is the one real reduction left, and is deferred to its own change —
  the client already handles `If-None-Match`, but no loader persists an etag.
- **A manual refresh bypasses the window only while it runs.** The
  invalidation signal is one global timestamp; unbounded, one Refresh on
  Wallet would send the next visit to every other page back to the network.
- Prefetch progress gets **its own dot in the rail beside the sync dot**,
  present only while a run is outstanding. A second permanently-idle dot
  beside the first would say nothing.
- **Past the window a slow call gets a quarter second before the stored rows
  are shown instead.** The defect being closed is _slowness_, not staleness:
  offline fails fast, so the cache fallback was already quick, but a slow or
  hanging connection left the page on a spinner over data the device already
  held. Racing rather than substituting a stored row unconditionally is the
  deliberate choice — on a healthy connection the call wins comfortably, so
  the page shows _fresh_ data with no stale-then-swap flash, and every view
  keeps the auth-failure behaviour it had. A quarter second is under the
  threshold where a spinner would have appeared anyway.
- **A row substituted at the grace mark reads as current, not cached.** No
  offline banner appears while the call is still in flight — there is no bad
  news yet. If it then fails, the view re-reads and _does_ raise the banner
  (or the re-login prompt), so an optimistic render never becomes a permanent
  lie. That failure is remembered, which is also what stops the re-read
  starting another slow call and looping.
- **Two carve-outs from substituting a stored row.** A manual Refresh awaits
  the network — the user is watching the button and it must report what
  actually happened. Game constants are never substituted; a lapsed 24h row is
  a station name, and a re-render per distinct location for data that has not
  changed is all cost.
