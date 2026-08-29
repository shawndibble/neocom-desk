import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { startLogin, completeLogin, getValidAccessToken } from './session';
import { challengeFromVerifier } from './pkce';
import { db } from '@/db';

const CHAR_ID = 2112625428;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeAccessJwt(expSeconds: number): string {
  const payload = {
    sub: `CHARACTER:EVE:${CHAR_ID}`,
    name: 'CCP Alpha',
    owner: 'owner-hash-1',
    exp: expSeconds,
    scp: ['esi-skills.read_skills.v1']
  };
  return `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

const cfg = { clientId: 'client-abc', redirectUri: 'https://app.example/neocom-desk/callback' };

let tokenRequests: URLSearchParams[] = [];

const server = setupServer(
  http.post('https://login.eveonline.com/v2/oauth/token', async ({ request }) => {
    const body = new URLSearchParams(await request.text());
    tokenRequests.push(body);
    if (body.get('grant_type') === 'authorization_code' && body.get('code') === 'good-code') {
      return HttpResponse.json({
        access_token: makeAccessJwt(Math.floor(Date.now() / 1000) + 1200),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'refresh-initial'
      });
    }
    if (body.get('grant_type') === 'refresh_token' && body.get('refresh_token') === 'refresh-old') {
      return HttpResponse.json({
        access_token: makeAccessJwt(Math.floor(Date.now() / 1000) + 1200),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'refresh-rotated'
      });
    }
    return HttpResponse.json({ error: 'invalid_grant', error_description: 'nope' }, { status: 400 });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(async () => {
  sessionStorage.clear();
  tokenRequests = [];
  await db.characters.clear();
  await db.tokens.clear();
});
afterEach(() => server.resetHandlers());

describe('startLogin', () => {
  it('stores verifier and state, returns authorize URL whose challenge matches verifier', async () => {
    const url = new URL(await startLogin(['esi-skills.read_skills.v1'], cfg));
    expect(url.origin + url.pathname).toBe('https://login.eveonline.com/v2/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('redirect_uri')).toBe(cfg.redirectUri);
    expect(url.searchParams.get('scope')).toBe('esi-skills.read_skills.v1');

    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();

    // verifier + state stashed for the callback leg
    const storedState = sessionStorage.getItem('neocom.sso.state');
    const storedVerifier = sessionStorage.getItem('neocom.sso.verifier');
    expect(storedState).toBe(state);
    expect(storedVerifier).toBeTruthy();
    await expect(challengeFromVerifier(storedVerifier!)).resolves.toBe(
      url.searchParams.get('code_challenge')
    );
  });
});

describe('startLogin env defaults', () => {
  it('falls back to VITE_EVE_CLIENT_ID and BASE_URL-based redirect when config omitted', async () => {
    vi.stubEnv('VITE_EVE_CLIENT_ID', 'env-client');
    try {
      const url = new URL(await startLogin(['esi-skills.read_skills.v1']));
      expect(url.searchParams.get('client_id')).toBe('env-client');
      expect(url.searchParams.get('redirect_uri')).toBe(
        `${location.origin}${import.meta.env.BASE_URL}callback`
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('completeLogin', () => {
  it('happy path: validates state, exchanges code, persists character + token', async () => {
    const url = new URL(await startLogin(['esi-skills.read_skills.v1'], cfg));
    const state = url.searchParams.get('state')!;
    const verifier = sessionStorage.getItem('neocom.sso.verifier')!;

    const character = await completeLogin({ code: 'good-code', state }, cfg);
    expect(character.characterId).toBe(CHAR_ID);
    expect(character.name).toBe('CCP Alpha');
    expect(character.ownerHash).toBe('owner-hash-1');

    const stored = await db.characters.get(CHAR_ID);
    expect(stored?.name).toBe('CCP Alpha');

    const token = await db.tokens.get(CHAR_ID);
    expect(token?.refreshToken).toBe('refresh-initial');
    expect(token?.scopes).toEqual(['esi-skills.read_skills.v1']);
    expect(token?.expiresAt).toBeGreaterThan(Date.now());

    // exchange used the stored verifier, and the one-shot stash was cleared
    expect(tokenRequests[0].get('code_verifier')).toBe(verifier);
    expect(sessionStorage.getItem('neocom.sso.verifier')).toBeNull();
    expect(sessionStorage.getItem('neocom.sso.state')).toBeNull();
  });

  it('rejects state mismatch without calling the token endpoint', async () => {
    await startLogin(['esi-skills.read_skills.v1'], cfg);
    await expect(completeLogin({ code: 'good-code', state: 'evil-state' }, cfg)).rejects.toThrow(
      /state/i
    );
    expect(tokenRequests).toHaveLength(0);
    expect(await db.tokens.count()).toBe(0);
  });

  it('rejects when no login is in progress', async () => {
    await expect(completeLogin({ code: 'good-code', state: 'x' }, cfg)).rejects.toThrow();
  });
});

describe('getValidAccessToken', () => {
  it('returns cached token when more than 60s from expiry', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'cached-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 120_000,
      scopes: []
    });
    await expect(getValidAccessToken(CHAR_ID, cfg)).resolves.toBe('cached-access');
    expect(tokenRequests).toHaveLength(0);
  });

  it('refreshes near-expiry token and persists rotated refresh token', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'stale-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 30_000, // < 60s buffer
      scopes: ['esi-skills.read_skills.v1']
    });
    const access = await getValidAccessToken(CHAR_ID, cfg);
    expect(access).not.toBe('stale-access');

    const stored = await db.tokens.get(CHAR_ID);
    expect(stored?.refreshToken).toBe('refresh-rotated'); // newest ALWAYS persisted
    expect(stored?.accessToken).toBe(access);
    expect(stored?.expiresAt).toBeGreaterThan(Date.now() + 60_000);
  });

  it('single-flights concurrent refreshes: token endpoint hit exactly once', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'stale-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 30_000,
      scopes: []
    });
    const [a, b] = await Promise.all([
      getValidAccessToken(CHAR_ID, cfg),
      getValidAccessToken(CHAR_ID, cfg)
    ]);
    expect(a).toBe(b);
    expect(tokenRequests).toHaveLength(1); // second concurrent call reuses in-flight refresh
    expect((await db.tokens.get(CHAR_ID))?.refreshToken).toBe('refresh-rotated');
  });

  it('allows a fresh refresh after the in-flight one settles', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'stale-access',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 30_000,
      scopes: []
    });
    await getValidAccessToken(CHAR_ID, cfg);
    // force stale again with a refreshable token
    await db.tokens.update(CHAR_ID, { expiresAt: Date.now() + 30_000, refreshToken: 'refresh-old' });
    await getValidAccessToken(CHAR_ID, cfg);
    expect(tokenRequests).toHaveLength(2); // map entry cleared on settle
  });

  it('throws when no token exists for the character', async () => {
    await expect(getValidAccessToken(999, cfg)).rejects.toThrow();
  });
});
