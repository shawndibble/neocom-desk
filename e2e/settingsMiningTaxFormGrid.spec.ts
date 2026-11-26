import type { Locator } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
];

const style = (locator: Locator) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fontSize: cs.fontSize, fontWeight: cs.fontWeight };
  });

for (const size of SIZES) {
  test(`Moon mining tax rows match the sibling form grid at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);

    await signInAndGoto(page, './settings/industry');
    const siblingLabel = page.locator('label[for="settings-bpc-hide-auctions"]').first();
    await expect(siblingLabel).toBeVisible();
    const expectedLabel = await style(siblingLabel);
    const expectedNote = await style(
      page.locator('label[for="settings-bpc-hide-plex"]').locator('xpath=following-sibling::p')
    );

    await page.goto('./settings/miningTax');
    const ids = [
      'settings-mining-tax-compressed-ore',
      'settings-mining-tax-ore-value-mode',
      'settings-mining-tax-auto-continue',
    ];
    const xs: number[] = [];
    for (const id of ids) {
      const checkbox = page.locator(`#${id}`);
      await expect(checkbox).toBeAttached();
      const label = page.locator(`label[for="${id}"]`).first();
      expect(await style(label)).toEqual(expectedLabel);
      const note = label.locator('xpath=following-sibling::p');
      expect(await style(note)).toEqual(expectedNote);
      const box = await checkbox.locator('xpath=..').boundingBox();
      xs.push(Math.round(box!.x));
    }
    expect(new Set(xs).size).toBe(1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
