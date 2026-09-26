/**
 * Build Plans column-label strip vs. its rows: the strip's trailing spacer
 * used to be a fixed 36px while every row's trailing `IconButton size="sm"`
 * is `size-9 md:size-7` (28px at `md`+), so every label sat 7px left of its
 * figures at desktop widths. The spacer now follows the same `w-9 md:w-7`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const GROUP_NAME = 'Test Group';
const PLAN_NAME = 'Aligned Plan';

async function seed(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, groupName, planName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['settings', 'buildPlans'], 'readwrite');
        tx.objectStore('settings').put({
          key: 'sync.industryBuildGroups',
          value: { [characterId]: [{ id: 'g1', name: groupName, order: 0 }] },
        });
        tx.objectStore('buildPlans').put({
          id: 'plan-1',
          characterId,
          name: planName,
          blueprintTypeID: 691,
          runs: 1,
          me: 0,
          te: 0,
          facility: 'npcStation',
          rigLevel: 'none',
          security: 'highsec',
          hubId: 'jita',
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: CHARACTER_ID, groupName: GROUP_NAME, planName: PLAN_NAME }
  );
}

/** Right edge of the `nth` span of the given width class inside `scope`. */
async function rightEdge(scope: ReturnType<Page['locator']>, widthClass: string) {
  const box = await scope.locator(`span.${widthClass}`).first().boundingBox();
  expect(box).not.toBeNull();
  return box!.x + box!.width;
}

for (const width of [1440, 1024]) {
  test(`Build Plans column labels line up with plan and group cells at ${width}px`, async ({
    page,
  }) => {
    await signInAndGoto(page);
    await seed(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./industry');

    const strip = page.locator('div.border-b.bg-panel-2').filter({ hasText: /profit/i });
    await expect(strip).toBeVisible();
    const planRow = page.locator('li').filter({ hasText: PLAN_NAME });
    const groupRow = page.locator('li').filter({ hasText: GROUP_NAME });
    await expect(planRow).toBeVisible();
    await expect(groupRow).toBeVisible();

    // Profit (w-24, first), Verdict (w-14) and Runs (w-8) always show at
    // these widths; the ISK/h and Margin columns are lg+ only (1440 here).
    const classes = ['w-24', 'w-14', 'w-8'];
    for (const cls of classes) {
      const label = await rightEdge(strip, cls);
      expect(Math.abs(label - (await rightEdge(planRow, cls)))).toBeLessThanOrEqual(1);
    }
    for (const cls of ['w-24', 'w-14']) {
      const label = await rightEdge(strip, cls);
      expect(Math.abs(label - (await rightEdge(groupRow, cls)))).toBeLessThanOrEqual(1);
    }
    if (width >= 1024) {
      // Margin: the last lg+ w-16 column.
      const label = await rightEdge(strip, 'w-16');
      expect(Math.abs(label - (await rightEdge(planRow, 'w-16')))).toBeLessThanOrEqual(1);
    }
  });
}
