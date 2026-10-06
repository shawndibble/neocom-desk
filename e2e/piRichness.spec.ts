/**
 * The planet richness override (#2685): the Colonies row links to the Map's
 * `?planet=` drawer, where the pilot ticks the resources they would pull.
 * Playwright for the real layout at phone and laptop width.
 * `PI_SHOTS=<dir>` writes screenshots there.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, mockPiHubPrices, mockPiSkills } from './support/piColonies';
import { expectNoPageOverflow } from './support/overflow';

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.PI_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

async function openColonies(page: Page): Promise<void> {
  await signInAndGoto(page, './planetary-industry/colonies');
  await mockPlannerColonies(page);
  await mockPiHubPrices(page);
  await mockPiSkills(page);
  await page.goto('./planetary-industry/colonies');
  await expect(page.locator('[data-colony-status]').first()).toBeVisible({ timeout: 20_000 });
}

for (const [label, size] of [
  ['390', { width: 390, height: 844 }],
  ['1440', { width: 1440, height: 900 }],
] as const) {
  test(`${label}: Colonies links to the richness drawer, and a pick is saved`, async ({ page }) => {
    await page.setViewportSize(size);
    await openColonies(page);

    const row = page.locator('[data-colony-status]').first();
    await row.getByRole('button', { name: /^Show details for / }).click();
    await row.getByRole('link', { name: 'Which resources do you pull here?' }).click();

    await expect(page).toHaveURL(/\/planetary-industry\/map\?planet=\d+/);
    const picks = page.getByRole('group', { name: 'Resources you would pull here' });
    await expect(picks).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Optional', { exact: true })).toBeVisible();
    await expectNoPageOverflow(page);

    const first = picks.getByRole('button').first();
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await shot(page, `richness-${label}`);

    // Saved: the write lands, and the pick survives a reload.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open('neocom');
              open.onsuccess = () => {
                const req = open.result
                  .transaction('planetRichness')
                  .objectStore('planetRichness')
                  .count();
                req.onsuccess = () => resolve(req.result);
              };
            })
        )
      )
      .toBeGreaterThan(0);
    await page.reload();
    await expect(
      page.getByRole('group', { name: 'Resources you would pull here' }).getByRole('button').first()
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await expectNoPageOverflow(page);
  });
}
