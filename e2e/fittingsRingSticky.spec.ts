/**
 * Open Fitting Ring column (issue #1929): at lg and up the Ring column stays in view
 * while the tall stats column is scrolled. Structure only — no stat figure is awaited.
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

test.describe('Open Fitting Ring column stays in view', () => {
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
  ]) {
    test(`is still on screen after scrolling to the page bottom at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await signInAndGoto(page, './fittings');
      await answerAnyType(page);
      await openRifter(page);

      const column = page.getByTestId('fitting-editor-column');
      await expect(column).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const box = await column.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThan(-2); // sub-pixel slack: it sits at the grid's end
      expect(box!.y).toBeLessThan(height);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      ).toBe(true);
    });
  }
});
