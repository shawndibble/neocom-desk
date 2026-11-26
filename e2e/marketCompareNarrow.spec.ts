import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

async function fillCompareSet(page: Page) {
  await signInAndGoto(page);
  await page.route(/\/markets\/\d+\/orders/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route(/\/universe\/types\/\d+$/, async (route) => {
    const typeId = Number(/\/universe\/types\/(\d+)$/.exec(route.request().url())![1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type_id: typeId,
        name: `Type ${typeId}`,
        description: '',
        group_id: 46,
        published: true,
        dogma_attributes: [],
      }),
    });
  });
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill('1MN Afterburner I');
  await page.getByRole('button', { name: '1MN Afterburner I', exact: true }).click();
  await page.getByRole('tab', { name: /^Variations/ }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}

const HANDLE = /^Compare \(\d+\)$/;

test('Compare drawer handle meets the 36px touch floor at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await fillCompareSet(page);

  const handle = page.getByRole('button', { name: HANDLE });
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(36);
});

test('Compare drawer handle keeps its compact height at and above md (1280px)', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await fillCompareSet(page);

  const handle = page.getByRole('button', { name: HANDLE });
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBe(36);
});
