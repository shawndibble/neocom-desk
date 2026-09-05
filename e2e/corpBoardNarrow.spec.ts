/**
 * The corp ops board at 320px (issue #419).
 *
 * The board's row is a fixed-width countdown column (`w-full sm:w-24`) beside
 * flex-wrapping text (`min-w-0 flex-1` + `truncate`) — untested at the low
 * end before this. Rather than `productionCss.built.spec.ts`'s pattern
 * (production CSS, `/styleguide`, no ESI needed), this runs against the dev
 * server: `/corp` needs a signed-in character and mocked ESI, which that
 * spec's target deliberately avoids needing at all. The overflow assertion
 * itself is the same one that file established — `scrollWidth` must not
 * exceed `clientWidth` — reused here rather than invented fresh.
 *
 * `mockEsi.ts`'s own comment invites exactly this override: "A corp spec
 * should override this route" (the `/roles` fixture answering `{}` puts
 * every corp capability off).
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

const NARROW = { width: 320, height: 720 };

/** Far-future expiry, matching `mockSso.ts`'s own mocked token. */
const EXP_SECONDS = 4_102_444_800;

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * `mockSso.ts`'s own `makeAccessToken` always grants `SCOPES` — deliberately
 * excluding the `corp` opt-in group (issue #295), so the default mock can
 * never reach `useCorpAccess`'s `ready` state no matter how many roles a
 * character holds. This is that same token shape with the corp group's
 * scopes unioned in, standing in for a Character who has already been
 * through the app's own corp grant flow once before.
 */
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

test.describe('corp ops board — 320px width', () => {
  test.use({ viewport: NARROW });

  test('the board holds without a horizontal scroll', async ({ page }) => {
    // Registered after `installSsoMock` (the `page` fixture's own setup), so
    // Playwright tries this one first: same endpoint, a token carrying the
    // corp scope group too.
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

      // Station_Manager opens both `canReadStructures` and
      // `canReadMoonExtractions` (engine/corpRoles.ts) — the extractions
      // read fires right alongside structures, and an unmocked route here
      // would trip testBase's network guard, not just leave a panel empty.
      if (path === `/characters/${CHARACTER_ID}/roles`) {
        return json({ roles: ['Station_Manager'] });
      }
      if (path === `/corporations/${CORPORATION_ID}/structures`) {
        return json([
          {
            structure_id: 1,
            corporation_id: CORPORATION_ID,
            system_id: 1,
            type_id: 1,
            profile_id: 1,
            // Deliberately long and unbroken: the regression this guards is
            // a flex child rendering without `min-w-0`, which overflows
            // instead of truncating — a short name would never surface it.
            name: 'Nakugard - Home Sweet Home Fortizar Citadel Deployment Alpha',
            fuel_expires: new Date(Date.now() + 2 * 86_400_000).toISOString(),
          },
        ]);
      }
      if (path === `/corporation/${CORPORATION_ID}/mining/extractions`) return json([]);

      await route.fallback();
    });

    await page.goto('./');
    await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
    await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
    await expect(page).toHaveURL(/\/overview$/);

    await page.goto('./corp');
    await expect(
      page.getByText('Nakugard - Home Sweet Home Fortizar Citadel Deployment Alpha')
    ).toBeVisible();

    // `scrollWidth` is never below `clientWidth`, so "not wider" is the whole
    // assertion — the same technique `productionCss.built.spec.ts` uses.
    const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
      const root = document.documentElement;
      const limit = root.clientWidth;
      const offenders = Array.from(document.body.querySelectorAll('*'))
        .map((element) => ({ element, right: element.getBoundingClientRect().right }))
        .filter((entry) => entry.right > limit + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 5)
        .map(({ element, right }) => {
          const name = element.getAttribute('aria-label') ?? element.id;
          return `${element.tagName.toLowerCase()}[class="${element.className}"]${name ? ` (${name})` : ''} @ ${Math.round(right)}px`;
        });
      return { scrollWidth: root.scrollWidth, clientWidth: limit, offenders };
    });
    expect(
      scrollWidth,
      `Page is ${scrollWidth}px wide in a ${clientWidth}px viewport. Widest: ${offenders.join(', ')}`
    ).toBeLessThanOrEqual(clientWidth);
  });
});
