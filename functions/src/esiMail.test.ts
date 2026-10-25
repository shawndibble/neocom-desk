import { describe, expect, it, vi } from 'vitest';
import { fetchMailHeaders } from './esiMail.js';

const respond = (status: number, body: unknown = [], headers: Record<string, string> = {}) =>
  vi.fn(
    async () => new Response(status === 304 ? null : JSON.stringify(body), { status, headers })
  );

describe('fetchMailHeaders', () => {
  it('sends ESI identification headers (no email), the bearer token and the stored ETag', async () => {
    const mock = respond(200);
    await fetchMailHeaders(9, 'tok', '"abc"', mock as unknown as typeof fetch);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://esi.evetech.net/latest/characters/9/mail/');
    expect(headers['X-Compatibility-Date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(headers['X-User-Agent']).not.toMatch(/@/);
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['If-None-Match']).toBe('"abc"');
  });

  it('reads only what the diff and the push need, dropping a header with no id', async () => {
    const result = await fetchMailHeaders(
      9,
      't',
      null,
      respond(
        200,
        [
          {
            mail_id: 7,
            from: 3,
            subject: 'Hi',
            timestamp: '2026-10-25T10:00:00Z',
            recipients: [{ recipient_id: 9, recipient_type: 'character' }],
            labels: [1],
            is_read: true,
          },
          { subject: 'no id' },
          { mail_id: 8 },
        ],
        { ETag: '"e"' }
      ) as never
    );
    expect(result).toEqual({
      kind: 'ok',
      headers: [
        { mailId: 7, fromId: 3, subject: 'Hi', sentMs: Date.parse('2026-10-25T10:00:00Z') },
        { mailId: 8 },
      ],
      etag: '"e"',
      budgetLow: false,
    });
  });

  it('classifies responses', async () => {
    expect(await fetchMailHeaders(9, 't', null, respond(304) as never)).toEqual({
      kind: 'not-modified',
      budgetLow: false,
    });
    expect(await fetchMailHeaders(9, 't', null, respond(403) as never)).toEqual({
      kind: 'forbidden',
    });
    expect(
      await fetchMailHeaders(9, 't', null, respond(420, {}, { 'Retry-After': '12' }) as never)
    ).toEqual({ kind: 'backoff', retryAfterMs: 12_000 });
    expect(await fetchMailHeaders(9, 't', null, respond(503) as never)).toEqual({
      kind: 'error',
      status: 503,
    });
    expect(await fetchMailHeaders(9, 't', null, respond(200, { nope: 1 }) as never)).toEqual({
      kind: 'error',
      status: 200,
    });
    const low = await fetchMailHeaders(
      9,
      't',
      null,
      respond(200, [], { 'X-ESI-Error-Limit-Remain': '3' }) as never
    );
    expect(low).toMatchObject({ kind: 'ok', budgetLow: true });
  });
});
