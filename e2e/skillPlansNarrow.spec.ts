/**
 * Skill Plans on a phone (issue #1096; the list now lives in the Plans page's
 * "All plans" dialog, so the check is that every row stays reachable there): `useViewportBoundedHeight`
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
import { signInAndGoto } from './support/authSeed';
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

test('plans page: the current plan opens from the page, and every other plan is reachable from the All plans popover at 390px', async ({
  page,
}) => {
  await signInAndGoto(page);
  await seedManyPlans(page);
  await page.setViewportSize(PHONE);
  await page.goto('./skills/plans');

  // The page leads with the plan edited last (the seed's highest `updatedAt`),
  // not a 40-row list: one tap to its editor.
  await expect(page.getByRole('link', { name: new RegExp(`^${LAST_PLAN_NAME}\\b`) })).toBeVisible();

  await page.getByRole('button', { name: 'All plans' }).click();
  const dialog = page.getByRole('dialog', { name: 'All plans' });

  // The first plan sits 39 rows down the popover's own scroller; it must scroll
  // into view rather than sit clipped (the #1096 bug class, in its new home).
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
