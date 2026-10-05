/**
 * The order book's scope bar shows its distance and origin controls inline
 * from `sm` up, so its funnel popover must not repeat them. The popover's
 * fields render on `FilterField`'s inline surface, which used to drop the
 * `sm:hidden` the bar passes, and so showed both controls twice. A phone has
 * no inline controls, so its sheet still holds the distance.
 *
 * Playwright rather than jsdom: whether a control is hidden comes down to
 * `sm:hidden` and `display: contents`, which jsdom cannot evaluate.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
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

test('the scope bar funnel does not repeat the distance control beside it (1440px)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTritanium(page);
  const bar = page.getByRole('region', { name: 'Where the order book is looking' });
  await expect(bar.getByRole('combobox', { name: 'Distance' })).toBeVisible();

  await bar.getByRole('button', { name: /^Filters/ }).click();
  const popover = page.getByRole('dialog', { name: 'Where to look' });
  await expect(popover.getByRole('spinbutton', { name: 'Min quantity' })).toBeVisible();
  await expect(popover.getByRole('combobox', { name: 'Distance' })).toBeHidden();
});

test('with a Jump Range set, neither the distance nor the origin repeats in the funnel (1440px)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTritanium(page);
  const bar = page.getByRole('region', { name: 'Where the order book is looking' });
  await bar.getByRole('combobox', { name: 'Distance' }).click();
  await page.getByRole('option', { name: 'Within 5 jumps' }).click();
  const fromButtons = page.getByRole('button', { name: /^Change current system/ });
  await expect(fromButtons).toHaveCount(1);

  await bar.getByRole('button', { name: /^Filters/ }).click();
  const popover = page.getByRole('dialog', { name: 'Where to look' });
  await expect(popover.getByRole('spinbutton', { name: 'Min quantity' })).toBeVisible();
  await expect(popover.getByRole('combobox', { name: 'Distance' })).toBeHidden();
  await expect(popover.getByRole('button', { name: /^Change current system/ })).toBeHidden();
});

test('a phone keeps the distance control in the scope bar sheet (390px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTritanium(page);
  const bar = page.getByRole('region', { name: 'Where the order book is looking' });

  await bar.getByRole('button', { name: /^Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Where to look' });
  await expect(sheet.getByRole('combobox', { name: 'Distance' })).toBeVisible();
});
