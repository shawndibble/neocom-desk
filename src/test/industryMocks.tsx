import { vi } from 'vitest';
import type { BlueprintMap, TypeMap } from '@/sde/types';

// Fixtures and `vi.mock` factories for the Industry route tests (Industry*.test.tsx).
// Kept free of app imports: a `vi.mock` factory imports this module while the app
// graph is still loading.

// The "vs 90d" figures read market history; nothing here is about them.
export const priceVsMedianMock = () => ({ loadPriceVsMedian: async () => null });
export const pwaRegisterMock = () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
});

// Small hand-made fixture, not the real SDE: one blueprint (Rifter, typeID
// 638) with two priced materials (Tritanium, Mechanical Parts) and a
// material with no hub orders (Pyerite). `9841` manufactures one of the
// Rifter's own materials, so a `?product=`/`?material=` deep link has
// somewhere real to resolve to besides the Rifter itself.
export const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [
      { typeID: 34, quantity: 100 },
      { typeID: 35, quantity: 50 },
      { typeID: 9840, quantity: 10 },
    ],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  '9841': {
    name: 'Mechanical Parts Blueprint',
    time: 300,
    materials: [{ typeID: 34, quantity: 20 }],
    products: [{ typeID: 9840, quantity: 5 }],
    skills: [],
    activity: 'manufacturing',
  },
};
export const TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  '9840': { name: 'Mechanical Parts', groupID: 428, volume: 0.03 },
};

export const loadSdeMock = () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
});
