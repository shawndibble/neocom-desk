/**
 * Open Fitting header (issue #1925): the action buttons wrap as one group, so at 1024
 * Fittings, Compare, Export and Save share a line and the header stays about two rows
 * tall; at 1440 it is still one row. Structure only — no stat figure is awaited.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

async function answerAnyType(page: Page) {
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
}

async function openRifter(page: Page) {
  const newFromHull = page.getByRole('button', { name: 'New from hull' });
  const hullSearch = page.getByRole('searchbox', { name: 'Search hulls' });
  await newFromHull.or(hullSearch).first().waitFor();
  if (await newFromHull.isVisible()) await newFromHull.click();
  await hullSearch.fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: 'Start fitting' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rifter' })).toBeVisible();
}

async function headerMetrics(page: Page) {
  const header = page
    .locator('div.rounded-xs')
    .filter({ has: page.getByRole('heading', { level: 1, name: 'Rifter' }) })
    .last();
  const names = ['Fittings', 'Compare', 'Export', 'Save'];
  const ys: number[] = [];
  for (const name of names) {
    const box = await header.getByRole('button', { name, exact: false }).first().boundingBox();
    expect(box, name).not.toBeNull();
    ys.push(box!.y);
  }
  return { ys, height: (await header.boundingBox())!.height };
}

test.describe('Open Fitting header action group', () => {
  test('keeps the four action buttons on one line at 1024x768', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await signInAndGoto(page, './fittings');
    await answerAnyType(page);
    await openRifter(page);

    const { ys, height } = await headerMetrics(page);
    for (const y of ys) expect(y).toBeCloseTo(ys[0], 0);
    expect(height).toBeLessThan(130);
  });

  test('is a single row at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAndGoto(page, './fittings');
    await answerAnyType(page);
    await openRifter(page);

    const { ys, height } = await headerMetrics(page);
    for (const y of ys) expect(y).toBeCloseTo(ys[0], 0);
    expect(height).toBeLessThan(90);
  });
});
