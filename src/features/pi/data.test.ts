import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadCharacterPlanets, loadPlanetDetail, loadAllColonyDetails } from './data';

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

const PLANET: import('@/esi/endpoints').CharacterPlanet = {
  solar_system_id: 30000142,
  planet_id: 40000001,
  planet_type: 'temperate',
  owner_id: CHAR_ID,
  last_update: '2026-08-30T00:00:00Z',
  upgrade_level: 3,
  num_pins: 4,
};

describe('loadCharacterPlanets', () => {
  it('fetches and caches the colony list', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([PLANET]))
    );
    const result = await loadCharacterPlanets(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual([PLANET]);
    expect((await db.esiCache.get([CHAR_ID, 'planets']))?.value).toEqual([PLANET]);
  });

  it('reports needsReauth on 403 with no cache fallback (scope granted after login)', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: 'planets', value: [PLANET], fetchedAt: 1 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadCharacterPlanets(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });

  it('does not treat a non-403 failure as needing reauth', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/planets`, () => HttpResponse.error())
    );
    const result = await loadCharacterPlanets(CHAR_ID);
    expect(result.needsReauth).toBe(false);
  });
});

describe('loadPlanetDetail', () => {
  it('fetches and caches one colony detail', async () => {
    const detail = { links: [], pins: [], routes: [] };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/planets/${PLANET.planet_id}`, () =>
        HttpResponse.json(detail)
      )
    );
    const result = await loadPlanetDetail(CHAR_ID, PLANET.planet_id);
    expect(result.cached?.data).toEqual(detail);
  });
});

describe('loadAllColonyDetails', () => {
  it('fetches detail for every planet id, concurrency-capped', async () => {
    const planetIds = [1, 2, 3, 4, 5];
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/planets/:planetId`, async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight -= 1;
        return HttpResponse.json({ links: [], pins: [], routes: [] });
      })
    );
    const results = await loadAllColonyDetails(CHAR_ID, planetIds);
    expect(results.size).toBe(5);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});
