/**
 * Production Runs header summary on a phone (issue #3226): the one-line
 * "N logged · profit realized · N open" read used to be squeezed beside the
 * header controls into a ~90px column, wrapping to four lines and clipping a
 * long figure. It now takes its own full-width row. Real layout only, so a
 * browser test.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PLAN_ID = 'e2e-plan-1';

test('Production Runs summary reads in at most two lines and does not clip at 390px', async ({
  page,
}) => {
  await signInAndGoto(page);
  await page.evaluate(
    async ({ characterId, planId }) => {
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
          blueprintTypeID: 691,
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
          id: 'e2e-run-1',
          characterId,
          buildPlanId: planId,
          productTypeID: 587,
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
    { characterId: CHARACTER_ID, planId: PLAN_ID }
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./industry/plans/${PLAN_ID}`);

  const summary = page.getByText(/logged · .* realized · .* open/);
  await expect(summary).toBeVisible();

  // Row 2: the summary sits beneath the title row, not squeezed beside it.
  const titleBox = (await page.getByRole('heading', { name: 'Production Runs' }).boundingBox())!;
  expect((await summary.boundingBox())!.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);

  for (const figure of [null, '-360,150,000', '-1,500,000,150,000']) {
    if (figure) {
      await summary.evaluate((el, text) => {
        el.textContent = `3 logged · ${text} ISK realized · 3 open`;
      }, figure);
    }
    const m = await summary.evaluate((el) => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      return {
        lines: Math.round(el.getBoundingClientRect().height / lineHeight),
        clipped: el.scrollWidth > el.clientWidth,
        right: el.getBoundingClientRect().right,
      };
    });
    expect(m.lines).toBeLessThanOrEqual(2);
    expect(m.clipped).toBe(false);
    expect(m.right).toBeLessThanOrEqual(390);
  }
});
