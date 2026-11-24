/**
 * The wire contract every ESI call out of `functions/` shares — both halves of
 * CLAUDE.md's rule, "ESI calls always send `X-Compatibility-Date` and a
 * descriptive `X-User-Agent`; respect `X-Ratelimit-*` and `Retry-After`": the
 * bases, the identification headers, and the readers for the two budgets CCP
 * answers with. The header block lived spelled out at nine call sites, where
 * bumping the compatibility date meant finding all of them and a new call could
 * quietly go out identifying itself as nobody.
 */

/** The host, unrouted: the raidable-skyhook list has no `/latest` route. */
export const ESI_ROOT = 'https://esi.evetech.net';
export const ESI_BASE = `${ESI_ROOT}/latest`;
export const ESI_COMPATIBILITY_DATE = '2026-08-04';
/** Descriptive and with a contact route, never an address: headers travel. */
export const ESI_USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';

/**
 * The headers an ESI request sends, carrying `Authorization` when a token is
 * given. Spread it to add the rest (`If-None-Match`, `Content-Type`) on top.
 */
export function esiHeaders(accessToken?: string | null): Record<string, string> {
  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    'User-Agent': ESI_USER_AGENT,
    'X-User-Agent': ESI_USER_AGENT,
    'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
    Accept: 'application/json',
  };
}

/** Stop polling for this run when fewer than this many errors remain in ESI's window. */
const ERROR_LIMIT_FLOOR = 20;
/** Stop polling for this run when the rate-limit group has this few tokens left. */
const RATELIMIT_REMAINING_FLOOR = 2;

function numberHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** True when ESI's own headers say the next call risks the shared budget. */
export function isBudgetLow(headers: Headers): boolean {
  const remaining = numberHeader(headers, 'X-Ratelimit-Remaining');
  if (remaining !== null && remaining <= RATELIMIT_REMAINING_FLOOR) return true;
  const errorsLeft = numberHeader(headers, 'X-ESI-Error-Limit-Remain');
  return errorsLeft !== null && errorsLeft < ERROR_LIMIT_FLOOR;
}

/** `Retry-After` in milliseconds. `workbenchFits.parseRetryAfterMs` is the richer
 *  reader (HTTP-date form, capped) the non-ESI syncs need. */
export function retryAfterMs(headers: Headers): number | null {
  const seconds = numberHeader(headers, 'Retry-After');
  return seconds === null ? null : Math.max(0, seconds) * 1000;
}

export type EsiGetResult =
  | { kind: 'ok'; body: unknown; headers: Headers; budgetLow: boolean }
  /** 304: only when the caller sent `ifNoneMatch`. */
  | { kind: 'not-modified'; headers: Headers; budgetLow: boolean }
  | { kind: 'forbidden'; budgetLow: boolean }
  | { kind: 'expired'; budgetLow: boolean }
  | { kind: 'not-found'; budgetLow: boolean }
  | { kind: 'backoff'; retryAfterMs: number | null; budgetLow: boolean }
  /** `status` is null when the request never got an answer (timeout, network). */
  | { kind: 'error'; status: number | null; budgetLow: boolean };

export interface EsiGetOptions {
  token?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Sent as `If-None-Match`; a 304 then reads as `not-modified`. */
  ifNoneMatch?: string | null;
  /** A JSON body makes this a POST. */
  body?: unknown;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * One ESI request, classified. Never throws: a fetch rejection (timeout, network) is
 * `error` with a null status, and the body is read with a guard (null when not JSON).
 * Each caller maps the kinds it cares about; 401/404 stay explicit per caller.
 */
export async function esiGet(url: string, opts: EsiGetOptions = {}): Promise<EsiGetResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...(opts.body === undefined
        ? {
            headers: {
              ...esiHeaders(opts.token),
              ...(opts.ifNoneMatch ? { 'If-None-Match': opts.ifNoneMatch } : {}),
            },
          }
        : {
            method: 'POST',
            headers: { ...esiHeaders(opts.token), 'Content-Type': 'application/json' },
            body: JSON.stringify(opts.body),
          }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'error', status: null, budgetLow: false };
  }
  const budgetLow = isBudgetLow(res.headers);
  if (res.status === 304) return { kind: 'not-modified', headers: res.headers, budgetLow };
  if (res.status === 420 || res.status === 429) {
    return { kind: 'backoff', retryAfterMs: retryAfterMs(res.headers), budgetLow };
  }
  if (res.status === 401) return { kind: 'expired', budgetLow };
  if (res.status === 403) return { kind: 'forbidden', budgetLow };
  if (res.status === 404) return { kind: 'not-found', budgetLow };
  if (!res.ok) return { kind: 'error', status: res.status, budgetLow };
  const body: unknown = await res.json().catch(() => null);
  return { kind: 'ok', body, headers: res.headers, budgetLow };
}
