import { test, expect } from './support/testBase';
import { expireCachedEsiRows, goExternallyOffline, loginAndSelectCharacter } from './support/login';
import { CHARACTER_NAME } from './support/fixtureData';

/**
 * NeoCom Desk has no dev-mode service worker (VitePWA's devOptions aren't
 * enabled), so `context.setOffline(true)` followed by a reload can't work
 * here — it also blocks the app's own localhost dev server, leaving nothing
 * to serve index.html. Offline support in this app instead lives in
 * `esi/cache.ts`, and these two specs split it between them: inside the
 * freshness window a page does not notice the network is gone at all, and
 * past that window a failed ESI fetch still falls back to the `esiCache`
 * Dexie table. Both cut off only the external hosts (ESI/fuzzwork/images/SSO)
 * and reload, since IndexedDB survives a reload.
 */
test('serves a fresh page with no offline banner when external hosts go unreachable', async ({
  page,
}) => {
  await loginAndSelectCharacter(page);
  // Skills opens on Plans, so the trained view is one sub-nav click away.
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('link', { name: 'Trained' }).click();
  await page.waitForURL(/\/skills\/trained$/);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();

  await goExternallyOffline(page);
  await page.reload();

  // Inside the freshness window the loader never attempts ESI, so losing the
  // network is invisible: the rows render as current, with no banner.
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();
  await expect(page.getByText('Showing cached data')).toHaveCount(0);
});

test('shows cached character and skills after external hosts go unreachable', async ({ page }) => {
  await loginAndSelectCharacter(page);
  // Skills opens on Plans, so the trained view is one sub-nav click away.
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('link', { name: 'Trained' }).click();
  await page.waitForURL(/\/skills\/trained$/);

  // Groups start collapsed; expand everything before asserting on skill rows.
  await page.getByRole('button', { name: 'Expand all' }).click();

  // Live data first: no "showing cached data" banner yet.
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();
  await expect(page.getByText('Showing cached data')).toHaveCount(0);

  await goExternallyOffline(page);
  // Age the rows out of the freshness window, so the reload actually attempts
  // ESI and exercises the fallback rather than the window the spec above covers.
  await expireCachedEsiRows(page);
  await page.reload();

  // Active character persisted in Dexie settings/characters — no ESI call
  // needed. The rail's pinned character menu takes its accessible name from
  // the pilot itself, so finding the trigger by name *is* the assertion.
  await expect(page.getByRole('button', { name: CHARACTER_NAME })).toBeVisible();

  // The reload resets React state, so groups are collapsed again.
  await page.getByRole('button', { name: 'Expand all' }).click();

  // Skills data served from esiCache: cached rows + the "stale" banner + a data-age badge.
  await expect(page.getByText('Showing cached data')).toBeVisible();
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();
  await expect(page.getByText('Small Hybrid Turret', { exact: true })).toBeVisible();
  await expect(page.locator('time')).toBeVisible();
});
