/**
 * Command Palette smoke (#2318): Ctrl+K opens it over a signed-in page, a
 * search finds a tab, Enter navigates there. The shortcut is the only way in:
 * no on-screen trigger shows, on desktop or phone.
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
    name: 'Search pages, commands, characters and items',
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

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`no palette trigger shows at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInAndGoto(page, './overview');
    await expect(page.getByRole('link', { name: 'Overview' }).first()).toBeAttached();
    // Neither the old "Search" row nor any other opener advertising the chord.
    await expect(page.getByRole('button', { name: /^Search/ })).toHaveCount(0);
    await expect(
      page.locator('[aria-keyshortcuts="Control+K"], [aria-keyshortcuts="Meta+K"]')
    ).toHaveCount(0);
  });
}
