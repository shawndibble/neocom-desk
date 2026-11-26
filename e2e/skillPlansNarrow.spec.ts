import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PLAN_COUNT = 40;
const LAST_PLAN_NAME = `Plan ${PLAN_COUNT}`;

async function seedManyPlans(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, count }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('skillPlans', 'readwrite');
        const store = tx.objectStore('skillPlans');
        for (let i = 1; i <= count; i++) {
          store.add({
            id: `plan-${i}`,
            characterId,
            name: `Plan ${i}`,
            entries: [],
            remapCount: 0,
            updatedAt: i,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: CHARACTER_ID, count: PLAN_COUNT }
  );
}

test('plans page: the current plan opens from the page, and every other plan is reachable from the All plans popover at 390px', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedManyPlans(page);
  await page.setViewportSize(PHONE);
  await page.goto('./skills/plans');

  await expect(page.getByRole('link', { name: new RegExp(`^${LAST_PLAN_NAME}\\b`) })).toBeVisible();

  await page.getByRole('button', { name: 'All plans' }).click();
  const dialog = page.getByRole('dialog', { name: 'All plans' });

  const firstRow = dialog.getByRole('link', { name: /^Plan 1\b/ });
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow).toBeVisible();
});

test('plan editor: the open plan name is visible in the header at 390px (#1709)', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedManyPlans(page);
  await page.setViewportSize(PHONE);
  await page.goto('./skills/plans/plan-7');

  const nameField = page.getByRole('textbox', { name: 'Plan name' });
  await expect(nameField).toBeVisible();
  await expect(nameField).toHaveValue('Plan 7');
});
