import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { buildAuthorizeUrl, exchangeCode, refreshToken, AuthError } from './sso';

const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';

let lastBody: URLSearchParams | null = null;
let lastAuthHeader: string | null = null;

const server = setupServer(
  http.post(TOKEN_URL, async ({ request }) => {
    lastBody = new URLSearchParams(await request.text());
    lastAuthHeader = request.headers.get('authorization');
    const grant = lastBody.get('grant_type');
    if (grant === 'authorization_code' && lastBody.get('code') === 'good-code') {
      return HttpResponse.json({
        access_token: 'access-1',
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'refresh-1'
      });
    }
    if (grant === 'refresh_token' && lastBody.get('refresh_token') === 'refresh-1') {
      return HttpResponse.json({
        access_token: 'access-2',
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'refresh-2' // rotated
      });
    }
    return HttpResponse.json(
      { error: 'invalid_grant', error_description: 'Invalid authorization code' },
      { status: 400 }
    );
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  lastBody = null;
  lastAuthHeader = null;
});
afterAll(() => server.close());

describe('buildAuthorizeUrl', () => {
  it('builds the v2 authorize URL with all PKCE params', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client-abc',
        redirectUri: 'https://app.example/neocom-desk/callback',
        scopes: ['esi-skills.read_skills.v1', 'esi-wallet.read_character_wallet.v1'],
        state: 'state-xyz',
        challenge: 'challenge-123'
      })
    );
    expect(url.origin + url.pathname).toBe('https://login.eveonline.com/v2/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/neocom-desk/callback');
    expect(url.searchParams.get('scope')).toBe(
      'esi-skills.read_skills.v1 esi-wallet.read_character_wallet.v1'
    );
    expect(url.searchParams.get('state')).toBe('state-xyz');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-123');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('exchangeCode', () => {
  it('posts form-encoded grant and returns token response', async () => {
    const res = await exchangeCode({ clientId: 'client-abc', code: 'good-code', verifier: 'ver-1' });
    expect(res).toEqual({
      access_token: 'access-1',
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'refresh-1'
    });
    expect(lastBody?.get('grant_type')).toBe('authorization_code');
    expect(lastBody?.get('code')).toBe('good-code');
    expect(lastBody?.get('client_id')).toBe('client-abc');
    expect(lastBody?.get('code_verifier')).toBe('ver-1');
  });

  it('sends no Authorization header (blocked by SSO CORS)', async () => {
    await exchangeCode({ clientId: 'client-abc', code: 'good-code', verifier: 'ver-1' });
    expect(lastAuthHeader).toBeNull();
  });

  it('throws typed AuthError on error response', async () => {
    const err = await exchangeCode({ clientId: 'client-abc', code: 'bad-code', verifier: 'v' }).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(AuthError);
    const authErr = err as AuthError;
    expect(authErr.code).toBe('invalid_grant');
    expect(authErr.description).toBe('Invalid authorization code');
    expect(authErr.status).toBe(400);
  });
});

describe('refreshToken', () => {
  it('posts refresh grant and returns rotated tokens', async () => {
    const res = await refreshToken({ clientId: 'client-abc', refreshToken: 'refresh-1' });
    expect(res.access_token).toBe('access-2');
    expect(res.refresh_token).toBe('refresh-2');
    expect(lastBody?.get('grant_type')).toBe('refresh_token');
    expect(lastBody?.get('refresh_token')).toBe('refresh-1');
    expect(lastBody?.get('client_id')).toBe('client-abc');
  });

  it('throws AuthError on revoked refresh token', async () => {
    await expect(refreshToken({ clientId: 'client-abc', refreshToken: 'revoked' })).rejects.toBeInstanceOf(
      AuthError
    );
  });
});
