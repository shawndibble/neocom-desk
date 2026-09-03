/// <reference lib="webworker" />
/// <reference types="vite/client" />

/**
 * Hand-written service worker (ADR 0007, issue #176) — `vite-plugin-pwa`'s
 * `injectManifest` strategy injects the precache manifest into this file
 * instead of generating the whole worker, which is what makes a custom
 * `periodicsync` handler possible at all. Precaching, the update-prompt flow,
 * and offline routing were free from `generateSW`'s defaults before; all
 * three are re-declared explicitly below (ADR 0007's stated consequence).
 *
 * This file is orchestration/wiring only and isn't unit-tested — ADR 0007's
 * carve-out, same as `ForegroundNotificationPoller.tsx`'s scheduling shell.
 * The actual poll logic (`runForegroundPoll`, `engine/notificationDiffs.ts`)
 * and this worker's two SW-specific dependency overrides
 * (`features/notifications/backgroundPoller.ts`) are both unit-tested;
 * verify this file itself via a production build (`dist/sw.js`) and manual
 * checks in a real browser.
 */
import { clientsClaim } from 'workbox-core';
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { runForegroundPoll } from '@/features/notifications/foregroundPoller';
import { backgroundDependencies } from '@/features/notifications/backgroundPoller';
import { configureEsi } from '@/esi/client';
import { getValidAccessToken } from '@/auth/session';
import { PERIODIC_SYNC_TAG } from '@/app/backgroundSync';
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

// Periodic Background Sync (AC2): where the browser both supports it and
// has granted it (registered from the page — `app/backgroundSync.ts`), fire
// the same poll the Foreground Poller runs, against the same
// registry/diff functions from #172 — nothing here is event-specific, so a
// future event type needs no changes on this side (issue #176).
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== PERIODIC_SYNC_TAG) return;
  event.waitUntil(
    runForegroundPoll(backgroundDependencies(self.registration)).catch(() => {
      // A failed poll must not reject `waitUntil` — some browsers penalize
      // (throttle or unregister) a periodicsync tag that keeps rejecting.
    })
  );
});

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
