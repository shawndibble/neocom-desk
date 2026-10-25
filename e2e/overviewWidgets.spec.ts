/**
 * The Overview widget grid, end to end: the first-run Role chooser, Customize
 * (remove, Undo, Cancel, Add), a widget's menu, the alerts bell panel and the
 * Danger banner, and the phone's Customize list. Geometry lives in
 * overviewNarrow.spec.ts.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { overviewLayoutSetting, signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, SCOPES } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
// The first load on a cold dev server is slow; later assertions use the default budget.
const FIRST_LOAD = { timeout: 20_000 };

const THREE = [
  overviewLayoutSetting([
    { kind: 'training', size: 'S' },
    { kind: 'wallet', size: 'S' },
    { kind: 'mail', size: 'S' },
  ]),
];

const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

test('first run asks for a role, builds the grid, and keeps it after a reload', async ({
  page,
}) => {
  await signInAndGoto(page, './overview');
  await expect(page.getByRole('heading', { name: /what do you do in eve/i })).toBeVisible(
    FIRST_LOAD
  );

  await page.getByRole('button', { name: /trader/i }).click();
  await page.getByRole('button', { name: /build my overview/i }).click();

  await expect(card(page, 'Open orders')).toBeVisible();
  await expect(card(page, 'Wallet')).toBeVisible();
  await expect(page.getByRole('heading', { name: /what do you do in eve/i })).toHaveCount(0);

  await page.reload();
  await expect(card(page, 'Wallet')).toBeVisible();
  await expect(page.getByRole('heading', { name: /what do you do in eve/i })).toHaveCount(0);
});

test('Customize removes a widget, Undo brings it back, Cancel restores, Done keeps', async ({
  page,
}) => {
  await signInAndGoto(page, './overview', SCOPES, THREE);
  await expect(card(page, 'Training')).toBeVisible(FIRST_LOAD);

  await page.locator('main').getByRole('button', { name: 'Customize' }).click();
  await expect(page.getByRole('region', { name: 'Customize the Overview' })).toBeVisible();
  // The edit bar owns Done: the header's Customize is gone, not duplicated.
  await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Remove Training' }).click();
  await expect(card(page, 'Training')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card(page, 'Training')).toBeVisible();

  await page.getByRole('button', { name: 'Remove Wallet' }).click();
  await expect(card(page, 'Wallet')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(card(page, 'Wallet')).toBeVisible();
  await expect(card(page, 'Training')).toBeVisible();

  await page.locator('main').getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('button', { name: 'Remove Mail' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(card(page, 'Mail')).toHaveCount(0);
  await page.reload();
  await expect(card(page, 'Wallet')).toBeVisible();
  await expect(card(page, 'Mail')).toHaveCount(0);
});

test('Customize adds a widget from the Gallery', async ({ page }) => {
  await signInAndGoto(page, './overview', SCOPES, THREE);
  await expect(card(page, 'Training')).toBeVisible(FIRST_LOAD);
  const cards = page.locator('main section[aria-label]');
  await expect(cards).toHaveCount(3);

  await page.locator('main').getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('button', { name: /^Add widget$/ }).click();
  const gallery = page.getByRole('dialog', { name: 'Add a widget' });
  await expect(gallery).toBeVisible();
  await gallery.getByRole('button', { name: /^Add / }).first().click();
  await expect(cards).toHaveCount(4);
});

test('the Gallery list scrolls only up and down; in the drawer the category row scrolls sideways', async ({
  page,
}) => {
  await signInAndGoto(page, './overview', SCOPES, THREE);
  await expect(card(page, 'Training')).toBeVisible(FIRST_LOAD);
  await page.locator('main').getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('button', { name: /^Add widget$/ }).click();
  const gallery = page.getByRole('dialog', { name: 'Add a widget' });
  await expect(gallery).toBeVisible();
  // A desktop opens in Browse all, whose rail is a column; the drawer keeps the sideways row.
  const sidewaysIn = () =>
    gallery.evaluate((root) =>
      [root, ...root.querySelectorAll('*')]
        // Only a scroller can scroll sideways. An `overflow: visible` box that
        // spills shows up at the scroller it spills into; counting it too made
        // this flaky: a Recharts preview's inner box spills while its
        // ResponsiveContainer is still 0px wide, before its first resize.
        .filter((el) => {
          const { overflowX } = getComputedStyle(el);
          return (
            el.scrollWidth > el.clientWidth + 1 && (overflowX === 'auto' || overflowX === 'scroll')
          );
        })
        // sr-only helpers clip themselves
        .filter((el) => !el.classList.contains('sr-only'))
        .map((el) => el.getAttribute('role') ?? el.className.toString())
    );
  expect(await sidewaysIn()).toEqual([]);
  await gallery.getByRole('button', { name: 'Quick add' }).click();
  // Exactly one thing may scroll sideways: the category chips (role=group).
  expect(await sidewaysIn()).toEqual(['group']);
});

test("a widget's menu offers its settings and closes on Escape", async ({ page }) => {
  await signInAndGoto(page, './overview', SCOPES, THREE);
  await expect(card(page, 'Wallet')).toBeVisible(FIRST_LOAD);

  const trigger = page.getByRole('button', { name: 'Settings for Wallet' });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /duplicate/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /remove from overview/i })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the bell opens the alerts panel and Escape closes it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAndGoto(page, './overview', SCOPES, THREE);
  const bell = page.locator('main').getByRole('button', { name: /^Alerts/ });
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Alerts' });
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
});

/** The Notification Feed row a poll would write, put straight into the app's IndexedDB. */
async function writeDangerAlert(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('notificationFeed', 'readwrite');
        tx.objectStore('notificationFeed').put({
          id: 'e2e-danger',
          characterId,
          eventId: 'eveNotification',
          eveType: 'StructureUnderAttack',
          title: 'Structure under attack',
          body: 'Test Citadel is under attack.',
          firedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: CHARACTER_ID }
  );
}

test('a danger alert draws the banner and a red bell; Acknowledge clears both', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAndGoto(page, './overview', SCOPES, THREE);
  await expect(card(page, 'Wallet')).toBeVisible(FIRST_LOAD);
  await writeDangerAlert(page);
  // A reload, not a live query: the write comes from outside the app's own Dexie connection.
  await page.reload();

  const banner = page.locator('main').getByText('Structure under attack').first();
  await expect(banner).toBeVisible();
  await expect(page.locator('main').getByRole('button', { name: /one is danger/ })).toBeVisible();

  await page.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(page.locator('main').getByText('Structure under attack')).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: /one is danger/ })).toHaveCount(0);
});

test('phone Customize is a reorder and remove list with 36px targets', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview', SCOPES, THREE);
  await expect(card(page, 'Training')).toBeVisible(FIRST_LOAD);

  await page.locator('main').getByRole('button', { name: 'Customize' }).click();
  await expect(page.getByText(/set on a larger screen/i)).toBeVisible();
  const remove = page.getByRole('button', { name: 'Remove Training' });
  await expect(remove).toBeVisible();
  await expect
    .poll(async () => (await remove.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(36);
  await expect
    .poll(
      async () =>
        (await page.getByRole('button', { name: 'Move Wallet up' }).boundingBox())?.height ?? 0
    )
    .toBeGreaterThanOrEqual(36);

  await remove.click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(card(page, 'Training')).toHaveCount(0);
  await expect(card(page, 'Wallet')).toBeVisible();
});
