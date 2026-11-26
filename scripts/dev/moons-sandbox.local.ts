import { test } from '@playwright/test';
import { signInAndGoto } from '../../e2e/support/authSeed';
import { installEsiMock } from '../../e2e/support/mockEsi';
import { installSsoMock } from '../../e2e/support/mockSso';
import { installPersonalEsi } from './sandbox/personalEsi';
import { installOpenPrices } from './sandbox/prices';
import { mockPlannerColonies } from '../../e2e/support/piColonies';
import { vettingAnswer } from './sandbox/vettingMocks';
import { CHARACTER_ID, CORPORATION_ID, OWNER_HASH, SCOPES } from '../../e2e/support/fixtureData';
import { scopesForGroup } from '../../src/esi/scopes';
import { SCOPE_GROUPS } from '../../src/esi/registry';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

test('moons sandbox', async ({ page }) => {
  const scopes = [
    ...new Set([...SCOPES, ...SCOPE_GROUPS.flatMap((group) => scopesForGroup(group))]),
  ];
  await installSsoMock(page, scopes);
  await installEsiMock(page);
  await mockPlannerColonies(page);
  await installPersonalEsi(page);
  await installOpenPrices(page);
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
  const officerAnswers: Record<string, unknown> = {
    verifyCorpOfficerCallable: {
      corporationId: CORPORATION_ID,
      isCeo: true,
      isDirector: true,
      isStationManager: true,
      canView: true,
      canEdit: true,
      bookActive: true,
      expiresAt: Date.now() + 86_400_000,
    },
    verifySrpOfficerCallable: {
      corporationId: CORPORATION_ID,
      isCeo: true,
      isDirector: true,
      canManage: true,
      srpEnabled: true,
      settingsExist: true,
      expiresAt: Date.now() + 86_400_000,
    },
    getSrpStatusCallable: {
      corporationId: CORPORATION_ID,
      enabled: true,
      settings: {
        killmailPct: 60,
        appraisalPct: null,
        hullRules: [
          { scope: 'hull', id: 587, kind: 'pay-fixed', iskAmount: 4_000_000 },
          { scope: 'hull', id: 24698, kind: 'pay-percent' },
          { scope: 'hull', id: 28606, kind: 'officer-decides' },
          { scope: 'hull', id: 16240, kind: 'not-covered' },
        ],
        windowDays: 30,
        requireFleetOrFc: false,
      },
    },
  };
  await page.route('**/corpTaxBookCall', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fallback();
    const action = (request.postDataJSON() as { data?: { action?: string } } | null)?.data?.action;
    const answer = action === undefined ? undefined : officerAnswers[action];
    if (answer === undefined) return route.fallback();
    await route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ result: answer }),
    });
  });
  await page.route('**/vettingCall', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fallback();
    const body = (
      request.postDataJSON() as {
        data?: { action?: string; data?: Record<string, unknown> };
      } | null
    )?.data;
    const answer =
      body?.action === undefined ? undefined : vettingAnswer(body.action, body.data ?? {});
    if (answer === undefined) return route.fallback();
    await route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ result: answer }),
    });
  });
  await signInAndGoto(page, './corp/members', scopes);
  await page.waitForEvent('close', { timeout: 0 });
});
