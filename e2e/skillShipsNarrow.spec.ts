/**
 * Skills → Ships "Attach a fit" toggle and "Remove" link touch targets (issue
 * #1392): both were bare 16px underlined text buttons with no touch-tier
 * sizing. Fixed with `min-h-11 ... md:min-h-0`, the same precedent as #1071.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function gotoShips(page: Page) {
  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('link', { name: 'Ships' }).click();
  await page.waitForURL(/\/skills\/ships$/);
}

const height = (el: Element) => el.getBoundingClientRect().height;

test('Attach a fit toggle and Remove link meet the 44px touch floor at 390px', async ({ page }) => {
  await gotoShips(page);
  await page.setViewportSize(PHONE);

  const attach = page.getByRole('button', { name: '+ Attach a fit (optional)' });
  await expect(attach).toBeVisible();
  expect(await attach.evaluate(height)).toBeGreaterThanOrEqual(44);

  await attach.click();
  await page.getByLabel(/paste an eft fit/i).fill('[Vexor, PvE Ratting]');
  await page.getByRole('button', { name: 'Check Fit' }).click();

  const remove = page.getByRole('button', { name: 'Remove' });
  await expect(remove).toBeVisible();
  expect(await remove.evaluate(height)).toBeGreaterThanOrEqual(44);
});

test('Attach a fit toggle stays compact at and above md (1280px)', async ({ page }) => {
  await gotoShips(page);
  await page.setViewportSize(DESKTOP);

  const attach = page.getByRole('button', { name: '+ Attach a fit (optional)' });
  await expect(attach).toBeVisible();
  expect(await attach.evaluate(height)).toBeLessThan(30);
});
