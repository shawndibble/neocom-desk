import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  completeAlertsLogin,
  completeCorpSyncLogin,
  completeLogin,
  loginIntentFor,
  scopesForRetry,
  startAlertsLogin,
  startCorpSyncLogin,
  startLogin,
  LoginError,
} from './session';
import { CORP_SYNC_SCOPES } from './corpSyncScopes';
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
    scp: [...CORP_SYNC_SCOPES],
  };
  return `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

let returnedCharacterId = 111;
const server = setupServer(
  http.post('https://login.eveonline.com/v2/oauth/token', () =>
    HttpResponse.json({
      access_token: jwt(returnedCharacterId),
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'corp-sync-refresh',
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(async () => {
  sessionStorage.clear();
  returnedCharacterId = 111;
  await db.characters.clear();
  await db.tokens.clear();
});
afterEach(() => server.resetHandlers());

const stateOf = (url: string) => new URL(url).searchParams.get('state')!;

describe('startCorpSyncLogin', () => {
  it('asks SSO for the sync grant scopes and nothing else', async () => {
    const url = await startCorpSyncLogin(111, 98000001, cfg);
    expect(new URL(url).searchParams.get('scope')?.split(' ').sort()).toEqual(
      [...CORP_SYNC_SCOPES].sort()
    );
  });

  it('records the Character and the book it was pressed for', async () => {
    const state = stateOf(await startCorpSyncLogin(111, 98000001, cfg));
    expect(loginIntentFor(state)).toEqual({
      kind: 'corpSync',
      characterId: 111,
      corporationId: 98000001,
    });
  });

  it('is never the scope set a failed callback restarts as a device login', async () => {
    await startCorpSyncLogin(111, 98000001, cfg);
    expect(scopesForRetry()).toBeUndefined();
  });
});

describe('completeCorpSyncLogin', () => {
  it('hands back the tokens, the authorizing Character and the book, and stores nothing', async () => {
    const state = stateOf(await startCorpSyncLogin(111, 98000001, cfg));
    const result = await completeCorpSyncLogin({ code: 'c', state }, cfg);
    expect(result).toMatchObject({
      expectedCharacterId: 111,
      characterId: 111,
      corporationId: 98000001,
      name: 'Pilot 111',
      refreshToken: 'corp-sync-refresh',
    });
    expect(await db.characters.count()).toBe(0);
    expect(await db.tokens.count()).toBe(0);
  });

  it('reports a different Character than the one pressed', async () => {
    const state = stateOf(await startCorpSyncLogin(111, 98000001, cfg));
    returnedCharacterId = 222;
    expect(await completeCorpSyncLogin({ code: 'c', state }, cfg)).toMatchObject({
      expectedCharacterId: 111,
      characterId: 222,
    });
  });

  it('is not interchangeable with an Alerts round trip or a device login, in either direction', async () => {
    const alerts = stateOf(await startAlertsLogin(111, cfg));
    await expect(completeCorpSyncLogin({ code: 'c', state: alerts }, cfg)).rejects.toBeInstanceOf(
      LoginError
    );
    const corp = stateOf(await startCorpSyncLogin(111, 98000001, cfg));
    await expect(completeAlertsLogin({ code: 'c', state: corp }, cfg)).rejects.toBeInstanceOf(
      LoginError
    );
    const corp2 = stateOf(await startCorpSyncLogin(111, 98000001, cfg));
    await expect(completeLogin({ code: 'c', state: corp2 }, cfg)).rejects.toBeInstanceOf(
      LoginError
    );
    const device = stateOf(await startLogin(['esi-skills.read_skills.v1'], cfg));
    await expect(completeCorpSyncLogin({ code: 'c', state: device }, cfg)).rejects.toBeInstanceOf(
      LoginError
    );
    expect(await db.tokens.count()).toBe(0);
  });
});
