/**
 * The logged-out landing page's permissions disclosure (the read-scope and
 * write-exception paragraphs under the trust cards) is body text, not fine
 * print: 14px, capped near 768px so a line stays readable (issue #3514).
 */
import { test, expect } from './support/testBase';

const PARAGRAPHS = [/^Logging in lets it read/, /^It also asks for five permissions that write/];

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`permissions disclosure is 14px and capped at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('./');
    for (const text of PARAGRAPHS) {
      const p = page.locator('section[aria-labelledby="login-trust-heading"] p', { hasText: text });
      await expect(p).toBeVisible();
      await expect(p).toHaveCSS('font-size', '14px');
      const box = await p.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(800);
    }
  });
}

test('permissions disclosure stays on screen at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  for (const text of PARAGRAPHS) {
    const p = page.locator('section[aria-labelledby="login-trust-heading"] p', { hasText: text });
    await expect(p).toBeVisible();
    const box = await p.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});
