const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';

const SSO_REQUEST_TIMEOUT_MS = 15_000;

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export class AuthError extends Error {
  constructor(
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
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

async function postToken(
  body: Record<string, string>,
  timeoutMs: number = SSO_REQUEST_TIMEOUT_MS
): Promise<TokenResponse> {
  const timeoutOrNetworkError = (err: unknown): AuthError => {
    const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
    return new AuthError(
      isTimeout ? 'timeout' : 'network_error',
      isTimeout ? 'Token request timed out' : 'Network error contacting the token endpoint',
      0
    );
  };

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw timeoutOrNetworkError(err);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw timeoutOrNetworkError(err);
    json = null;
  }
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
  timeoutMs?: number;
}): Promise<TokenResponse> {
  return postToken(
    {
      grant_type: 'authorization_code',
      code: opts.code,
      client_id: opts.clientId,
      code_verifier: opts.verifier,
    },
    opts.timeoutMs
  );
}

export function refreshToken(opts: {
  clientId: string;
  refreshToken: string;
  timeoutMs?: number;
}): Promise<TokenResponse> {
  return postToken(
    {
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
    },
    opts.timeoutMs
  );
}
