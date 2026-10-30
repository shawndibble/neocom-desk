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

// Shared fixtures and `vi.mock` factories for the Market route tests
// (Market*.test.tsx). Kept free of app imports: a `vi.mock` factory imports this
// module while the app graph is still loading, so it must not import the app back.

// Rifter (typeId 587, the market TYPES fixture below) has a blueprint;
// Tritanium (typeId 34) doesn't — exercises the item context menu's Build
// Plan action in both states (issue #6).
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

// Price History's date-range control (issue #412) defaults to the last 30
// days — a literal fixture date would age out of that window and silently
// stop reaching the (mocked) chart the longer this suite exists.
export const RECENT_DATE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const loadSdeMock = () => ({
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadTypes: vi.fn(async () => SDE_TYPES),
  loadSkills: vi.fn(async () => []),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
  // ItemDetailModal (opened via "Show info" below) loads this unconditionally.
  loadSkillAttributeModifiers: vi.fn(async () => ({})),
});

// ItemDetailModal reads the baked type-info shard first. Mocked rather than
// fetched (`onUnhandledRequest: 'error'`); null sends it to the ESI handlers below.
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
// Destroyers (issue #10 "Related Items strip", now the Variations table's
// sibling-fallback path per issue #145): four Market Group siblings
// sharing group 4 — Merlin and Kestrel have sell orders, Corax has a buy
// order only (no sell), and Cormorant has none at all.
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
// Empty by default — none of the TYPES fixtures above carry a Tech/Meta/
// Faction classification, so the Variations table falls back to Market Group
// siblings exactly like the tests below expect. The variation-sourced path
// is exercised separately (see "shows the variation group, not Market Group
// siblings, when the item has variation data" below).
export const VARIATION_DATA: VariationData = { types: {}, metaGroups: {} };

// Rifter's own detail attribute (issue #9 "Item Detail"): matches the
// dogma_attributes fixture the ESI /universe/types/587 handler below returns.
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
