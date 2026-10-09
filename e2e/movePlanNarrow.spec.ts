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
const AMARR_STATION = 60008494;

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

// Issue #3240: a pickup card's heading gave the station name the sliver left
// beside the m³ total and the Route Safety link, so it broke one word a line.
test('pickup heading gives the name a row on a phone and stays one row on desktop', async ({
  page,
}) => {
  await page.route(`**/characters/${CHARACTER_ID}/assets*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        [STATION, AMARR_STATION].map((location_id, i) => ({
          item_id: i + 1,
          type_id: 34,
          quantity: 1_000_000,
          location_id,
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
  await dialog.getByRole('checkbox', { name: /select everything at jita/i }).check();
  await dialog
    .getByRole('group', { name: 'Or one of your stations' })
    .getByRole('button', { name: /amarr/i })
    .click();
  await dialog.getByRole('button', { name: 'Show plan' }).click();

  const heading = dialog.getByRole('heading', { name: /Caldari Navy Assembly Plant/ });
  const name = heading.locator('span').first();
  const total = heading.locator('span').nth(1);
  const link = dialog.getByRole('link', { name: /^Route Safety from/ });
  const card = heading.locator('xpath=ancestor::section[1]');
  await expect(link).toBeVisible();

  const box = async (l: typeof name) => (await l.boundingBox())!;
  const [n, t, k, c] = [await box(name), await box(total), await box(link), await box(card)];
  expect(n.width).toBeGreaterThanOrEqual(c.width * 0.6);
  expect(t.y).toBeGreaterThanOrEqual(n.y + n.height - 1);
  expect(k.y).toBeGreaterThanOrEqual(n.y + n.height - 1);
  const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect(n.height).toBeLessThanOrEqual(lineHeight * 2 + 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);

  await page.setViewportSize({ width: 1024, height: 800 });
  const [dn, dt, dk] = [await box(name), await box(total), await box(link)];
  // Same vertical band: each one's top sits inside the name's row.
  expect(dt.y).toBeLessThan(dn.y + dn.height);
  expect(dk.y).toBeLessThan(dn.y + dn.height);
});
