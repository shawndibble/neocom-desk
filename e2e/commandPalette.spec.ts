import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

async function shellReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('complementary').getByRole('link', { name: 'Overview' })
  ).toBeVisible();
}

test('Ctrl+K opens the palette, searches and navigates', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, './overview');
  await shellReady(page);

  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', {
    name: 'Search pages, commands, characters, assets and items',
  });
  await expect(input).toBeFocused();

  await input.fill('opp');
  await expect(
    page
      .getByRole('group', { name: 'Pages' })
      .getByRole('option', { name: 'Industry › Opportunities' })
  ).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(input).toBeHidden();
  await expect(page).toHaveURL(/\/industry\/opportunities$/);
});

test('Escape closes the palette even with text typed', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, './overview');

  await shellReady(page);
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox');
  await input.fill('wallet');
  await page.keyboard.press('Escape');
  await expect(input).toBeHidden();
});

test('the rail’s Go to button opens the palette', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, './overview');
  await shellReady(page);

  await page.getByRole('button', { name: /go to/i }).click();
  await expect(page.getByRole('combobox')).toBeFocused();
});

test('the phone’s More sheet search opens the palette', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview');

  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'More' })
    .click();
  await page
    .getByRole('dialog', { name: 'More' })
    .getByRole('button', { name: /search pages, items, pilots/i })
    .click();
  await expect(page.getByRole('dialog', { name: 'More' })).toBeHidden();
  await expect(page.getByRole('combobox')).toBeFocused();
});
