import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import {
  completeCorpSyncLogin,
  completeLogin,
  completeVettingLogin,
  loginIntentFor,
  scopesForRetry,
  startCorpSyncLogin,
  startLogin,
  startVettingLogin,
  LoginError,
} from './session';
import { VETTING_SCOPES } from './vettingScopes';
import { db } from '@/db';

const cfg = { clientId: 'client-abc', redirectUri: 'https://app.example/neocom-desk/callback' };

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwt(characterId: number): string {
  const payload = {
    sub: `CHARACTER:EVE:${characterId}`,
    name: `Pilot ${characterId}`,
    owner: 'owner-hash',
    exp: Math.floor(Date.now() / 1000) + 1200,
    scp: [...VETTING_SCOPES],
  };
  return `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

// Minted once: `exp` is in whole seconds, so two calls can differ across a tick.
const ACCESS = jwt(333);

mswServer(
  http.post('https://login.eveonline.com/v2/oauth/token', () =>
    HttpResponse.json({
      access_token: ACCESS,
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'vetting-refresh',
    })
  )
);

beforeEach(async () => {
  sessionStorage.clear();
  await db.characters.clear();
  await db.tokens.clear();
});

const stateOf = (url: string) => new URL(url).searchParams.get('state')!;

describe('startVettingLogin', () => {
  it('asks SSO for the vetting scopes and nothing else', async () => {
    const url = await startVettingLogin(98000001, undefined, cfg);
    expect(new URL(url).searchParams.get('scope')?.split(' ').sort()).toEqual(
      [...VETTING_SCOPES].sort()
    );
  });

  it('records the corporation, and the review once there is one, with no Character', async () => {
    const first = stateOf(await startVettingLogin(98000001, undefined, cfg));
    expect(loginIntentFor(first)).toEqual({ kind: 'vetting', corporationId: 98000001 });
    const next = stateOf(await startVettingLogin(98000001, 'r-1', cfg));
    expect(loginIntentFor(next)).toEqual({
      kind: 'vetting',
      corporationId: 98000001,
      reviewId: 'r-1',
    });
  });

  it('is never the scope set a failed callback restarts as a device login', async () => {
    await startVettingLogin(98000001, undefined, cfg);
    expect(scopesForRetry()).toBeUndefined();
  });
});

describe('completeVettingLogin', () => {
  it('hands back the access token and who signed in, never the refresh token, and stores nothing', async () => {
    const state = stateOf(await startVettingLogin(98000001, 'r-1', cfg));
    const result = await completeVettingLogin({ code: 'c', state }, cfg);
    expect(result).toEqual({
      corporationId: 98000001,
      reviewId: 'r-1',
      characterId: 333,
      name: 'Pilot 333',
      accessToken: ACCESS,
    });
    expect(JSON.stringify(result)).not.toContain('vetting-refresh');
    expect(await db.characters.count()).toBe(0);
    expect(await db.tokens.count()).toBe(0);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('vetting-refresh');
    expect(JSON.stringify({ ...localStorage })).not.toContain('vetting-refresh');
  });

  it('is not interchangeable with a grant round trip or a device login, in either direction', async () => {
    const corp = stateOf(await startCorpSyncLogin(111, 98000001, cfg));
    await expect(completeVettingLogin({ code: 'c', state: corp }, cfg)).rejects.toBeInstanceOf(
      LoginError
    );
    const vetting = stateOf(await startVettingLogin(98000001, undefined, cfg));
    await expect(completeCorpSyncLogin({ code: 'c', state: vetting }, cfg)).rejects.toBeInstanceOf(
      LoginError
    );
    const vetting2 = stateOf(await startVettingLogin(98000001, undefined, cfg));
    await expect(completeLogin({ code: 'c', state: vetting2 }, cfg)).rejects.toBeInstanceOf(
      LoginError
    );
    const device = stateOf(await startLogin(['esi-skills.read_skills.v1'], cfg));
    await expect(completeVettingLogin({ code: 'c', state: device }, cfg)).rejects.toBeInstanceOf(
      LoginError
    );
    expect(await db.tokens.count()).toBe(0);
  });
});
