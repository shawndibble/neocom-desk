import { vi } from 'vitest';
export { pwaRegisterMock } from '@/test/assetsMocks';

// Shared fixtures and mock factories for the Travel route tests
// (Travel*.test.tsx). Kept free of app imports: a `vi.mock` factory imports this
// module while the app graph is still loading, so it must not import the app back.

export const JITA = 30000142;
export const PERIMETER = 30000144;
export const UEDAMA = 30002768;
export const THERA = 31000005;
// A longer highsec run for the quiet-stretch fold: no ESI or zKillboard kills.
export const NIYABAINEN = 30000150;
export const MUVOLAILEN = 30000151;
export const SOBASEKI = 30000152;

// Its own region, so one rate-limited region leaves the others filling in.
export const PERIMETER_REGION = 10000043;
export const UEDAMA_REGION = 10000033;

export const SYSTEMS = [
  { id: JITA, name: 'Jita', security: 0.9459, regionId: 10000002 },
  { id: PERIMETER, name: 'Perimeter', security: 0.95, regionId: PERIMETER_REGION },
  { id: UEDAMA, name: 'Uedama', security: 0.505, regionId: UEDAMA_REGION },
  { id: THERA, name: 'Thera', security: -0.99, regionId: 11000031 },
  { id: NIYABAINEN, name: 'Niyabainen', security: 0.71, regionId: 10000002 },
  { id: MUVOLAILEN, name: 'Muvolailen', security: 0.62, regionId: 10000002 },
  { id: SOBASEKI, name: 'Sobaseki', security: 0.84, regionId: 10000002 },
];

export const UEDAMA_STATION = 60099001;
export const SOBASEKI_STATION = 60099002;
export const NPC_STATIONS = [
  { id: UEDAMA_STATION, name: 'Nova Depot', systemId: UEDAMA },
  { id: SOBASEKI_STATION, name: 'Crown Exchange', systemId: SOBASEKI },
];

export const JUMPS = {
  [JITA]: [PERIMETER],
  [PERIMETER]: [JITA, UEDAMA],
  [UEDAMA]: [PERIMETER],
  [THERA]: [],
};

/** What the mocked hooks and the ESI `/incursions` handler read; reset before each test. */
export const travelState: {
  lawlessSystems: ReadonlySet<number>;
  /** ESI `/incursions`; empty unless a test sets it. `null` answers 503. */
  incursions: unknown[] | null;
} = { lawlessSystems: new Set(), incursions: [] };

export const incursion = (
  constellation_id: number,
  staging_solar_system_id: number,
  state: string
) => ({
  constellation_id,
  staging_solar_system_id,
  state,
  influence: 0.4,
  has_boss: false,
  faction_id: 500019,
  type: 'Incursion',
  infested_solar_systems: [staging_solar_system_id],
});

export const loadSolarSystemJumps = vi.fn();

export const loadSdeMock = () => ({
  loadSkills: vi.fn(async () => []),
  // A smartbomb, for the zKillboard column's tag.
  loadTypes: vi.fn(async () => ({ '3995': { name: 'Large EMP Smartbomb II', groupID: 72 } })),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
  loadShipMass: vi.fn(async () => ({})),
  loadWormholeMass: vi.fn(async () => ({})),
});

export const lawlessSystemsMock = () => ({
  useLawlessSystems: () => travelState.lawlessSystems,
});

export const loadMarketSdeMock = (original: typeof import('@/sde/loadMarketSde')) => ({
  ...original,
  loadSolarSystemJumps: () => loadSolarSystemJumps(),
  loadSolarSystems: async () => SYSTEMS,
  loadMarketRegions: async () => [{ id: 10000002, name: 'The Forge' }],
  loadMarketGroups: async () => [],
  loadNpcStations: async () => NPC_STATIONS,
});

// Hauling's scan reads every hub's order books; the tab's own tests live with
// `HaulingPanel`. Here it only has to mount, so a failed scan is the cheapest
// state with a line to find.
// One result object, so `refresh` keeps its identity across renders as the
// real hook's does (the panel hands it up to the title bar on every change).
export const haulingScanMock = () => {
  const scan = { state: { status: 'error' }, refresh: () => {} };
  const fees = { accountingLevel: 5, brokerRelationsLevel: 4, at: () => null };
  return { useHaulingScan: () => scan, useHaulingFees: () => fees };
};
// The fill scan loads market types, and the jump count pulls the route
// settings stores: neither has anything to show while the main scan failed.
export const haulingFillScanMock = () => {
  const fill = { state: { status: 'idle' }, find() {}, more() {}, stop() {}, reset() {} };
  return { useHaulingFillScan: () => fill };
};
export const hubJumpsMock = () => ({ useHubJumps: () => ({ status: 'none' }) });
