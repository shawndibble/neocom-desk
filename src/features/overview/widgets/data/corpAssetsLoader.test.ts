import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveCorpReadAccess = vi.fn();
const loadCorporationAssets = vi.fn();
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: (...a: unknown[]) => resolveCorpReadAccess(...a),
}));
vi.mock('@/features/corp/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/assets')>()),
  loadCorporationAssets: (...a: unknown[]) => loadCorporationAssets(...a),
}));
const getPrices = vi.fn(async () => new Map([[34, 10]]));
vi.mock('@/market/prices', () => ({ getAveragePriceByType: () => getPrices() }));
vi.mock('@/features/corp/blueprints', () => ({
  loadCorporationBlueprints: async () => ({ cached: null }),
}));

import { loadCorpAssets } from './corpFeedLoaders';

const access = (can: boolean) => ({ corporationId: 98000001, can: () => can });
const asset = (item_id: number, location_flag: string) => ({
  item_id,
  type_id: 34,
  quantity: 3,
  location_id: 60003760,
  location_type: 'station',
  location_flag,
  is_singleton: false,
});

beforeEach(() => vi.clearAllMocks());

describe('loadCorpAssets', () => {
  it('summarises the cached read with the page prices', async () => {
    resolveCorpReadAccess.mockResolvedValue(access(true));
    loadCorporationAssets.mockResolvedValue({
      cached: {
        data: [asset(1, 'AssetSafety'), asset(2, 'CorpDeliveries')],
        fetchedAt: new Date(0),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const feed = await loadCorpAssets(1);
    expect(loadCorporationAssets).toHaveBeenCalledWith(1, 98000001);
    expect(feed.readable).toBe(true);
    expect(feed.summary?.assetSafety).toEqual({ stacks: 1, value: 30 });
    expect(feed.summary?.deliveries.stacks).toBe(1);
  });

  it('degrades to counts without value when the price read fails', async () => {
    resolveCorpReadAccess.mockResolvedValue(access(true));
    loadCorporationAssets.mockResolvedValue({
      cached: {
        data: [asset(1, 'AssetSafety')],
        fetchedAt: new Date(0),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    getPrices.mockRejectedValueOnce(new Error('prices down'));
    const feed = await loadCorpAssets(1);
    expect(feed.summary?.assetSafety).toEqual({ stacks: 1, value: null });
  });
});
