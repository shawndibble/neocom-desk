import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
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

const server = mswServer();

beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  clearNpcStationIndex();
  loadNpcStations.mockReset();
  loadNpcStations.mockResolvedValue(SNAPSHOT);
});
afterEach(() => {
  configureEsi({ getToken: null });
});

describe('loadContractLocationName', () => {
  it('names an NPC station from the snapshot, with no request at all', async () => {
    expect(await loadContractLocationName(CHAR_ID, 60003760)).toBe('Jita IV - Moon 4');
  });

  it('goes straight to the structure endpoint for an id the snapshot does not hold', async () => {
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

  it('judges a station the loaded snapshot predates to be a structure, and says so', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/60099999`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    expect(await loadContractLocationName(CHAR_ID, 60099999)).toBeNull();
  });

  it('still resolves a station the snapshot predates when the snapshot is unreadable', async () => {
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
