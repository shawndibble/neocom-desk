import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadCharacterClones } from './clones';

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

describe('loadCharacterClones', () => {
  it('fetches and caches the clones payload', async () => {
    const payload = {
      jump_clones: [
        {
          jump_clone_id: 1,
          location_id: 60003760,
          location_type: 'station' as const,
          implants: [19540],
        },
      ],
      last_clone_jump_date: '2026-08-01T00:00:00Z',
    };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/clones`, () => HttpResponse.json(payload))
    );
    const result = await loadCharacterClones(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    expect((await db.esiCache.get([CHAR_ID, 'clones']))?.value).toEqual(payload);
  });

  it('falls back to cache offline', async () => {
    const payload = { jump_clones: [] };
    await db.esiCache.put({ characterId: CHAR_ID, key: 'clones', value: payload, fetchedAt: 2 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/clones`, () => HttpResponse.error())
    );
    const result = await loadCharacterClones(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: payload,
      fetchedAt: new Date(2),
      fromCache: true,
      truncated: false,
    });
  });

  it('reports needsReauth when the clones scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/clones`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadCharacterClones(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});
