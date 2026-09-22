/**
 * The reauth CTA that replaces a locked route has to be a real touch target
 * (issue #1135). `ScopeGate` swaps a gated route's whole body for a
 * `ReauthBanner`, so that banner's button is the only thing on the page left to
 * tap — and it rendered at DESIGN.md §3's compact tier (`h-9 md:h-7`, 36px on a
 * phone), the tier for a control sitting beside a view's own. `ReauthBanner`
 * now takes `soleAction` for exactly this case, raising it to the `md` touch
 * tier (`h-11 md:h-9`, 44px).
 *
 * Forcing the locked state: `ScopeGate` compares the route's declared scopes
 * (`routeScopes.ts`) against the active Character's stored grant, and that
 * grant is whatever the mocked JWT's `scp` claim carried (`auth/session.ts`
 * writes `decoded.scopes` into `db.tokens`). So this re-mocks the token
 * endpoint with the usual fixture token minus `/clones`' one scope. `/clones`
 * is the narrowest gated route and needs no ESI fixture of its own: the gate
 * decides before any request goes out.
 *
 * One of the two specs still driving the real SSO round trip rather than
 * `signInAndGoto`'s seeded session (`auth.spec.ts` is the other). It has to:
 * the whole setup is a re-mocked token endpoint, and a seeded token row would
 * be written with the full fixture grant, never passing through the code
 * exchange this spec bends.
 */
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID, CHARACTER_NAME, OWNER_HASH, SCOPES } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };

/** Far-future expiry, matching `mockSso.ts`'s own token. */
const EXP_SECONDS = 4_102_444_800;

/** `/clones`' single requirement, via `esi/registry.ts`'s `getCharacterClones`. */
const CLONES_SCOPE = 'esi-clones.read_clones.v1';

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeAccessTokenWithoutClonesScope(): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const payload = base64url({
    sub: `CHARACTER:EVE:${CHARACTER_ID}`,
    name: CHARACTER_NAME,
    owner: OWNER_HASH,
    exp: EXP_SECONDS,
    scp: SCOPES.filter((scope) => scope !== CLONES_SCOPE),
    iss: 'login.eveonline.com',
  });
  return `${header}.${payload}.fakesig`;
}

test('the locked-route reauth button meets the 44px touch floor at 390px', async ({ page }) => {
  // Guards the subtraction above: were the scope registry to stop asking for
  // this scope, the filter would quietly become a no-op, `/clones` would render
  // unlocked, and this spec would be measuring nothing.
  expect(SCOPES).toContain(CLONES_SCOPE);

  // Registered after `installSsoMock` (the `page` fixture's own setup), so
  // Playwright tries this one first. It has to precede the login below: `scp`
  // is read once, at the code exchange.
  await page.route('https://login.eveonline.com/v2/oauth/token', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: makeAccessTokenWithoutClonesScope(),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'fake-refresh',
      }),
    });
  });

  await loginAndSelectCharacter(page);
  await page.setViewportSize(PHONE);
  await page.goto('./clones');

  // The title is this banner's alone; its action label is shared with a dozen
  // other namespaces and with the shell's own `AuthFailureNotice`, so the
  // button is looked up inside the banner rather than on the page. Asserting
  // the title first also proves the locked state actually painted.
  const banner = page.getByText('Log in again to see your clones').locator('..');
  await expect(banner).toBeVisible();

  const loginButton = banner.getByRole('button', { name: 'Log in again with EVE Online' });
  await expect(loginButton).toBeVisible();

  const box = await loginButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
