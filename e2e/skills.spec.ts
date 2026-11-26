import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

test.beforeEach(async ({ page }) => {
  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Trained' }).click();
  await page.waitForURL(/\/skills\/trained$/);
});

function statChip(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('..');
}

test('renders trained skills grouped by SDE group, with SP totals', async ({ page }) => {
  await expect(statChip(page, 'Total SP')).toContainText('264,000');
  await expect(statChip(page, 'Unallocated SP')).toContainText('500');

  await page.getByRole('button', { name: 'Expand all' }).click();

  await expect(page.getByRole('heading', { name: 'Spaceship Command' })).toBeVisible();
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();
  await expect(page.getByText('256,000 SP')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Gunnery' })).toBeVisible();
  await expect(page.getByText('Small Hybrid Turret', { exact: true })).toBeVisible();
  await expect(page.getByText('8,000 SP')).toBeVisible();
});
