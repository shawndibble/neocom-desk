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
import { isEvePortraitImage, isEveTypeImage, isVersionedSdeData } from '@/lib/swRoutes';

declare let self: ServiceWorkerGlobalScope;

// registerType: 'prompt' (vite.config.ts) — the worker must stay in
// `waiting` until ReloadPrompt triggers it (auto, once idle/hidden) via
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
precacheAndRoute(self.__WB_MANIFEST, {
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

// SDE files not in the precache (vite.config.ts globIgnores): cache-first
// under their content-versioned URL. A changed file is a new `?v=`, i.e. a
// cache miss, so this never serves stale SDE; unchanged files survive any
// number of deploys. maxEntries ~2x the file count and a 90-day age cap so
// superseded versions get evicted rather than accumulating.
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
        maxEntries: 32,
        maxAgeSeconds: 90 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

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
