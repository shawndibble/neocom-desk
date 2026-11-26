import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const REASON = 'Select a character to use the Quickbar';

async function clearActiveCharacter(page: Page) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('settings', 'readwrite');
      tx.objectStore('settings').delete('activeCharacterId');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  await page.reload();
}

test.describe('Quickbar actions with no active character', () => {
  test.use({ hasTouch: true });

  test('the price-alert bell explains its disabled state on a tap', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, './market?section=browser');
    await clearActiveCharacter(page);

    for (const kind of ['orders', 'history']) {
      await page.route(`https://esi.evetech.net/markets/*/${kind}*`, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      );
    }
    await page.route('https://esi.evetech.net/universe/types/*', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"nf"}' })
    );
    await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
    await page.getByRole('button', { name: 'Tritanium', exact: true }).click();

    const bell = page.getByRole('button', { name: 'Set price alert' });
    await expect(bell).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    await bell.tap({ force: true });
    await expect(page.getByRole('tooltip')).toHaveText(REASON);

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
