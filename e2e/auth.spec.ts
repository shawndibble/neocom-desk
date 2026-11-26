import { test, expect, PHONE } from './support/testBase';
import { CHARACTER_NAME } from './support/fixtureData';

test.use({ viewport: PHONE });

test('first login via mocked EVE SSO lands straight on the first-run Overview', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Neocom Desk', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /everything you do outside the client/i })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();

  await page.waitForLoadState('load');
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: CHARACTER_NAME })).toBeVisible();
  await expect(page.getByRole('heading', { name: /what do you do in eve/i })).toBeVisible();
});
