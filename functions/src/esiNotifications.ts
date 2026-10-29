// `GET /characters/{id}/notifications/` for the Alerts poller (issue #3756,
// ADR 0020). Sends ESI's required identification headers (no email address),
// the stored ETag, and classifies the response so the poller never has to read
// a status code: 304 costs nothing, 403 is a dead grant, 420/429 stop the whole
// run (the error budget is shared by every user of the client id).

import { ESI_BASE, esiHeaders } from './esiClient.js';
import type { EsiNotification } from './eveNotificationSelection.js';

/** Stop polling for this run when fewer than this many errors remain in ESI's window. */
const ERROR_LIMIT_FLOOR = 20;
/** Stop polling for this run when the rate-limit group has this few tokens left. */
const RATELIMIT_REMAINING_FLOOR = 2;

export type NotificationsResult =
  | {
      kind: 'ok';
      notifications: EsiNotification[];
      etag: string | null;
      budgetLow: boolean;
    }
  | { kind: 'not-modified'; budgetLow: boolean }
  | { kind: 'forbidden' }
  | { kind: 'backoff'; retryAfterMs: number | null }
  | { kind: 'error'; status: number };

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

export function retryAfterMs(headers: Headers): number | null {
  const seconds = numberHeader(headers, 'Retry-After');
  return seconds === null ? null : Math.max(0, seconds) * 1000;
}

function isNotification(value: unknown): value is EsiNotification {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.notification_id === 'number' &&
    typeof v.type === 'string' &&
    typeof v.timestamp === 'string' &&
    (v.text === undefined || typeof v.text === 'string')
  );
}

export async function fetchNotifications(
  characterId: number,
  accessToken: string,
  etag: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<NotificationsResult> {
  const res = await fetchImpl(`${ESI_BASE}/characters/${characterId}/notifications/`, {
    headers: { ...esiHeaders(accessToken), ...(etag ? { 'If-None-Match': etag } : {}) },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 304) return { kind: 'not-modified', budgetLow: isBudgetLow(res.headers) };
  if (res.status === 403) return { kind: 'forbidden' };
  if (res.status === 420 || res.status === 429) {
    return { kind: 'backoff', retryAfterMs: retryAfterMs(res.headers) };
  }
  if (!res.ok) return { kind: 'error', status: res.status };

  const body: unknown = await res.json().catch(() => null);
  if (!Array.isArray(body)) return { kind: 'error', status: res.status };
  return {
    kind: 'ok',
    notifications: body.filter(isNotification),
    etag: res.headers.get('ETag'),
    budgetLow: isBudgetLow(res.headers),
  };
}
