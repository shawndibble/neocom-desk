import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import {
  completeAlertsLogin,
  completeCorpSyncLogin,
  completeFeederGrantLogin,
  completeLogin,
  loginIntentFor,
  scopesForRetry,
  startAlertsLogin,
  startCorpSyncLogin,
  startFeederGrantLogin,
  startLogin,
  LoginError,
} from './session';
import { CORP_SYNC_SCOPES, FEEDER_SYNC_SCOPES } from './corpSyncScopes';
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
mswServer(
  http.post('https://login.eveonline.com/v2/oauth/token', () =>
    HttpResponse.json({
      access_token: jwt(returnedCharacterId),
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'corp-sync-refresh',
    })
  )
);

beforeEach(async () => {
  sessionStorage.clear();
  returnedCharacterId = 111;
  await db.characters.clear();
  await db.tokens.clear();
});

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

describe('moon owner grant round trip', () => {
  it('asks for the observer ledger scope alone and carries the invite and rate', async () => {
    const url = await startFeederGrantLogin(111, 'invite-code-1', 6, cfg);
    expect(new URL(url).searchParams.get('scope')).toBe(FEEDER_SYNC_SCOPES.join(' '));
    expect(loginIntentFor(stateOf(url))).toEqual({
      kind: 'feederGrant',
      characterId: 111,
      inviteCode: 'invite-code-1',
      requestedRatePct: 6,
    });
  });

  it('accepts an alt the player did not press and stores nothing', async () => {
    const state = stateOf(await startFeederGrantLogin(111, 'invite-code-1', undefined, cfg));
    returnedCharacterId = 222;
    const result = await completeFeederGrantLogin({ code: 'c', state }, cfg);
    expect(result).toMatchObject({
      expectedCharacterId: 111,
      characterId: 222,
      inviteCode: 'invite-code-1',
      refreshToken: 'corp-sync-refresh',
    });
    expect(result.requestedRatePct).toBeUndefined();
    expect(await db.tokens.count()).toBe(0);
  });
});
