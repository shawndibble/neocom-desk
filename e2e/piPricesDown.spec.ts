/**
 * PI with the hub price read failing: ISK is blanked, nothing else.
 * `PI_SHOTS=<dir>` also writes screenshots.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, PLAN_WINS_COLONIES } from './support/piColonies';

const VIEWPORTS = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }],
] as const;
const NOTICE = 'Hub prices could not be fetched';

async function openPricesDown(page: Page, tab: string) {
  await signInAndGoto(page, `./planetary-industry/${tab}`);
  await mockPlannerColonies(page, PLAN_WINS_COLONIES);
  await page.route('https://market.fuzzwork.co.uk/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"down"}' })
  );
  await page.goto(`./planetary-industry/${tab}`);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.PI_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

for (const [label, viewport] of VIEWPORTS) {
  test(`map ${label}: prices down keeps the board, no ISK`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await openPricesDown(page, 'map');
    await expect(page.getByText(NOTICE)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('group', { name: /^Planet map|^Planets$/ }).first()).toBeVisible();
    // The notice itself names ISK; nothing else may.
    await expect(
      page.getByText(/\bISK\b/).filter({ hasNotText: 'hidden until they load' })
    ).toHaveCount(0);
    await shot(page, `prices-down-map-${label}`);
  });

  test(`plan ${label}: prices down keeps price-free wins, no gain`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await openPricesDown(page, 'plan');
    await expect(page.getByText(NOTICE)).toBeVisible({ timeout: 30_000 });
    const panel = page.locator('section', {
      has: page.getByRole('heading', { name: /Quick wins/ }),
    });
    await expect(panel.getByRole('checkbox').first()).toBeVisible();
    await expect(panel).not.toContainText('ISK');
    await shot(page, `prices-down-plan-${label}`);
  });

  test(`colonies ${label}: prices down shows the notice, not "still loading"`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await openPricesDown(page, 'colonies');
    await expect(page.getByText(NOTICE)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/still loading/)).toHaveCount(0);
    await shot(page, `prices-down-colonies-${label}`);
  });
}
