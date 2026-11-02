/**
 * Settings › Market: the inline percent values (Reprocessing yield, Reprocessing
 * tax) put their text on the control column's edge, the same x as the hint
 * beneath them (issue #5788). The hover box hangs into the gutter instead.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
];

for (const size of SIZES) {
  test(`Refining percent values sit on the hint edge at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await signInAndGoto(page, './settings/market');

    // The seeded Character has skills, so the form asks for the reprocessing yield, not the base.
    for (const name of ['Reprocessing yield', 'Reprocessing tax']) {
      const button = page.getByRole('button', { name: new RegExp(`Edit ${name}`) });
      await expect(button).toBeVisible();
      const textX = await button.evaluate((el) => {
        const node = [...el.childNodes].find(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
        )!;
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().x;
      });
      const hint = button.locator('xpath=ancestor::*[.//p][1]//p').first();
      const hintBox = await hint.boundingBox();
      expect(Math.abs(textX - hintBox!.x)).toBeLessThanOrEqual(1);
    }
  });
}
