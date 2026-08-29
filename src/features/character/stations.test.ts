import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadStationName } from './stations';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadStationName', () => {
  it('fetches and caches the station name under the global sentinel', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({
          station_id: 60003760,
          name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
          type_id: 1531,
          system_id: 30000142,
        })
      )
    );

    const name = await loadStationName(60003760);

    expect(name).toBe('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
    expect((await db.esiCache.get([0, 'station:60003760']))?.value).toMatchObject({
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    });
  });

  it('returns null when unresolvable (structure, or offline + uncached)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/1000000000001`, () => HttpResponse.error())
    );

    const name = await loadStationName(1000000000001);

    expect(name).toBeNull();
  });
});
