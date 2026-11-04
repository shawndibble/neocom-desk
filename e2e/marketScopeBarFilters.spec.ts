/**
 * From `lg` up the finder column beside the order book holds the distance
 * select, so the scope bar's funnel popover must not repeat it. The popover's
 * fields render on `FilterField`'s inline surface, which used to drop the
 * `sm:hidden` the bar passes, and so showed both controls twice. A phone has
 * no inline controls, so its sheet still holds the distance.
 *
 * Playwright rather than jsdom: whether a control is hidden comes down to
 * `sm:hidden` and `display: contents`, which jsdom cannot evaluate.
 */
import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

async function openTritanium(page: Page) {
  await page.route('https://esi.evetech.net/markets/*/orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('https://esi.evetech.net/markets/*/history*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('https://esi.evetech.net/universe/types/*', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"nf"}' })
  );
  await signInAndGoto(page, './market?section=browser');
  await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
  await page.getByRole('button', { name: 'Tritanium', exact: true }).click();
}

test("from lg up the distance is the finder column's, not the scope bar's or its funnel's (1440px)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTritanium(page);
  const bar = page.getByRole('region', { name: 'Where the order book is looking' });
  await expect(bar.getByRole('combobox', { name: 'Distance' })).toHaveCount(0);
  // One select on the page, in the finder column beside the book.
  await expect(page.getByRole('combobox', { name: 'Distance' })).toHaveCount(1);

  await bar.getByRole('button', { name: /^Filters/ }).click();
  const popover = page.getByRole('dialog', { name: 'Where to look' });
  await expect(popover.getByRole('spinbutton', { name: 'Min quantity' })).toBeVisible();
  await expect(popover.getByRole('combobox', { name: 'Distance' })).toBeHidden();
});

test('with a Jump Range set, the bar says it in words and the origin is not repeated (1440px)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTritanium(page);
  await page.getByRole('combobox', { name: 'Distance' }).click();
  await page.getByRole('option', { name: 'Within 5 jumps' }).click();
  const bar = page.getByRole('region', { name: 'Where the order book is looking' });
  await expect(bar.getByText(/Within 5 jumps of/)).toBeVisible();
  // The range is in the finder, so the bar's funnel does not count it.
  await expect(bar.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();

  await bar.getByRole('button', { name: /^Filters/ }).click();
  const popover = page.getByRole('dialog', { name: 'Where to look' });
  await expect(popover.getByRole('spinbutton', { name: 'Min quantity' })).toBeVisible();
  await expect(popover.getByRole('combobox', { name: 'Distance' })).toBeHidden();
  await expect(popover.getByRole('button', { name: /^Change current system/ })).toBeHidden();
});

test('between md and lg the scope bar popover with a range set stays clear of the nav rail (768px)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await openTritanium(page);
  const bar = page.getByRole('region', { name: 'Where the order book is looking' });
  await bar.getByRole('button', { name: /^Filters/ }).click();
  const popover = page.getByRole('dialog', { name: 'Where to look' });
  // Below `lg` the finder is hidden beside an open item: the range is set here.
  await popover.getByRole('combobox', { name: 'Distance' }).click();
  await page.getByRole('option', { name: 'Within 5 jumps' }).click();
  await expect(popover.getByRole('button', { name: /^Change current system/ })).toBeVisible();
  const nav = (await page.getByRole('navigation').first().boundingBox())!;
  const box = (await popover.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(nav.x + nav.width);
});

test('a phone keeps the distance control in the scope bar sheet (390px)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openTritanium(page);
  const bar = page.getByRole('region', { name: 'Where the order book is looking' });

  await bar.getByRole('button', { name: /^Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Where to look' });
  await expect(sheet.getByRole('combobox', { name: 'Distance' })).toBeVisible();
});
