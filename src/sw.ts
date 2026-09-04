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
import { configureEsi } from '@/esi/client';
import { getValidAccessToken } from '@/auth/session';
import {
  handleNotificationClick,
  urlFromNotificationData,
} from '@/features/notifications/notificationClick';

declare let self: ServiceWorkerGlobalScope;

// The worker is a separate module graph from the page, so `configureEsi`
// (a module-level singleton, `esi/client.ts`) needs wiring here too, exactly
// as `App.tsx` wires it for the page. Plain `getValidAccessToken`, not the
// page's `getAccessTokenReportingFailures` wrapper — that publishes to a
// zustand auth-failure store the page's UI reads, which this worker has no
// separate instance of and nothing here would ever observe.
//
// No listener in this file calls `esiFetch` today (the `periodicsync`
// handler that did is retired, ADR 0009) — this wiring stays because the
// `push` handler that replaces it will: `backgroundPoller.ts`'s
// `sendBackgroundNotification` resolves item/skill names via ESI
// (`notificationText`, `foregroundPoller.ts`) before it can build a
// notification body.
configureEsi({ getToken: (characterId) => getValidAccessToken(characterId) });

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
