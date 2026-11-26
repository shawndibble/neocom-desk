import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { goExternallyOffline, expireCachedEsiRows } from './support/login';
import { CHARACTER_NAME } from './support/fixtureData';

test('serves a fresh page with no offline banner when external hosts go unreachable', async ({
  page,
}) => {
  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Trained' }).click();
  await page.waitForURL(/\/skills\/trained$/);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();

  await goExternallyOffline(page);
  await page.reload();

  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();
  await expect(page.getByText('Showing cached data')).toHaveCount(0);
});

test('shows cached character and skills after external hosts go unreachable', async ({ page }) => {
  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Trained' }).click();
  await page.waitForURL(/\/skills\/trained$/);

  await page.getByRole('button', { name: 'Expand all' }).click();

  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();
  await expect(page.getByText('Showing cached data')).toHaveCount(0);

  await goExternallyOffline(page);
  await expireCachedEsiRows(page);
  await page.reload();

  await expect(page.getByRole('link', { name: CHARACTER_NAME })).toBeVisible();

  await page.getByRole('button', { name: 'Expand all' }).click();

  await expect(page.getByText('Showing cached data')).toBeHidden();
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();
  await expect(page.getByText('Small Hybrid Turret', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').locator('time').first()).toBeVisible();
});

test('shows the offline banner while the browser is offline and drops it on reconnect', async ({
  page,
  context,
}) => {
  await signInAndGoto(page);
  await expect(page.getByRole('link', { name: CHARACTER_NAME })).toBeVisible();
  const banner = page.getByTestId('offline-banner');
  await expect(banner).toHaveCount(0);

  await context.setOffline(true);
  await expect(banner).toBeVisible();

  await context.setOffline(false);
  await expect(banner).toHaveCount(0);
});

test('opens Item Detail with baked description and attributes for a never-seen item', async ({
  page,
}) => {
  const RIFTER = 587;
  const typeRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === `/universe/types/${RIFTER}`) {
      typeRequests.push(request.url());
    }
  });

  await signInAndGoto(page);
  await goExternallyOffline(page);
  await page.goto(`./overview?info=type-${RIFTER}`);

  const dialog = page.getByRole('dialog', { name: 'Rifter' });
  await expect(dialog.getByText(/very powerful combat frigate/)).toBeVisible();
  await expect(dialog.getByText('Maximum Velocity', { exact: true })).toBeVisible();
  await expect(dialog.getByText('365 m/sec', { exact: true })).toBeVisible();
  await expect(dialog.getByText("Couldn't load item info")).toHaveCount(0);
  expect(typeRequests).toEqual([]);
});
