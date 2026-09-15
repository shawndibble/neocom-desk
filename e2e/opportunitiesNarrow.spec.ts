/**
 * Build Opportunities' selection checkbox on a phone (mobile UX pass): the
 * `select` column's blank `header` gave it no context once `DataTable`
 * stacked the row into a card — it rendered as an orphaned, unlabelled 16px
 * checkbox on its own blank-labelled line between the row's title and its
 * first real field. The fix marks the column `cardCorner: true` (the same
 * corner-icon mechanism `TaxTab.tsx`'s decorative edit affordance already
 * uses), pinning it out of the label/value flow, and wraps the checkbox in a
 * `size-11 md:size-4` label so a thumb gets a real target below `md` while
 * the checkbox itself stays the exact 16px glyph — and cell position — it
 * always was at or above `md` (desktop unaffected).
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

test.describe('Opportunities selection checkbox — stacked phone card', () => {
  test.beforeEach(async ({ page }) => {
    await seedOwnedBlueprint(page);
    await loginAndSelectCharacter(page);
  });

  test('pins to the card corner, off the label/value flow, at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry?tab=opportunities');

    const checkbox = page.getByRole('checkbox', { name: /Select Rifter/ });
    await expect(checkbox).toBeVisible();

    // The `cardCorner` positioning lands on the cell itself, not the label.
    const cell = checkbox.locator('xpath=ancestor::td[1]');
    const position = await cell.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('absolute');

    // A real touch target below `md`, not just the 16px glyph.
    const label = checkbox.locator('xpath=..');
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // No orphaned blank-labelled line above "Blueprint" any more: the
    // checkbox sits at/above the row's title, not between it and the
    // first real field.
    const blueprintLabel = page.getByText('Blueprint', { exact: true });
    const [checkboxBox, labelBox] = await Promise.all([
      checkbox.boundingBox(),
      blueprintLabel.boundingBox(),
    ]);
    expect(checkboxBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    expect(checkboxBox!.y).toBeLessThan(labelBox!.y);
  });

  test('stays an ordinary 16px table cell at desktop width, unchanged', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./industry?tab=opportunities');

    const checkbox = page.getByRole('checkbox', { name: /Select Rifter/ });
    await expect(checkbox).toBeVisible();

    const cell = checkbox.locator('xpath=ancestor::td[1]');
    const position = await cell.evaluate((el) => getComputedStyle(el).position);
    expect(position).not.toBe('absolute');

    const label = checkbox.locator('xpath=..');
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(16, 0);
    expect(box!.height).toBeCloseTo(16, 0);
  });
});
