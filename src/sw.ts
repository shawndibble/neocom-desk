/// <reference lib="webworker" />
/// <reference types="vite/client" />

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
import { resolvePublicNames, resolvePushNames } from '@/features/notifications/pushNames';
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
clientsClaim();

cleanupOutdatedCaches();
const precacheManifest = self.__WB_MANIFEST;
precacheAndRoute(precacheManifest, {
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
});

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  })
);

const DAY_SECONDS = 24 * 60 * 60;
const cacheOnly200 = new CacheableResponsePlugin({ statuses: [200] });
const notHtml = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.headers.get('content-type')?.includes('text/html') ? null : response,
};

const scopePath = new URL(self.registration.scope).pathname;
registerRoute(
  ({ url, request }) => isVersionedSdeData(url, request.mode, self.location.origin, scopePath),
  new CacheFirst({
    cacheName: 'sde-data',
    plugins: [
      cacheOnly200,
      notHtml,
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 90 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

const LAZY_CHUNK_CACHE = 'lazy-chunks';
registerRoute(
  ({ url, request }) => isLazyChunk(url, request.mode, self.location.origin, scopePath),
  new CacheFirst({
    cacheName: LAZY_CHUNK_CACHE,
    plugins: [
      cacheOnly200,
      notHtml,
      new ExpirationPlugin({ maxEntries: 1500, purgeOnQuotaError: true }),
    ],
  })
);

async function dropStaleChunks(): Promise<void> {
  try {
    const response = await fetch(`${scopePath}lazy-chunks.json`, { cache: 'no-store' });
    if (!response.ok) return;
    const body: unknown = await response.json();
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
  } catch {}
}
self.addEventListener('activate', (event) => event.waitUntil(dropStaleChunks()));

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
    resolveIds: (ids) => resolvePublicNames(ids),
    alreadyNotified: async (key) =>
      (await db.notificationFeed.get(key))?.notifiedHereAt !== undefined,
    timeZone: readTimeZone,
  };
}

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(pushEnv(), event.data ? event.data.text() : null, Date.now()));
});
