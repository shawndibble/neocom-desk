import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveCorpReadAccess = vi.fn();
const loadCorporationStarbases = vi.fn();
const loadStarbaseDetails = vi.fn();
const resolveNames = vi.fn();
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: (...a: unknown[]) => resolveCorpReadAccess(...a),
}));
vi.mock('@/features/corp/starbases', () => ({
  loadCorporationStarbases: (...a: unknown[]) => loadCorporationStarbases(...a),
  loadStarbaseDetails: (...a: unknown[]) => loadStarbaseDetails(...a),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () => new Map([[12235, 'Caldari Control Tower']]),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => new Map([[30000142, { name: 'Jita' }]]),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: (...a: unknown[]) => resolveNames(...a),
}));

import { loadCorpStarbases } from './corpFeedLoaders';

const access = { corporationId: 98000001, can: () => true };
const at = (ms: number) => ({ fetchedAt: new Date(ms), fromCache: false });

beforeEach(() => {
  vi.clearAllMocks();
  resolveCorpReadAccess.mockResolvedValue(access);
  resolveNames.mockResolvedValue(new Map());
});

describe('loadCorpStarbases', () => {
  it('reads details for online and reinforced towers, and anchors each bay to its own read', async () => {
    loadCorporationStarbases.mockResolvedValue({
      cached: {
        data: [
          { starbase_id: 1, system_id: 30000142, type_id: 12235, state: 'online' },
          { starbase_id: 2, system_id: 30000142, type_id: 12235, state: 'reinforced' },
          { starbase_id: 3, system_id: 30000142, type_id: 12235, state: 'offline' },
        ],
        ...at(5000),
      },
      needsReauth: false,
    });
    loadStarbaseDetails.mockResolvedValue(
      new Map([
        [1, { cached: { data: { fuels: [{ type_id: 4051, quantity: 40 }] }, ...at(9000) } }],
        [2, { cached: { data: { fuels: [{ type_id: 16275, quantity: 7 }] }, ...at(1000) } }],
      ])
    );
    const feed = await loadCorpStarbases(1);
    const asked = loadStarbaseDetails.mock.calls[0]?.[2] as { starbase_id: number }[];
    expect(asked.map((s) => s.starbase_id)).toEqual([1, 2]);
    expect(feed.starbases.map((s) => s.bayReadAtMs)).toEqual([9000, 1000, null]);
    expect(feed.starbases[1]?.bay).toEqual({ fuelBlocks: 0, strontium: 7 });
  });

  it('names systems from the static data like customs offices, without ESI name lookups', async () => {
    loadCorporationStarbases.mockResolvedValue({
      cached: {
        data: [{ starbase_id: 1, system_id: 30000142, type_id: 12235, state: 'offline' }],
        ...at(0),
      },
      needsReauth: false,
    });
    loadStarbaseDetails.mockResolvedValue(new Map());
    const feed = await loadCorpStarbases(1);
    expect(feed.systemNames.get(30000142)).toBe('Jita');
    expect(resolveNames).not.toHaveBeenCalled();
  });
});
