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
const { loadHaulingBooks, parseHaulingBooks } = await import('./haulingBooks');

const OBJECT = {
  stationId: 60003760,
  lastSyncedAt: Date.now(),
  asOf: Date.now() - 30 * 60_000,
  types: {
    34: [
      [
        [6, 10, 2],
        [6.1, 5, 1],
      ],
      [[5.6, 4, 1]],
    ],
  },
};

afterEach(() => vi.clearAllMocks());

describe('parseHaulingBooks', () => {
  it('reads each stored tuple back as a ladder level', () => {
    expect(parseHaulingBooks(OBJECT)?.types.get(34)).toEqual({
      sell: [
        { price: 6, units: 10, orders: 2 },
        { price: 6.1, units: 5, orders: 1 },
      ],
      buy: [{ price: 5.6, units: 4, orders: 1 }],
    });
  });

  it('drops a malformed type but keeps the rest', () => {
    const books = parseHaulingBooks({ ...OBJECT, types: { ...OBJECT.types, 35: [[['x']], []] } });
    expect([...(books?.types.keys() ?? [])]).toEqual([34]);
  });

  it('is null for a wrong shape', () => {
    expect(parseHaulingBooks(null)).toBeNull();
    expect(parseHaulingBooks({ ...OBJECT, asOf: 'yesterday' })).toBeNull();
    expect(parseHaulingBooks({ ...OBJECT, types: [] })).toBeNull();
    expect(parseHaulingBooks({ ...OBJECT, lastSyncedAt: 0 })).toBeNull();
  });
});

describe('loadHaulingBooks', () => {
  it('returns a fresh snapshot', async () => {
    const parsed = parseHaulingBooks(OBJECT);
    loadWithCache.mockResolvedValue({ data: parsed });
    expect(await loadHaulingBooks(60003760)).toBe(parsed);
    expect(loadWithCache.mock.calls[0][1]).toBe('haulingBooksR2:60003760');
  });

  it('is null when the snapshot is older than three hours', async () => {
    loadWithCache.mockResolvedValue({
      data: parseHaulingBooks({ ...OBJECT, asOf: Date.now() - 4 * 60 * 60_000 }),
    });
    expect(await loadHaulingBooks(60003760)).toBeNull();
  });

  it('is null when nothing loads or the cache throws', async () => {
    loadWithCache.mockResolvedValueOnce(null);
    expect(await loadHaulingBooks(1)).toBeNull();
    loadWithCache.mockRejectedValueOnce(new Error('boom'));
    expect(await loadHaulingBooks(1)).toBeNull();
  });
});
