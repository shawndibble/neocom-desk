import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

test('desktop: first Tab is the skip link, Enter moves focus past the rail', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, './overview');
  await expect(page.locator('#route-outlet h1').first()).toBeVisible();

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
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview');
  await expect(page.locator('#route-outlet h1').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /skip to content/i })).toHaveCount(0);
});
