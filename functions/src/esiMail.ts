import { ESI_BASE, esiGet } from './esiClient.js';
import { isRecord } from './guards.js';
import type { MailHeader } from './mailPush.js';

export type MailHeadersResult =
  | { kind: 'ok'; headers: MailHeader[]; etag: string | null; budgetLow: boolean }
  | { kind: 'not-modified'; budgetLow: boolean }
  | { kind: 'forbidden' }
  | { kind: 'backoff'; retryAfterMs: number | null }
  | { kind: 'error'; status: number };

function toHeader(v: unknown): MailHeader[] {
  if (!isRecord(v)) return [];
  if (typeof v.mail_id !== 'number' || !Number.isSafeInteger(v.mail_id)) return [];
  const sentMs = typeof v.timestamp === 'string' ? Date.parse(v.timestamp) : NaN;
  return [
    {
      mailId: v.mail_id,
      ...(Number.isNaN(sentMs) ? {} : { sentMs }),
      ...(typeof v.from === 'number' ? { fromId: v.from } : {}),
      ...(typeof v.subject === 'string' ? { subject: v.subject } : {}),
    },
  ];
}

export async function fetchMailHeaders(
  characterId: number,
  accessToken: string,
  etag: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<MailHeadersResult> {
  const got = await esiGet(`${ESI_BASE}/characters/${characterId}/mail/`, {
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
    headers: body.flatMap(toHeader),
    etag: got.headers.get('ETag'),
    budgetLow: got.budgetLow,
  };
}
