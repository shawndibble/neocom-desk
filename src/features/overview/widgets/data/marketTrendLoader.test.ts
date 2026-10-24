import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiError } from '@/esi/errors';
import { loadMarketTrend, type MarketTrendRequest } from './marketTrendLoader';

const loadPriceHistory = vi.fn();
vi.mock('@/features/market/priceHistory', () => ({
  loadPriceHistory: (...args: unknown[]) => loadPriceHistory(...args),
}));
vi.mock('@/features/market/orderBookView', () => ({
  loadGlobalMarketOverrides: async () =>
    new Map([[44992, { regionId: 19000001, regionName: 'Global' }]]),
}));
vi.mock('@/sde/marketTypesById', () => ({
  loadMarketTypesById: async () =>
    new Map([[40520, { typeId: 40520, name: 'Large Skill Injector' }]]),
}));

const row = (date: string) => ({
  date,
  average: 1,
  highest: 1,
  lowest: 1,
  volume: 1,
  orderCount: 1,
});
const request = (
  sets: MarketTrendRequest['sets'],
  quickbar: MarketTrendRequest['quickbar'] = [
    { typeId: 34, name: 'Tritanium' },
    { typeId: 35, name: 'Pyerite' },
  ]
): MarketTrendRequest => ({ quickbar, defaultHubId: 'jita', sets });

describe('loadMarketTrend', () => {
  beforeEach(() => {
    loadPriceHistory.mockReset();
    loadPriceHistory.mockResolvedValue({ points: [], fetchedAt: 1, fromCache: false });
  });

  it('reads nothing for no widgets', async () => {
    const feed = await loadMarketTrend(request([]));
    expect(feed.series).toEqual({});
    expect(loadPriceHistory).not.toHaveBeenCalled();
  });

  it('reads a line shared by two widgets once', async () => {
    await loadMarketTrend(
      request([
        { typeIds: [34], hubIds: ['jita'] },
        { typeIds: [34, 35], hubIds: ['jita'] },
      ])
    );
    expect(loadPriceHistory).toHaveBeenCalledTimes(2);
  });

  it("reads each hub of a multi-hub widget at that hub's region", async () => {
    const feed = await loadMarketTrend(request([{ typeIds: [34], hubIds: ['jita', 'amarr'] }]));
    expect(loadPriceHistory).toHaveBeenCalledWith(10000002, 34);
    expect(loadPriceHistory).toHaveBeenCalledWith(10000043, 34);
    expect(feed.series['34@amarr']!.to).toBe('/market/browser?type=34&hub=amarr');
  });

  it('reads a global-market item once, at its own region', async () => {
    const feed = await loadMarketTrend(
      request([{ typeIds: [44992], hubIds: ['jita', 'amarr'] }], [{ typeId: 44992, name: 'PLEX' }])
    );
    expect(loadPriceHistory).toHaveBeenCalledTimes(1);
    expect(loadPriceHistory).toHaveBeenCalledWith(19000001, 44992);
    expect(feed.series['44992@global']!.to).toBe('/market/browser?type=44992&region=19000001');
    expect(feed.globalTypeIds).toContain(44992);
  });

  it('names an item outside the Quickbar from the market catalogue', async () => {
    const feed = await loadMarketTrend(request([{ typeIds: [40520], hubIds: ['jita'] }]));
    expect(feed.series['40520@jita']!.name).toBe('Large Skill Injector');
  });

  it('keeps a no-market item (ESI 400) as a row of unknowns', async () => {
    loadPriceHistory.mockRejectedValueOnce(new EsiError(400, 'no market'));
    const feed = await loadMarketTrend(request([{ typeIds: [34, 35], hubIds: ['jita'] }]));
    expect(feed.series['34@jita']!.points).toEqual([]);
    expect(feed.series['34@jita']!.failed).toBe(false);
  });

  it('flags a line whose read failed, while the others still load', async () => {
    loadPriceHistory.mockRejectedValueOnce(new Error('offline'));
    const feed = await loadMarketTrend(request([{ typeIds: [34, 35], hubIds: ['jita'] }]));
    expect(feed.series['34@jita']!.failed).toBe(true);
    expect(feed.series['35@jita']!.failed).toBe(false);
  });

  it('fails when every read fails, instead of showing "no history"', async () => {
    loadPriceHistory.mockRejectedValue(new Error('offline'));
    await expect(
      loadMarketTrend(request([{ typeIds: [34, 35], hubIds: ['jita'] }]))
    ).rejects.toThrow();
  });

  it('dates the feed by its oldest read, not the clock', async () => {
    loadPriceHistory
      .mockResolvedValueOnce({ points: [], fetchedAt: 5_000, fromCache: true })
      .mockResolvedValueOnce({ points: [], fetchedAt: 9_000, fromCache: false });
    const feed = await loadMarketTrend(request([{ typeIds: [34, 35], hubIds: ['jita'] }]));
    expect(feed.fetchedAt).toEqual(new Date(5_000));
  });

  it('keeps only the rows a year chart and a 30 day change need', async () => {
    loadPriceHistory.mockResolvedValue({
      points: [row('2025-01-01'), row('2026-06-01'), row('2026-10-24')],
      fetchedAt: 1,
      fromCache: false,
    });
    const feed = await loadMarketTrend(request([{ typeIds: [34], hubIds: ['jita'] }]));
    expect(feed.series['34@jita']!.points.map((p) => p.date)).toEqual(['2026-06-01', '2026-10-24']);
  });
});
