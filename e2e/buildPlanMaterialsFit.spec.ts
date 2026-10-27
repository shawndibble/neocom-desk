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
/** Tritanium — one of the Rifter blueprint's (691) materials. */
const TRITANIUM = 34;

async function seed(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, planId, tritanium }) => {
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
          materialSourcing: { [tritanium]: { overridePrice: 12345678.9 } },
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: CHARACTER_ID, planId: PLAN_ID, tritanium: TRITANIUM }
  );
}

// 1024 and 1249 are the stacked range the fix covers; 1250 and 1440 guard the
// side-by-side split it now starts at.
for (const width of [1024, 1249, 1250, 1440]) {
  test(`Build Plan Materials table fits its frame at ${width}px`, async ({ page }) => {
    await signInAndGoto(page);
    await seed(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`./industry/plans/${PLAN_ID}`);

    // One table per errand section (To buy, Building, …); every one of them
    // has to fit.
    const tables = page.getByRole('table', { name: /^Materials: / });
    // A cold dev server can take well past the 5s default to price the plan.
    await expect(tables.first()).toBeVisible({ timeout: 15000 });
    for (const table of await tables.all()) {
      // Every horizontal scroller between the table and the page must fit its
      // content — a clipped column behind one of them is the bug.
      const overflows = await table.evaluate((el) => {
        const scrollers: { scrollWidth: number; clientWidth: number }[] = [];
        for (let node = el.parentElement; node; node = node.parentElement) {
          const { overflowX } = getComputedStyle(node);
          if (overflowX === 'auto' || overflowX === 'scroll') {
            scrollers.push({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth });
          }
        }
        return scrollers;
      });
      expect(overflows.length).toBeGreaterThan(0);
      for (const s of overflows) expect(s.scrollWidth).toBeLessThanOrEqual(s.clientWidth);
    }
  });
}
