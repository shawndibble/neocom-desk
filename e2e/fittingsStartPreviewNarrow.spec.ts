import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { answerAnyType } from './support/universeTypes';

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
  await signInAndGoto(page, './ships/fittings');
  await answerAnyType(page);
  await page.setViewportSize(size);
  await page.getByRole('button', { name: /^PvP Rifter/ }).hover();
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
      await expect
        .poll(async () => {
          const box = await value.boundingBox();
          const lineHeight = await value.evaluate((el) =>
            parseFloat(getComputedStyle(el).lineHeight)
          );
          return box !== null && box.height <= lineHeight + 1;
        })
        .toBe(true);
    }

    const boxes = [];
    for (const name of ['EM', 'Therm', 'Kin', 'Exp']) {
      const header = page.getByRole('columnheader', { name, exact: true }).first();
      await expect(header).toBeVisible();
      boxes.push((await header.boundingBox())!);
    }
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 0.5);
    }
  });

  test('at 1440px the Ring stays beside the stats', async ({ page }) => {
    await openInGamePreview(page, { width: 1440, height: 900 });

    const slot = page.getByLabel(/^High slots 1[:,]/);
    await expect(slot).toBeVisible();
    const ring = (await slot.boundingBox())!;
    const meters = (await page.getByRole('meter', { name: 'CPU' }).boundingBox())!;
    expect(ring.x + ring.width).toBeLessThanOrEqual(meters.x);
  });
});
