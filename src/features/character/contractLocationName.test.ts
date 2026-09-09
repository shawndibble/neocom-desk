import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { clearNpcStationIndex } from '@/sde/npcStations';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { loadContractLocationName } from './contractLocationName';

const CHAR_ID = 91;
const SNAPSHOT: NpcStationEntry[] = [
  { id: 60003760, name: 'Jita IV - Moon 4', systemId: 30000142, typeId: 52678 },
];

const loadNpcStations = vi.fn(async (): Promise<NpcStationEntry[]> => SNAPSHOT);
vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: () => loadNpcStations(),
}));

// Handlers are registered per test, and `onUnhandledRequest: 'error'` turns
// any request this module should no longer make into a failure — which is how
// "the station probe is gone" is asserted below rather than merely described.
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  clearNpcStationIndex();
  loadNpcStations.mockReset();
  loadNpcStations.mockResolvedValue(SNAPSHOT);
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadContractLocationName', () => {
  it('names an NPC station from the snapshot, with no request at all', async () => {
    expect(await loadContractLocationName(CHAR_ID, 60003760)).toBe('Jita IV - Moon 4');
  });

  it('goes straight to the structure endpoint for an id the snapshot does not hold', async () => {
    // No `/universe/stations/1000000000001` handler on purpose: the snapshot is
    // the complete staStations table, so its silence *is* the answer, and the
    // 404 probe this used to spend on every modal open is gone (#655).
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000001`, () =>
        HttpResponse.json({ name: 'Tycho Brahe 18 HQ', owner_id: 1, solar_system_id: 30045349 })
      )
    );

    expect(await loadContractLocationName(CHAR_ID, 1000000000001)).toBe('Tycho Brahe 18 HQ');
  });

  it('falls back to the old station-then-structure probe when the snapshot is unreadable', async () => {
    loadNpcStations.mockRejectedValue(new Error('offline'));
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

  it('still resolves a station the snapshot predates, via the fallback probe', async () => {
    loadNpcStations.mockRejectedValue(new Error('offline'));
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60099999`, () =>
        HttpResponse.json({
          station_id: 60099999,
          name: 'Somewhere New',
          type_id: 1531,
          system_id: 30000001,
        })
      )
    );

    expect(await loadContractLocationName(CHAR_ID, 60099999)).toBe('Somewhere New');
  });

  it("returns null when the structure is outside this character's ACL", async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/999`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    expect(await loadContractLocationName(CHAR_ID, 999)).toBeNull();
  });
});
