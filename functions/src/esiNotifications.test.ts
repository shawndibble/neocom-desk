import { describe, expect, it, vi } from 'vitest';
import { isBudgetLow } from './esiClient.js';
import { fetchNotifications } from './esiNotifications.js';

const respond = (status: number, body: unknown = [], headers: Record<string, string> = {}) =>
  vi.fn(
    async () => new Response(status === 304 ? null : JSON.stringify(body), { status, headers })
  );

describe('fetchNotifications', () => {
  it('sends ESI identification headers (no email) and the stored ETag', async () => {
    const fetchMock = respond(200);
    await fetchNotifications(9, 'tok', '"abc"', fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://esi.evetech.net/latest/characters/9/notifications/');
    const h = init.headers as Record<string, string>;
    expect(h['X-Compatibility-Date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(h['X-User-Agent']).not.toMatch(/@/);
    expect(h['If-None-Match']).toBe('"abc"');
    expect(h.Authorization).toBe('Bearer tok');
  });

  it('classifies responses', async () => {
    const feed = [{ notification_id: 1, type: 'T', timestamp: '2026-10-14T00:00:00Z', text: 'a' }];
    const ok = await fetchNotifications(
      9,
      't',
      null,
      respond(200, [...feed, { junk: 1 }], { ETag: '"e"' }) as never
    );
    expect(ok).toEqual({ kind: 'ok', notifications: feed, etag: '"e"', budgetLow: false });
    expect(await fetchNotifications(9, 't', '"e"', respond(304) as never)).toEqual({
      kind: 'not-modified',
      budgetLow: false,
    });
    expect(await fetchNotifications(9, 't', null, respond(403) as never)).toEqual({
      kind: 'forbidden',
    });
    expect(
      await fetchNotifications(9, 't', null, respond(429, {}, { 'Retry-After': '30' }) as never)
    ).toEqual({
      kind: 'backoff',
      retryAfterMs: 30_000,
    });
    expect(await fetchNotifications(9, 't', null, respond(420) as never)).toEqual({
      kind: 'backoff',
      retryAfterMs: null,
    });
    expect(await fetchNotifications(9, 't', null, respond(502) as never)).toEqual({
      kind: 'error',
      status: 502,
    });
    expect(await fetchNotifications(9, 't', null, respond(200, { not: 'array' }) as never)).toEqual(
      {
        kind: 'error',
        status: 200,
      }
    );
  });
});

describe('isBudgetLow', () => {
  it('flags a nearly empty rate-limit group or error window', () => {
    expect(isBudgetLow(new Headers({ 'X-Ratelimit-Remaining': '1' }))).toBe(true);
    expect(isBudgetLow(new Headers({ 'X-ESI-Error-Limit-Remain': '5' }))).toBe(true);
    expect(
      isBudgetLow(new Headers({ 'X-Ratelimit-Remaining': '100', 'X-ESI-Error-Limit-Remain': '99' }))
    ).toBe(false);
    expect(isBudgetLow(new Headers())).toBe(false);
  });
});
