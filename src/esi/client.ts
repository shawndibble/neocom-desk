import { AuthError } from '@/auth/sso';
import { emitEsiActivity } from './activityLog';
import { passEsiGate, observeEsiResponse } from './budget';
import {
  EsiError,
  EsiBudgetError,
  EsiOfflineError,
  EsiSsoUnavailableError,
  EsiTimeoutError,
} from './errors';
import { currentEsiLane, gateLane, type EsiLane } from './lane';
import type { EsiEndpointId } from './registry';
import { COMPATIBILITY_DATE } from './compatibilityDate';
import { USER_AGENT } from './userAgent';

export {
  EsiError,
  EsiBudgetError,
  EsiOfflineError,
  EsiSsoUnavailableError,
  EsiTimeoutError,
  attachEndpointId,
} from './errors';

export const ESI_BASE_URL = 'https://esi.evetech.net';
export { COMPATIBILITY_DATE };
export { USER_AGENT };

export const REQUEST_TIMEOUT_MS = 30_000;

export type GetToken = (characterId: number) => Promise<string>;

let tokenProvider: GetToken | null = null;

export function configureEsi(config: { getToken: GetToken | null }): void {
  tokenProvider = config.getToken;
}

export interface EsiFetchOptions {
  characterId?: number;
  query?: Record<string, string | number | boolean | undefined>;
  page?: number;
  etag?: string;
  signal?: AbortSignal;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  endpointId?: EsiEndpointId;
  lane?: EsiLane;
}

export interface EsiResult<T> {
  data: T | null;
  etag: string | null;
  pages: number;
  expires: string | null;
  notModified: boolean;
}

export function isAuthFailure(err: unknown): boolean {
  if (err instanceof EsiError) {
    if (err.status === 401) return true;
    return err.status === 403 && !isMissingRole(err);
  }
  return err instanceof AuthError && err.status !== 0 && !isSsoUnavailable(err);
}

export function isSsoUnavailable(err: AuthError): boolean {
  return err.status >= 500 || err.status === 429;
}

export function isMissingRole(err: unknown): boolean {
  if (!(err instanceof EsiError) || err.status !== 403) return false;
  const said = (err.body as { error?: unknown } | undefined)?.error;
  return /required role/i.test(`${err.message} ${typeof said === 'string' ? said : ''}`);
}

export function isOfflineFailure(err: unknown): boolean {
  if (err instanceof EsiOfflineError || err instanceof EsiTimeoutError) return true;
  if (err instanceof AuthError) return err.status === 0;
  if (err instanceof DOMException) return err.name === 'TimeoutError';
  return err instanceof TypeError;
}

export function isUnconfirmedWrite(err: unknown): boolean {
  if (err instanceof EsiTimeoutError) return err.sent;
  return err instanceof DOMException && err.name === 'TimeoutError';
}

export function isCredentialFailure(err: unknown): boolean {
  if (err instanceof EsiError) return err.status === 401;
  return isAuthFailure(err);
}

async function accessTokenOrOffline(getToken: GetToken, characterId: number): Promise<string> {
  try {
    return await getToken(characterId);
  } catch (err) {
    if (err instanceof AuthError && err.status === 0) throw new EsiOfflineError(err);
    if (err instanceof AuthError && isSsoUnavailable(err)) {
      throw new EsiSsoUnavailableError(err.status, err);
    }
    throw err;
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

interface RequestScope {
  readonly signal: AbortSignal;
  dispose(): void;
}

function openRequestScope(caller?: AbortSignal): RequestScope {
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const onTimeout = (): void => controller.abort(new EsiTimeoutError(REQUEST_TIMEOUT_MS));
  const onCaller = (): void =>
    controller.abort(caller?.reason ?? new DOMException('Aborted', 'AbortError'));

  if (caller?.aborted) onCaller();
  caller?.addEventListener('abort', onCaller, { once: true });
  timeout.addEventListener('abort', onTimeout, { once: true });

  return {
    signal: controller.signal,
    dispose() {
      timeout.removeEventListener('abort', onTimeout);
      caller?.removeEventListener('abort', onCaller);
    },
  };
}

async function gatedFetch(
  url: URL,
  init: RequestInit,
  signal: AbortSignal,
  lane: EsiLane | undefined
): Promise<Response> {
  let release: () => void;
  try {
    release = await passEsiGate(signal, lane);
  } catch (err) {
    if (err instanceof EsiTimeoutError) throw new EsiTimeoutError(err.timeoutMs, false);
    throw err;
  }
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...init, signal });
    observeEsiResponse(response.status, response.headers, startedAt);
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError' && signal.reason) throw signal.reason;
    throw err;
  } finally {
    release();
  }
}

async function errorFromResponse(
  response: Response,
  endpointId?: EsiEndpointId
): Promise<EsiError> {
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
  } catch {}
  return new EsiError(response.status, message, body, endpointId);
}

export async function esiFetch<T>(
  path: string,
  options: EsiFetchOptions = {}
): Promise<EsiResult<T>> {
  const { characterId, query, page, etag, signal, method = 'GET', body, endpointId } = options;
  const lane = gateLane(options.lane ?? currentEsiLane(), characterId);
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
    headers.Authorization = `Bearer ${await accessTokenOrOffline(tokenProvider, characterId)}`;
  }

  const scope = openRequestScope(signal);
  try {
    const requestBody = body !== undefined ? JSON.stringify(body) : undefined;
    const init: RequestInit = { method, headers, body: requestBody };
    let response = await gatedFetch(url, init, scope.signal, lane);
    if (response.status === 429 || response.status === 420) {
      try {
        response = await gatedFetch(url, init, scope.signal, lane);
      } catch (retryErr) {
        if (!(retryErr instanceof EsiBudgetError)) throw retryErr;
        throw await errorFromResponse(response, endpointId);
      }
    }

    if (response.status === 304 || response.status === 204) {
      recordEsiActivity(endpointId, characterId, 'success');
      return {
        data: null,
        etag: response.headers.get('etag') ?? etag ?? null,
        pages: parsePages(response),
        expires: response.headers.get('expires'),
        notModified: response.status === 304,
      };
    }
    if (!response.ok) throw await errorFromResponse(response, endpointId);

    const data = (await response.json()) as T;
    recordEsiActivity(endpointId, characterId, 'success');
    return {
      data,
      etag: response.headers.get('etag'),
      pages: parsePages(response),
      expires: response.headers.get('expires'),
      notModified: false,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof EsiBudgetError) throw err;
    recordEsiActivity(endpointId, characterId, outcomeForError(err));
    throw err;
  } finally {
    scope.dispose();
  }
}

export function outcomeForError(err: unknown): 'authFailure' | 'error' {
  return isAuthFailure(err) ? 'authFailure' : 'error';
}

export function recordEsiActivity(
  endpointId: EsiEndpointId | undefined,
  characterId: number | undefined,
  outcome: 'success' | 'authFailure' | 'error'
): void {
  if (!endpointId) return;
  emitEsiActivity({ endpointId, characterId, timestamp: Date.now(), outcome });
}
