import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';
import { db } from '@/db';
import { resetDetailPrefetchForTests } from './detailPrefetch';
import {
  loadMailHeaders,
  loadMailBody,
  loadMailLabels,
  loadMoreMailHeaders,
  markMailReadOnEsi,
  prefetchMailBodies,
  sendMail,
} from './mail';

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
    expect(result.failure).toBe('offline');
  });

  it('names a non-network failure as an error, not as offline', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 })
      )
    );
    const result = await loadMoreMailHeaders(CHAR_ID, [{ mail_id: 5 }]);
    expect(result.hasMore).toBe(true);
    expect(result.failure).toBe('error');
  });

  it('reports no failure on success', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([{ mail_id: 1 }])
      )
    );
    expect((await loadMoreMailHeaders(CHAR_ID, [{ mail_id: 5 }])).failure).toBeUndefined();
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

describe('prefetchMailBodies', () => {
  const headers = [
    { mail_id: 30, from: 90000002, subject: 'New', is_read: false },
    { mail_id: 20, from: 90000002, subject: 'Cached', is_read: false },
    { mail_id: 10, from: 90000002, subject: 'Old', is_read: true },
  ];
  const requested: number[] = [];

  beforeEach(() => {
    requested.length = 0;
    vi.stubGlobal('navigator', { onLine: true });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/:mailId`, ({ params }) => {
        requested.push(Number(params.mailId));
        return HttpResponse.json({ from: 90000002, subject: 'S', body: 'Text', read: false });
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetDetailPrefetchForTests();
  });

  it('caches the bodies of the newest mail so the reader has them offline, skipping cached ones', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:20',
      value: { from: 1, subject: 'Cached', body: 'Already here', read: true },
      fetchedAt: 1,
    });

    await prefetchMailBodies(CHAR_ID, headers);

    expect(requested.sort()).toEqual([10, 30]);
    expect(await db.esiCache.get([CHAR_ID, 'mail:30'])).toBeDefined();
    expect((await db.esiCache.get([CHAR_ID, 'mail:20']))?.value).toMatchObject({
      body: 'Already here',
    });
  });

  it('does nothing while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await prefetchMailBodies(CHAR_ID, headers);
    expect(requested).toEqual([]);
  });

  it('does nothing on a save-data connection', async () => {
    vi.stubGlobal('navigator', { onLine: true, connection: { saveData: true } });
    await prefetchMailBodies(CHAR_ID, headers);
    expect(requested).toEqual([]);
  });

  it('does not ask again, this session, for a body that failed (deleted mail, a 403 or 404)', async () => {
    let hits = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/30`, () => {
        hits += 1;
        return HttpResponse.json({ error: 'gone' }, { status: 404 });
      })
    );

    await prefetchMailBodies(CHAR_ID, headers);
    await prefetchMailBodies(CHAR_ID, headers);

    expect(hits).toBe(1);
    // The others were cached by the first run and are not asked for again either.
    expect(requested.sort()).toEqual([10, 20]);
  });

  it('never rejects when a body cannot be fetched, and carries on with the rest', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/30`, () => HttpResponse.error())
    );
    await expect(prefetchMailBodies(CHAR_ID, headers)).resolves.toBeUndefined();
    expect(await db.esiCache.get([CHAR_ID, 'mail:20'])).toBeDefined();
  });
});

describe('markMailReadOnEsi', () => {
  // `organize_mail` is off by default (Write to EVE): most cases run with it held.
  beforeEach(async () => {
    await db.tokens.clear();
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 600_000,
      scopes: ['esi-mail.organize_mail.v1'],
    });
  });

  it('makes no request and reports nothing when the grant lacks organize_mail', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 600_000,
      scopes: ['esi-mail.read_mail.v1'],
    });
    const requested = vi.fn();
    server.use(
      http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`, () => {
        requested();
        return new HttpResponse(null, { status: 204 });
      })
    );
    const reported = vi.fn();
    const unsubscribe = onEsiAuthFailure(reported);

    try {
      await markMailReadOnEsi(CHAR_ID, 7);
      expect(requested).not.toHaveBeenCalled();
      expect(reported).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('PUTs {read:true} to the mail endpoint', async () => {
    let capturedBody: unknown;
    server.use(
      http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`, async ({ request }) => {
        capturedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      })
    );

    await markMailReadOnEsi(CHAR_ID, 7);

    expect(capturedBody).toEqual({ read: true });
  });

  it('resolves rather than throwing when the write fails — fire-and-forget', async () => {
    server.use(
      http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    await expect(markMailReadOnEsi(CHAR_ID, 7)).resolves.toBeUndefined();
  });

  it('resolves rather than throwing on a network failure', async () => {
    server.use(
      http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`, () => HttpResponse.error())
    );

    await expect(markMailReadOnEsi(CHAR_ID, 7)).resolves.toBeUndefined();
  });

  it('signals the app-wide reauth banner on a 401 — a dead credential must not fail silently', async () => {
    server.use(
      http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
      )
    );
    const reported = vi.fn();
    const unsubscribe = onEsiAuthFailure(reported);

    try {
      await markMailReadOnEsi(CHAR_ID, 7);
      expect(reported).toHaveBeenCalledTimes(1);
      expect(reported.mock.calls[0][0]).toBe(CHAR_ID);
    } finally {
      unsubscribe();
    }
  });

  it('stays quiet on a 403 when the grant already holds organize_mail: a re-login could not fix it', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 600_000,
      scopes: ['esi-mail.organize_mail.v1'],
    });
    server.use(
      http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`, () =>
        HttpResponse.json({ error: 'forbidden' }, { status: 403 })
      )
    );
    const reported = vi.fn();
    const unsubscribe = onEsiAuthFailure(reported);

    try {
      await markMailReadOnEsi(CHAR_ID, 7);
      expect(reported).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('does not signal the reauth banner for a non-auth failure (network error)', async () => {
    server.use(
      http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`, () => HttpResponse.error())
    );
    const reported = vi.fn();
    const unsubscribe = onEsiAuthFailure(reported);

    try {
      await markMailReadOnEsi(CHAR_ID, 7);
      expect(reported).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('patches the cached header list so is_read survives a reload', async () => {
    const headers = [
      { mail_id: 7, subject: 'Hi', is_read: false },
      { mail_id: 8, subject: 'Other', is_read: false },
    ];
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: headers,
      fetchedAt: Date.now(),
    });
    server.use(
      http.put(
        `${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`,
        () => new HttpResponse(null, { status: 204 })
      )
    );

    await markMailReadOnEsi(CHAR_ID, 7);

    const cached = (await db.esiCache.get([CHAR_ID, 'mail:headers']))?.value as typeof headers;
    expect(cached).toEqual([
      { mail_id: 7, subject: 'Hi', is_read: true },
      { mail_id: 8, subject: 'Other', is_read: false },
    ]);
  });

  it('keeps the header list at the age it was fetched, rather than restamping it as fresh', async () => {
    const fetchedAt = Date.now() - 3 * 60 * 60_000;
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: [{ mail_id: 7, subject: 'Hi', is_read: false }],
      fetchedAt,
    });
    server.use(
      http.put(
        `${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`,
        () => new HttpResponse(null, { status: 204 })
      )
    );

    await markMailReadOnEsi(CHAR_ID, 7);

    expect((await db.esiCache.get([CHAR_ID, 'mail:headers']))?.fetchedAt).toBe(fetchedAt);
  });

  it('leaves the cached header list alone when the write fails', async () => {
    const headers = [{ mail_id: 7, subject: 'Hi', is_read: false }];
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: headers,
      fetchedAt: Date.now(),
    });
    server.use(
      http.put(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/7/`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    await markMailReadOnEsi(CHAR_ID, 7);

    const cached = (await db.esiCache.get([CHAR_ID, 'mail:headers']))?.value;
    expect(cached).toEqual(headers);
  });
});

describe('sendMail', () => {
  const RECIPIENTS = [{ recipient_id: 90000001, recipient_type: 'character' as const }];

  it('POSTs recipients/subject/body with no approved_cost, and returns the new mail id', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(123456);
      })
    );

    const mailId = await sendMail(CHAR_ID, RECIPIENTS, 'RE: Hi', 'On my way');

    expect(mailId).toBe(123456);
    expect(capturedBody).toEqual({
      recipients: RECIPIENTS,
      subject: 'RE: Hi',
      body: 'On my way',
    });
  });

  it('deletes the cached headers row on success, so the next load refetches', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: [{ mail_id: 1 }],
      fetchedAt: Date.now(),
    });
    server.use(
      http.post(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/`, () => HttpResponse.json(123456))
    );

    await sendMail(CHAR_ID, RECIPIENTS, 'RE: Hi', 'On my way');

    expect(await db.esiCache.get([CHAR_ID, 'mail:headers'])).toBeUndefined();
  });

  it('throws with only ESI’s own error message on a rejected send (e.g. a CSPA charge)', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/`, () =>
        HttpResponse.json({ error: 'Contact 90000001 requires 1000000.0 ISK' }, { status: 400 })
      )
    );

    await expect(sendMail(CHAR_ID, RECIPIENTS, 'RE: Hi', 'On my way')).rejects.toThrow(
      'Contact 90000001 requires 1000000.0 ISK'
    );
  });

  it('signals the app-wide reauth banner on a 401/403', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const reported = vi.fn();
    const unsubscribe = onEsiAuthFailure(reported);

    try {
      await expect(sendMail(CHAR_ID, RECIPIENTS, 'RE: Hi', 'On my way')).rejects.toThrow();
      expect(reported).toHaveBeenCalledWith(CHAR_ID, 'postCharacterMail');
    } finally {
      unsubscribe();
    }
  });

  it('leaves the cached headers row alone when the send fails', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: [{ mail_id: 1 }],
      fetchedAt: Date.now(),
    });
    server.use(
      http.post(`${ESI_BASE_URL}/characters/${CHAR_ID}/mail/`, () => HttpResponse.error())
    );

    await expect(sendMail(CHAR_ID, RECIPIENTS, 'RE: Hi', 'On my way')).rejects.toThrow();

    expect((await db.esiCache.get([CHAR_ID, 'mail:headers']))?.value).toEqual([{ mail_id: 1 }]);
  });
});
