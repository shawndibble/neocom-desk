import { test, expect, PHONE } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID, CHARACTER_NAME, OWNER_HASH, SCOPES } from './support/fixtureData';

const EXP_SECONDS = 4_102_444_800;

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

test('the locked-route reauth button meets the 36px touch floor at 390px', async ({ page }) => {
  expect(SCOPES).toContain(CLONES_SCOPE);

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

  const banner = page.getByText(/: grant .+$/).locator('..');
  await expect(banner).toBeVisible();

  const loginButton = banner.getByRole('button', { name: 'Grant in EVE' });
  await expect(loginButton).toBeVisible();

  const box = await loginButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(36);
});
