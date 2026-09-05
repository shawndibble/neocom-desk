/**
 * The reported bug, as a navigation: leaving a page and coming back must show
 * the rows it already had, not a spinner over them.
 *
 * Only an e2e spec can assert this. The retained snapshot
 * (`lib/routeSnapshotCache.ts`) exists only on a *second* mount of a view, and
 * the unit suite resets that store before every test — deliberately, so no
 * test leaks its rows into the next one.
 */
import { test, expect } from './support/testBase';
import { CHARACTER_ID } from './support/fixtureData';
import { loginAndSelectCharacter, clearCachedEsiRows } from './support/login';

const CORP_HISTORY = [
  { record_id: 2, corporation_id: 98000002, start_date: '2026-01-01T00:00:00Z' },
  { record_id: 1, corporation_id: 98000001, start_date: '2025-01-01T00:00:00Z' },
];

const CORP_NAMES = [
  { id: 98000002, name: 'Current Corp', category: 'corporation' },
  { id: 98000001, name: 'Past Corp', category: 'corporation' },
];

test('coming back to a page shows its rows again, not a spinner', async ({ page }) => {
  // Held from the moment it is set, so the return visit's live read is still
  // in flight while the assertions run — anything on screen then can only be
  // the retained snapshot.
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

  await loginAndSelectCharacter(page);

  // The Character-overview sub-nav, not the left rail: 'Overview' names a link
  // in both.
  const subNav = page.getByRole('navigation', { name: 'Overview' });

  await subNav.getByRole('link', { name: 'Employment' }).click();
  await expect(page.getByText('Past Corp')).toBeVisible();

  await subNav.getByRole('link', { name: 'Overview' }).click();
  await page.waitForURL(/\/overview$/);

  // Every local copy dropped, not merely expired. Expiring is not enough to
  // tell this apart from `esi/cache.ts`'s grace path, which serves an expired
  // row after `STALE_GRACE_MS` anyway. With the rows gone and the live read
  // held below, what the view shows can only be what it was already holding —
  // which before this fix was nothing, and a spinner.
  await clearCachedEsiRows(page);
  held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await subNav.getByRole('link', { name: 'Employment' }).click();

  await expect(page.getByText('Past Corp')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);

  // Released before the test ends so the held request cannot outlive it.
  release();
});
