import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadMailHeaders, loadMailBody, loadMailLabels, loadMoreMailHeaders } from './mail';

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
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(headers);
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
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: headers,
      fetchedAt: new Date(2),
      fromCache: true,
      truncated: false,
    });
  });

  it('reports needsReauth when the mail scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadMailHeaders(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });

  it('reports hasMore false when the first page is short of the 50-cap', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([{ mail_id: 1 }])
      )
    );
    const result = await loadMailHeaders(CHAR_ID);
    expect(result.hasMore).toBe(false);
  });

  it('reports hasMore true when the first page comes back at the 50-cap', async () => {
    const headers = Array.from({ length: 50 }, (_, i) => ({ mail_id: i + 1 }));
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () => HttpResponse.json(headers))
    );
    const result = await loadMailHeaders(CHAR_ID);
    expect(result.hasMore).toBe(true);
  });
});

describe('loadMoreMailHeaders', () => {
  it('fetches with last_mail_id set to the lowest cached mail_id, merges, and caches', async () => {
    let lastMailIdParam: string | null = null;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, ({ request }) => {
        lastMailIdParam = new URL(request.url).searchParams.get('last_mail_id');
        return HttpResponse.json([{ mail_id: 1, subject: 'Older' }]);
      })
    );

    const current = [{ mail_id: 5, subject: 'Newer' }];
    const result = await loadMoreMailHeaders(CHAR_ID, current);

    expect(lastMailIdParam).toBe('5');
    expect(result.headers).toEqual([
      { mail_id: 5, subject: 'Newer' },
      { mail_id: 1, subject: 'Older' },
    ]);
    expect((await db.esiCache.get([CHAR_ID, 'mail:headers']))?.value).toEqual(result.headers);
  });

  it('reports hasMore false once a short page is returned', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([{ mail_id: 1 }])
      )
    );
    const result = await loadMoreMailHeaders(CHAR_ID, [{ mail_id: 5 }]);
    expect(result.hasMore).toBe(false);
  });

  it('leaves the current list untouched and keeps hasMore true on a network failure', async () => {
    server.use(http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () => HttpResponse.error()));
    const current = [{ mail_id: 5, subject: 'Newer' }];
    const result = await loadMoreMailHeaders(CHAR_ID, current);
    expect(result.headers).toEqual(current);
    expect(result.hasMore).toBe(true);
  });
});

describe('loadMailLabels', () => {
  it('fetches labels and caches them', async () => {
    const labels = {
      labels: [{ label_id: 1, name: 'Inbox', unread_count: 3, color: '#ffffff' }],
      total_unread_count: 3,
    };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/labels`, () => HttpResponse.json(labels))
    );
    const result = await loadMailLabels(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(labels);
    expect((await db.esiCache.get([CHAR_ID, 'mail:labels']))?.value).toEqual(labels);
  });

  it('reports needsReauth when the mail scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/labels`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadMailLabels(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
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
