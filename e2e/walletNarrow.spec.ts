/**
 * Wallet Journal "Transactions →" link touch target (issue #1919): a bare
 * `text-xs` link in the Panel header `actions` (centred, so it does not
 * inherit the header's `min-h-11`) was ~14px tall. Fixed with
 * `inline-flex min-h-11 min-w-11 ... md:min-h-0 md:min-w-0`, the same
 * precedent as #1070 / #1077 / #1126.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test('Journal "Transactions →" link meets the 44px touch floor at 390px, without overflow', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './wallet/journal');

  const link = page.getByRole('link', { name: 'Transactions →' });
  await expect(link).toBeVisible();

  const box = await link.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { height: r.height, right: r.right };
  });
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.right).toBeLessThanOrEqual(PHONE.width);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await expect(page.getByRole('button', { name: /export/i }).first()).toBeVisible();
});

test('Journal "Transactions →" link keeps its text-link height at 1280px', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, './wallet/journal');

  const link = page.getByRole('link', { name: 'Transactions →' });
  await expect(link).toBeVisible();
  const height = await link.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(20);
});
