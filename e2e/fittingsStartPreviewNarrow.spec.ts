/**
 * Fittings Start screen (issue #2000): the picked fitting's preview sits in a
 * pane far narrower than the viewport, so it lays out by its own width — the
 * Ring stacks above the stats at 1024px and stays beside them at 1440px, and
 * the page never scrolls sideways.
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

async function openInGamePreview(page: Page, size: { width: number; height: number }) {
  await page.route(/\/characters\/\d+\/fittings\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          fitting_id: 1,
          name: 'PvP Rifter',
          description: '',
          ship_type_id: 587,
          items: [{ flag: 'HiSlot0', quantity: 1, type_id: 484 }],
        },
      ]),
    })
  );
  await signInAndGoto(page, './fittings');
  await answerAnyType(page);
  await page.setViewportSize(size);
  await page.getByRole('button', { name: /^PvP Rifter/ }).click();
  await expect(page.getByRole('meter', { name: 'CPU' })).toBeVisible({ timeout: 60_000 });
}

test.describe('Fittings Start preview at desktop widths', () => {
  test('at 1024px the preview stacks, fits the page, and keeps its meters and resist headers readable', async ({
    page,
  }) => {
    await openInGamePreview(page, { width: 1024, height: 768 });

    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);

    for (const label of ['CPU', 'Powergrid', 'Calibration']) {
      const value = page
        .getByRole('meter', { name: label })
        .locator('xpath=following-sibling::span');
      const box = (await value.boundingBox())!;
      const lineHeight = await value.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      expect(box.height).toBeLessThanOrEqual(lineHeight + 1);
    }

    const boxes = [];
    for (const name of ['EM', 'Therm', 'Kin', 'Exp']) {
      boxes.push(
        (await page.getByRole('columnheader', { name, exact: true }).first().boundingBox())!
      );
    }
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 0.5);
    }
  });

  test('at 1440px the Ring stays beside the stats', async ({ page }) => {
    await openInGamePreview(page, { width: 1440, height: 900 });

    const ring = (await page.getByLabel(/^High slots 1,/).boundingBox())!;
    const meters = (await page.getByRole('meter', { name: 'CPU' }).boundingBox())!;
    expect(ring.x + ring.width).toBeLessThanOrEqual(meters.x);
  });
});
