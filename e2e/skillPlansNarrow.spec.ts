/**
 * Skill Plans list pane on a phone (issue #1096): `useViewportBoundedHeight`
 * sizes the list's scroller off the raw viewport height, with no knowledge of
 * `Layout.tsx`'s fixed mobile tab bar below `md` — the same bug class already
 * shipped as #1054 for Mail. `PlanListPane` applied that height unconditionally
 * in `'viewport'` mode (the list route's default), so a character with enough
 * plans to fill the list had the last one(s) sit behind the opaque tab bar with
 * no further scroll to reach them. The fix gates the computed max-height to
 * desktop only (the same pattern `PlanEditor.tsx` already ships for the same
 * hook) — on phone the list falls back to normal document flow, which
 * `Layout.tsx`'s bottom padding already clears.
 *
 * Enough plans are seeded directly into IndexedDB (Dexie's own reactivity
 * doesn't see a write made through the raw API, so a full navigation is used
 * to pick them up fresh) to overflow one phone screen, then the last plan's
 * row is checked against the fixed tab bar's own bounding box.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
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

test('plan list: the last plan row is reachable above the fixed tab bar at 390px', async ({
  page,
}) => {
  await loginAndSelectCharacter(page);
  await seedManyPlans(page);
  await page.setViewportSize(PHONE);
  await page.goto('./skills/plans');

  const lastRow = page.getByRole('button', { name: LAST_PLAN_NAME, exact: true });
  await expect(lastRow).toBeVisible();

  // Scrolls the page itself, not the list pane, to its end: the fix's whole
  // point is that the list no longer scrolls internally on phone.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const tabBar = page.getByRole('navigation', { name: 'Mobile navigation' });
  const [rowBox, tabBarBox] = await Promise.all([lastRow.boundingBox(), tabBar.boundingBox()]);

  expect(rowBox).not.toBeNull();
  expect(tabBarBox).not.toBeNull();
  expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(tabBarBox!.y);
});
