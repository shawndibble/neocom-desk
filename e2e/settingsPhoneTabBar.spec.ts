/**
 * Settings › Display: the "Phone tab bar" panel shows only where the bottom
 * tab bar exists (below `md`). The preference is device-local, so choosing
 * tabs on a laptop cannot reach the phone (issue #1967).
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP_SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
];

test('Display has no Phone tab bar panel at md and up', async ({ page }) => {
  for (const size of DESKTOP_SIZES) {
    await page.setViewportSize(size);
    await signInAndGoto(page, './settings/display');
    await page.waitForURL(/\/settings\/display$/);
    await expect(page.getByText(/time format/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Phone tab bar' })).toHaveCount(0);
  }
});

test('Display shows the Phone tab bar panel at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './settings/display');
  await page.waitForURL(/\/settings\/display$/);
  await expect(page.getByRole('heading', { name: 'Phone tab bar' })).toBeVisible();
});
