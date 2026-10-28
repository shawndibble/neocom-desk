import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadFactions } from './factions';

const CALDARI = {
  faction_id: 500001,
  name: 'Caldari State',
  description: 'Ruled by corporations.',
  corporation_id: 1000035,
  militia_corporation_id: 1000180,
  size_factor: 5,
  solar_system_id: 30000145,
  station_count: 1535,
  station_system_count: 534,
  is_unique: true,
};

const server = setupServer();
let requests = 0;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  requests = 0;
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadFactions', () => {
  it('reads the faction list from ESI', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/factions`, () => {
        requests++;
        return HttpResponse.json([CALDARI]);
      })
    );
    expect(await loadFactions()).toEqual([CALDARI]);
  });

  it('serves a second read from the cache without another request', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/factions`, () => {
        requests++;
        return HttpResponse.json([CALDARI]);
      })
    );
    await loadFactions();
    expect(await loadFactions()).toEqual([CALDARI]);
    expect(requests).toBe(1);
  });

  it('is null when ESI is down and nothing is cached: an unread list is not "no factions"', async () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/factions`, () => HttpResponse.error()));
    expect(await loadFactions()).toBeNull();
  });
});
