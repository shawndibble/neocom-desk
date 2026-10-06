/**
 * The PI Map at laptop, wide and phone widths: the page never scrolls
 * sideways, and a click on a product opens the detail panel the way the width
 * says (a drawer over the map below ~1500px of map panel, docked beside it
 * above, a bottom sheet on a phone). Playwright rather than jsdom because only
 * a real layout engine can tell the widths apart.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, mockPiHubPrices, mockPiSkills } from './support/piColonies';
import { expectNoPageOverflow } from './support/overflow';

async function openMap(page: import('@playwright/test').Page): Promise<void> {
  await signInAndGoto(page, './planetary-industry/colonies');
  await mockPlannerColonies(page);
  await mockPiHubPrices(page);
  await mockPiSkills(page);
  await page.goto('./planetary-industry/map');
}

test.describe('PI Map', () => {
  test('1440: no sideways page scroll; a product opens the drawer and Escape closes it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page);
    // Well past the 5s default: the tab awaits the SDE bake, every colony's detail and a hub read.
    const board = page.getByRole('group', { name: /^Planet map/ });
    await expect(board).toBeVisible({ timeout: 20_000 });
    await expectNoPageOverflow(page);

    // A product tile is a real link to its PI detail (`?product=`).
    const product = board.getByRole('link', { name: /^Coolant\. Refined/ });
    await product.click();
    const drawer = page.getByRole('dialog', { name: 'How to make it' });
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(/[?&]product=9832\b/);
    await expect(drawer.getByRole('link', { name: 'View in Market' })).toBeVisible();
    await expectNoPageOverflow(page);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(product).toBeFocused();
  });

  test('1920: the detail panel docks beside the map instead of covering it', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await openMap(page);
    await expect(page.getByRole('group', { name: /^Planet map/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-detail-mode="docked"]')).toBeVisible();
    await page
      .getByRole('group', { name: /^Planet map/ })
      .getByRole('link', { name: /^Coolant\. Refined/ })
      .click();
    await expect(page.getByRole('complementary', { name: 'How to make it' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectNoPageOverflow(page);
  });

  test('390: no sideways page scroll; a tapped product opens a bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMap(page);
    await expect(page.getByRole('group', { name: 'Planets' })).toBeVisible({ timeout: 20_000 });
    await expectNoPageOverflow(page);

    await page.getByRole('button', { name: 'P2', exact: true }).click();
    await page
      .getByRole('link', { name: /Coolant/ })
      .first()
      .click();
    const sheet = page.getByRole('dialog', { name: 'How to make it' });
    await expect(sheet).toBeVisible();
    await expectNoPageOverflow(page);

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
    // "Show full map" scrolls inside its own container, never the page.
    await page.getByRole('button', { name: 'Show full map' }).click();
    await expectNoPageOverflow(page);
  });
});
