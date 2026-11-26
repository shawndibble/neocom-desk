import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const MD_EDGE = { width: 768, height: 800 };

async function searchTritanium(page: Page) {
  await signInAndGoto(page, './market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritaniu');
}

async function heightOf(page: Page, name: string) {
  const row = page.getByRole('button', { name, exact: true });
  await expect(row).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  return box!.height;
}

test('item-finder tree rows meet the 36px touch floor at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await searchTritanium(page);

  expect(await heightOf(page, 'Minerals')).toBeGreaterThanOrEqual(36);
  expect(await heightOf(page, 'Tritanium')).toBeGreaterThanOrEqual(36);
});

test('item-finder tree rows keep their dense height at and above md (1280px)', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await searchTritanium(page);

  expect(await heightOf(page, 'Minerals')).toBe(24);
  expect(await heightOf(page, 'Tritanium')).toBe(24);
});

test('item-finder tree rows keep their dense height at exactly md (768px)', async ({ page }) => {
  await page.setViewportSize(MD_EDGE);
  await searchTritanium(page);

  expect(await heightOf(page, 'Minerals')).toBe(24);
  expect(await heightOf(page, 'Tritanium')).toBe(24);
});

for (const viewport of [PHONE, DESKTOP]) {
  test(`a broad search shows category headers in the first viewport at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInAndGoto(page, './market');
    await page.getByRole('searchbox', { name: 'Search items' }).fill('Caldari');

    const headers = page.getByRole('button', { name: /^.+ · \d+$/ });
    await expect(headers.first()).toBeVisible();
    const box = await headers.first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

for (const size of [{ width: 1024, height: 768 }, DESKTOP, { width: 1440, height: 900 }]) {
  test(`finder keeps the Quickbar in view with a search and a pinned item (${size.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    for (const kind of ['orders', 'history']) {
      await page.route(`https://esi.evetech.net/markets/*/${kind}*`, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      );
    }
    await page.route('https://esi.evetech.net/universe/types/*', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"nf"}' })
    );
    await searchTritanium(page);
    await page.getByRole('button', { name: 'Tritanium', exact: true }).click();
    await page.getByRole('button', { name: 'Add to Quickbar' }).click();
    await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritaniu');

    const quickbar = page.getByTestId('quickbar');
    await expect(quickbar.getByRole('heading')).toBeVisible();
    const heading = await quickbar.getByRole('heading').boundingBox();
    const panel = await page.locator('section', { has: quickbar }).boundingBox();
    expect(heading!.y + heading!.height).toBeLessThanOrEqual(panel!.y + panel!.height);
    expect(panel!.height).toBeLessThanOrEqual(size.height - 32);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });
}
