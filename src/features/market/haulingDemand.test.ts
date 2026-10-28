import { afterEach, describe, expect, it, vi } from 'vitest';

const loadWithCache = vi.fn();
vi.mock('@/esi/cache', () => ({
  loadWithCache: (...a: unknown[]) => loadWithCache(...a),
  GLOBAL_CACHE_CHARACTER_ID: 0,
}));
vi.mock('@/features/contractSearch/r2OfferSnapshot', () => ({
  R2_SNAPSHOT_ORIGIN: 'https://r2.test',
  fetchJson: vi.fn(),
}));
const { loadHaulingDemand, parseHaulingDemand } = await import('./haulingDemand');

const isoDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

const OBJECT = {
  lastSyncedAt: Date.now(),
  asOf: isoDay(1),
  days: 30,
  types: { 34: [110, 4, 20, 110, '2026-10-14', 120, 100] },
};

afterEach(() => vi.clearAllMocks());

describe('parseHaulingDemand', () => {
  it('reads each stored tuple back as an aggregate', () => {
    expect(parseHaulingDemand(OBJECT)?.types.get(34)).toEqual({
      volume: 110,
      daysWithTrades: 4,
      orderSum: 20,
      recentSalePrice: 110,
      latestDay: { date: '2026-10-14', highest: 120, lowest: 100 },
    });
  });

  it('is null for anything that is not that shape', () => {
    expect(parseHaulingDemand(null)).toBeNull();
    expect(parseHaulingDemand({ ...OBJECT, asOf: 'yesterday' })).toBeNull();
    expect(parseHaulingDemand({ ...OBJECT, types: [] })).toBeNull();
    expect(parseHaulingDemand({ ...OBJECT, types: { 34: [1, 2] } })?.types.size).toBe(0);
  });
});

describe('loadHaulingDemand', () => {
  it('returns the cached object', async () => {
    loadWithCache.mockResolvedValue({ data: parseHaulingDemand(OBJECT) });
    expect((await loadHaulingDemand(10000002))?.asOf).toBe(OBJECT.asOf);
    expect(loadWithCache.mock.calls[0]![1]).toBe('haulingDemandR2:10000002');
  });

  it('is null when the newest day of data is over four days old', async () => {
    const old = { ...OBJECT, asOf: isoDay(6) };
    loadWithCache.mockResolvedValue({ data: parseHaulingDemand(old) });
    expect(await loadHaulingDemand(10000002)).toBeNull();
  });

  it('is null when nothing loads', async () => {
    loadWithCache.mockResolvedValue({ data: null });
    expect(await loadHaulingDemand(10000002)).toBeNull();
    loadWithCache.mockRejectedValue(new Error('offline'));
    expect(await loadHaulingDemand(10000002)).toBeNull();
  });
});
