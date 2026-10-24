import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { EsiError } from '@/esi/errors';
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

  it('keeps a no-market item (ESI 400) as a row of unknowns', async () => {
    await quickbar([34, 35]);
    loadPriceHistory.mockRejectedValueOnce(new EsiError(400, 'no market'));
    const data = await loadMarketTrendWidget(91);
    expect(data.items[0]!.points).toEqual([]);
  });

  it('fails the widget when every read fails, instead of showing "no history"', async () => {
    await quickbar([34, 35]);
    loadPriceHistory.mockRejectedValue(new Error('offline'));
    await expect(loadMarketTrendWidget(91)).rejects.toThrow();
  });

  it('dates the widget by its oldest read, not the clock', async () => {
    await quickbar([34, 35]);
    loadPriceHistory
      .mockResolvedValueOnce({ points: [], fetchedAt: 5_000, fromCache: true })
      .mockResolvedValueOnce({ points: [], fetchedAt: 9_000, fromCache: false });
    expect((await loadMarketTrendWidget(91)).fetchedAt).toEqual(new Date(5_000));
  });

  it('honours a hub still stored under the legacy key', async () => {
    await db.settings.put({ key: 'marketHub', value: 'amarr' });
    await quickbar([34]);
    const data = await loadMarketTrendWidget(91);
    expect(data.hubName).toBe('Amarr');
    expect(data.items[0]!.to).toBe('/market/browser?type=34&hub=amarr');
  });

  it('keeps only the rows a 90 day chart and a 30 day change need', async () => {
    await quickbar([34]);
    const row = (date: string) => ({
      date,
      average: 1,
      highest: 1,
      lowest: 1,
      volume: 1,
      orderCount: 1,
    });
    loadPriceHistory.mockResolvedValue({
      points: [row('2025-01-01'), row('2026-06-01'), row('2026-10-24')],
      fetchedAt: 1,
      fromCache: false,
    });
    const data = await loadMarketTrendWidget(91);
    expect(data.items[0]!.points.map((p) => p.date)).toEqual(['2026-10-24']);
  });
});
