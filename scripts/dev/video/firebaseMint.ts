/**
 * Signs the sandbox Character into the Auth emulator: the real `mintFirebaseToken` verifies
 * the EVE token with CCP, so answer it with an unsigned custom token the emulator accepts
 * (as scripts/dev/moons-sandbox.local.ts does). Only for pages that write to Firestore.
 */
import type { Page } from '@playwright/test';
import { CHARACTER_ID, OWNER_HASH } from '../../../e2e/support/fixtureData';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function installFirebaseMint(page: Page): Promise<void> {
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
}
