/**
 * Build Plan detail's Materials table at the narrow end of the pointer-width
 * range (#2165): with Costs & revenue pinned beside it at `lg`, the table's
 * scroll wrapper was 423px against 612px of content at 1024, so Price and
 * Line total — the override input included — sat out of frame with no cue.
 * The two panels now sit side by side only from `xl`; below that they stack
 * and the table gets the full width.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PLAN_ID = 'plan-fit';

async function seed(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, planId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['buildPlans'], 'readwrite');
        tx.objectStore('buildPlans').put({
          id: planId,
          characterId,
          name: 'Fit Plan',
          blueprintTypeID: 691,
          runs: 1,
          me: 0,
          te: 0,
          facility: 'npcStation',
          rigLevel: 'none',
          security: 'highsec',
          hubId: 'jita',
          // An 8-digit override: the widest Price cell a pilot plausibly types.
          materialSourcing: { 34: { overridePrice: 12345678.9 } },
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: CHARACTER_ID, planId: PLAN_ID }
  );
}

for (const width of [1024, 1279]) {
  test(`Build Plan Materials table fits its frame at ${width}px`, async ({ page }) => {
    await signInAndGoto(page);
    await seed(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`./industry/plans/${PLAN_ID}`);

    const table = page.getByRole('table', { name: 'Materials' });
    await expect(table).toBeVisible();

    // Every horizontal scroller between the table and the page must fit its
    // content — a clipped column behind one of them is the bug.
    const overflows = await table.evaluate((el) => {
      const out: { scrollWidth: number; clientWidth: number }[] = [];
      for (let node = el.parentElement; node; node = node.parentElement) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === 'auto' || overflowX === 'scroll') {
          out.push({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth });
        }
      }
      return out;
    });
    expect(overflows.length).toBeGreaterThan(0);
    for (const o of overflows) expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth);
  });
}
