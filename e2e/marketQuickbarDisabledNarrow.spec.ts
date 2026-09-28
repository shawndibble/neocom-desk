/**
 * Market Browser Quickbar actions at phone width with no active character
 * (issue #2162): the price-alert bell, the item context menu's "Add to
 * Quickbar", and its "Set price alert…" entry all explained their disabled
 * state only via a native `title=`, unreachable on touch — a phone user saw
 * dead controls with no way to learn why. All three now wrap the disabled
 * trigger in a tap-reachable `Tooltip` instead (`RequireCharacter` gates on
 * character *count*, not the active selection, so a phone with a signed-in
 * Character but none active — `clearActiveCharacter`'s own documented case —
 * still reaches the Market Browser to hit this).
 *
 * No change above `md` is out of scope for this spec: the mouse-hover
 * `title=`/native tooltip path was never broken, so there's nothing new to
 * assert there.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const REASON = 'Select a character to use the Quickbar';

/**
 * Drops the persisted active-character selection without removing the
 * Character itself, then reloads so `useActiveCharacter`'s `hydrate` re-reads
 * the setting as null — `useQuickbar`'s `available` flag follows it.
 */
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

    // The item view under test fetches an Order Book, Price History and the
    // item's own universe/types record; the bell's disabled state doesn't
    // care what any of them hold.
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

    const bell = page.getByRole('button', { name: 'Set price alert for Tritanium' });
    await expect(bell).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    // `force`: Playwright's own actionability check treats `aria-disabled`
    // like the native attribute and refuses to tap it — exactly the
    // real-browser gap this fix closes (a real touch has no such check).
    await bell.tap({ force: true });
    await expect(page.getByRole('tooltip')).toHaveText(REASON);

    // The tap explains rather than acts: no popover opened behind the bubble.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('"Add to Quickbar" and "Set price alert…" explain their disabled state on a tap', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, './market?section=browser');
    await clearActiveCharacter(page);

    await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
    const item = page.getByRole('button', { name: 'Tritanium', exact: true });
    await expect(item).toBeVisible();
    await item.click({ button: 'right' });

    const addToQuickbar = page.getByRole('menuitem', { name: 'Add to Quickbar' });
    await expect(addToQuickbar).toHaveAttribute('aria-disabled', 'true');
    // `force`: see the price-alert bell test above.
    await addToQuickbar.tap({ force: true });
    await expect(page.getByRole('tooltip')).toHaveText(REASON);

    const priceAlert = page.getByRole('menuitem', { name: 'Set price alert…' });
    await expect(priceAlert).toHaveAttribute('aria-disabled', 'true');
    await priceAlert.tap({ force: true });
    await expect(page.getByRole('tooltip')).toHaveText(REASON);
  });
});
