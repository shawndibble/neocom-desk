import type { Page } from '@playwright/test';
import { CHARACTER_ID, CHARACTER_NAME, OWNER_HASH, SCOPES } from './fixtureData';

export const EXP_SECONDS = 4_102_444_800;

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function makeAccessToken(scopes: readonly string[] = SCOPES): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const payload = base64url({
    sub: `CHARACTER:EVE:${CHARACTER_ID}`,
    name: CHARACTER_NAME,
    owner: OWNER_HASH,
    exp: EXP_SECONDS,
    scp: [...scopes],
    iss: 'login.eveonline.com',
  });
  return `${header}.${payload}.fakesig`;
}

export async function installSsoMock(
  page: Page,
  scopes: readonly string[] = SCOPES
): Promise<void> {
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

  await page.route('https://login.eveonline.com/v2/oauth/token', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: makeAccessToken(scopes),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'fake-refresh',
      }),
    });
  });
}
