/**
 * Skill Plan editor's back-to-plan-list link (issue #1095): below `lg` the
 * plan list is not on screen at all, so this link is the only way back to
 * it — and it was a bare `inline-block text-xs text-accent hover:underline`
 * anchor, a ~16px-tall tap target on exactly the viewport where it matters
 * most.
 *
 * Asserted on the rendered bounding box rather than the class string; see
 * `loyaltyStoreNarrow.spec.ts` for why.
 *
 * The plan is seeded straight into IndexedDB rather than created through the
 * "New plan" flow — same raw-`indexedDB` precedent as
 * `industryRecordsNarrow.spec.ts`, run after `loginAndSelectCharacter` so the
 * app's Dexie schema has already opened the stores.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const PLAN_ID = 'e2e-skill-plan-1';
const PLAN_NAME = 'Narrow viewport plan';

async function seedPlan(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, planId, planName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['skillPlans'], 'readwrite');
        tx.objectStore('skillPlans').put({
          id: planId,
          characterId,
          name: planName,
          entries: [],
          remapCount: 0,
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: CHARACTER_ID, planId: PLAN_ID, planName: PLAN_NAME }
  );
}

test('the back-to-plan-list link is a full sm-tier control (36px) at 390px', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await seedPlan(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(PHONE);

  const back = page.getByRole('link', { name: 'Back to plans' });
  await expect(back).toBeVisible();

  const height = await back.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(36);
});

test('the back-to-plan-list link stays absent at and above lg (1280px), where the list is on screen', async ({
  page,
}) => {
  await loginAndSelectCharacter(page);
  await seedPlan(page);
  await page.goto(`./skills/plans/${PLAN_ID}`);
  await page.setViewportSize(DESKTOP);

  // Anchor on the editor having actually rendered before asserting an
  // absence: `toHaveCount(0)` alone also passes on the loading spinner, or on
  // the `<Navigate to="/skills/plans">` the route falls back to if the seeded
  // plan never landed — neither of which says anything about the gate.
  await expect(page.getByPlaceholder('Search skills…')).toBeVisible();

  // Gated on `!isDesktop`: the plan list itself is in the sidebar here, so
  // there is no box to size — pinned so the restyling above cannot quietly
  // start rendering a second route back to a list already in view.
  await expect(page.getByRole('link', { name: 'Back to plans' })).toHaveCount(0);
});
