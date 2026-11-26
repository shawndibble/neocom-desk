import { vi } from 'vitest';
export { pwaRegisterMock } from '@/test/assetsMocks';

export const JITA = 30000142;
export const PERIMETER = 30000144;
export const UEDAMA = 30002768;
export const THERA = 31000005;
export const NIYABAINEN = 30000150;
export const MUVOLAILEN = 30000151;
export const SOBASEKI = 30000152;

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

export const travelState: {
  lawlessSystems: ReadonlySet<number>;
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

export const haulingScanMock = () => {
  const scan = { state: { status: 'error' }, refresh: () => {} };
  const fees = { accountingLevel: 5, brokerRelationsLevel: 4, at: () => null };
  return { useHaulingScan: () => scan, useHaulingFees: () => fees };
};
export const haulingFillScanMock = () => {
  const fill = { state: { status: 'idle' }, find() {}, more() {}, stop() {}, reset() {} };
  return { useHaulingFillScan: () => fill };
};
export const hubJumpsMock = () => ({ useHubJumps: () => ({ status: 'none' }) });
