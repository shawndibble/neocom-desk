import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearNpcStationIndex } from '@/sde/npcStations';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import { loadCourierEndpoints } from './courierEndpoints';

const JITA_STATION = 60003760;
const JITA_SYSTEM = 30000142;
const STRUCTURE = 1035466617946;
const THE_FORGE = 10000002;

const STATIONS: NpcStationEntry[] = [
  { id: JITA_STATION, name: 'Jita IV - Moon 4', systemId: JITA_SYSTEM },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: JITA_SYSTEM, name: 'Jita', security: 0.9459, regionId: THE_FORGE },
];

const loadNpcStations = vi.fn(async (): Promise<NpcStationEntry[]> => STATIONS);
const loadSolarSystems = vi.fn(async (): Promise<SolarSystemEntry[]> => SYSTEMS);
vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: () => loadNpcStations(),
  loadSolarSystems: () => loadSolarSystems(),
  loadSolarSystemJumps: async () => ({}),
}));

function row(overrides: Partial<PublicCourierContractRow> = {}): PublicCourierContractRow {
  return {
    contractId: 1,
    regionId: THE_FORGE,
    originLocationId: JITA_STATION,
    destinationLocationId: STRUCTURE,
    reward: 10_000_000,
    volume: 50_000,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  clearNpcStationIndex();
  clearSolarSystemIndex();
  clearJumpGraphIndex();
  loadNpcStations.mockClear();
  loadSolarSystems.mockClear();
});

describe('loadCourierEndpoints — security', () => {
  it('fills a resolved station endpoint with its system’s raw security status', async () => {
    const endpoints = await loadCourierEndpoints([row()]);

    expect(endpoints.get(JITA_STATION)?.security).toBe(0.9459);
  });

  it('leaves an unplaced endpoint’s security null, structure or unreadable alike', async () => {
    const endpoints = await loadCourierEndpoints([row()]);

    // STRUCTURE is not in STATIONS, so it resolves as a player structure —
    // no system, so no security status either.
    expect(endpoints.get(STRUCTURE)?.security).toBeNull();
  });
});
