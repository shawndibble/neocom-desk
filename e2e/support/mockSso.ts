/**
 * Mocks EVE SSO v2 OAuth end to end: no real request ever reaches
 * login.eveonline.com. src/auth/jwt.ts does no signature check, so a
 * hand-built (unsigned) JWT is accepted exactly like a real one.
 */
import type { Page } from '@playwright/test';
import { CHARACTER_ID, CHARACTER_NAME, OWNER_HASH, SCOPES } from './fixtureData';

/** Far-future expiry (seconds since epoch) so the mocked session never needs a refresh. */
const EXP_SECONDS = 4_102_444_800; // 2100-01-01T00:00:00Z

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Access token shaped exactly as src/auth/jwt.ts's decodeAccessToken expects. */
function makeAccessToken(): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const payload = base64url({
    sub: `CHARACTER:EVE:${CHARACTER_ID}`,
    name: CHARACTER_NAME,
    owner: OWNER_HASH,
    exp: EXP_SECONDS,
    scp: [...SCOPES],
    iss: 'login.eveonline.com',
  });
  return `${header}.${payload}.fakesig`;
}

export async function installSsoMock(page: Page): Promise<void> {
  // GET /v2/oauth/authorize -> 302 straight back to the app's own callback,
  // echoing state and the caller's redirect_uri (works for any dev port).
  await page.route('https://login.eveonline.com/v2/oauth/authorize*', async (route) => {
    const url = new URL(route.request().url());
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    if (!redirectUri || !state) {
      await route.fulfill({ status: 400, body: 'mockSso: missing redirect_uri or state' });
      return;
    }
    const location = `${redirectUri}?code=fakecode&state=${encodeURIComponent(state)}`;
    await route.fulfill({ status: 302, headers: { location } });
  });

  // POST /v2/oauth/token -> hand-built token response. Used for both the
  // initial code exchange and any refresh_token grant.
  await page.route('https://login.eveonline.com/v2/oauth/token', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: makeAccessToken(),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'fake-refresh',
      }),
    });
  });
}
