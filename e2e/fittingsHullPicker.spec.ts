/**
 * Fittings Start screen hull picker (issue #1637): the class list scrolls
 * vertically only — no class is stranded off the right edge of a
 * height-capped multi-column box.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test.describe('Fittings — hull picker', () => {
  for (const viewport of WIDTHS) {
    test(`scrolls vertically to the last class at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signInAndGoto(page, './fittings');

      // Nothing is listed until the player searches; "e" matches (nearly) every
      // class, so the full list is what gets measured. The list renders once the
      // static market catalogue has loaded.
      await page.getByRole('searchbox', { name: 'Search hulls' }).fill('e');
      const list = page.getByTestId('hull-list');
      await expect(list).toBeVisible({ timeout: 30_000 });

      const overflow = await list.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      const last = list.getByRole('heading', { name: /Special Edition Ships/ });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeVisible();
      const listBox = (await list.boundingBox())!;
      const box = (await last.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(listBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(listBox.x + listBox.width + 1);
    });
  }
});
