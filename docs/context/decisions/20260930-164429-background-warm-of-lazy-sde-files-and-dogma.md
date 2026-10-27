# Scope decisions — Background warm of lazy SDE files and dogma engine

_Recorded 2026-09-30._

- **The lazy SDE files and the dogma engine are warmed in the background, so they work offline without ever having been opened online.** Amends `20260928-144005-feature-sde-files-load-on-demand-not-precached.md`: still not in the install precache, but no longer "needs a network the first time it is used" once the warm has run (~90 s after boot, then an idle slot, once per page load).
  - Warm list (`src/sde/warmLazySde.ts`): the six files that decision named plus the ten `market/*.json` = 16 `sde-data` entries, under the service worker's 32-entry cap. The dogma WASM + `sde.dat` (~10 MB) go to `dogmaFittingEngine`'s own Cache Storage bucket, not `sde-data`.
  - Gate (`src/lib/lazyAssetWarmGate.ts`): skipped offline, under Save-Data, and on slow-2g/2g/3g; the ~10 MB engine is also skipped on a `cellular` connection. An absent Network Information API counts as unknown, not blocked.
  - Sequential, fetch-only (nothing parsed or memoized), silent on failure, no retry; skipped until a service worker controls the page (an earlier fetch would not be cached) and for any file already cached. The engine is fetched into its cache but not initialised.
  - No user setting: the gate covers metered/slow links, and the cost is a one-time ~2 MB gzip + ~10 MB. Revisit if users ask to opt out.
