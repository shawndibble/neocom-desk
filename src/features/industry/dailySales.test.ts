import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EsiError } from '@/esi/errors';

vi.mock('@/features/market/priceHistory', () => ({ loadPriceHistory: vi.fn() }));
import { loadPriceHistory } from '@/features/market/priceHistory';
import { loadDailySales } from './dailySales';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const history = (volume: number) => ({
  points: [{ date: '2026-09-28', average: 1, highest: 1, lowest: 1, volume, orderCount: 1 }],
  fetchedAt: NOW,
});

beforeEach(() => vi.mocked(loadPriceHistory).mockReset());

describe('loadDailySales', () => {
  it('sums the last 30 days across every trade-hub region', async () => {
    vi.mocked(loadPriceHistory).mockResolvedValue(history(30));
    // Five hub regions, 30 units each, over 30 days: 5 a day.
    expect(await loadDailySales(34, NOW)).toBeCloseTo(5);
    expect(
      vi
        .mocked(loadPriceHistory)
        .mock.calls.map(([region]) => region)
        .sort()
    ).toEqual([10000002, 10000030, 10000032, 10000042, 10000043]);
  });

  it('counts a region where the type has no market as no sales', async () => {
    vi.mocked(loadPriceHistory)
      .mockRejectedValueOnce(new EsiError(400, 'no market'))
      .mockResolvedValue(history(30));
    expect(await loadDailySales(34, NOW)).toBeCloseTo(4);
  });

  it('is unknown (null) when a region could not be read, rather than under-counting', async () => {
    vi.mocked(loadPriceHistory)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(history(30));
    expect(await loadDailySales(34, NOW)).toBeNull();
  });
});
