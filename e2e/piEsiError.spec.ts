/**
 * PI ESI error state (#2691): a /planets 5xx on a cold cache reads as "ESI
 * didn't answer" with a Retry on Plan, Map and Colonies, never "no colonies".
 * A warm cache keeps its data when a refresh fails. `PI_SHOTS=<dir>` also
 * writes screenshots.
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
const NOTICE = "ESI didn't answer";

/** Fails the colony list read with a 503 while `state.down`; everything else falls through to the colony mocks. */
async function openWithPlanetsDown(page: Page, tab: string, startDown: boolean) {
  const state = { down: startDown };
  await signInAndGoto(page, `./planetary-industry/${tab}`);
  await mockPlannerColonies(page, PLAN_WINS_COLONIES);
  await mockHubPrices(page);
  await page.route(`https://esi.evetech.net/characters/${CHARACTER_ID}/planets`, (route) =>
    state.down
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"down"}' })
      : route.fallback()
  );
  await page.goto(`./planetary-industry/${tab}`);
  return state;
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.PI_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

for (const [label, viewport] of VIEWPORTS) {
  for (const tab of TABS) {
    test(`${tab} ${label}: cold cache + 503 says ESI didn't answer, Retry recovers`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(viewport);
      const state = await openWithPlanetsDown(page, tab, true);
      const alert = page.getByRole('alert').filter({ hasText: NOTICE });
      await expect(alert).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/no colonies yet/i)).toHaveCount(0);
      await expect(page.getByText(/Reconnect/)).toHaveCount(0);
      const box = await alert.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      // The notice owns the colony slot only: Plan keeps Find best, Map keeps its board (#2760).
      if (tab === 'plan') {
        await expect(page.getByRole('group', { name: 'What do you want to do?' })).toBeVisible();
      }
      if (tab === 'map') {
        await expect(
          page.getByRole('group', { name: /^Planet map|^Planets$/ }).first()
        ).toBeVisible();
      }
      await shot(page, `esi-error-${tab}-${label}`);

      state.down = false;
      await alert.getByRole('button', { name: 'Retry' }).click();
      await expect(alert).toHaveCount(0, { timeout: 30_000 });
      if (tab !== 'colonies') {
        // Focus lands on the result, never on <body>.
        await expect
          .poll(() => page.evaluate(() => document.activeElement?.tagName))
          .not.toBe('BODY');
      }
      await shot(page, `esi-retry-${tab}-${label}`);
    });
  }
}

test('colonies: a warm cache keeps its rows when a refresh gets a 503', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize(VIEWPORTS[1][1]);
  const state = await openWithPlanetsDown(page, 'colonies', false);
  await expect(page.getByRole('heading', { name: /Hek VI/ }).first()).toBeVisible({
    timeout: 30_000,
  });
  state.down = true;
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /Hek VI/ }).first()).toBeVisible();
  await expect(page.getByText(NOTICE)).toHaveCount(0);
});
