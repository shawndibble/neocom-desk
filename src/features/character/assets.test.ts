import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadCharacterAssets } from './assets';

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

const ASSET = (id: number) => ({
  item_id: id,
  type_id: 34,
  quantity: 1,
  location_id: 60003760,
  location_type: 'station' as const,
  location_flag: 'Hangar',
  is_singleton: false,
});

describe('loadCharacterAssets', () => {
  it('concatenates every page and caches the combined result', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/assets`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json([ASSET(page === '2' ? 2 : 1)], { headers: { 'X-Pages': '2' } });
      })
    );

    const result = await loadCharacterAssets(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: [ASSET(1), ASSET(2)],
      fetchedAt: expect.any(Date),
      fromCache: false,
      truncated: false,
    });
    expect((await db.esiCache.get([CHAR_ID, 'assets']))?.value).toEqual([ASSET(1), ASSET(2)]);
  });

  it('falls back to cache offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'assets',
      value: [ASSET(1)],
      fetchedAt: 5,
      truncated: false,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/assets`, () => HttpResponse.error())
    );

    const result = await loadCharacterAssets(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: [ASSET(1)],
      fetchedAt: new Date(5),
      fromCache: true,
      truncated: false,
    });
  });

  it('reports needsReauth when the scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/assets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadCharacterAssets(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});
