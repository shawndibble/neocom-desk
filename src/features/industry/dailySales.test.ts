import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EsiError } from '@/esi/errors';

vi.mock('@/features/market/priceHistory', () => ({ loadPriceHistory: vi.fn() }));
import { loadPriceHistory } from '@/features/market/priceHistory';
vi.mock('@/features/loyalty/lpStoreVolume', () => ({ loadLpStoreVolume: vi.fn() }));
import { loadLpStoreVolume } from '@/features/loyalty/lpStoreVolume';
import { loadDailySales, resetRegionVolumes } from './dailySales';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const history = (volume: number) => ({
  points: [{ date: '2026-09-28', average: 1, highest: 1, lowest: 1, volume, orderCount: 1 }],
  fetchedAt: NOW,
});

const JITA_REGION = 10000002;

beforeEach(() => {
  vi.mocked(loadPriceHistory).mockReset();
  vi.mocked(loadLpStoreVolume).mockReset();
  resetRegionVolumes();
  // No volume object by default: the ESI fallback path.
  vi.mocked(loadLpStoreVolume).mockResolvedValue(null);
});

describe('loadDailySales', () => {
  describe('from the region volume object', () => {
    it("reads the scanned hub's region only, without asking ESI", async () => {
      vi.mocked(loadLpStoreVolume).mockResolvedValue({ 34: 2 });
      expect(await loadDailySales(JITA_REGION, 34, NOW)).toBe(2);
      expect(loadLpStoreVolume).toHaveBeenCalledOnce();
      expect(loadLpStoreVolume).toHaveBeenCalledWith(JITA_REGION);
      expect(loadPriceHistory).not.toHaveBeenCalled();
    });

    it('reads the region object once however many products are checked', async () => {
      vi.mocked(loadLpStoreVolume).mockResolvedValue({ 34: 1 });
      await Promise.all([
        loadDailySales(JITA_REGION, 34, NOW),
        loadDailySales(JITA_REGION, 35, NOW),
      ]);
      expect(loadLpStoreVolume).toHaveBeenCalledOnce();
    });

    it('reads another hub region separately', async () => {
      vi.mocked(loadLpStoreVolume).mockImplementation(async (regionId) =>
        regionId === JITA_REGION ? { 34: 9 } : { 34: 1 }
      );
      expect(await loadDailySales(JITA_REGION, 34, NOW)).toBe(9);
      expect(await loadDailySales(10000043, 34, NOW)).toBe(1);
    });

    it('reuses a complete read for 30 minutes, then reads again', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(NOW);
        vi.mocked(loadLpStoreVolume).mockResolvedValue({ 34: 1 });
        await loadDailySales(JITA_REGION, 34, NOW);
        vi.setSystemTime(NOW + 29 * 60_000);
        await loadDailySales(JITA_REGION, 34, NOW);
        expect(loadLpStoreVolume).toHaveBeenCalledTimes(1);
        vi.setSystemTime(NOW + 31 * 60_000);
        await loadDailySales(JITA_REGION, 34, NOW);
        expect(loadLpStoreVolume).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not keep a read where the object failed to load', async () => {
      vi.mocked(loadPriceHistory).mockResolvedValue(history(30));
      await loadDailySales(JITA_REGION, 34, NOW);
      await Promise.resolve();
      vi.mocked(loadLpStoreVolume).mockResolvedValue({ 34: 4 });
      expect(await loadDailySales(JITA_REGION, 34, NOW)).toBe(4);
    });

    it('counts a type absent from the object as no sales', async () => {
      vi.mocked(loadLpStoreVolume).mockResolvedValue({ 99: 7 });
      expect(await loadDailySales(JITA_REGION, 34, NOW)).toBe(0);
    });
  });

  describe('falling back to ESI history', () => {
    it("reads the last 30 days of the one region's history", async () => {
      vi.mocked(loadPriceHistory).mockResolvedValue(history(30));
      expect(await loadDailySales(JITA_REGION, 34, NOW)).toBeCloseTo(1);
      expect(loadPriceHistory).toHaveBeenCalledOnce();
      expect(loadPriceHistory).toHaveBeenCalledWith(JITA_REGION, 34);
    });

    it('counts a type with no market as no sales', async () => {
      vi.mocked(loadPriceHistory).mockRejectedValue(new EsiError(400, 'no market'));
      expect(await loadDailySales(JITA_REGION, 34, NOW)).toBe(0);
    });

    it('is unknown (null) when the region could not be read, rather than under-counting', async () => {
      vi.mocked(loadPriceHistory).mockRejectedValue(new Error('offline'));
      expect(await loadDailySales(JITA_REGION, 34, NOW)).toBeNull();
    });
  });
});
