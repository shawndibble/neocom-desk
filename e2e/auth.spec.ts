import { test, expect } from './support/testBase';
import { CHARACTER_NAME, WALLET_BALANCE_FORMATTED } from './support/fixtureData';

test('logs in via mocked EVE SSO, picks a character, sees the overview wallet', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'NeoCom Desk' })).toBeVisible();

  await page.getByRole('button', { name: 'Log in with EVE Online' }).click();

  // authorize -> mocked 302 -> /callback -> token exchange -> /characters.
  await expect(page).toHaveURL(/\/characters$/);
  const characterButton = page.getByRole('button', { name: `Select ${CHARACTER_NAME}` });
  await expect(characterButton).toBeVisible();

  await characterButton.click();

  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: CHARACTER_NAME })).toBeVisible();
  await expect(page.getByText(`${WALLET_BALANCE_FORMATTED} ISK`)).toBeVisible();
});
