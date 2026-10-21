# Scope decisions — Boot applies a waiting update, never mid-session

_Recorded 2026-10-15._

- **A waiting service-worker build is applied only on a cold start or a browser reload, behind the boot screen.** Never on a route change, and a running tab never reloads for an update. There is no "update ready" indicator. The old behaviour reloaded on the next route change, which dropped the pilot onto a hard loading page in the middle of a task.

- **Boot holds the loading screen on the update check, capped at about 3.5 s** (`BOOT_UPDATE_CHECK_CAP_MS` in `src/app/bootUpdate.ts`). If a build is found, it downloads and swaps behind the boot screen. If the cap passes first, the current build renders and the update stays waiting for the next load. Offline skips the check.

- **`/callback` never waits or reloads.** The OAuth code is single-use, so a reload would replay a spent code. The check still runs there, so the update is picked up on the next load.

- **A browser reload is the same path.** It loads the old precached bundle, which sees the waiting update at boot and swaps behind the boot screen. The old `beforeunload` skip-waiting is gone: it was racy and best effort.

- **Settings nav → "Update app" stays.** It is explicit and labelled, and goes through the same boot-screen cover. In-app data-refresh buttons never reload the app.

- **The `vite:preloadError` reload stays as a safety net.** A stale lazy chunk (for example an old tab claimed by a new worker through `clientsClaim` after another tab swapped) reloads, now shown through the boot screen.

- **Loop guard: a failed swap does not reload on every load.** At most one boot swap per 30 s per tab (a `sessionStorage` marker), and no swap at all when storage is unavailable, so a swap that does not take cannot reload on every load. Inside the window the current build renders and the update stays waiting.

- **The boot screen shows one random plain-fact tip after about 400 ms**, rotating only if boot is still up after 5 s. A fast boot never flashes one.

- **Trade-off, accepted: a tab left open for days stays on its old build until it is reopened or reloaded.** No indicator, no countdown. A mid-task reload costs more than a stale build, and a stale lazy chunk is covered by the preload-error reload above.

- **Multi-tab.** Another tab swapping the worker is harmless to a running tab until it needs a chunk the new build dropped; that is the preload-error case. Each tab applies the waiting build on its own next boot.
- **No hold when there is nothing to wait for.** Offline, on `/callback`, or with no worker controlling the page (dev, a blocked worker, the first install), the app renders on the first frame with no gate delay. The Dexie open and its schema upgrade must not slip behind an await: e2e specs seed IndexedDB right after load and rely on that timing.
- **A hard reload brings the worker up to date, without a reload.** A hard reload bypasses the service worker, so the page already runs the latest build from the network and has no controller. If a registration exists, boot still activates a waiting build (or one the check finds within the 3.5 s cap) after the first frame, so the next normal load serves the new precache instead of swapping on it. It never reloads and never holds the page.
