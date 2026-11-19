import { test } from '@playwright/test';
import { signInAndGoto } from '../../e2e/support/authSeed';
import { installEsiMock } from '../../e2e/support/mockEsi';
import { installSsoMock } from '../../e2e/support/mockSso';
import { CHARACTER_ID, CORPORATION_ID, OWNER_HASH, SCOPES } from '../../e2e/support/fixtureData';
import { scopesForGroup } from '../../src/esi/scopes';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

test('moons sandbox', async ({ page }) => {
  const scopes = [...SCOPES, ...scopesForGroup('corp')];
  await installSsoMock(page, scopes);
  await installEsiMock(page);
  await page.route('https://esi.evetech.net/**/roles*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ roles: ['Director'] }),
    })
  );
  // The corp wallet page (reached from a payment's link) reads these live; answer them for the
  // fake corp. Journal refs 900001+ are the seeded donations, so `?highlight=<ref>` finds its row.
  await page.route(
    `https://esi.evetech.net/**/corporations/${CORPORATION_ID}/wallets**`,
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'x-pages': '1' },
          body: JSON.stringify(body),
        });
      if (path.endsWith('/journal')) {
        return json(
          Array.from({ length: 24 }, (_, i) => ({
            id: 900_001 + i,
            date: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(),
            ref_type: 'player_donation',
            amount: 1_000_000 * (i + 1),
            balance: 5_000_000_000 + i,
            first_party_id: 90_000_002 + (i % 4),
            second_party_id: CORPORATION_ID,
            description: 'moon tax',
            reason: 'moon tax',
          }))
        );
      }
      if (path.endsWith('/transactions')) return json([]);
      return json(
        [1, 2, 3, 4, 5, 6, 7].map((division) => ({
          division,
          balance: division === 1 ? 5_000_000_000 : 0,
        }))
      );
    }
  );
  // The real mint verifies the token with CCP; the Auth emulator takes an unsigned custom token.
  await page.route('**/mintFirebaseToken', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: CORS });
    const uid = `char:${CHARACTER_ID}`;
    const now = Math.floor(Date.now() / 1000);
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      iss: 'firebase-auth-emulator@example.com',
      sub: 'firebase-auth-emulator@example.com',
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now,
      exp: now + 3600,
      uid,
      claims: { ownerHash: OWNER_HASH },
    })}.`;
    await route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ result: { token, uid, ownerHash: OWNER_HASH } }),
    });
  });
  // The real officer check reads live ESI; answer it for the fake corp, pass everything else through.
  await page.route('**/corpTaxBookCall', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS' || !req.postData()?.includes('verifyCorpOfficerCallable'))
      return route.fallback();
    await route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          corporationId: CORPORATION_ID,
          isCeo: true,
          isDirector: true,
          isStationManager: true,
          canView: true,
          canEdit: true,
          bookActive: true,
          expiresAt: Date.now() + 86_400_000,
        },
      }),
    });
  });
  await signInAndGoto(page, './corp/moons', scopes);
  await page.waitForEvent('close', { timeout: 0 });
});
