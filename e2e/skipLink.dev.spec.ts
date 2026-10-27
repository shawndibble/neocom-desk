/**
 * The "Skip to content" link (WCAG 2.4.1): first Tab stop at `md` and up,
 * absent below it, and Enter lands on the route outlet.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

test('desktop: first Tab is the skip link, Enter moves focus past the rail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAndGoto(page, './overview');
  await expect(page.locator('#route-outlet h1').first()).toBeVisible();

  // Headless Chromium can report the page as unfocused, which swallows Tab.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.keyboard.press('Tab');
  const link = page.getByRole('link', { name: /skip to content/i });
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport({ ratio: 1 });

  await page.keyboard.press('Enter');
  await expect(page.locator('#route-outlet')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');

  await page.keyboard.press('Tab');
  const inRail = await page.evaluate(() => !!document.activeElement?.closest('aside'));
  expect(inRail).toBe(false);
});

test('phone: no skip link is rendered', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndGoto(page, './overview');
  await expect(page.locator('#route-outlet h1').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /skip to content/i })).toHaveCount(0);
});
