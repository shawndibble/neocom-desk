/**
 * Typed ESI (EVE Swagger Interface) HTTP client.
 *
 * Decoupled from auth/storage: token lookup is injected via configureEsi.
 * Every request pins X-Compatibility-Date and identifies the app via
 * X-User-Agent, per ESI guidelines.
 */
import { AuthError } from '@/auth/sso';

export const ESI_BASE_URL = 'https://esi.evetech.net';
export const COMPATIBILITY_DATE = '2026-08-01';
export const USER_AGENT = 'NeoCom Desk (github.com/shawndibble/neocom-desk)';

/** Single retry on 429/420; never wait longer than this, whatever the server asks. */
const MAX_RETRY_WAIT_MS = 10_000;
const DEFAULT_RETRY_WAIT_MS = 1_000;

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

export class EsiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'EsiError';
    this.status = status;
    this.body = body;
  }
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

/** Wait time before the single retry: Retry-After (429) or error-limit reset (420), capped. */
function retryWaitMs(response: Response): number {
  const raw =
    response.status === 420
      ? response.headers.get('x-esi-error-limit-reset')
      : response.headers.get('retry-after');
  const seconds = raw === null ? NaN : Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : DEFAULT_RETRY_WAIT_MS;
  return Math.min(Math.max(ms, 0), MAX_RETRY_WAIT_MS);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
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
 * otherwise. Retries once on 429/420, honoring Retry-After / error-limit
 * reset (capped at 10s). Throws EsiError on any other non-2xx/304 response.
 */
export async function esiFetch<T>(
  path: string,
  options: EsiFetchOptions = {}
): Promise<EsiResult<T>> {
  const { characterId, query, page, etag, signal, method = 'GET', body } = options;
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

  const requestBody = body !== undefined ? JSON.stringify(body) : undefined;
  let response = await fetch(url, { method, headers, body: requestBody, signal });
  if (response.status === 429 || response.status === 420) {
    await sleep(retryWaitMs(response), signal);
    response = await fetch(url, { method, headers, body: requestBody, signal });
  }

  if (response.status === 304) {
    return {
      data: null,
      etag: response.headers.get('etag') ?? etag ?? null,
      pages: parsePages(response),
      expires: response.headers.get('expires'),
    };
  }
  if (!response.ok) throw await errorFromResponse(response);

  return {
    data: (await response.json()) as T,
    etag: response.headers.get('etag'),
    pages: parsePages(response),
    expires: response.headers.get('expires'),
  };
}
