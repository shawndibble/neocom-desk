/**
 * Corp Assets' Volume column shows a real m³ figure (issues #2216, #4671).
 *
 * Corp Assets is Director-only (`engine/corpRoles.ts`), so this needs a JWT
 * carrying the corp scope group plus a `/roles` override granting Director —
 * the same access-setup pattern `corpBoardNarrow.spec.ts` established, since
 * the default mock's `/roles` answers `{}` (issue #295) to keep the corp
 * grant prompt off every other spec.
 */
import { test, expect } from './support/testBase';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';
import { makeAccessToken } from './support/mockSso';

test.describe('Corp Assets — item row volume', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://login.eveonline.com/v2/oauth/token', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: makeAccessToken([...SCOPES, ...scopesForGroup('corp')]),
          token_type: 'Bearer',
          expires_in: 1199,
          refresh_token: 'fake-refresh',
        }),
      });
    });

    await page.route('https://esi.evetech.net/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Director'] });
      if (path === `/corporations/${CORPORATION_ID}/divisions`) return json({});
      if (path === `/corporations/${CORPORATION_ID}/assets`) {
        return json([
          {
            item_id: 1,
            type_id: 34,
            quantity: 500,
            location_id: 60003760,
            location_type: 'station',
            location_flag: 'CorpSAG1',
            is_singleton: false,
          },
          {
            // No entry in the slim SDE snapshot for a market/asset-only type
            // the fixtures never populate — stays "-" for this row only.
            item_id: 2,
            type_id: 999_999,
            quantity: 1,
            location_id: 60003760,
            location_type: 'station',
            location_flag: 'CorpSAG1',
            is_singleton: false,
          },
        ]);
      }
      // A Director implicitly holds every corp role, so the boot prefetch
      // (`app/prefetch.ts`) warms every corp surface once the JWT carries the
      // corp scope group — not just the assets/divisions this spec cares
      // about. Answer them empty rather than letting them hit the network
      // guard.
      if (path === `/corporation/${CORPORATION_ID}/mining/extractions`) return json([]);
      if (path === `/corporations/${CORPORATION_ID}/structures`) return json([]);
      if (path === `/corporations/${CORPORATION_ID}/industry/jobs`) return json([]);
      if (path === `/corporations/${CORPORATION_ID}/members`) return json([]);
      if (path === `/corporations/${CORPORATION_ID}/wallets`) return json([]);
      if (/^\/corporations\/\d+\/wallets\/\d+\/journal$/.test(path)) return json([]);

      await route.fallback();
    });
  });

  for (const width of [1440, 1024]) {
    test(`shows a real m³ total once Volume is ticked at ${width}px, a dash for an unknown type`, async ({
      page,
    }) => {
      await page.goto('./');
      await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
      await expect(page).toHaveURL(/\/overview$/);

      await page.setViewportSize({ width, height: 900 });
      await page.goto('./corp/assets');
      await expect(
        page.getByRole('main').getByText('Tritanium', { exact: true }).first()
      ).toBeVisible();

      // Volume starts off; the column picker adds it.
      await page.getByRole('button', { name: 'Columns' }).click();
      await page.getByRole('menuitemcheckbox', { name: 'Volume' }).click();
      await page.keyboard.press('Escape');

      const known = page.getByRole('row').filter({ hasText: 'Tritanium' });
      // 500 Tritanium at 0.01 m³ each; the header names the unit.
      await expect(known.getByRole('cell', { name: '5', exact: true })).toBeVisible();
      const unknown = page.getByRole('row').filter({ hasText: 'Type #999999' });
      await expect(unknown).toBeVisible();
      await expect(unknown.getByText('—', { exact: true }).first()).toBeVisible();
    });
  }
});
