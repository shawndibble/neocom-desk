import { vi } from 'vitest';
import type { TypeMap } from '@/sde/types';

// Shared mock factories for the Assets route tests (Assets*.test.tsx). Kept free
// of app imports: a `vi.mock` factory imports this module while the app graph is
// still loading, so it must not import the app back.

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

// Show info's modal fetches the type's dogma/market data; a stub that names
// its item is all the name-button tests need to see it opened.
export const itemDetailModalMock = () => ({
  ItemDetailModal: ({ itemName }: { itemName: string }) => (
    <div role="dialog" aria-label={`Item detail: ${itemName}`} />
  ),
});

export const loadSdeMock = () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  // Group 25 (Frigate) is in category 6, Ship.
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

// The Move tab reads hull capacities from the Fitting catalogue and the pilot's
// skills; its own tests (MovePlanTab.test.tsx) cover that, these files only open the tab.
export const fittingCatalogueMock = () => ({
  useFittingCatalogue: () => null,
  useFittingCatalogueFailed: () => false,
});
export const fittingPilotProfileMock = () => ({
  usePilotProfile: () => ({ profile: null, failed: false, retry: () => {} }),
});

// Only reached by the "View in Market" navigation test: Market Browser
// lazy-loads its own SDE payloads on mount, which these files otherwise never
// touch. Empty catalogues are enough to mount it without an unhandled fetch.
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
  // Jita to Amamake: two jumps through low-sec Lowpoint, or three through
  // high-sec Hed and Far. Prefer safer flies the three, Prefer shorter the two.
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

// The export tests read the rows handed to the export rather than a file.
export const downloadCsvMock = (original: typeof import('@/lib/downloadCsv')) => ({
  ...original,
  exportRows: vi.fn(async () => {}),
});
