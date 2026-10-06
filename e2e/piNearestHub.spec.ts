/**
 * PI header strip suggests the nearest trade hub for a far-from-Jita home
 * (#2705). Real gate routes from the shipped jump graph: Tanoo (highsec) is 4
 * jumps from Rens against 19 from Jita; FMH-OV (nullsec) is 34 from Hek
 * against 42 from Jita. `PI_SHOTS=<dir>` also writes screenshots.
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

async function open(page: Page, systemId: number): Promise<void> {
  const colonies = PLAN_WINS_COLONIES.map((c) => ({ ...c, systemId }));
  await signInAndGoto(page, './planetary-industry/plan');
  await mockPlannerColonies(page, colonies);
  await mockHubPrices(page);
  await page.goto('./planetary-industry/plan');
}

for (const [label, viewport] of VIEWPORTS) {
  for (const [home, systemId, hub, jumps] of [
    ['highsec', 30000001, 'Rens', 4],
    ['nullsec', 30000484, 'Hek', 34],
  ] as const) {
    test(`${label}, ${home} home: suggests ${hub}, accepting sells there`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, systemId);
      const hint = page.getByTestId('pi-nearest-hub');
      await expect(hint).toContainText(`Nearest hub: ${hub}, ${jumps} jumps`, { timeout: 20_000 });
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      );
      expect(fits).toBe(true);
      const dir = process.env.PI_SHOTS;
      if (dir) await page.screenshot({ path: `${dir}/nearest-hub-${home}-${label}.png` });
      await hint.getByRole('button', { name: `Sell at ${hub}` }).click();
      await expect(hint).toBeHidden();
      await expect(page.getByRole('combobox', { name: 'Where do you sell?' })).toHaveText(hub);
    });
  }
}
