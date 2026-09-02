import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadContractLocationName } from './contractLocationName';

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

describe('loadContractLocationName', () => {
  it('resolves a station id via the station endpoint', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({
          station_id: 60003760,
          name: 'Jita IV - Moon 4',
          type_id: 1,
          system_id: 2,
        })
      )
    );

    expect(await loadContractLocationName(CHAR_ID, 60003760)).toBe('Jita IV - Moon 4');
  });

  it('falls back to the structure endpoint when the station lookup misses', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/1000000000001`, () =>
        HttpResponse.json({ error: 'Station not found' }, { status: 404 })
      ),
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000001`, () =>
        HttpResponse.json({ name: 'Tycho Brahe 18 HQ', owner_id: 1, solar_system_id: 30045349 })
      )
    );

    expect(await loadContractLocationName(CHAR_ID, 1000000000001)).toBe('Tycho Brahe 18 HQ');
  });

  it('returns null when neither endpoint resolves it', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/999`, () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 })
      ),
      http.get(`${ESI_BASE_URL}/universe/structures/999`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    expect(await loadContractLocationName(CHAR_ID, 999)).toBeNull();
  });
});
