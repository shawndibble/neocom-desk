import type { Page, Route } from '@playwright/test';

export async function loginAndSelectCharacter(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await page.waitForURL(/\/overview$/);
}

export async function goExternallyOffline(page: Page): Promise<void> {
  const disconnect = (route: Route) => route.abort('internetdisconnected');
  await page.route('https://esi.evetech.net/**', disconnect);
  await page.route('https://market.fuzzwork.co.uk/**', disconnect);
  await page.route('https://images.evetech.net/**', disconnect);
  await page.route('https://login.eveonline.com/**', disconnect);
}

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
        cursor.update({ ...cursor.value, fetchedAt: Date.now() - 2 * ONE_DAY_MS });
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
}

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
