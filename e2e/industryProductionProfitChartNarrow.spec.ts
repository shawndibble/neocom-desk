import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PLAN_ID = 'e2e-profit-plan-1';
const RUN_ID_SMALL = 'e2e-profit-run-small';
const RUN_ID_LARGE = 'e2e-profit-run-large';
const PRODUCT_TYPE_ID = 587;
const BLUEPRINT_TYPE_ID = 691;
const DAY_MS = 24 * 60 * 60 * 1000;

async function seedProfitHistory(page: Page): Promise<void> {
  await page.evaluate(
    async ({
      characterId,
      productTypeID,
      blueprintTypeID,
      planId,
      smallRunId,
      largeRunId,
      dayMs,
    }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      const threeDaysAgo = now - 3 * dayMs;
      const oneDayAgo = now - 1 * dayMs;
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(
          ['buildPlans', 'productionRuns', 'productionSaleLinks'],
          'readwrite'
        );
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
          id: smallRunId,
          characterId,
          buildPlanId: planId,
          productTypeID,
          quantity: 10,
          materialCost: 500_000,
          jobFee: 50_000,
          totalCost: 550_000,
          loggedAt: threeDaysAgo,
          updatedAt: threeDaysAgo,
        });
        tx.objectStore('productionSaleLinks').put({
          id: `${characterId}:manual:${smallRunId}`,
          characterId,
          runId: smallRunId,
          quantity: 10,
          unitPrice: 100_000,
          linkedAt: threeDaysAgo,
          updatedAt: threeDaysAgo,
        });
        tx.objectStore('productionRuns').put({
          id: largeRunId,
          characterId,
          buildPlanId: planId,
          productTypeID,
          quantity: 1_000,
          materialCost: 1_000_000,
          jobFee: 100_000,
          totalCost: 1_100_000,
          loggedAt: oneDayAgo,
          updatedAt: oneDayAgo,
        });
        tx.objectStore('productionSaleLinks').put({
          id: `${characterId}:manual:${largeRunId}`,
          characterId,
          runId: largeRunId,
          quantity: 1_000,
          unitPrice: 2_000_000,
          linkedAt: oneDayAgo,
          updatedAt: oneDayAgo,
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
      smallRunId: RUN_ID_SMALL,
      largeRunId: RUN_ID_LARGE,
      dayMs: DAY_MS,
    }
  );
}

test.describe('production profit chart — 390px width', () => {
  test.use({ viewport: PHONE });

  test('Y-axis ticks stay inside the chart, not clipped, at a 1B+ ISK value', async ({ page }) => {
    await signInAndGoto(page);
    await seedProfitHistory(page);

    await page.goto('./industry/logs');

    const chart = page.getByRole('img', { name: 'Realized profit over time' });
    await expect(chart).toBeVisible();
    await expect(
      chart.locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')
    ).not.toHaveCount(0);

    const geometry = await chart.evaluate((container) => {
      const containerLeft = container.getBoundingClientRect().left;
      const ticks = Array.from(
        container.querySelectorAll(
          '.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value'
        )
      );
      return {
        containerLeft,
        tickLefts: ticks.map((tick) => tick.getBoundingClientRect().left),
        tickTexts: ticks.map((tick) => tick.textContent ?? ''),
      };
    });

    expect(geometry.tickLefts.length).toBeGreaterThan(0);
    expect(
      geometry.tickTexts.some((text) => text.includes('B')),
      `no billion-scale tick rendered — tick texts: ${geometry.tickTexts.join(', ')}`
    ).toBe(true);
    const minTickLeft = Math.min(...geometry.tickLefts);
    const reported = `tick texts: ${geometry.tickTexts.join(', ')}; leftmost tick at ${Math.round(minTickLeft)}px, chart container at ${Math.round(geometry.containerLeft)}px`;
    expect(
      minTickLeft,
      `Y-axis tick renders outside the chart container — ${reported}`
    ).toBeGreaterThanOrEqual(geometry.containerLeft - 1);
  });
});
