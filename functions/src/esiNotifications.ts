import { ESI_BASE, esiGet } from './esiClient.js';
import { isRecord } from './guards.js';
import type { EsiNotification } from './eveNotificationSelection.js';

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

function isNotification(v: unknown): v is EsiNotification {
  if (!isRecord(v)) return false;
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
  const got = await esiGet(`${ESI_BASE}/characters/${characterId}/notifications/`, {
    token: accessToken,
    ifNoneMatch: etag,
    fetchImpl,
  });
  switch (got.kind) {
    case 'not-modified':
      return { kind: 'not-modified', budgetLow: got.budgetLow };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'backoff':
      return { kind: 'backoff', retryAfterMs: got.retryAfterMs };
    case 'error':
      return { kind: 'error', status: got.status ?? 0 };
    case 'expired':
      return { kind: 'error', status: 401 };
    case 'not-found':
      return { kind: 'error', status: 404 };
    case 'ok':
      break;
  }
  const body = got.body;
  if (!Array.isArray(body)) return { kind: 'error', status: 200 };
  return {
    kind: 'ok',
    notifications: body.filter(isNotification),
    etag: got.headers.get('ETag'),
    budgetLow: got.budgetLow,
  };
}
