import { vi } from 'vitest';
import type {
  MarketGroupNode,
  MarketTypeEntry,
  NpcStationEntry,
  SolarSystemEntry,
  MarketRegionEntry,
  GlobalMarketEntry,
  VariationData,
} from '@/sde/marketTypes';
import type { BlueprintMap, TypeMap } from '@/sde/types';

export const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [{ typeID: 34, quantity: 4500 }],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
};
export const SDE_TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
};

export const RECENT_DATE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const loadSdeMock = () => ({
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadTypes: vi.fn(async () => SDE_TYPES),
  loadSkills: vi.fn(async () => []),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
  loadSkillAttributeModifiers: vi.fn(async () => ({})),
});

export const loadTypeInfoMock = () => ({ loadTypeInfo: vi.fn(async () => null) });

export const priceHistoryChartMock = () => ({
  default: ({
    points,
    itemName,
    comparisons,
  }: {
    points: { date: string }[];
    itemName: string;
    comparisons?: { name: string; status: string }[];
  }) => (
    <div data-testid="price-history-chart">
      {itemName}: {points.length} points
      {(comparisons ?? []).map((c) => ` [${c.name}:${c.status}]`).join('')}
    </div>
  ),
});

export const pwaRegisterMock = () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
});

export const PLEX_TYPE_ID = 44992;
export const GPMR_REGION_ID = 19000001;

export const GROUPS: MarketGroupNode[] = [
  { id: 1, name: 'Ships', parentId: null, hasTypes: false },
  { id: 2, name: 'Frigates', parentId: 1, hasTypes: true },
  { id: 3, name: 'Ore', parentId: null, hasTypes: true },
  { id: 4, name: 'Destroyers', parentId: 1, hasTypes: true },
];
export const MERLIN_TYPE_ID = 608;
export const KESTREL_TYPE_ID = 609;
export const CORMORANT_TYPE_ID = 610;
export const CORAX_TYPE_ID = 611;
export const TYPES: MarketTypeEntry[] = [
  { typeId: 587, name: 'Rifter', marketGroupId: 2, volume: 1 },
  { typeId: 34, name: 'Tritanium', marketGroupId: 3, volume: 1 },
  { typeId: PLEX_TYPE_ID, name: 'PLEX', marketGroupId: 3, volume: 1 },
  { typeId: MERLIN_TYPE_ID, name: 'Merlin', marketGroupId: 4, volume: 1 },
  { typeId: KESTREL_TYPE_ID, name: 'Kestrel', marketGroupId: 4, volume: 1 },
  { typeId: CORMORANT_TYPE_ID, name: 'Cormorant', marketGroupId: 4, volume: 1 },
  { typeId: CORAX_TYPE_ID, name: 'Corax', marketGroupId: 4, volume: 1 },
];
export const STATIONS: NpcStationEntry[] = [
  { id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
];
export const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9459, regionId: 10000002 },
];
export const REGIONS: MarketRegionEntry[] = [
  { id: 10000002, name: 'The Forge' },
  { id: 10000043, name: 'Domain' },
];
export const GLOBAL_MARKETS: GlobalMarketEntry[] = [
  { typeId: PLEX_TYPE_ID, regionId: GPMR_REGION_ID, regionName: 'GPMR-01' },
];
export const VARIATION_DATA: VariationData = { types: {}, metaGroups: {} };

export const STRUCTURE_HITPOINTS_ATTR_ID = 9;
export const ATTRIBUTE_DICTIONARY = {
  [STRUCTURE_HITPOINTS_ATTR_ID]: {
    name: 'Structure Hitpoints',
    unit: 'HP',
    category: 'Structure',
  },
};

export const loadMarketSdeMock = () => ({
  loadMarketGroups: vi.fn(async () => GROUPS),
  loadMarketTypes: vi.fn(async () => TYPES),
  loadNpcStations: vi.fn(async () => STATIONS),
  loadSolarSystems: vi.fn(async () => SYSTEMS),
  loadMarketRegions: vi.fn(async () => REGIONS),
  loadGlobalMarkets: vi.fn(async () => GLOBAL_MARKETS),
  loadVariations: vi.fn(async () => VARIATION_DATA),
  loadAttributeDictionary: vi.fn(async () => ATTRIBUTE_DICTIONARY),
});
