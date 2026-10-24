/// <reference lib="webworker" />
/// <reference types="vite/client" />

/**
 * Hand-written service worker (originally ADR 0007, issue #176; that
 * justification retired with Periodic Background Sync — ADR 0009 carries it
 * forward for the `push` handler Web Push work adds here). `vite-plugin-pwa`'s
 * `injectManifest` strategy injects the precache manifest into this file
 * instead of generating the whole worker, which is what makes a custom
 * service-worker event handler possible at all. Precaching, the
 * update-prompt flow, and offline routing were free from `generateSW`'s
 * defaults before; all three are re-declared explicitly below (ADR 0007's
 * stated consequence).
 *
 * This file is orchestration/wiring only and isn't unit-tested — ADR 0007's
 * carve-out, same as `ForegroundNotificationPoller.tsx`'s scheduling shell.
 * Verify this file itself via a production build (`dist/sw.js`) and manual
 * checks in a real browser.
 */
import { clientsClaim } from 'workbox-core';
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import {
  handleNotificationClick,
  urlFromNotificationData,
} from '@/features/notifications/notificationClick';
import { handlePush, type PushEnv } from '@/features/notifications/pushHandler';
import { recordFeedEntry } from '@/features/notifications/feed';
import { resolvePushNames } from '@/features/notifications/pushNames';
import { db } from '@/db';
import { readTimeZone } from '@/lib/timeFormat';
import {
  isContractSnapshotObject,
  isEvePortraitImage,
  isEveTypeImage,
  isLazyChunk,
  isVersionedSdeData,
} from '@/lib/swRoutes';
import { chunkKey, chunksToDelete, listMatchesBuild, parseLazyChunksJson } from '@/app/lazyChunks';

declare let self: ServiceWorkerGlobalScope;

// registerType: 'prompt' (vite.config.ts) — the worker must stay in
// `waiting` until a boot-time swap triggers it (cold start or browser reload,
// behind the boot screen, never mid-session) or Settings → "Update app", via
// workbox-window's `messageSkipWaiting()`, which sends exactly this message.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
clientsClaim();

cleanupOutdatedCaches();
// `v` joins Workbox's default ignore list (which passing this option
// replaces): SDE loaders request `/data/<file>?v=<content hash>`
// (src/sde/sdeDataUrl.ts), and a precached file must still be served from
// the precache — its own revision already tracks the same bytes.
const precacheManifest = self.__WB_MANIFEST;
precacheAndRoute(precacheManifest, {
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
});

// SPA fallback: any non-precached navigation resolves to the cached
// index.html, except API calls (never a page navigation, but matches the
// generateSW config this replaces).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  })
);

const DAY_SECONDS = 24 * 60 * 60;
// Only a real 200 is cached. The <img>s that load these (src/lib/eveImages.ts
// call sites) set crossOrigin="anonymous" — the image server answers with
// `Access-Control-Allow-Origin: *` — so responses are readable rather than
// opaque, and an error (e.g. a blueprint's 400 on /icon) is never cached.
const cacheOnly200 = new CacheableResponsePlugin({ statuses: [200] });

// SDE files not in the precache (vite.config.ts globIgnores, built from
// src/sde/lazySdeFiles.ts): cache-first under their content-versioned URL. A
// changed file is a new `?v=`, i.e. a cache miss, so this never serves stale
// SDE; unchanged files survive any number of deploys. maxEntries 150 ≈ 2x the
// lazy set (9 files + 64 typeInfo shards): a deploy leaves old `?v=` entries
// behind; the 90-day cap evicts them.
// The base path comes from the registration scope (= Vite's `base`), not
// `import.meta`, which would break sw.js as a classic script (check-sw.mjs).
const scopePath = new URL(self.registration.scope).pathname;
registerRoute(
  ({ url, request }) => isVersionedSdeData(url, request.mode, self.location.origin, scopePath),
  new CacheFirst({
    cacheName: 'sde-data',
    plugins: [
      cacheOnly200,
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 90 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Build chunks outside the boot graph (vite.config.ts `lazyChunksPlugin`, what
// `lazy-chunks.json` lists) are not precached: the install stays small, and the
// idle warm (src/sde/warmLazySde.ts) fetches them where the connection allows.
// Cache-first under their content-hashed URL, so a changed chunk is a new
// entry. The entry cap is a backstop; `dropStaleChunks` is the real cleanup.
const LAZY_CHUNK_CACHE = 'lazy-chunks';
registerRoute(
  ({ url, request }) => isLazyChunk(url, request.mode, self.location.origin, scopePath),
  new CacheFirst({
    cacheName: LAZY_CHUNK_CACHE,
    plugins: [cacheOnly200, new ExpirationPlugin({ maxEntries: 1500, purgeOnQuotaError: true })],
  })
);

// A deploy renames the chunks whose code changed, so the previous build's would pile up.
// When a build's worker takes over, drop the cached ones its list no longer
// names. An unreadable list deletes nothing (`chunksToDelete`).
async function dropStaleChunks(): Promise<void> {
  try {
    const response = await fetch(`${scopePath}lazy-chunks.json`, { cache: 'no-store' });
    if (!response.ok) return;
    const body: unknown = await response.json();
    // The list is the server's current build. Another build than this worker's
    // (a deploy since it installed) must not prune what its page still needs.
    const precached = precacheManifest.map((entry) =>
      typeof entry === 'string' ? entry : entry.url
    );
    if (!listMatchesBuild(body, precached)) return;
    const files = parseLazyChunksJson(body);
    const cache = await caches.open(LAZY_CHUNK_CACHE);
    const keys = await cache.keys();
    const doomed = new Set(
      chunksToDelete(
        keys.map((key) => chunkKey(key.url, scopePath)),
        files
      )
    );
    await Promise.all(
      keys.filter((key) => doomed.has(chunkKey(key.url, scopePath))).map((key) => cache.delete(key))
    );
  } catch {
    // Offline mid-activation: the next build's worker cleans up.
  }
}
self.addEventListener('activate', (event) => event.waitUntil(dropStaleChunks()));

// EVE image server: every icon/render/bp is `max-age=3600`, so without this
// each one revalidated hourly. Type art only changes with a game expansion.
registerRoute(
  ({ url }) => isEveTypeImage(url),
  new CacheFirst({
    cacheName: 'eve-type-images',
    plugins: [
      cacheOnly200,
      new ExpirationPlugin({
        maxEntries: 3000,
        maxAgeSeconds: 30 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// R2 contract-offer objects (ADR 0019): immutable, content-addressed by hash, so
// cache-first is always correct. The server already says `immutable`; this keeps
// them across browser-cache eviction. A short age cap, since the writer deletes
// superseded objects after a few days and a cached one is then never named again.
registerRoute(
  ({ url }) => isContractSnapshotObject(url),
  new CacheFirst({
    cacheName: 'contract-offer-objects',
    plugins: [
      cacheOnly200,
      new ExpirationPlugin({
        maxEntries: 400,
        maxAgeSeconds: 3 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Portraits and logos do change (a new portrait, a corp rebrand): serve the
// cached one instantly and refresh it in the background.
registerRoute(
  ({ url }) => isEvePortraitImage(url),
  new StaleWhileRevalidate({
    cacheName: 'eve-portraits',
    plugins: [
      cacheOnly200,
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 30 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Tapping a notification (best-practice audit): focus an open window and move
// it to the event's page, or open one if nothing of ours is running. Without
// this listener a tap did nothing at all. The decision logic is in
// `features/notifications/notificationClick.ts` so it can be unit-tested —
// this file stays orchestration-only per ADR 0007.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    handleNotificationClick(
      {
        matchAll: () => self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
        openWindow: (target) => self.clients.openWindow(target),
        origin: self.location.origin,
      },
      urlFromNotificationData(event.notification.data)
    )
  );
});

function pushEnv(): PushEnv {
  return {
    showNotification: (title, options) => self.registration.showNotification(title, options),
    recordFeedEntry,
    characterName: async (characterId) => (await db.characters.get(characterId))?.name,
    resolveNames: (fire) => resolvePushNames(fire),
    timeZone: readTimeZone,
  };
}

// A push must always result in a shown notification (ADR 0009/0010): WebKit
// revokes the subscription if a push event completes without posting one, so
// there is no silent path here, including a malformed payload. Decision logic
// (payload parsing, the fallback, the Notification Feed write) lives in
// `features/notifications/pushHandler.ts` so it's unit-tested — this file
// stays orchestration-only per ADR 0007's carve-out. `event.data.text()`
// rather than `.json()`: `.text()` never throws on malformed bytes, which is
// what lets `pushHandler.ts` treat "invalid JSON" as an ordinary value to
// fall back on instead of an exception this file would have to catch.
self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(pushEnv(), event.data ? event.data.text() : null, Date.now()));
});
