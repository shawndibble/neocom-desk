import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadMailHeaders, loadMailBody } from './mail';

const CHAR_ID = 91;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadMailHeaders', () => {
  it('fetches headers and caches them', async () => {
    const headers = [
      {
        mail_id: 1,
        from: 90000001,
        subject: 'Hi',
        timestamp: '2026-08-01T00:00:00Z',
        is_read: false,
      },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () => HttpResponse.json(headers))
    );
    const result = await loadMailHeaders(CHAR_ID);
    expect(result?.data).toEqual(headers);
    expect((await db.esiCache.get([CHAR_ID, 'mail:headers']))?.value).toEqual(headers);
  });

  it('falls back to cache offline', async () => {
    const headers = [{ mail_id: 1, subject: 'Hi' }];
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: headers,
      fetchedAt: 2,
    });
    server.use(http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () => HttpResponse.error()));
    const result = await loadMailHeaders(CHAR_ID);
    expect(result).toEqual({ data: headers, fetchedAt: new Date(2), fromCache: true });
  });
});

describe('loadMailBody', () => {
  it('fetches one mail body and caches it under a per-mail key', async () => {
    const body = { from: 90000001, subject: 'Hi', body: 'Text', read: true };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7`, () => HttpResponse.json(body))
    );
    const result = await loadMailBody(CHAR_ID, 7);
    expect(result?.data).toEqual(body);
    expect((await db.esiCache.get([CHAR_ID, 'mail:7']))?.value).toEqual(body);
  });
});
