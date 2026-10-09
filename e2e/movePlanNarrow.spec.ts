/**
 * Assets > Move at 390px (issue #2947): the tab must not
 * scroll sideways and its actions must stay reachable. jsdom has no layout, so
 * only a real browser can check either.
 *
 * Assets are seeded by overriding the `/assets` route before login (the
 * pattern `assetsItemColumns.spec.ts` documents). Jita 4-4 is a real NPC
 * station id, so name resolution never needs a live ESI call.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const STATION = 60003760;

test('Move tab fits a phone and keeps its actions reachable', async ({ page }) => {
  await page.route(`**/characters/${CHARACTER_ID}/assets*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        [34, 35, 36, 269].map((type_id, i) => ({
          item_id: i + 1,
          type_id,
          quantity: 1_000 * (i + 1),
          location_id: STATION,
          location_flag: 'Hangar',
          location_type: 'station',
          is_singleton: false,
        }))
      ),
    })
  );
  await signInAndGoto(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./assets/move');

  const dialog = page.getByRole('region', { name: 'Plan a move' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox').first()).toBeVisible();

  const noSidewaysScroll = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    );
  expect(await noSidewaysScroll()).toBe(true);
  const sheetFitsWidth = await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(sheetFitsWidth).toBe(true);

  // The destination and the action bar are on screen without scrolling.
  await expect(dialog.getByRole('button', { name: 'Pick a system' })).toBeInViewport();
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  await expect(cancel).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Show plan' })).toBeInViewport();
  await cancel.click();
  await expect(page).toHaveURL(/\/assets\/items/);
  await expect(dialog).toBeHidden();
});
