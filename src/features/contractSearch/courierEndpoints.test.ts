import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearNpcStationIndex } from '@/sde/npcStations';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import { loadCourierEndpoints, placeStructureEndpoint } from './courierEndpoints';

const cachedStructures = vi.hoisted(
  () => new Map<number, { name: string; systemId: number | null }>()
);
vi.mock('@/features/character/structures', () => ({
  readCachedStructures: async () => cachedStructures,
}));

const JITA_STATION = 60003760;
const JITA_SYSTEM = 30000142;
const STRUCTURE = 1035466617946;
const THE_FORGE = 10000002;
const AINSAN_SYSTEM = 30002187;
const KHANID = 10000049;

const STATIONS: NpcStationEntry[] = [
  { id: JITA_STATION, name: 'Jita IV - Moon 4', systemId: JITA_SYSTEM },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: JITA_SYSTEM, name: 'Jita', security: 0.9459, regionId: THE_FORGE },
  { id: AINSAN_SYSTEM, name: 'Ainsan', security: 0.5321, regionId: KHANID },
];

const loadNpcStations = vi.fn(async (): Promise<NpcStationEntry[]> => STATIONS);
const loadSolarSystems = vi.fn(async (): Promise<SolarSystemEntry[]> => SYSTEMS);
vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: () => loadNpcStations(),
  loadSolarSystems: () => loadSolarSystems(),
  loadSolarSystemJumps: async () => ({
    [JITA_SYSTEM]: [AINSAN_SYSTEM],
    [AINSAN_SYSTEM]: [JITA_SYSTEM],
  }),
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

describe('loadCourierEndpoints — cached structures', () => {
  beforeEach(() => cachedStructures.clear());

  it('names a player structure this device already knows, and still marks it a structure', async () => {
    cachedStructures.set(STRUCTURE, { name: 'Perimeter - Keepstar', systemId: null });
    const endpoints = await loadCourierEndpoints([row()]);

    expect(endpoints.get(STRUCTURE)).toMatchObject({
      name: 'Perimeter - Keepstar',
      resolution: 'structure',
    });
  });

  it('places a cached structure in its system, so a route can be measured to it', async () => {
    cachedStructures.set(STRUCTURE, {
      name: "Ainsan - Mav's Watering Hole",
      systemId: AINSAN_SYSTEM,
    });
    const endpoints = await loadCourierEndpoints([row()]);

    expect(endpoints.get(STRUCTURE)).toEqual({
      locationId: STRUCTURE,
      name: "Ainsan - Mav's Watering Hole",
      systemName: 'Ainsan',
      systemId: AINSAN_SYSTEM,
      regionId: KHANID,
      security: 0.5321,
      space: 'highsec',
      resolution: 'structure',
      hasStargates: true,
    });
  });

  it('leaves it nameless when the cache has nothing', async () => {
    const endpoints = await loadCourierEndpoints([row()]);

    expect(endpoints.get(STRUCTURE)?.name).toBeNull();
  });
});

describe('placeStructureEndpoint', () => {
  it('places an unplaced structure end in the system its lookup returned', async () => {
    const endpoints = await loadCourierEndpoints([row()]);
    const unplaced = endpoints.get(STRUCTURE)!;

    const placed = await placeStructureEndpoint(unplaced, {
      name: "Ainsan - Mav's Watering Hole",
      systemId: AINSAN_SYSTEM,
    });

    expect(placed).toMatchObject({
      name: "Ainsan - Mav's Watering Hole",
      systemId: AINSAN_SYSTEM,
      systemName: 'Ainsan',
      regionId: KHANID,
      space: 'highsec',
      resolution: 'structure',
      hasStargates: true,
    });
  });

  it('keeps the region it had when the system is not in the snapshot', async () => {
    const endpoints = await loadCourierEndpoints([row({ originLocationId: STRUCTURE })]);
    const unplaced = endpoints.get(STRUCTURE)!;

    const placed = await placeStructureEndpoint(unplaced, { name: 'Somewhere', systemId: 1 });

    expect(placed).toMatchObject({
      systemId: 1,
      systemName: null,
      regionId: THE_FORGE,
      space: null,
    });
  });
});
