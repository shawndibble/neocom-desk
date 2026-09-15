/**
 * Build Opportunities on a phone (mobile UX pass, issues stemming from
 * #1096's checkbox fix): `DataTable`'s stacked layout hid the sortable
 * column headers entirely (`.dt-stack thead`, `src/styles/index.css`), so a
 * phone pilot had no way to change sort — and its 8-line stacked card had no
 * single number a glance could land on. `MobileOpportunityList` replaces the
 * table below `lg` with a ranked card list: a rank badge, a "hero" metric
 * that tracks whichever field is the active sort, and a real "Sort by" menu.
 * Desktop (`isDesktop`, `lg` and up) keeps the exact `DataTable` it always
 * had — this list never mounts there.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
/** Rifter Blueprint (BPC) — same fixture pair other Industry specs use. */
const BLUEPRINT_TYPE_ID = 691;

async function seedOwnedBlueprint(page: Page): Promise<void> {
  await page.route(`**/characters/${CHARACTER_ID}/blueprints**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          item_id: 1,
          type_id: BLUEPRINT_TYPE_ID,
          runs: 5,
          material_efficiency: 10,
          time_efficiency: 20,
          quantity: 1,
          location_id: 60003760,
          location_flag: 'Hangar',
        },
      ]),
    })
  );
}

test.describe('Opportunities — ranked phone list', () => {
  test.beforeEach(async ({ page }) => {
    await seedOwnedBlueprint(page);
    await loginAndSelectCharacter(page);
  });

  test('renders a ranked card list at 390px, not the desktop table', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry?tab=opportunities');

    await expect(page.getByRole('table', { name: 'Build Opportunities' })).toHaveCount(0);
    await expect(page.getByLabel('Rank 1')).toBeVisible();
    await expect(page.getByText('Rifter', { exact: true })).toBeVisible();
  });

  test('the selection checkbox is pinned with a real ~44px target', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry?tab=opportunities');

    const checkbox = page.getByRole('checkbox', { name: /Select Rifter/ });
    await expect(checkbox).toBeVisible();

    const wrapper = checkbox.locator('xpath=..');
    const position = await wrapper.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('absolute');

    const box = await wrapper.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('changing the sort changes which metric leads the card', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry?tab=opportunities');

    await expect(page.getByRole('button', { name: /Sort by ISK\/hour/ })).toBeVisible();

    await page.getByRole('button', { name: /Sort by ISK\/hour/ }).click();
    await page.getByRole('menuitem', { name: 'Margin', exact: true }).click();

    await expect(page.getByRole('button', { name: /Sort by Margin/ })).toBeVisible();
    // The hero number's own unit label now reads "Margin", not "ISK/hour".
    await expect(page.getByText('ISK/hour', { exact: true })).toHaveCount(0);
  });

  test('a long product name wraps instead of truncating', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry?tab=opportunities');

    const name = page.getByText('Rifter', { exact: true });
    const overflowWrap = await name.evaluate((el) => getComputedStyle(el).overflowWrap);
    const textOverflow = await name.evaluate((el) => getComputedStyle(el).textOverflow);
    expect(overflowWrap).toBe('break-word');
    expect(textOverflow).not.toBe('ellipsis');
  });

  test('desktop keeps the ordinary table, unchanged, with no sort menu', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./industry?tab=opportunities');

    await expect(page.getByRole('table', { name: 'Build Opportunities' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sort by/ })).toHaveCount(0);

    const checkbox = page.getByRole('checkbox', { name: /Select Rifter/ });
    await expect(checkbox).toBeVisible();
    const box = await checkbox.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(16, 0);
    expect(box!.height).toBeCloseTo(16, 0);
  });
});
