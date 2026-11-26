import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, PLAN_WINS_COLONIES } from './support/piColonies';
import { mockHubPrices } from './support/piPrices';
import { CHARACTER_ID } from './support/fixtureData';

const VIEWPORTS = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }],
] as const;
const TABS = ['plan', 'map', 'colonies'] as const;

async function openRefused(page: Page, tab: string) {
  await signInAndGoto(page, `./planetary-industry/${tab}`);
  await mockPlannerColonies(page, PLAN_WINS_COLONIES);
  await mockHubPrices(page);
  await page.route(`https://esi.evetech.net/characters/${CHARACTER_ID}/planets`, (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"forbidden"}' })
  );
  await page.goto(`./planetary-industry/${tab}`);
}

for (const [label, viewport] of VIEWPORTS) {
  for (const tab of TABS) {
    test(`${tab} ${label}: 403 reads unknown, one login banner`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(viewport);
      await openRefused(page, tab);
      await expect(page.getByText(/: log in again$/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/: log in again$/)).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Log in', exact: true })).toHaveCount(1);
      await page.getByRole('button', { name: 'Home, colonies and route' }).click();
      await expect(page.getByRole('dialog', { name: 'Home, colonies and route' })).toContainText(
        '—'
      );
      await expect(page.getByText(/no colonies/i)).toHaveCount(0);
      await expect(page.getByText(/colonies yet/i)).toHaveCount(0);
      const dir = process.env.PI_SHOTS;
      if (dir)
        await page.screenshot({ path: `${dir}/noscope-${tab}-${label}.png`, fullPage: true });
    });
  }
}
