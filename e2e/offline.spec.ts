import { test, expect } from './support/testBase';
import { goExternallyOffline, loginAndSelectCharacter } from './support/login';
import { CHARACTER_NAME } from './support/fixtureData';

/**
 * NeoCom Desk has no dev-mode service worker (VitePWA's devOptions aren't
 * enabled), so `context.setOffline(true)` followed by a reload can't work
 * here — it also blocks the app's own localhost dev server, leaving nothing
 * to serve index.html. Offline support in this app instead lives in
 * src/features/skills/data.ts's `loadWithCache`: a failed ESI fetch falls
 * back to the `esiCache` Dexie table. This spec proves that path: load with
 * live data, cut off only the external hosts (ESI/fuzzwork/images/SSO), then
 * reload — IndexedDB survives the reload, the live fetch fails, and the
 * cached character + skills + data-age badge should still render.
 */
test('shows cached character and skills after external hosts go unreachable', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.waitForURL(/\/skills$/);

  // Live data first: no "showing cached data" banner yet.
  await expect(page.getByText('Caldari Frigate')).toBeVisible();
  await expect(page.getByText('Showing cached data')).toHaveCount(0);

  await goExternallyOffline(page);
  await page.reload();

  // Active character persisted in Dexie settings/characters — no ESI call needed.
  await expect(page.getByRole('link', { name: 'Switch character' })).toContainText(CHARACTER_NAME);

  // Skills data served from esiCache: cached rows + the "stale" banner + a data-age badge.
  await expect(page.getByText('Showing cached data')).toBeVisible();
  await expect(page.getByText('Caldari Frigate')).toBeVisible();
  await expect(page.getByText('Small Hybrid Turret')).toBeVisible();
  await expect(page.locator('time')).toBeVisible();
});
