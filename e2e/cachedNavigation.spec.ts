import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { clearCachedEsiRows } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const CORP_HISTORY = [
  { record_id: 2, corporation_id: 98000002, start_date: '2026-01-01T00:00:00Z' },
  { record_id: 1, corporation_id: 98000001, start_date: '2025-01-01T00:00:00Z' },
];

const CORP_NAMES = [
  { id: 98000002, name: 'Current Corp', category: 'corporation' },
  { id: 98000001, name: 'Past Corp', category: 'corporation' },
];

test('coming back to a page shows its rows again, not a spinner', async ({ page }) => {
  let held: Promise<void> | null = null;
  let release: () => void = () => {};

  await page.route(`**/characters/${CHARACTER_ID}/corporationhistory`, async (route) => {
    if (held) await held;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CORP_HISTORY),
    });
  });
  await page.route('**/universe/names', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CORP_NAMES),
    })
  );

  await signInAndGoto(page);

  const subNav = page.getByRole('navigation', { name: 'Overview' });
  const historyList = page.getByRole('list', { name: 'Employment' });

  await subNav.getByRole('link', { name: 'Employment' }).click();
  await expect(historyList.getByRole('link', { name: 'Past Corp' })).toBeVisible();

  await subNav.getByRole('link', { name: 'Overview' }).click();
  await page.waitForURL(/\/overview$/);

  await clearCachedEsiRows(page);
  held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await subNav.getByRole('link', { name: 'Employment' }).click();

  await expect(historyList.getByRole('link', { name: 'Past Corp' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);

  release();
});
