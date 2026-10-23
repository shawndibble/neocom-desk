# Scope decisions — Only the boot graph is precached; route chunks are warmed at idle

_Recorded 2026-10-23._

- **The install precaches the boot graph only; every other hashed build chunk is cached by a cache-first route and warmed at idle.** The boot graph is the entry's static imports and their css (what `index.html` modulepreloads) plus the signed-in shell boot preloads (`Layout`, `Overview`, `bootShellPreload.ts`). Measured on two consecutive builds: the precache was 840 entries (17.7 MB raw, ~4.5 MB gzip), and an ordinary deploy invalidated ~360 of them (~2 MB gzip), because a changed leaf rewrites the hashed filename inside every chunk that imports it. Workbox already diffs per file; the cascade is the cost. The boot graph is ~77 files (~0.44 MB gzip), so the install is small and a new build is `waiting` quickly.

- **The warm is the SDE warm.** `warmLazySde` reads `lazy-chunks.json` (emitted by the build, `no-store`) and fetches the chunks after the SDE files and the engine, six at a time (never one by one: ~120 chunks measured at 13 s sequential on fresh connections against 0.2 s multiplexed). It runs behind the same gate: not on cellular, Save-Data or a slow link, unless the pilot presses "Download everything". It needs a controlling worker, whose `lazy-chunks` cache route stores what the page fetches.

- **Amends** `20261015-225232-core-feature-sde-files-are-precached-for-offline.md` and `20261015-225313-market-catalogue-files-are-precached-lazy-warm-fetches.md`: they hold that core features open offline from the install. That still holds for the SDE files. It no longer holds for route code: **a page the pilot has not opened is not available offline until the warm has finished** (on a gated connection, until they download it). Extends `20261016-025931-settings-has-an-offline-data-panel.md`: the panel counts the chunks as an "App pages" pack.

- **Trade-off, accepted: a tab left open across deploys can 404 a chunk it has not cached.** The old build's precache used to keep every old chunk. Now an old tab opening a route it never visited, before the warm cached it, gets a 404; `staleBuildRecovery` purges and reloads it. Deploys land every ~15 minutes, so this is the common stale-tab case, not a rare one, which is why the warm runs soon after boot.

- **Cleanup.** When a build's worker activates it deletes cached chunks `lazy-chunks.json` no longer lists. The list is read live, so it only prunes when the list's `entry` is one this worker precached (a worker for build N activating after N+1 deployed leaves the cache alone), and an unreadable list deletes nothing; the route's entry cap (1500) is the backstop. A fresh worker still deletes what a still-open old tab may want, same trade-off as above.

- **First visit: nothing is offline beyond what was opened until the next boot.** The warm starts about 90 s after boot and needs a controlling worker; on a first visit that has not claimed the page yet it does nothing until the next load. The boot graph and the SDE precache still work offline from the install.

- **Unchanged:** `version.json` and `lazy-chunks.json` are not precached; the SDE precache split (`lazySdeFiles.ts`); boot's swap and the update checks.
