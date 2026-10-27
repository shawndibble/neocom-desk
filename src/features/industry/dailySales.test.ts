import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EsiError } from '@/esi/errors';

vi.mock('@/features/market/priceHistory', () => ({ loadPriceHistory: vi.fn() }));
import { loadPriceHistory } from '@/features/market/priceHistory';
vi.mock('@/features/loyalty/lpStoreVolume', () => ({ loadLpStoreVolume: vi.fn() }));
import { loadLpStoreVolume } from '@/features/loyalty/lpStoreVolume';
import { loadDailySales, resetHubVolumes } from './dailySales';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const history = (volume: number) => ({
  points: [{ date: '2026-09-28', average: 1, highest: 1, lowest: 1, volume, orderCount: 1 }],
  fetchedAt: NOW,
});

beforeEach(() => {
  vi.mocked(loadPriceHistory).mockReset();
  vi.mocked(loadLpStoreVolume).mockReset();
  resetHubVolumes();
  // No volume objects by default: the ESI fallback path.
  vi.mocked(loadLpStoreVolume).mockResolvedValue(null);
});

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

  describe('from the published volume objects', () => {
    it('sums the type across the hub regions without asking ESI', async () => {
      vi.mocked(loadLpStoreVolume).mockResolvedValue({ 34: 2 });
      expect(await loadDailySales(34, NOW)).toBe(10);
      expect(loadPriceHistory).not.toHaveBeenCalled();
    });

    it('reads each region object once however many products are checked', async () => {
      vi.mocked(loadLpStoreVolume).mockResolvedValue({ 34: 1 });
      await Promise.all([loadDailySales(34, NOW), loadDailySales(35, NOW)]);
      expect(loadLpStoreVolume).toHaveBeenCalledTimes(5);
    });

    it('reuses the read for 30 minutes, then reads again', async () => {
      vi.mocked(loadLpStoreVolume).mockResolvedValue({ 34: 1 });
      await loadDailySales(34, NOW);
      await loadDailySales(34, NOW + 29 * 60_000);
      expect(loadLpStoreVolume).toHaveBeenCalledTimes(5);
      await loadDailySales(34, NOW + 31 * 60_000);
      expect(loadLpStoreVolume).toHaveBeenCalledTimes(10);
    });

    it('counts a type absent from every object as no sales', async () => {
      vi.mocked(loadLpStoreVolume).mockResolvedValue({ 99: 7 });
      expect(await loadDailySales(34, NOW)).toBe(0);
    });

    it('asks ESI only for a region whose object is unavailable', async () => {
      vi.mocked(loadLpStoreVolume).mockImplementation(async (regionId) =>
        regionId === 10000002 ? null : { 34: 1 }
      );
      vi.mocked(loadPriceHistory).mockResolvedValue(history(30));
      // Four objects at 1 a day, plus Jita's 30 units over 30 days.
      expect(await loadDailySales(34, NOW)).toBeCloseTo(5);
      expect(vi.mocked(loadPriceHistory).mock.calls.map(([region]) => region)).toEqual([10000002]);
    });
  });
});
