/**
 * Vetting, both sides, against the Storybook stand-in backend (`src/storybook/vettingFixture.ts`
 * through `setVettingBackendOverride`): a Director's queue opens a report with its flags, and
 * the public apply link renders its start page with nobody logged in.
 *
 * Dev server only: the override is installed by importing those `/src` modules into the running
 * app, and the e2e build has no Firebase.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';
import type { setVettingBackendOverride } from '../src/features/corp/vetting/vettingBackend';
import type {
  createVettingFixture,
  VETTING_FIXTURE_CORPORATION,
} from '../src/storybook/vettingFixture';
import type { db } from '../src/db';

/**
 * Installs the stand-in in the running app, then moves to `path` inside the same page load (a
 * full navigation would load the modules afresh and lose it). `path` may name the fixture's
 * corporation as `<corp>`. Resolves to how many Character rows were given a corporation.
 */
async function installAndOpen(page: Page, path: string, characterId?: number): Promise<number> {
  return page.evaluate(
    async ({ path, characterId, corporationId }) => {
      // Indirected through variables so `tsc` leaves them alone: dev-server URLs, not paths this
      // spec's module graph resolves. The casts are checked against the real signatures.
      const urls = {
        db: '/src/db/index.ts',
        backend: '/src/features/corp/vetting/vettingBackend.ts',
        fixture: '/src/storybook/vettingFixture.ts',
      };
      const backend = (await import(/* @vite-ignore */ urls.backend)) as {
        setVettingBackendOverride: typeof setVettingBackendOverride;
      };
      const fixture = (await import(/* @vite-ignore */ urls.fixture)) as {
        createVettingFixture: typeof createVettingFixture;
        VETTING_FIXTURE_CORPORATION: typeof VETTING_FIXTURE_CORPORATION;
      };
      backend.setVettingBackendOverride(fixture.createVettingFixture());
      let updated = 0;
      if (characterId !== undefined) {
        // The queue reads for the active pilot's corporation.
        const store = (await import(/* @vite-ignore */ urls.db)) as { db: typeof db };
        updated = await store.db.characters.update(characterId, { corporationId });
      }
      const target = path.replace(
        '<corp>',
        String(fixture.VETTING_FIXTURE_CORPORATION.corporationId)
      );
      window.history.pushState(null, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return updated;
    },
    { path, characterId, corporationId: CORPORATION_ID }
  );
}

test('a Director opens a review from the vetting queue and sees its flags', async ({ page }) => {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Director'] });
    if (path === `/corporations/${CORPORATION_ID}/`)
      return json({ name: 'Sample Corp', ceo_id: 1, member_count: 40, tax_rate: 0.1 });
    if (path.startsWith(`/corporations/${CORPORATION_ID}/`)) return json([]);
    await route.fallback();
  });
  await signInAndGoto(page, './settings', [...SCOPES, ...scopesForGroup('corp')]);
  await expect(page.locator('main')).toBeVisible();
  const seeded = await installAndOpen(page, '/corp/vetting/open', CHARACTER_ID);
  expect(seeded, 'pilot row seeded with a corporation').toBe(1);

  await expect(page.getByRole('heading', { level: 1, name: 'Vetting' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Open vetting reviews' });
  const row = table.getByRole('row', { name: /Tamsin Vell/ });
  await expect(row).toContainText('3 flags');
  await expect(row).toContainText('Yours needed');
  await expect(table.getByRole('row', { name: /Pell Okonru/ })).toContainText('Nothing found');

  await row.click();
  await expect(page).toHaveURL(/\/corp\/vetting\/open\/v-0042$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tamsin Vell' })).toBeVisible();
  await expect(page.getByText('3 flags in 9 checks')).toBeVisible();
  await expect(page.getByText('ISK with the watchlist')).toBeVisible();
  await expect(page.getByText('Mira Vell did not share Mail.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vetting' }).first()).toBeVisible();
});

test('the apply link shows its start page with nobody logged in', async ({ page }) => {
  await page.goto('./login');
  // The app has booted once the login page's own button is up.
  await expect(page.getByRole('button', { name: /EVE Online/ }).first()).toBeVisible();
  await installAndOpen(page, '/apply/<corp>');

  await expect(
    page.getByRole('heading', { level: 1, name: /Apply to Brass Meridian Logistics/ })
  ).toBeVisible();
  await expect(page.getByText('How it works')).toBeVisible();
  await expect(page.getByText('Who and subject, never the message')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in with EVE Online' })).toBeVisible();
  // No account: the app's rail is not drawn around a public page.
  await expect(page.getByRole('navigation')).toHaveCount(0);
});
