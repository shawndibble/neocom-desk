// EVE SSO v2 OAuth endpoints (PKCE, public client).
// Token endpoint is CORS-open for browser SPAs; it does NOT allow an
// Authorization header — client_id goes in the form body instead.

const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';

/**
 * How long a token-endpoint POST (login exchange or refresh) may take before
 * it's abandoned. Previously unbounded: a request that never got a response
 * (proxy/network stall, not a rejection) left its caller's `await` unsettled
 * forever — `Callback.tsx`'s "Completing login…" spinner, and, via
 * `session.ts`'s `getValidAccessToken` calling `refreshToken`, app boot
 * itself. Exported (and overridable per-call below) only so tests can drive
 * a hang without waiting out the real value.
 */
export const SSO_REQUEST_TIMEOUT_MS = 15_000;

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export class AuthError extends Error {
  constructor(
    /**
     * OAuth error code, e.g. "invalid_grant"; "unknown_error" for a non-2xx,
     * non-JSON body; "network_error" for a request that never reached a
     * response at all (offline, DNS, TLS); "timeout" specifically when
     * `SSO_REQUEST_TIMEOUT_MS` was hit. Only "invalid_grant" means the grant
     * itself is dead — see `tokenProvider.ts`'s `isTotalAuthFailure`.
     */
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
  // Neither a network failure nor a timeout is proof the grant itself is
  // bad, so neither must collide with 'invalid_grant' (`tokenProvider.ts`'s
  // `isTotalAuthFailure` treats only that code as a reason to sign out).
  // Distinguish them anyway, rather than one generic code, so a genuine
  // timeout isn't reported the same as being offline.
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
    // The same timeout can also fire mid-body-read (headers arrived, then
    // the body stalled) — that must be reported as a timeout too, not folded
    // into the generic "body wasn't JSON" fallback below, which would report
    // a misleading `unknown_error` on whatever status the headers happened
    // to carry.
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
  // Response may rotate the refresh token — caller must persist the newest one.
  return postToken(
    {
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
    },
    opts.timeoutMs
  );
}
