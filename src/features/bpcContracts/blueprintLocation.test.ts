import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { clearNpcStationIndex } from '@/sde/npcStations';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import { loadBlueprintLocation, loadContractLocationInfo } from './blueprintLocation';

const CHAR_ID = 91;

const STATIONS: NpcStationEntry[] = [
  { id: 60003760, name: 'Jita IV - Moon 4', systemId: 30000142, typeId: 52678 },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9459, regionId: 10000002 },
  { id: 31000007, name: 'J105443', security: -0.99, regionId: 11000001 },
];

const loadNpcStations = vi.fn(async (): Promise<NpcStationEntry[]> => STATIONS);
const loadSolarSystems = vi.fn(async (): Promise<SolarSystemEntry[]> => SYSTEMS);
vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: () => loadNpcStations(),
  loadSolarSystems: () => loadSolarSystems(),
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  clearNpcStationIndex();
  clearSolarSystemIndex();
  loadNpcStations.mockReset();
  loadNpcStations.mockResolvedValue(STATIONS);
  loadSolarSystems.mockReset();
  loadSolarSystems.mockResolvedValue(SYSTEMS);
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadBlueprintLocation', () => {
  it('resolves an NPC station to its name, region, and highsec space — no ESI request at all', async () => {
    expect(await loadBlueprintLocation(CHAR_ID, 60003760)).toEqual({
      name: 'Jita IV - Moon 4',
      regionId: 10000002,
      space: 'highsec',
    });
  });

  it('resolves a player structure via its ACL-checked lookup, classifying wormhole by system name', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000001`, () =>
        HttpResponse.json({ name: 'A Citadel', owner_id: 1, solar_system_id: 31000007 })
      )
    );

    expect(await loadBlueprintLocation(CHAR_ID, 1000000000001)).toEqual({
      name: 'A Citadel',
      regionId: 11000001,
      space: 'wormhole',
    });
  });

  it('resolves to a name with no region/space when the structure is outside this character ACL', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/999`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    expect(await loadBlueprintLocation(CHAR_ID, 999)).toEqual({
      name: null,
      regionId: null,
      space: null,
    });
  });
});

describe('loadContractLocationInfo', () => {
  it('names an NPC station and classifies its space from the free SDE snapshot alone', async () => {
    expect(await loadContractLocationInfo(60003760)).toEqual({
      name: 'Jita IV - Moon 4',
      space: 'highsec',
    });
  });

  it('leaves a player-structure location unresolved rather than firing an ESI request for it', async () => {
    // No handler registered for `/universe/structures/1000000000001` on
    // purpose — `onUnhandledRequest: 'error'` would fail the test if this
    // function ever tried, which is exactly the property under test.
    expect(await loadContractLocationInfo(1000000000001)).toEqual({ name: null, space: null });
  });
});
