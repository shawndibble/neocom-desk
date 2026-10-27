/**
 * Command Palette smoke (#2318): Ctrl+K opens it over a signed-in page, a
 * search finds a tab, Enter navigates there. The rail's Go to button and the
 * phone's More-sheet search open it too (scope decision
 * `20261002-145653-go-to-button-opens-the-command-palette`).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

/**
 * The shell (and its Ctrl+K listener) is up once the rail is. Not `main`: the
 * boot screen has one too, and a chord pressed there goes nowhere.
 */
async function shellReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('complementary').getByRole('link', { name: 'Overview' })
  ).toBeVisible();
}

test('Ctrl+K opens the palette, searches and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
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
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAndGoto(page, './overview');

  await shellReady(page);
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox');
  await input.fill('wallet');
  await page.keyboard.press('Escape');
  await expect(input).toBeHidden();
});

test('the rail’s Go to button opens the palette', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAndGoto(page, './overview');
  await shellReady(page);

  await page.getByRole('button', { name: /go to/i }).click();
  await expect(page.getByRole('combobox')).toBeFocused();
});

test('the phone’s More sheet search opens the palette', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
