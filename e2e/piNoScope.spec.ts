/**
 * PI with the planets read refused (403, #2762): the colony count is unknown,
 * not zero, so the strip shows "—", Plan and Map never say "no colonies", and
 * one login banner shows (the shell's "EVE access was refused" stays quiet on
 * PI). `PI_SHOTS=<dir>` also writes screenshots.
 */
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
      await expect(page.getByText('Log in again to see your colonies')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('EVE access was refused')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Log in again/ })).toHaveCount(1);
      await expect(page.getByTestId('pi-header-strip')).toContainText('—');
      await expect(page.getByText(/no colonies/i)).toHaveCount(0);
      await expect(page.getByText(/colonies yet/i)).toHaveCount(0);
      const dir = process.env.PI_SHOTS;
      if (dir)
        await page.screenshot({ path: `${dir}/noscope-${tab}-${label}.png`, fullPage: true });
    });
  }
}
