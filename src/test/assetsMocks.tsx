import { vi } from 'vitest';
import type { TypeMap } from '@/sde/types';

export const TYPES: TypeMap = {
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  '650': { name: 'Drake', groupID: 27, volume: 92150 },
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '691': { name: 'Rifter Blueprint', groupID: 105, volume: 0.01 },
  '47832': { name: 'Heavy Abyssal Energy Neutralizer', groupID: 71, volume: 50 },
};

export const ABYSSAL_NEUT = 47832;
export const abyssalEstimate = vi.fn();

export const pwaRegisterMock = () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
});

export const mutamarketMock = (original: typeof import('@/market/mutamarket')) => ({
  ...original,
  getAbyssalEstimate: abyssalEstimate,
});

export const itemDetailModalMock = () => ({
  ItemDetailModal: ({ itemName }: { itemName: string }) => (
    <div role="dialog" aria-label={`Item detail: ${itemName}`} />
  ),
});

export const loadSdeMock = () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadGroupCategories: vi.fn(async () => ({ '25': 6 })),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
  loadCompressedOreTypeIds: vi.fn(async () => ({})),
  loadMutaplasmids: vi.fn(async () => ({
    attributeNames: {},
    mutaplasmids: {},
    abyssalTypeIds: [47832],
  })),
});

export const fittingCatalogueMock = () => ({
  useFittingCatalogue: () => null,
  useFittingCatalogueFailed: () => false,
});
export const fittingPilotProfileMock = () => ({
  usePilotProfile: () => ({ profile: null, failed: false, retry: () => {} }),
});

export const loadMarketSdeMock = () => ({
  loadMarketGroups: vi.fn(async () => []),
  loadMarketTypes: vi.fn(async () => []),
  loadNpcStations: vi.fn(async () => []),
  loadSolarSystems: vi.fn(async () => [
    { id: 30000142, name: 'Jita', security: 0.95, regionId: 10000002 },
    { id: 30002053, name: 'Hed', security: 0.9, regionId: 10000002 },
    { id: 30002054, name: 'Lowpoint', security: 0.3, regionId: 10000002 },
    { id: 30002055, name: 'Far', security: 0.9, regionId: 10000002 },
    { id: 30002187, name: 'Amamake', security: 0.9, regionId: 10000002 },
  ]),
  loadSolarSystemJumps: vi.fn(async () => ({
    30000142: [30002054, 30002053],
    30002054: [30000142, 30002187],
    30002053: [30000142, 30002055],
    30002055: [30002053, 30002187],
    30002187: [30002054, 30002055],
  })),
  loadMarketRegions: vi.fn(async () => []),
  loadGlobalMarkets: vi.fn(async () => []),
  loadAttributeDictionary: vi.fn(async () => new Map()),
});

export const downloadCsvMock = (original: typeof import('@/lib/downloadCsv')) => ({
  ...original,
  exportRows: vi.fn(async () => {}),
});
