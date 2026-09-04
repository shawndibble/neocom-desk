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
import {
  handleNotificationClick,
  urlFromNotificationData,
} from '@/features/notifications/notificationClick';
import { handlePush, type PushEnv } from '@/features/notifications/pushHandler';
import { recordFeedEntry } from '@/features/notifications/feed';

declare let self: ServiceWorkerGlobalScope;

// registerType: 'prompt' (vite.config.ts) — the worker must stay in
// `waiting` until the page's ReloadPrompt asks for it, not skip ahead on its
// own. `workbox-window`'s `messageSkipWaiting()` (behind ReloadPrompt's
// "Reload" button) sends exactly this message (AC3).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback: any non-precached navigation resolves to the cached
// index.html, except API calls (never a page navigation, but matches the
// generateSW config this replaces).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
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
