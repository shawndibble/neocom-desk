/**
 * Typed ESI (EVE Swagger Interface) HTTP client.
 *
 * Decoupled from auth/storage: token lookup is injected via configureEsi.
 * Every request pins X-Compatibility-Date and identifies the app via
 * X-User-Agent, per ESI guidelines.
 *
 * This is the one choke point every ESI call in the app passes through, which
 * is why the app-wide error/rate budget (`./budget.ts`, issue #655) is applied
 * here and nowhere else: a request is admitted by the gate, its response is
 * folded back into the budget, and its in-flight permit is released before any
 * backoff so a waiting retry cannot hold the ceiling shut behind it.
 */
import { AuthError } from '@/auth/sso';
import { emitEsiActivity } from './activityLog';
import { passEsiGate, observeEsiResponse } from './budget';
import { EsiError, EsiBudgetError } from './errors';
import type { EsiEndpointId } from './registry';

// `EsiError` lives in `./errors` so the budget can throw one without importing
// the client back (issue #655), but this stays its canonical import path.
export { EsiError, EsiBudgetError } from './errors';

export const ESI_BASE_URL = 'https://esi.evetech.net';
export const COMPATIBILITY_DATE = '2026-08-01';
export const USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';

/**
 * How long one request may take before it is abandoned.
 *
 * `esiFetch` had no timeout at all, which was survivable while a hung socket
 * only stalled its own call site. It is not survivable now that every request
 * holds one of `budget.ts`'s `ESI_MAX_IN_FLIGHT` app-wide permits: twelve hung
 * sockets would be the app's whole ESI layer. Deliberately generous — this is
 * the "this connection is dead" bound, not a latency target; `esi/cache.ts`'s
 * 250ms grace race is what keeps a merely slow call off the screen.
 */
const REQUEST_TIMEOUT_MS = 30_000;

export type GetToken = (characterId: number) => Promise<string>;

let tokenProvider: GetToken | null = null;

/** Inject (or clear) the access-token provider used for authenticated calls. */
export function configureEsi(config: { getToken: GetToken | null }): void {
  tokenProvider = config.getToken;
}

export interface EsiFetchOptions {
  /** When set, the request is authenticated with a Bearer token for this character. */
  characterId?: number;
  query?: Record<string, string | number | boolean | undefined>;
  page?: number;
  /** Previously seen ETag; sent as If-None-Match. A 304 yields data: null. */
  etag?: string;
  signal?: AbortSignal;
  /** HTTP method; defaults to GET. */
  method?: 'GET' | 'POST';
  /** JSON-serialized as the request body when `method` is 'POST'. */
  body?: unknown;
  /**
   * Identifies the call for the activity log (issue #32). Every
   * `endpoints.ts` wrapper passes its own registry key; omitted only by
   * direct `esiFetch` callers (tests) that don't need an entry.
   */
  endpointId?: EsiEndpointId;
}

export interface EsiResult<T> {
  /** Response body, or null when the server answered 304 Not Modified. */
  data: T | null;
  etag: string | null;
  /** Total pages from X-Pages; 1 when the endpoint is not paginated. */
  pages: number;
  /** Raw Expires header, for cache-freshness display. */
  expires: string | null;
}

/**
 * BUG #3: distinguishes "not logged in / needs re-login" from "offline /
 * ESI down" so read-through caches can surface a re-auth affordance instead
 * of silently going stale forever. Two shapes cover it:
 *  - EsiError with 401 (bad/expired token) or 403 (token valid but missing
 *    the scope this endpoint needs — same reasoning as
 *    src/features/industry/jobs.ts's existing needsReauth handling).
 *  - AuthError (src/auth/sso): getValidAccessToken's own refresh call fails
 *    (e.g. a revoked/expired refresh token) *before* esiFetch ever makes a
 *    request, so it never becomes an EsiError at all.
 */
export function isAuthFailure(err: unknown): boolean {
  if (err instanceof EsiError) return err.status === 401 || err.status === 403;
  return err instanceof AuthError;
}

function buildUrl(path: string, query?: EsiFetchOptions['query'], page?: number): URL {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, ESI_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  if (page !== undefined) url.searchParams.set('page', String(page));
  return url;
}

function parsePages(response: Response): number {
  const pages = Number(response.headers.get('x-pages'));
  return Number.isInteger(pages) && pages > 0 ? pages : 1;
}

/**
 * One HTTP request, admitted by the app-wide gate and abandoned if it hangs.
 *
 * The permit is released in `finally`, before the caller decides anything about
 * a retry — a retry that waited while still holding its permit would take one
 * of twelve slots out of the app for the length of the backoff.
 *
 * The timeout aborts through a controller of our own rather than the caller's,
 * so a timed-out request is distinguishable from a cancelled one: only the
 * caller's own abort is a cancellation, and only that one is exempt from the
 * activity log.
 */
async function gatedFetch(url: URL, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const release = await passEsiGate(signal);
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const abortFromTimeout = (): void =>
    controller.abort(new EsiError(0, `ESI request timed out after ${REQUEST_TIMEOUT_MS}ms`));
  const abortFromCaller = (): void =>
    controller.abort(signal?.reason ?? new DOMException('Aborted', 'AbortError'));

  if (signal?.aborted) abortFromCaller();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  timeout.addEventListener('abort', abortFromTimeout, { once: true });

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    observeEsiResponse(response.status, response.headers);
    return response;
  } catch (err) {
    // `fetch` rejects with its own AbortError; the reason we asked it to abort
    // for is the honest one to surface.
    if (err instanceof Error && err.name === 'AbortError' && controller.signal.reason) {
      throw controller.signal.reason;
    }
    throw err;
  } finally {
    timeout.removeEventListener('abort', abortFromTimeout);
    signal?.removeEventListener('abort', abortFromCaller);
    release();
  }
}

async function errorFromResponse(response: Response): Promise<EsiError> {
  let body: unknown;
  let message = `ESI request failed with status ${response.status}`;
  try {
    body = await response.json();
    if (
      body !== null &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
    ) {
      message = (body as { error: string }).error;
    }
  } catch {
    // Non-JSON error body; keep the status message.
  }
  return new EsiError(response.status, message, body);
}

/**
 * Fetch one ESI resource. Public when characterId is omitted, authenticated
 * otherwise. Throws EsiError on any non-2xx/304 response.
 *
 * Throttling is the app-wide budget's job (`./budget.ts`), not this function's:
 * every request is admitted by the gate, every response is fed back to it, and
 * the one retry a 429/420 still gets is the gate's decision rather than a blind
 * sleep. A caller can therefore be refused *before* a request is made, with an
 * `EsiBudgetError` — an `EsiError` carrying 420 or 429, which `esi/cache.ts`
 * answers from the stored row exactly as it answers a 5xx.
 */
export async function esiFetch<T>(
  path: string,
  options: EsiFetchOptions = {}
): Promise<EsiResult<T>> {
  const { characterId, query, page, etag, signal, method = 'GET', body, endpointId } = options;
  const url = buildUrl(path, query, page);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Compatibility-Date': COMPATIBILITY_DATE,
    'X-User-Agent': USER_AGENT,
  };
  if (etag !== undefined) headers['If-None-Match'] = etag;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (characterId !== undefined) {
    if (!tokenProvider) {
      throw new Error('esiFetch: authenticated call without a configured getToken (configureEsi)');
    }
    headers.Authorization = `Bearer ${await tokenProvider(characterId)}`;
  }

  try {
    const requestBody = body !== undefined ? JSON.stringify(body) : undefined;
    const init: RequestInit = { method, headers, body: requestBody };
    let response = await gatedFetch(url, init, signal);
    if (response.status === 429 || response.status === 420) {
      // The response has already been folded into the budget, so re-entering
      // the gate *is* the backoff: it waits out a short reset the server named
      // and refuses a long one. Refused, we keep the server's own error rather
      // than swapping in a synthetic one — this caller did reach ESI.
      try {
        response = await gatedFetch(url, init, signal);
      } catch (retryErr) {
        if (!(retryErr instanceof EsiBudgetError)) throw retryErr;
        throw await errorFromResponse(response);
      }
    }

    if (response.status === 304) {
      recordEsiActivity(endpointId, characterId, 'success');
      return {
        data: null,
        etag: response.headers.get('etag') ?? etag ?? null,
        pages: parsePages(response),
        expires: response.headers.get('expires'),
      };
    }
    if (!response.ok) throw await errorFromResponse(response);

    // Parsed before recordActivity: a body that fails to parse is this
    // request's outcome, not a second event stacked on top of a 'success'
    // already recorded for it.
    const data = (await response.json()) as T;
    recordEsiActivity(endpointId, characterId, 'success');
    return {
      data,
      etag: response.headers.get('etag'),
      pages: parsePages(response),
      expires: response.headers.get('expires'),
    };
  } catch (err) {
    // A cancelled route load (useRouteSnapshot discarding a stale response)
    // never reached a real outcome — not activity worth showing a user. Name
    // check, not `instanceof DOMException`: msw/undici don't agree on the
    // concrete error class, only on `name`.
    if (err instanceof Error && err.name === 'AbortError') throw err;
    recordEsiActivity(endpointId, characterId, outcomeForError(err));
    throw err;
  }
}

/** Shared with `paginated.ts` and the wallet-transactions loop, so a multi-request read logs once, not once per page. */
export function outcomeForError(err: unknown): 'authFailure' | 'error' {
  return isAuthFailure(err) ? 'authFailure' : 'error';
}

/** No-op when the caller didn't identify the endpoint (direct esiFetch callers in tests). */
export function recordEsiActivity(
  endpointId: EsiEndpointId | undefined,
  characterId: number | undefined,
  outcome: 'success' | 'authFailure' | 'error'
): void {
  if (!endpointId) return;
  emitEsiActivity({ endpointId, characterId, timestamp: Date.now(), outcome });
}
