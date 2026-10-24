import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loadMarketTrendWidget, MARKET_TREND_MAX_ITEMS } from './kindLoaders';

const loadPriceHistory = vi.fn();
vi.mock('@/features/market/priceHistory', () => ({
  loadPriceHistory: (...args: unknown[]) => loadPriceHistory(...args),
}));
vi.mock('@/features/market/orderBookView', () => ({
  loadGlobalMarketOverrides: async () =>
    new Map([[44992, { regionId: 19000001, regionName: 'Global' }]]),
}));

const quickbar = (typeIds: number[]) =>
  db.quickbars.put({
    id: '91',
    characterId: 91,
    items: typeIds.map((typeId) => ({ typeId, name: `Item ${typeId}` })),
    updatedAt: 1,
  });

describe('loadMarketTrendWidget', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await db.quickbars.clear();
    loadPriceHistory.mockReset();
    loadPriceHistory.mockResolvedValue({ points: [], fetchedAt: 1, fromCache: false });
  });

  it('is empty, with no requests, when the Quickbar is', async () => {
    const data = await loadMarketTrendWidget(91);
    expect(data.items).toEqual([]);
    expect(loadPriceHistory).not.toHaveBeenCalled();
  });

  it('reads the pilot hub, and a global-market item at its own region', async () => {
    await quickbar([34, 44992]);
    const data = await loadMarketTrendWidget(91);
    expect(loadPriceHistory).toHaveBeenCalledWith(10000002, 34);
    expect(loadPriceHistory).toHaveBeenCalledWith(19000001, 44992);
    expect(data.hubName).toBe('Jita');
    expect(data.items.map((i) => i.to)).toEqual([
      '/market/browser?type=34&hub=jita',
      '/market/browser?type=44992&region=19000001',
    ]);
  });

  it('caps the lines and counts what it left out', async () => {
    await quickbar([1, 2, 3, 4, 5, 6, 7, 8]);
    const data = await loadMarketTrendWidget(91);
    expect(data.items).toHaveLength(MARKET_TREND_MAX_ITEMS);
    expect(data.omitted).toBe(2);
  });

  it('keeps an item whose history failed as a row of unknowns', async () => {
    await quickbar([34]);
    loadPriceHistory.mockRejectedValue(new Error('no market'));
    const data = await loadMarketTrendWidget(91);
    expect(data.items[0]!.points).toEqual([]);
  });
});
