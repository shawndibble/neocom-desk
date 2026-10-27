import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { goExternallyOffline, expireCachedEsiRows } from './support/login';
import { CHARACTER_NAME } from './support/fixtureData';

/**
 * Neocom Desk has no dev-mode service worker (VitePWA's devOptions aren't
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
  await signInAndGoto(page);
  // Skills opens on Plans, so the trained view is one sub-nav click away.
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Trained' }).click();
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
  await signInAndGoto(page);
  // Skills opens on Plans, so the trained view is one sub-nav click away.
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Trained' }).click();
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
  // needed. The rail's pinned Character link takes its accessible name from
  // the pilot itself, so finding it by name *is* the assertion.
  await expect(page.getByRole('link', { name: CHARACTER_NAME })).toBeVisible();

  // The reload resets React state, so groups are collapsed again.
  await page.getByRole('button', { name: 'Expand all' }).click();

  // Skills data served from esiCache: cached rows + the "stale" notice, dated.
  await expect(page.getByText('Showing cached data')).toBeVisible();
  await expect(page.getByText('Caldari Frigate', { exact: true })).toBeVisible();
  await expect(page.getByText('Small Hybrid Turret', { exact: true })).toBeVisible();
  // The notice's own age: the header's DataAgeBadge is a second `<time>` (hidden below md).
  await expect(page.getByText('Showing cached data').locator('..').locator('time')).toBeVisible();
});

/**
 * The shell's offline strip follows the browser's connection state at every
 * width. `setOffline` on an already-loaded page is safe here (unlike the
 * reload specs above): nothing needs the dev server again, and the page gets
 * the real `offline` / `online` events and `navigator.onLine`.
 */
test('shows the offline banner while the browser is offline and drops it on reconnect', async ({
  page,
  context,
}) => {
  await signInAndGoto(page);
  // Wait for the shell itself, not just the page load: `Layout` is its own lazy
  // chunk, and cutting the network while it is still downloading is a cold chunk
  // failing offline (the full-page Reload screen, no shell, so no strip), not
  // the already-running app this spec is about. The rail's pinned Character link
  // exists only once `Layout` has rendered.
  await expect(page.getByRole('link', { name: CHARACTER_NAME })).toBeVisible();
  // The strip by test id: its sentence is also in a screen-reader-only live region, so text alone matches twice.
  const banner = page.getByTestId('offline-banner');
  await expect(banner).toHaveCount(0);

  await context.setOffline(true);
  await expect(banner).toBeVisible();

  await context.setOffline(false);
  await expect(banner).toHaveCount(0);
});

/**
 * Item Detail offline for a never-opened item (issue #3882): description and attributes come from
 * the baked typeInfo shard. Opened via `?info=type-<id>` over Overview, not Market Browser, whose
 * item panel also reads `/universe/types/587` (useOrderRowSkills). Counting those requests
 * (aborted ones still fire) proves the baked path, not an esiCache row.
 */
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
