import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { IMPLANT_NAMES } from './support/fixtureData';

test.beforeEach(async ({ page }) => {
  await loginAndSelectCharacter(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.waitForURL(/\/skills$/);
});

/** The StatChip label and value are separate sibling <span>s; scope by the label's parent. */
function statChip(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('..');
}

test('renders trained skills grouped by SDE group, with SP totals', async ({ page }) => {
  await expect(statChip(page, 'Total SP')).toContainText('264,000');
  await expect(statChip(page, 'Unallocated SP')).toContainText('500');

  // Groups start collapsed; expand everything before asserting on skill rows.
  await page.getByRole('button', { name: 'Expand all' }).click();

  await expect(page.getByRole('heading', { name: 'Spaceship Command' })).toBeVisible();
  await expect(page.getByText('Caldari Frigate')).toBeVisible();
  await expect(page.getByText('256,000 SP')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Gunnery' })).toBeVisible();
  await expect(page.getByText('Small Hybrid Turret')).toBeVisible();
  await expect(page.getByText('8,000 SP')).toBeVisible();
});

test('shows implant names, not type IDs', async ({ page }) => {
  for (const name of Object.values(IMPLANT_NAMES)) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
});
