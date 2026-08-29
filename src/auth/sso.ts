// EVE SSO v2 OAuth endpoints (PKCE, public client).
// Token endpoint is CORS-open for browser SPAs; it does NOT allow an
// Authorization header — client_id goes in the form body instead.

const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export class AuthError extends Error {
  constructor(
    /** OAuth error code, e.g. "invalid_grant"; "network_error" for non-JSON failures. */
    readonly code: string,
    readonly description: string,
    readonly status: number
  ) {
    super(`${code}: ${description}`);
    this.name = 'AuthError';
  }
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    scope: opts.scopes.join(' '),
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256'
  }).toString();
  return url.toString();
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || json === null) {
    const err = (json ?? {}) as { error?: string; error_description?: string };
    throw new AuthError(
      err.error ?? 'unknown_error',
      err.error_description ?? `Token request failed (${res.status})`,
      res.status
    );
  }
  return json as TokenResponse;
}

export function exchangeCode(opts: {
  clientId: string;
  code: string;
  verifier: string;
}): Promise<TokenResponse> {
  return postToken({
    grant_type: 'authorization_code',
    code: opts.code,
    client_id: opts.clientId,
    code_verifier: opts.verifier
  });
}

export function refreshToken(opts: {
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  // Response may rotate the refresh token — caller must persist the newest one.
  return postToken({
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId
  });
}
