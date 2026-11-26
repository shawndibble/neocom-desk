export const ESI_ROOT = 'https://esi.evetech.net';
export const ESI_BASE = `${ESI_ROOT}/latest`;
export const ESI_COMPATIBILITY_DATE = '2026-08-04';
export const ESI_USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';

export function esiHeaders(accessToken?: string | null): Record<string, string> {
  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    'User-Agent': ESI_USER_AGENT,
    'X-User-Agent': ESI_USER_AGENT,
    'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
    Accept: 'application/json',
  };
}

const ERROR_LIMIT_FLOOR = 20;
const RATELIMIT_REMAINING_FLOOR = 2;

function numberHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function isBudgetLow(headers: Headers): boolean {
  const remaining = numberHeader(headers, 'X-Ratelimit-Remaining');
  if (remaining !== null && remaining <= RATELIMIT_REMAINING_FLOOR) return true;
  const errorsLeft = numberHeader(headers, 'X-ESI-Error-Limit-Remain');
  return errorsLeft !== null && errorsLeft < ERROR_LIMIT_FLOOR;
}

export function retryAfterMs(headers: Headers): number | null {
  const seconds = numberHeader(headers, 'Retry-After');
  return seconds === null ? null : Math.max(0, seconds) * 1000;
}

export type EsiGetResult =
  | { kind: 'ok'; body: unknown; headers: Headers; budgetLow: boolean }
  | { kind: 'not-modified'; headers: Headers; budgetLow: boolean }
  | { kind: 'forbidden'; budgetLow: boolean }
  | { kind: 'expired'; budgetLow: boolean }
  | { kind: 'not-found'; budgetLow: boolean }
  | { kind: 'backoff'; retryAfterMs: number | null; budgetLow: boolean }
  | { kind: 'error'; status: number | null; budgetLow: boolean };

export interface EsiGetOptions {
  token?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  ifNoneMatch?: string | null;
  body?: unknown;
}

const DEFAULT_TIMEOUT_MS = 15_000;

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
