/**
 * Employment History on a phone (issue #5694): a long corporation name in the
 * "Longest stay" chip ends in an ellipsis instead of pushing the page
 * sideways, and the Character sub-nav opens with its current tab on screen.
 */
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const LONG_NAME = 'The Extraordinarily Long Named Corporation Of Many Many Words Indeed';

// The past corporation's year beats the current one's months, so it is the longest stay.
const CORP_HISTORY = [
  { record_id: 2, corporation_id: 98000002, start_date: '2026-01-01T00:00:00Z' },
  { record_id: 1, corporation_id: 98000001, start_date: '2025-01-01T00:00:00Z' },
];

const CORP_NAMES = [
  { id: 98000002, name: 'Current Corp', category: 'corporation' },
  { id: 98000001, name: LONG_NAME, category: 'corporation' },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.route(`**/characters/${CHARACTER_ID}/corporationhistory`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CORP_HISTORY),
    })
  );
  await page.route('**/universe/names', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CORP_NAMES),
    })
  );
  await signInAndGoto(page, './employment-history');
  // The timeline carries the name in full; once it shows, so does the chip.
  await expect(
    page.getByRole('list', { name: 'Employment' }).getByRole('link', { name: LONG_NAME })
  ).toBeVisible();
});

test('a long Longest-stay corporation name does not widen the page at 390px', async ({ page }) => {
  const chip = page.getByText('Longest stay', { exact: true }).locator('..');
  await expect(chip).toContainText('Extraordinarily');

  await expectNoPageOverflow(page);

  const box = (await chip.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
});

test('the current sub-nav tab is fully inside the strip at 390px', async ({ page }) => {
  const subNav = page.getByRole('navigation', { name: 'Overview' });
  const current = subNav.locator('[aria-current="page"]');
  await expect(current).toHaveText('Employment');

  // The strip's scroller is the nav's parent; the data-age badge sits beside it.
  const scroller = subNav.locator('..');
  await expect(async () => {
    const strip = (await scroller.boundingBox())!;
    const tab = (await current.boundingBox())!;
    expect(tab.x).toBeGreaterThanOrEqual(strip.x - 0.5);
    expect(tab.x + tab.width).toBeLessThanOrEqual(strip.x + strip.width + 0.5);
  }).toPass();

  // The data-age badge sits outside the scroller, so it stays on screen too.
  const badge = page.getByText('Data updated');
  await expect(badge).toBeInViewport({ ratio: 1 });
});
