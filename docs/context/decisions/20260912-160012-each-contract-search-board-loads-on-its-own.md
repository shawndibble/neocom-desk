# Scope decisions — Each Contract Search board loads on its own, and names fill in behind it (issue #963)

_Recorded 2026-09-12 · issue #963._

- **The wait was all network, not computation — measured before designing.**
  Parsing the 1.45 MB market catalogue and scanning all 19,551 entries is 5 ms;
  parsing `stations.json` + `systems.json` and doing 1,240 endpoint lookups is
  3 ms. What actually costs seconds is the offers snapshot's ~124 Firestore
  chunk docs, and one ESI call per distinct region on a cold cache. So the fix
  is ordering and gating, not making any stage faster — and there is no
  computation worth reporting progress on.

- **One `useRouteSnapshot` per corpus, not one for the tab.** The two snapshots
  used to be fetched together on the argument that the courier one is a single
  chunk doc, which is true and is exactly why pairing them was the wrong trade:
  a hauler opening Courier waited on ~370k item-offer rows to be shown ~620
  hauls. Each board now renders when its own snapshot lands. The cost is two
  retained-snapshot keys and a Refresh handler that calls both — deliberate,
  because the button above the boards is one button and still means "reload the
  tab" (the Data Age badge and the offline banner stay per corpus, as they were).

- **Names resolve behind the table, never in front of it.** Type names, courier
  endpoints and region names are three independent hooks, not three serial
  stages of the loader. This is only safe because every consumer already renders
  an unresolved id honestly — `#34`, `#10000002`, a raw location id — which the
  courier board has done for player structures since #910. A row is never wrong
  while a name is missing, only less readable.

- **Region names commit once, not per region.** Both boards render a Region
  column and rebuild their column set when that map changes, so committing each
  name as it arrives would rebuild the columns once per region. A quiet
  "Naming regions…" note says the same thing for the duration.

- **Progress is a stage, not a percentage.** A cold load has no denominator
  until the corpus lands, and once it lands the board is already on screen. So
  the spinner names which corpus it is waiting for, and the only name stage with
  real network cost names itself while it runs. No synthesized completion bar.

- **A published snapshot opts into stale-serve; a game constant still does not.**
  `esi/cache.ts` refused to substitute a lapsed row for any key whose window is
  longer than `STALE_AFTER.default`, which lumped these snapshots in with
  station names. A new `allowStaleServe` option splits the two cases: a long
  window that encodes a _publish cadence_ may show last cycle's rows while this
  cycle's arrive; a long window that asserts _immutability_ still may not. The
  30-minute freshness window itself is unchanged, and a Refresh still cannot
  force these keys live — `isRefreshInvalidated` continues to exempt them by
  design.

- **Opting in buys the honesty rule with it.** The stale-serve path already
  writes the late result, signals `onCacheRevalidated`, and re-serves the row
  with `fromCache` set when the revalidation failed. The panel reads that as
  `common.refreshFailedTitle` after a manual Refresh and `common.offlineTitle`
  otherwise, so a background refresh that never lands is stated rather than left
  standing as a loading state.

- **A board mid-load never reads as a finished one.** The per-corpus empty state
  is gated on that corpus having settled, so "not all of them have arrived" is
  never rendered as "nothing has synced".

- **Not done here:** no change to what the backend publishes or how often, no
  change to the freshness window, and no service-worker precache of either
  snapshot — they sit outside the install precache deliberately.
