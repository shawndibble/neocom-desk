/**
 * Corp Assets item rows show a real M³ figure (issue #2216).
 *
 * `CorpAssets.tsx`'s `NodeRowView` used to hardcode `unitVolume={undefined}`
 * on every item row, so the shared `ItemRow` component (the same one
 * `/assets` uses) always rendered "-" there regardless of whether the SDE
 * snapshot actually knew the type's volume. This pins that a known type (34,
 * Tritanium — 0.01 m³ in the slim snapshot, same fixture `assetsItemColumns
 * .spec.ts` uses for `/assets`) now resolves a real figure here too, and that
 * an unresolvable type degrades that one row to "-" rather than failing the
 * page.
 *
 * Corp Assets is Director-only (`engine/corpRoles.ts`), so this needs a JWT
 * carrying the corp scope group plus a `/roles` override granting Director —
 * the same access-setup pattern `corpBoardNarrow.spec.ts` established, since
 * the default mock's `/roles` answers `{}` (issue #295) to keep the corp
 * grant prompt off every other spec.
 */
import { test, expect } from './support/testBase';
import {
  CHARACTER_NAME,
  CHARACTER_ID,
  CORPORATION_ID,
  OWNER_HASH,
  SCOPES,
} from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';

/** Far-future expiry, matching `mockSso.ts`'s own mocked token. */
const EXP_SECONDS = 4_102_444_800;

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeAccessTokenWithCorpScopes(): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const payload = base64url({
    sub: `CHARACTER:EVE:${CHARACTER_ID}`,
    name: CHARACTER_NAME,
    owner: OWNER_HASH,
    exp: EXP_SECONDS,
    scp: [...SCOPES, ...scopesForGroup('corp')],
    iss: 'login.eveonline.com',
  });
  return `${header}.${payload}.fakesig`;
}

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
          access_token: makeAccessTokenWithCorpScopes(),
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
      if (path === `/corporations/${CORPORATION_ID}/structures`) return json([]);
      if (path === `/corporations/${CORPORATION_ID}/industry/jobs`) return json([]);
      if (path === `/corporations/${CORPORATION_ID}/members`) return json([]);
      if (path === `/corporations/${CORPORATION_ID}/wallets`) return json([]);
      if (/^\/corporations\/\d+\/wallets\/\d+\/journal$/.test(path)) return json([]);

      await route.fallback();
    });
  });

  for (const width of [1440, 1024]) {
    test(`shows the real M³ figure for a known type at ${width}px, "-" for an unknown one`, async ({
      page,
    }) => {
      await page.goto('./');
      await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
      await expect(page).toHaveURL(/\/overview$/);

      await page.setViewportSize({ width, height: 900 });
      await page.goto('./corp/assets');
      await page.getByRole('link', { name: /Division 1/i }).click();

      await expect(page.getByText('Tritanium')).toBeVisible();
      await expect(page.getByText('0.01 m³')).toBeVisible();
      await expect(page.getByText('Type #999999')).toBeVisible();
    });
  }

  test('the label strip is absent below md', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
    await expect(page).toHaveURL(/\/overview$/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./corp/assets');
    await page.getByRole('link', { name: /Division 1/i }).click();
    await expect(page.getByText('Tritanium')).toBeVisible();
    await expect(page.getByTestId('item-column-labels')).toBeHidden();
  });
});
