/**
 * Sold/Watch/Manual/Delete button group alignment on a stacked phone card
 * (issue #1053): `SoldSplitButton` renders its own `justify-end` wrapper,
 * which `.dt-stack td`'s CSS cannot reach — jsdom has no real layout engine,
 * so only a real browser can show the regression. Covers both consumers:
 * Industry's Records tab (`ProductionLogPanel`) and a Build Plan's own
 * Production Runs panel (`ProductionRunsPanel`).
 *
 * A run (and, for the Build Plan panel, its plan) is seeded directly into
 * IndexedDB rather than driven through a "create plan, log a run" UI flow —
 * matches the raw-`indexedDB` precedent in `support/login.ts`'s
 * `expireCachedEsiRows`, run only after `loginAndSelectCharacter` so the
 * app's own Dexie schema has already opened the stores.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const RUN_ID = 'e2e-run-1';
const PLAN_ID = 'e2e-plan-1';
/** Rifter / Rifter Blueprint — same pair `ProductionLogPanel.test.tsx` uses. */
const PRODUCT_TYPE_ID = 587;
const BLUEPRINT_TYPE_ID = 691;

async function seedFixtures(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, productTypeID, blueprintTypeID, planId, runId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['buildPlans', 'productionRuns'], 'readwrite');
        tx.objectStore('buildPlans').put({
          id: planId,
          characterId,
          name: 'Rifter Line',
          blueprintTypeID,
          runs: 1,
          me: 0,
          te: 0,
          facility: 'npcStation',
          rigLevel: 'none',
          security: 'highsec',
          hubId: 'jita',
          updatedAt: now,
        });
        tx.objectStore('productionRuns').put({
          id: runId,
          characterId,
          buildPlanId: planId,
          productTypeID,
          quantity: 10,
          materialCost: 500_000,
          jobFee: 50_000,
          totalCost: 550_000,
          loggedAt: now,
          updatedAt: now,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    {
      characterId: CHARACTER_ID,
      productTypeID: PRODUCT_TYPE_ID,
      blueprintTypeID: BLUEPRINT_TYPE_ID,
      planId: PLAN_ID,
      runId: RUN_ID,
    }
  );
}

/**
 * Unfolds the runs table — both panels start it collapsed, but under
 * different copy (`ProductionLogPanel`'s "All production runs" vs
 * `ProductionRunsPanel`'s "Production Runs"), so the caller names its own
 * show-label and table-label.
 */
async function expandRunsTable(page: Page, showLabel: string, tableLabel: string) {
  const toggle = page.getByRole('button', { name: showLabel, exact: true });
  await expect(toggle).toBeVisible();
  await toggle.click();
  return page.getByRole('table', { name: tableLabel });
}

/**
 * The Sold-actions wrapper's `justify-content`, plus its left edge against
 * the rendered text of a genuine label/value sibling cell — not "Logged",
 * which is `dt-primary` (the card's hoisted title, with no label gutter of
 * its own). Scoped to the single seeded row so a future extra unlabelled
 * column can't make this silently match the wrong cell.
 */
async function measure(page: Page, tableLabel: string) {
  return page.evaluate((label) => {
    const table = document.querySelector(`table[aria-label="${label}"]`)!;
    const row = table.querySelector('tbody tr')!;
    const siblingCell = row.querySelector('td[data-label="Total cost"]')!;
    const actionsCell = row.querySelector('td[data-label=""]')!;
    const wrapper = actionsCell.querySelector(':scope > div')!;

    const range = document.createRange();
    range.selectNodeContents(siblingCell);

    return {
      justifyContent: getComputedStyle(wrapper).justifyContent,
      wrapperLeft: wrapper.getBoundingClientRect().left,
      siblingTextLeft: range.getBoundingClientRect().left,
    };
  }, tableLabel);
}

test.describe('Sold action buttons — stacked phone card', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSelectCharacter(page);
    await seedFixtures(page);
  });

  test('Records tab: starts at the card label gutter below sm', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry?tab=records');
    await expandRunsTable(page, 'Show all production runs', 'All production runs');

    const { justifyContent, wrapperLeft, siblingTextLeft } = await measure(
      page,
      'All production runs'
    );
    expect(justifyContent).not.toBe('flex-end');
    expect(Math.abs(wrapperLeft - siblingTextLeft)).toBeLessThanOrEqual(2);
  });

  test('Records tab: stays right-aligned at and above sm', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./industry?tab=records');
    await expandRunsTable(page, 'Show all production runs', 'All production runs');

    expect((await measure(page, 'All production runs')).justifyContent).toBe('flex-end');
  });

  test("Build Plan's Production Runs panel: starts at the card label gutter below sm", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`./industry/plans/${PLAN_ID}`);
    await expandRunsTable(page, 'Show production runs', 'Production Runs');

    const { justifyContent, wrapperLeft, siblingTextLeft } = await measure(page, 'Production Runs');
    expect(justifyContent).not.toBe('flex-end');
    expect(Math.abs(wrapperLeft - siblingTextLeft)).toBeLessThanOrEqual(2);
  });
});
