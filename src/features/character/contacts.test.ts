import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadContacts } from './contacts';

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

const CONTACT = (id: number) => ({
  contact_id: id,
  contact_type: 'character' as const,
  standing: 5,
  is_blocked: false,
  is_watched: false,
});

describe('loadContacts', () => {
  it('concatenates every page and caches the combined result', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contacts`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json([CONTACT(page === '2' ? 2 : 1)], { headers: { 'X-Pages': '2' } });
      })
    );

    const result = await loadContacts(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data.map((c) => c.contact_id)).toEqual([1, 2]);
  });

  it('falls back to cache offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contacts',
      value: [CONTACT(1)],
      fetchedAt: 9,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contacts`, () => HttpResponse.error())
    );

    const result = await loadContacts(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: [CONTACT(1)],
      fetchedAt: new Date(9),
      fromCache: true,
      truncated: false,
    });
  });

  it('reports needsReauth when the contacts scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadContacts(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});
