import { test, expect, PHONE } from './support/testBase';

const PARAGRAPHS = [/^Here is everything logging in grants/];

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
  await page.setViewportSize(PHONE);
  await page.goto('./');
  for (const text of PARAGRAPHS) {
    const p = page.locator('section[aria-labelledby="login-trust-heading"] p', { hasText: text });
    await expect(p).toBeVisible();
    const box = await p.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});
