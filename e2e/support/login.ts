/** Drives the mocked SSO flow end to end, landing on /overview with Test Pilot active. */
import type { Page, Route } from '@playwright/test';
import { CHARACTER_NAME } from './fixtureData';

export async function loginAndSelectCharacter(page: Page): Promise<void> {
  await page.goto('./');
  // The landing page repeats this CTA (hero + closing band) — .first() is the
  // hero button, the one actually in view on load.
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await page.waitForURL(/\/characters$/);
  await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
  await page.waitForURL(/\/overview$/);
}

/**
 * Blocks every mocked external host from here on (route.abort, not
 * context.setOffline — that would also kill the localhost dev server, so a
 * subsequent reload couldn't even fetch index.html). Simulates "ESI/SSO/
 * images are unreachable" while the app itself keeps working.
 */
export async function goExternallyOffline(page: Page): Promise<void> {
  const disconnect = (route: Route) => route.abort('internetdisconnected');
  await page.route('https://esi.evetech.net/**', disconnect);
  await page.route('https://market.fuzzwork.co.uk/**', disconnect);
  await page.route('https://images.evetech.net/**', disconnect);
  await page.route('https://login.eveonline.com/**', disconnect);
}

/**
 * Backdates every `esiCache` row past its freshness window (`esi/cache.ts`),
 * so the next read attempts ESI instead of serving the row as current.
 *
 * Without this a spec cannot reach the offline-fallback path at all: a row
 * written seconds ago is inside the window, so the loader returns it without
 * touching the network and no "showing cached data" banner appears — which is
 * the caching promise working, not the fallback. Raw IndexedDB rather than
 * Dexie because this runs in the page, before the app's own module graph is
 * necessarily reachable from the test.
 */
export async function expireCachedEsiRows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('esiCache', 'readwrite');
      const store = tx.objectStore('esiCache');
      store.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        // Two days back clears both windows — the 10-minute default and the
        // 24-hour one the static/game-data loaders use.
        cursor.update({ ...cursor.value, fetchedAt: Date.now() - 2 * ONE_DAY_MS });
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
}

/**
 * Deletes every `esiCache` row, leaving the app with no local copy of anything.
 *
 * Stronger than `expireCachedEsiRows` and used for a different question. An
 * expired row is still served: `esi/cache.ts` races the live call for
 * `STALE_GRACE_MS` and then hands the stored row over, so a spec that only
 * expires rows cannot tell a retained route snapshot
 * (`lib/routeSnapshotCache.ts`) from that grace path. With the rows gone, what
 * a view renders can only be what it was already holding.
 */
export async function clearCachedEsiRows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('esiCache', 'readwrite');
      tx.objectStore('esiCache').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
}
