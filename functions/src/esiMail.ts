// `GET /characters/{id}/mail/` for the Alerts poller (issue #5143, ADR 0029): the
// mail HEADERS only (scope `esi-mail.read_mail.v1`), never a body, a mailing list
// or a label. Same etiquette as the other poller reads (esiClient.ts): the shared
// headers, the stored ETag, and a classified result so the poller never
// reads a status code — 304 costs nothing, 403 is "this grant cannot read mail",
// 420/429 stop the run, a low budget stops it after this call.

import { ESI_BASE, esiHeaders, isBudgetLow, retryAfterMs } from './esiClient.js';
import type { MailHeader } from './mailPush.js';

export type MailHeadersResult =
  | { kind: 'ok'; headers: MailHeader[]; etag: string | null; budgetLow: boolean }
  | { kind: 'not-modified'; budgetLow: boolean }
  | { kind: 'forbidden' }
  | { kind: 'backoff'; retryAfterMs: number | null }
  | { kind: 'error'; status: number };

/** An entry without a numeric `mail_id` is unusable; the other fields are optional here. */
function toHeader(value: unknown): MailHeader[] {
  if (typeof value !== 'object' || value === null) return [];
  const v = value as Record<string, unknown>;
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
  const res = await fetchImpl(`${ESI_BASE}/characters/${characterId}/mail/`, {
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
    headers: body.flatMap(toHeader),
    etag: res.headers.get('ETag'),
    budgetLow: isBudgetLow(res.headers),
  };
}
