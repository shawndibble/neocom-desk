/**
 * PI Plan question in the URL (#2713, ADR 0015): the picked question rides in
 * `?q=` (replace, so Back leaves Plan), reloads and deep links restore it, and
 * a junk value reads as the default.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, PLAN_WINS_COLONIES } from './support/piColonies';
import { mockHubPrices } from './support/piPrices';

const VIEWPORTS = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }],
] as const;

const question = (page: Page, name: RegExp) => page.getByRole('button', { name });

for (const [label, viewport] of VIEWPORTS) {
  test(`${label}: the picked question survives reload and deep link, Back leaves Plan`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await signInAndGoto(page, './planetary-industry/colonies');
    await mockPlannerColonies(page, PLAN_WINS_COLONIES);
    await mockHubPrices(page);

    await page.goto('./planetary-industry/plan');
    const makeMore = question(page, /Make more from my planets/);
    const findBest = question(page, /Find the best thing to build/);
    await expect(makeMore).toHaveAttribute('aria-current', 'true', { timeout: 30_000 });

    await findBest.click();
    await expect(findBest).toHaveAttribute('aria-current', 'true');
    await expect(page).toHaveURL(/\?q=find-best$/);

    await page.reload();
    await expect(question(page, /Find the best thing to build/)).toHaveAttribute(
      'aria-current',
      'true',
      { timeout: 30_000 }
    );

    // Deep link to another question.
    await page.goto('./planetary-industry/plan?q=product');
    await expect(question(page, /Make a specific product/)).toHaveAttribute(
      'aria-current',
      'true',
      { timeout: 30_000 }
    );

    // Junk reads as the default.
    await page.goto('./planetary-industry/plan?q=nonsense');
    await expect(question(page, /Make more from my planets/)).toHaveAttribute(
      'aria-current',
      'true',
      { timeout: 30_000 }
    );

    // Picking replaces history: Back goes to the page before Plan, not the prior question.
    await page.goto('./planetary-industry/colonies');
    await page.goto('./planetary-industry/plan');
    await question(page, /Find the best thing to build/).click();
    await question(page, /Make a specific product/).click();
    await expect(page).toHaveURL(/\?q=product$/);
    await page.goBack();
    await expect(page).toHaveURL(/planetary-industry\/colonies/);

    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(viewport.width);
  });
}
