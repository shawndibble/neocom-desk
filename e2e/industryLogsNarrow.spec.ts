import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const RUN_ID = 'e2e-run-1';
const PLAN_ID = 'e2e-plan-1';
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

async function expandRunsTable(page: Page, showLabel: string, tableLabel: string) {
  const toggle = page.getByRole('button', { name: showLabel, exact: true });
  await expect(toggle).toBeVisible();
  await toggle.click();
  return page.getByRole('table', { name: tableLabel });
}

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
    await signInAndGoto(page);
    await seedFixtures(page);
  });

  test('Logs tab: starts at the card label gutter below sm', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/logs');
    await expandRunsTable(page, 'Show all production runs', 'All production runs');

    const { justifyContent, wrapperLeft, siblingTextLeft } = await measure(
      page,
      'All production runs'
    );
    expect(justifyContent).not.toBe('flex-end');
    expect(Math.abs(wrapperLeft - siblingTextLeft)).toBeLessThanOrEqual(2);
  });

  test('Logs tab: stays right-aligned at and above sm', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./industry/logs');
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

test.describe('By item card — margin on units sold (issue #1785)', () => {
  test('phone card shows Margin on units sold and Unsold cost rows', async ({ page }) => {
    await signInAndGoto(page);
    await seedFixtures(page);
    await page.setViewportSize(PHONE);
    await page.goto('./industry/logs');

    const row = page
      .locator('tbody tr', { has: page.locator('td[data-label="Unsold cost"]') })
      .first();
    await expect(row.locator('td[data-label="Margin on units sold"]')).toBeVisible();
    await expect(row.locator('td[data-label="Unsold cost"]')).toContainText('550,000');
  });
});

test.describe('Realized-profit hero — captions folded into a tooltip (issue #3127)', () => {
  for (const width of [390, 1024, 1280]) {
    test(`hero is shorter than the stat rows and the page does not overflow at ${width}px`, async ({
      page,
    }) => {
      await signInAndGoto(page);
      await seedFixtures(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./industry/logs');

      const hero = page
        .getByRole('button', { name: 'About total realized profit' })
        .locator('xpath=ancestor::div[contains(@class,"bg-panel-2")][1]');
      await expect(hero).toBeVisible();
      const heroHeight = (await hero.boundingBox())!.height;
      const rowsHeight = (await hero.locator('xpath=following-sibling::div[last()]').boundingBox())!
        .height;
      expect(heroHeight).toBeLessThan(rowsHeight);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
