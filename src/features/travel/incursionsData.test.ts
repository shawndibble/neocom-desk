import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { db } from '@/db';
import { ESI_BASE_URL } from '@/esi/client';
import { loadConstellationNames } from './incursionsData';

const server = setupServer();
let namesRequests = 0;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  namesRequests = 0;
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadConstellationNames', () => {
  it('names constellations through the cached name lookup', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => {
        namesRequests += 1;
        return HttpResponse.json([{ id: 20000901, name: 'Kimotoro', category: 'constellation' }]);
      })
    );

    const names = await loadConstellationNames([20000901]);

    expect(names.get(20000901)).toBe('Kimotoro');
    expect(namesRequests).toBe(1);
  });

  it('leaves a constellation unnamed when ESI cannot be reached and nothing is cached', async () => {
    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));

    const names = await loadConstellationNames([20000902]);

    expect(names.has(20000902)).toBe(false);
  });

  it('reads a name from esiCache with ESI down', async () => {
    // Seeded by an earlier session; this id is not in the in-memory session map.
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () =>
        HttpResponse.json([{ id: 20000903, name: 'Mareerieh', category: 'constellation' }])
      )
    );
    const { resolveNames } = await import('@/features/character/names');
    await resolveNames([20000903]);
    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));

    const names = await loadConstellationNames([20000903]);

    expect(names.get(20000903)).toBe('Mareerieh');
  });
});
