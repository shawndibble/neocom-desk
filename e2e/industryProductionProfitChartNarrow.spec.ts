/**
 * Production Log profit chart Y-axis at 390px (issue #1160) — the same
 * clipping bug already fixed on `WalletBalanceChart` (#764) and
 * `PriceHistoryChart`/`MiningYieldCharts` (#772): a `YAxis` narrow enough
 * that a wide tick label's leading digit renders outside the SVG's own
 * coordinate space rather than a plain CSS overflow. Only a real browser
 * lays that out, so this asserts actual rendered geometry rather than
 * trusting that the source now imports the same constants as those charts.
 *
 * Two production runs, sold on two different local days, so
 * `productionProfitHistory` emits the two cumulative points the chart needs
 * to render at all (`profitHistoryPoints.length >= 2` gates it) — the
 * second day's sale is priced to push the running total past 1B ISK, the
 * threshold #764 reproduced the clip at.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };

const PLAN_ID = 'e2e-profit-plan-1';
const RUN_ID_SMALL = 'e2e-profit-run-small';
const RUN_ID_LARGE = 'e2e-profit-run-large';
/** Rifter / Rifter Blueprint — same pair the industry Records spec above uses. */
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
        // A small, ordinary first point — the running total after this one
        // stays well under 1B, so the second run's jump is what the test
        // exercises.
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
        // A single large batch, sold for enough that the cumulative running
        // total crosses 1B ISK on this second point — #764's own repro
        // threshold for the leading digit clipping outside the axis gutter.
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

    await page.goto('./industry?tab=records');

    const chart = page.getByRole('img', { name: 'Realized profit over time' });
    await expect(chart).toBeVisible();
    // The tallest tick's text only exists once Recharts has measured and
    // laid out the axis — `toBeVisible` above only confirms the container.
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
    // Anchors this test to the 1B+ scenario specifically — without it, a
    // seed that silently degraded to small-magnitude ticks would still pass
    // the geometry check below trivially (a narrow number always clears the
    // left edge), and the regression this guards against would go untested.
    expect(
      geometry.tickTexts.some((text) => text.includes('B')),
      `no billion-scale tick rendered — tick texts: ${geometry.tickTexts.join(', ')}`
    ).toBe(true);
    const minTickLeft = Math.min(...geometry.tickLefts);
    const reported = `tick texts: ${geometry.tickTexts.join(', ')}; leftmost tick at ${Math.round(minTickLeft)}px, chart container at ${Math.round(geometry.containerLeft)}px`;
    // A clipped leading digit renders outside the chart's own box — its
    // glyphs start to the left of the container that's supposed to hold
    // them. A tolerance of 1px absorbs sub-pixel rounding, not a real clip.
    expect(
      minTickLeft,
      `Y-axis tick renders outside the chart container — ${reported}`
    ).toBeGreaterThanOrEqual(geometry.containerLeft - 1);
  });
});
