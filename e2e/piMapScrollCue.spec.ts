/**
 * PI Map: a board wider than its panel shows an edge chevron so the clipped
 * columns are discoverable; nothing changes when it fits or on a phone.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, PLAN_WINS_COLONIES } from './support/piColonies';
import { mockHubPrices } from './support/piPrices';

async function open(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await signInAndGoto(page, './planetary-industry/map');
  await mockPlannerColonies(page, PLAN_WINS_COLONIES);
  await mockHubPrices(page);
  await page.goto('./planetary-industry/map');
}

test('Map 1024: clipped board shows a trailing cue, then a leading one at the end', async ({
  page,
}) => {
  await open(page, { width: 1024, height: 768 });
  const scroller = page.getByTestId('pi-map-scroll');
  await expect(scroller).toBeVisible({ timeout: 20_000 });
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(page.getByTestId('pi-map-scroll-after')).toBeVisible();
  await expect(page.getByTestId('pi-map-scroll-before')).toHaveCount(0);
  await scroller.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect(page.getByTestId('pi-map-scroll-after')).toHaveCount(0);
  await expect(page.getByTestId('pi-map-scroll-before')).toBeVisible();
});

test('Map 1440: a board that fits draws no cue', async ({ page }) => {
  await open(page, { width: 1440, height: 900 });
  const scroller = page.getByTestId('pi-map-scroll');
  await expect(scroller).toBeVisible({ timeout: 20_000 });
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  await expect(page.getByTestId('pi-map-scroll-after')).toHaveCount(0);
  await expect(page.getByTestId('pi-map-scroll-before')).toHaveCount(0);
});
