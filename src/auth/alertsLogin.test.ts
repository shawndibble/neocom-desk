import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  startAlertsLogin,
  startLogin,
  loginIntentFor,
  completeAlertsLogin,
  completeLogin,
  scopesForRetry,
  LoginError,
} from './session';
import { ALERTS_SCOPE } from './alertsScope';
import { db } from '@/db';

const cfg = { clientId: 'client-abc', redirectUri: 'https://app.example/neocom-desk/callback' };

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwt(characterId: number, scp: string[]): string {
  const payload = {
    sub: `CHARACTER:EVE:${characterId}`,
    name: `Pilot ${characterId}`,
    owner: 'owner-hash',
    exp: Math.floor(Date.now() / 1000) + 1200,
    scp,
  };
  return `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

/** Which Character SSO "returns" for the next code exchange. */
let returnedCharacterId = 111;

const server = setupServer(
  http.post('https://login.eveonline.com/v2/oauth/token', () =>
    HttpResponse.json({
      access_token: jwt(returnedCharacterId, [ALERTS_SCOPE]),
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'alerts-refresh',
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

function stateOf(url: string): string {
  return new URL(url).searchParams.get('state')!;
}

describe('startAlertsLogin', () => {
  it('asks SSO for the notifications scope and nothing else', async () => {
    const url = await startAlertsLogin(111, cfg);
    expect(new URL(url).searchParams.get('scope')).toBe(ALERTS_SCOPE);
  });

  it('records which Character the row was for, under that round trip', async () => {
    const state = stateOf(await startAlertsLogin(111, cfg));
    expect(loginIntentFor(state)).toEqual({ kind: 'alerts', characterId: 111 });
  });

  it('leaves an ordinary login with no intent', async () => {
    const state = stateOf(await startLogin(['esi-skills.read_skills.v1'], cfg));
    expect(loginIntentFor(state)).toBeUndefined();
  });

  it('is never the scope set a failed callback restarts as a device login', async () => {
    await startAlertsLogin(111, cfg);
    expect(scopesForRetry()).toBeUndefined();
  });

  it('does not narrow what a live device login retries with', async () => {
    await startLogin(['esi-skills.read_skills.v1'], cfg);
    await startAlertsLogin(111, cfg);
    expect(scopesForRetry()).toEqual(['esi-skills.read_skills.v1']);
  });
});

describe('completeAlertsLogin', () => {
  it('hands back the tokens and the Character that authorized', async () => {
    const state = stateOf(await startAlertsLogin(111, cfg));
    const result = await completeAlertsLogin({ code: 'c', state }, cfg);
    expect(result).toMatchObject({
      expectedCharacterId: 111,
      characterId: 111,
      name: 'Pilot 111',
      refreshToken: 'alerts-refresh',
    });
    expect(result.accessToken.split('.')).toHaveLength(3);
  });

  it('reports a different Character than the row when EVE returns another one', async () => {
    const state = stateOf(await startAlertsLogin(111, cfg));
    returnedCharacterId = 222;
    const result = await completeAlertsLogin({ code: 'c', state }, cfg);
    expect(result).toMatchObject({ expectedCharacterId: 111, characterId: 222, name: 'Pilot 222' });
  });

  it('never writes a Character or a token to the device', async () => {
    const state = stateOf(await startAlertsLogin(111, cfg));
    await completeAlertsLogin({ code: 'c', state }, cfg);
    expect(await db.characters.count()).toBe(0);
    expect(await db.tokens.count()).toBe(0);
  });

  it('refuses a round trip that was not an Alerts login', async () => {
    const state = stateOf(await startLogin([ALERTS_SCOPE], cfg));
    await expect(completeAlertsLogin({ code: 'c', state }, cfg)).rejects.toBeInstanceOf(LoginError);
  });

  it('is single use', async () => {
    const state = stateOf(await startAlertsLogin(111, cfg));
    await completeAlertsLogin({ code: 'c', state }, cfg);
    await expect(completeAlertsLogin({ code: 'c', state }, cfg)).rejects.toBeInstanceOf(LoginError);
  });

  it('the device login path refuses an Alerts round trip, so its token cannot become a session', async () => {
    const state = stateOf(await startAlertsLogin(111, cfg));
    await expect(completeLogin({ code: 'c', state }, cfg)).rejects.toBeInstanceOf(LoginError);
    expect(await db.tokens.count()).toBe(0);
  });
});
