/**
 * Command Palette smoke (#2318): Ctrl+K opens it over a signed-in page, a
 * search finds a tab, Enter navigates there; the phone's trigger opens it too.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

test('Ctrl+K opens the palette, searches and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAndGoto(page, './overview');
  // The shell (and its listener) is up once its trigger is.
  await expect(page.getByRole('button', { name: /^Search/ })).toBeVisible();

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

  const trigger = page.getByRole('button', { name: /^Search/ });
  await trigger.click();
  const input = page.getByRole('combobox');
  await input.fill('wallet');
  await page.keyboard.press('Escape');
  await expect(input).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the phone trigger opens the palette', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndGoto(page, './overview');

  await page.getByRole('button', { name: 'Search pages, commands, characters and items' }).click();
  await expect(page.getByRole('combobox')).toBeFocused();
});
