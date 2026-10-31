import { beforeEach, describe, expect, it, vi } from 'vitest';
import { historyPoint } from '@/engine/market/__fixtures__/priceHistory';
import { EsiError } from '@/esi/errors';
import { TRADE_HUBS } from '@/market/hubs';

const getHubPrices = vi.fn();
const loadPriceHistory = vi.fn();
const getOrderBook = vi.fn();
const loadHaulingDemand = vi.fn();
const loadHaulingBooks = vi.fn();

vi.mock('@/market/prices', () => ({ getHubPrices: (...a: unknown[]) => getHubPrices(...a) }));
vi.mock('@/features/market/priceHistory', () => ({
  loadPriceHistory: (...a: unknown[]) => loadPriceHistory(...a),
}));
// Default: no daily demand object, so pass 2 takes the ESI history path.
vi.mock('@/features/market/haulingDemand', () => ({
  loadHaulingDemand: (...a: unknown[]) => loadHaulingDemand(...a),
}));
// Default: no books snapshot, so pass 3 reads ESI books for a short list.
vi.mock('@/features/market/haulingBooks', () => ({
  loadHaulingBooks: (...a: unknown[]) => loadHaulingBooks(...a),
}));
vi.mock('@/features/market/orderBook', () => ({
  getOrderBook: (...a: unknown[]) => getOrderBook(...a),
}));
const loadUniverseTypeOnce = vi.fn();
vi.mock('@/features/skills/data', () => ({
  loadUniverseTypeOnce: (...a: unknown[]) => loadUniverseTypeOnce(...a),
}));
// Default: the baked shard lacks the type, so reads take the ESI fallback.
vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn(async () => null) }));
const { loadTypeInfo } = await import('@/sde/loadTypeInfo');
const loadMarketTypes = vi.fn();
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: (...a: unknown[]) => loadMarketTypes(...a),
}));
const { clearMarketTypeIndex } = await import('@/sde/marketTypesById');

const {
  clearHaulingScanCache,
  evictHaulingScan,
  haulingScanCacheKey,
  MAX_BOOK_CANDIDATES,
  MAX_HISTORY_READS,
  runHaulingScan,
} = await import('./haulingData');

const FROM = TRADE_HUBS.find((h) => h.id === 'jita')!;
const TO = TRADE_HUBS.find((h) => h.id === 'amarr')!;
const TYPES = { '34': { name: 'Tritanium', volume: 0.01 } } as never;

/** A catalogue entry, 1 m³ each, for every id. */
function typesFor(ids: readonly number[]) {
  return Object.fromEntries(ids.map((id) => [String(id), { name: `T${id}`, volume: 1 }])) as never;
}

function aggregate(
  sellMin: number | null,
  buyMax: number | null,
  sellVolume = 100,
  buyVolume = 100
) {
  return { sellMin, buyMax, sellVolume, buyVolume };
}

beforeEach(() => {
  clearHaulingScanCache();
  vi.clearAllMocks();
  clearMarketTypeIndex();
  loadMarketTypes.mockResolvedValue([]);
  loadHaulingDemand.mockResolvedValue(null);
  loadHaulingBooks.mockResolvedValue(null);
  getHubPrices.mockImplementation(async (hub: { id: string }) =>
    hub.id === FROM.id ? new Map([[34, aggregate(100, 90)]]) : new Map([[34, aggregate(200, 115)]])
  );
  getOrderBook.mockImplementation(async (regionId: number) =>
    regionId === FROM.regionId
      ? {
          orders: [
            { price: 100, volume_remain: 10, is_buy_order: false, location_id: FROM.stationId },
          ],
        }
      : {
          orders: [
            { price: 115, volume_remain: 5, is_buy_order: true, location_id: TO.stationId },
            // Elsewhere in the destination region: must not count as a buyer at the hub.
            { price: 150, volume_remain: 500, is_buy_order: true, location_id: 1 },
          ],
        }
  );
});

describe('haulingScanCacheKey', () => {
  it('keeps the two modes apart for the same route and category', () => {
    const list = haulingScanCacheKey({ from: FROM, to: TO, scope: 4, mode: 'list' });
    const instant = haulingScanCacheKey({ from: FROM, to: TO, scope: 4, mode: 'instant' });
    expect(list).not.toBe(instant);
    expect(haulingScanCacheKey({ from: FROM, to: TO, scope: 4 })).toBe(list);
  });
});

describe('runHaulingScan, selling into buy orders', () => {
  it('reads the destination buy orders at the hub station only and skips the history pass', async () => {
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: TYPES,
      mode: 'instant',
    });
    expect(loadPriceHistory).not.toHaveBeenCalled();
    expect(scan.rows).toHaveLength(1);
    expect(scan.rows[0]).toMatchObject({
      mode: 'instant',
      destBuyLadder: [{ price: 115, units: 5, orders: 1 }],
    });
  });

  it("carries each item's group and category, which decide the holds it may ride in", async () => {
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 99,
      types: { '34': { name: 'Tritanium', volume: 0.01, groupID: 18 } } as never,
      groupCategories: { '18': 4 },
      mode: 'instant',
    });
    expect(scan.rows[0]).toMatchObject({ groupId: 18, categoryId: 4 });
  });

  it('reads a missing catalogue volume through the cached type loader', async () => {
    loadUniverseTypeOnce.mockResolvedValue({ data: { volume: 0.01 } });
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: { '34': { name: 'Tritanium' } } as never,
      mode: 'instant',
    });
    expect(loadUniverseTypeOnce).toHaveBeenCalledWith(34);
    expect(scan.rows[0]).toMatchObject({ unitVolumeM3: 0.01 });
  });

  it('reads a baked packaged volume for a type no catalogue carries, without asking ESI', async () => {
    vi.mocked(loadTypeInfo).mockResolvedValueOnce({
      description: '',
      attributes: [],
      effects: [],
      volume: 16_500,
      packagedVolume: 2_500,
    });
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: { '34': { name: 'Unlisted hull' } } as never,
      mode: 'instant',
    });
    expect(loadUniverseTypeOnce).not.toHaveBeenCalled();
    expect(scan.rows[0]).toMatchObject({ unitVolumeM3: 2_500 });
  });

  it("hauls a container at the market catalogue's packaged volume, not types.json's assembled one", async () => {
    loadMarketTypes.mockResolvedValue([
      {
        typeId: 34,
        name: 'Station Container',
        marketGroupId: 1658,
        volume: 2_000_000,
        packagedVolume: 10_000,
      },
    ]);
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: { '34': { name: 'Station Container', volume: 2_000_000, groupID: 448 } } as never,
      mode: 'instant',
    });
    expect(scan.rows[0]).toMatchObject({ unitVolumeM3: 10_000, groupId: 448 });
  });

  it('names a type types.json lacks from the market catalogue, and takes its volume there', async () => {
    loadMarketTypes.mockResolvedValue([
      { typeId: 34, name: 'Microorganisms', marketGroupId: 1333, volume: 0.01 },
    ]);
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: {} as never,
      mode: 'instant',
    });
    expect(loadUniverseTypeOnce).not.toHaveBeenCalled();
    // The market catalogue has no SDE group: the holds it may ride in stay unknown.
    expect(scan.rows[0]).toMatchObject({
      name: 'Microorganisms',
      unitVolumeM3: 0.01,
      groupId: null,
    });
  });

  it('still scans when the market catalogue cannot load', async () => {
    loadMarketTypes.mockRejectedValue(new Error('offline'));
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: TYPES,
      mode: 'instant',
    });
    expect(scan.rows[0]).toMatchObject({ name: 'Tritanium', unitVolumeM3: 0.01 });
  });

  it('loads the market catalogue only once some item reaches the order books', async () => {
    getHubPrices.mockImplementation(async () => new Map([[34, aggregate(100, 90)]]));
    await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: TYPES,
      mode: 'instant',
    });
    expect(loadMarketTypes).not.toHaveBeenCalled();
  });

  it('drops an item whose volume cannot be told, not the scan', async () => {
    loadUniverseTypeOnce.mockResolvedValue(null);
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: { '34': { name: 'Tritanium' } } as never,
      mode: 'instant',
    });
    expect(scan.rows).toHaveLength(0);
  });

  it('evicts one scan from the cache and keeps the others', async () => {
    const scan = (scope: number | string) =>
      runHaulingScan({ from: FROM, to: TO, typeIds: [34], scope, types: TYPES, mode: 'instant' });
    await scan(4);
    await scan('fill-4');
    expect(getHubPrices).toHaveBeenCalledTimes(4);

    evictHaulingScan(haulingScanCacheKey({ from: FROM, to: TO, scope: 'fill-4', mode: 'instant' }));
    await scan(4);
    expect(getHubPrices).toHaveBeenCalledTimes(4);
    await scan('fill-4');
    expect(getHubPrices).toHaveBeenCalledTimes(6);
  });

  it('does not answer an instant scan from a cached listing scan', async () => {
    loadPriceHistory.mockRejectedValue(new Error('no history'));
    const list = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: TYPES,
    });
    expect(list.rows).toHaveLength(0);
    const instant = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: TYPES,
      mode: 'instant',
    });
    expect(instant.rows).toHaveLength(1);
  });
});

describe('runHaulingScan, shortlist order', () => {
  const TODAY = '2026-10-15';
  /** Many high-ratio items that never sell (history drops them), and one bulk steady seller at a lower ratio. */
  const THIN_COUNT = 85;
  const THIN = Array.from({ length: THIN_COUNT }, (_, i) => 2000 + i);
  const BULK = 5000;

  function history(average: number, volume: number) {
    return Array.from({ length: 30 }, (_, day) =>
      historyPoint({
        date: new Date(Date.parse(`${TODAY}T00:00:00Z`) - day * 86_400_000)
          .toISOString()
          .slice(0, 10),
        average,
        volume,
        orderCount: 10,
      })
    );
  }
  const BULK_HISTORY = history(120, 5_000);
  const THIN_HISTORY = history(300, 0);

  beforeEach(() => {
    getHubPrices.mockImplementation(async (hub: { id: string }, ids: number[]) => {
      const atOrigin = hub.id === FROM.id;
      return new Map(
        ids.map((id) => {
          if (id === BULK)
            return [id, atOrigin ? aggregate(100, 90, 50_000) : aggregate(120, 110, 30_000)];
          // 3x the price, two units for sale at the origin.
          return [id, atOrigin ? aggregate(100, 90, 2) : aggregate(300, 250, 500)];
        })
      );
    });
    loadPriceHistory.mockImplementation(async (_region: number, typeId: number) => ({
      points: typeId === BULK ? BULK_HISTORY : THIN_HISTORY,
    }));
    getOrderBook.mockImplementation(async (regionId: number, typeId: number) => {
      const hub = regionId === FROM.regionId ? FROM : TO;
      const price = hub === FROM ? 100 : typeId === BULK ? 120 : 300;
      return {
        orders: [{ price, volume_remain: 50_000, is_buy_order: false, location_id: hub.stationId }],
      };
    });
  });

  it('shortlists a bulk steady seller over high-ratio items with thin stock', async () => {
    const typeIds = [...THIN, BULK];
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 4,
      types: typesFor(typeIds),
      today: TODAY,
    });
    // Ranked below every thin item at pass 1, it still reaches history: those items drop out there.
    expect(loadPriceHistory).toHaveBeenCalledWith(TO.regionId, BULK);
    expect(getOrderBook).toHaveBeenCalledWith(TO.regionId, BULK);
    expect(scan.rows.map((r) => r.typeId)).toContain(BULK);
    expect(scan.capped).toBeUndefined();
  });

  it('names what it examined: dropped by history or given books', async () => {
    // Every tenth thin item has no market at the destination: dropped by pass 2.
    loadPriceHistory.mockImplementation(async (_region: number, typeId: number) => {
      if (typeId !== BULK && typeId % 10 === 0) throw new EsiError(400, 'no market');
      return { points: typeId === BULK ? BULK_HISTORY : THIN_HISTORY };
    });
    const typeIds = [...THIN, BULK];
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 4,
      types: typesFor(typeIds),
      today: TODAY,
    });
    const historyIds = loadPriceHistory.mock.calls.map(([, id]) => id as number);
    expect(new Set(scan.examinedTypeIds)).toEqual(new Set(historyIds));
    // Every candidate was read; each is examined unless it failed history without a verdict.
    expect(historyIds.length).toBe(typeIds.length);
    expect(scan.examinedTypeIds.length).toBe(historyIds.length);
  });
});

describe('runHaulingScan, examined ids and a failed history read', () => {
  const TODAY = '2026-10-15';
  const points = (average: number, volume: number) =>
    Array.from({ length: 30 }, (_, day) =>
      historyPoint({
        date: new Date(Date.parse(`${TODAY}T00:00:00Z`) - day * 86_400_000)
          .toISOString()
          .slice(0, 10),
        average,
        volume,
        orderCount: 10,
      })
    );

  it('leaves an item whose history read failed (rate limit, network) unexamined, for a later scan', async () => {
    loadPriceHistory.mockRejectedValue(new Error('429'));
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: TYPES,
      today: TODAY,
    });
    expect(scan.examinedTypeIds).not.toContain(34);
  });

  it('marks examined an item whose history loaded and did not sell above the origin price', async () => {
    loadPriceHistory.mockResolvedValue({ points: points(90, 1_000) });
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: TYPES,
      today: TODAY,
    });
    expect(scan.examinedTypeIds).toContain(34);
  });
});

describe('runHaulingScan, Max price', () => {
  /** More dear, high-scoring items than the order-book pass takes, and one cheap one. */
  const DEAR = Array.from({ length: MAX_BOOK_CANDIDATES + 5 }, (_, i) => 7000 + i);
  const CHEAP = 8000;

  beforeEach(() => {
    getHubPrices.mockImplementation(async (hub: { id: string }, ids: number[]) => {
      const atOrigin = hub.id === FROM.id;
      return new Map(
        ids.map((id) => {
          if (id === CHEAP) return [id, atOrigin ? aggregate(100, 90) : aggregate(200, 150)];
          return [
            id,
            atOrigin ? aggregate(1_000_000, 1) : aggregate(3_000_000, 2_000_000, 1_000, 1_000),
          ];
        })
      );
    });
    getOrderBook.mockImplementation(async (regionId: number) => {
      const origin = regionId === FROM.regionId;
      return {
        orders: [
          {
            price: origin ? 100 : 150,
            volume_remain: 100,
            is_buy_order: !origin,
            location_id: (origin ? FROM : TO).stationId,
          },
        ],
      };
    });
  });

  it('gives no shortlist slot to an item dearer than Max price, so a cheaper one takes it', async () => {
    const typeIds = [...DEAR, CHEAP];
    const run = (maxUnitPrice?: number) =>
      runHaulingScan({
        from: FROM,
        to: TO,
        typeIds,
        scope: 4,
        types: typesFor(typeIds),
        mode: 'instant',
        maxUnitPrice,
      });
    expect((await run()).rows.map((r) => r.typeId)).not.toContain(CHEAP);
    getOrderBook.mockClear();
    const capped = await run(500);
    expect(capped.rows.map((r) => r.typeId)).toEqual([CHEAP]);
    expect(getOrderBook).toHaveBeenCalledTimes(2);
    // Said, not silent: every dear item pass 1 would have kept.
    expect(capped.overMaxPrice).toBe(DEAR.length);
    expect((await run()).overMaxPrice).toBe(0);
  });

  it('keeps a Max price scan apart in the cache', () => {
    const base = { from: FROM, to: TO, scope: 4, mode: 'instant' as const };
    expect(haulingScanCacheKey({ ...base, maxUnitPrice: 500 })).not.toBe(haulingScanCacheKey(base));
    expect(haulingScanCacheKey({ ...base, maxUnitPrice: null })).toBe(haulingScanCacheKey(base));
  });
});

describe('runHaulingScan, the scan cache', () => {
  it('writes nothing once the scan was aborted, even after the last book landed', async () => {
    const controller = new AbortController();
    getOrderBook.mockImplementation(async (regionId: number) => {
      controller.abort();
      return regionId === FROM.regionId
        ? {
            orders: [
              { price: 100, volume_remain: 10, is_buy_order: false, location_id: FROM.stationId },
            ],
          }
        : {
            orders: [
              { price: 115, volume_remain: 5, is_buy_order: true, location_id: TO.stationId },
            ],
          };
    });
    await expect(
      runHaulingScan({
        from: FROM,
        to: TO,
        typeIds: [34],
        scope: 4,
        types: TYPES,
        mode: 'instant',
        signal: controller.signal,
      })
    ).rejects.toThrow(/aborted/);
    // Nothing cached: the same scan asked again reads the hubs again.
    getHubPrices.mockClear();
    await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds: [34],
      scope: 4,
      types: TYPES,
      mode: 'instant',
    });
    expect(getHubPrices).toHaveBeenCalled();
  });

  it('answers a fresh scan from the cache and an expired one afresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const scan = (scope: number) =>
        runHaulingScan({ from: FROM, to: TO, typeIds: [34], scope, types: TYPES, mode: 'instant' });
      await scan(4);
      getHubPrices.mockClear();
      await scan(4);
      expect(getHubPrices).not.toHaveBeenCalled();
      vi.setSystemTime(Date.now() + 10 * 60_000);
      await scan(5);
      getHubPrices.mockClear();
      await scan(4);
      expect(getHubPrices).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('runHaulingScan, shortlist order selling into buy orders', () => {
  const WIDE = Array.from({ length: MAX_BOOK_CANDIDATES + 5 }, (_, i) => 3000 + i);
  const DEEP = 6000;

  beforeEach(() => {
    getHubPrices.mockImplementation(async (hub: { id: string }, ids: number[]) => {
      const atOrigin = hub.id === FROM.id;
      return new Map(
        ids.map((id) => {
          if (atOrigin) return [id, aggregate(100, 90, 100_000)];
          // 1.05x into deep buy orders: profitable after sales tax, not after a listing's fees.
          if (id === DEEP) return [id, aggregate(500, 105, 1, 100_000)];
          // 1.5x, one unit wanted, though plenty is listed for sale.
          return [id, aggregate(160, 150, 100_000, 1)];
        })
      );
    });
    getOrderBook.mockImplementation(async (regionId: number) => {
      const origin = regionId === FROM.regionId;
      const hub = origin ? FROM : TO;
      return {
        orders: [
          {
            price: origin ? 100 : 105,
            volume_remain: 100_000,
            is_buy_order: !origin,
            location_id: hub.stationId,
          },
        ],
      };
    });
  });

  it('ranks by the buy orders standing at the destination, after sales tax only', async () => {
    const typeIds = [...WIDE, DEEP];
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 4,
      types: typesFor(typeIds),
      mode: 'instant',
    });
    expect(getOrderBook).toHaveBeenCalledWith(TO.regionId, DEEP);
    expect(scan.rows.map((r) => r.typeId)).toContain(DEEP);
  });
});

describe('runHaulingScan, Any hub at one end', () => {
  const hubById = (id: string) => TRADE_HUBS.find((h) => h.id === id)!;
  const JITA = hubById('jita');
  const DODIXIE = hubById('dodixie');
  const RENS = hubById('rens');
  /** Lowest sell per hub for every item: Dodixie is the cheapest origin, Rens the dearest destination. */
  const SELL: Record<string, number> = { jita: 200, amarr: 150, dodixie: 100, rens: 400, hek: 180 };
  const BUY: Record<string, number> = { jita: 180, amarr: 120, dodixie: 90, rens: 300, hek: 150 };

  beforeEach(() => {
    getHubPrices.mockImplementation(
      async (hub: { id: string }, ids: number[]) =>
        new Map(ids.map((id) => [id, aggregate(SELL[hub.id]!, BUY[hub.id]!)]))
    );
    getOrderBook.mockImplementation(async (regionId: number) => {
      const hub = TRADE_HUBS.find((h) => h.regionId === regionId)!;
      return {
        orders: [
          {
            price: SELL[hub.id],
            volume_remain: 10,
            is_buy_order: false,
            location_id: hub.stationId,
          },
          { price: BUY[hub.id], volume_remain: 10, is_buy_order: true, location_id: hub.stationId },
        ],
      };
    });
  });

  it('buys each item at its cheapest hub and says which one', async () => {
    const scan = await runHaulingScan({
      from: 'any',
      to: JITA,
      typeIds: [34],
      scope: 4,
      types: TYPES,
      mode: 'instant',
    });
    expect(scan.rows).toHaveLength(1);
    expect(scan.rows[0]).toMatchObject({
      fromHub: DODIXIE,
      toHub: JITA,
      buyLadder: [{ price: 100, units: 10, orders: 1 }],
      destBuyLadder: [{ price: 180, units: 10, orders: 1 }],
    });
  });

  it('sells each item at its dearest hub, reading that hub region for demand', async () => {
    loadPriceHistory.mockRejectedValue(new Error('no history'));
    await runHaulingScan({ from: JITA, to: 'any', typeIds: [34], scope: 4, types: TYPES });
    expect(loadPriceHistory).toHaveBeenCalledWith(RENS.regionId, 34);
  });

  it('fetches each hub price list once and keeps the order-book pass under the overall cap', async () => {
    const typeIds = Array.from({ length: 200 }, (_, i) => 1000 + i);
    const scan = await runHaulingScan({
      from: 'any',
      to: JITA,
      typeIds,
      scope: 4,
      types: typesFor(typeIds),
      mode: 'instant',
    });
    expect(getHubPrices).toHaveBeenCalledTimes(TRADE_HUBS.length);
    expect(scan.rows).toHaveLength(MAX_BOOK_CANDIDATES);
    // Two books (origin and destination) per shortlisted item — no more.
    expect(getOrderBook).toHaveBeenCalledTimes(2 * MAX_BOOK_CANDIDATES);
    expect(scan.capped).toBe(true);
  });

  it('keeps Any in the cache key', () => {
    expect(haulingScanCacheKey({ from: 'any', to: JITA, scope: 4 })).not.toBe(
      haulingScanCacheKey({ from: DODIXIE, to: JITA, scope: 4 })
    );
  });

  it('refuses Any at both ends', async () => {
    await expect(
      runHaulingScan({ from: 'any', to: 'any', typeIds: [34], scope: 4, types: TYPES })
    ).rejects.toThrow();
    expect(getHubPrices).not.toHaveBeenCalled();
  });
});

describe('runHaulingScan, history pass feeding', () => {
  const TODAY = '2026-10-15';
  const points = (average: number, volume: number) =>
    Array.from({ length: 30 }, (_, day) =>
      historyPoint({
        date: new Date(Date.parse(`${TODAY}T00:00:00Z`) - day * 86_400_000)
          .toISOString()
          .slice(0, 10),
        average,
        volume,
        orderCount: 10,
      })
    );
  /** Ids 1000.. rank by price in id order: a lower id has the bigger gap. */
  const idAt = (rank: number) => 1000 + rank;

  function setup(count: number, passes: (rank: number) => boolean) {
    getHubPrices.mockImplementation(async (hub: { id: string }, ids: number[]) => {
      const atOrigin = hub.id === FROM.id;
      return new Map(
        ids.map((id) => [
          id,
          atOrigin ? aggregate(100, 90, 100) : aggregate(2000 - (id - 1000), 250, 100),
        ])
      );
    });
    loadPriceHistory.mockImplementation(async (_region: number, typeId: number) => ({
      points: passes(typeId - 1000) ? points(300, 50) : points(300, 0),
    }));
    getOrderBook.mockImplementation(async (regionId: number) => {
      const hub = regionId === FROM.regionId ? FROM : TO;
      return {
        orders: [
          {
            price: hub === FROM ? 100 : 300,
            volume_remain: 50_000,
            is_buy_order: false,
            location_id: hub.stationId,
          },
        ],
      };
    });
    const typeIds = Array.from({ length: count }, (_, i) => idAt(i));
    return { typeIds, types: typesFor(typeIds) };
  }

  const bookedIds = () =>
    getOrderBook.mock.calls
      .filter(([region]) => region === TO.regionId)
      .map(([, id]) => id as number);

  it('reaches liquid candidates ranked past the old 80 when the top ones fail history', async () => {
    const { typeIds, types } = setup(200, (rank) => rank >= 100);
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 1,
      types,
      today: TODAY,
    });
    expect(bookedIds()).toHaveLength(MAX_BOOK_CANDIDATES);
    expect(bookedIds().every((id) => id >= idAt(100))).toBe(true);
    expect(scan.rows.length).toBe(MAX_BOOK_CANDIDATES);
  });

  it('books only the best 40 by history score and says capped when more pass', async () => {
    const { typeIds, types } = setup(100, () => true);
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 2,
      types,
      today: TODAY,
    });
    expect(bookedIds()).toHaveLength(MAX_BOOK_CANDIDATES);
    expect(scan.capped).toBe(true);
    // The scan stops feeding once enough passed: not every candidate was read.
    expect(loadPriceHistory.mock.calls.length).toBeLessThan(100);
  });

  it('is not capped when the candidates run out before 40 pass', async () => {
    const { typeIds, types } = setup(120, (rank) => rank % 10 === 0);
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 3,
      types,
      today: TODAY,
    });
    expect(loadPriceHistory).toHaveBeenCalledTimes(120);
    expect(bookedIds()).toHaveLength(12);
    expect(scan.capped).toBeUndefined();
  });

  it('instant mode: capped only when more than 40 pass the price pass', async () => {
    const run = async (count: number, scope: number) => {
      const { typeIds, types } = setup(count, () => true);
      return runHaulingScan({
        from: FROM,
        to: TO,
        typeIds,
        scope,
        types,
        today: TODAY,
        mode: 'instant',
      });
    };
    getHubPrices.mockImplementation(async (hub: { id: string }, ids: number[]) => {
      const atOrigin = hub.id === FROM.id;
      return new Map(ids.map((id) => [id, atOrigin ? aggregate(100, 90) : aggregate(200, 150)]));
    });
    expect((await run(MAX_BOOK_CANDIDATES, 5)).capped).toBeUndefined();
    getHubPrices.mockImplementation(async (hub: { id: string }, ids: number[]) => {
      const atOrigin = hub.id === FROM.id;
      return new Map(ids.map((id) => [id, atOrigin ? aggregate(100, 90) : aggregate(200, 150)]));
    });
    expect((await run(MAX_BOOK_CANDIDATES + 1, 6)).capped).toBe(true);
    expect(loadPriceHistory).not.toHaveBeenCalled();
  });

  it('never reads more history than the safety cap, and says capped', async () => {
    const count = MAX_HISTORY_READS + 30;
    const { typeIds, types } = setup(count, () => false);
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 4,
      types,
      today: TODAY,
    });
    expect(loadPriceHistory).toHaveBeenCalledTimes(MAX_HISTORY_READS);
    expect(scan.capped).toBe(true);
  });
});

describe('runHaulingScan, demand from the daily R2 object', () => {
  const TODAY = '2026-10-15';
  const idAt = (rank: number) => 1000 + rank;
  const aggregate_ = (price: number) => ({
    volume: 1500,
    daysWithTrades: 30,
    orderSum: 300,
    recentSalePrice: price,
    latestDay: { date: '2026-10-14', highest: price, lowest: price },
  });

  /** Ids 1000.. rank by price in id order; `demand(rank)` is the aggregate the object holds, or undefined for absent. */
  function setup(
    count: number,
    demand: (rank: number) => ReturnType<typeof aggregate_> | undefined
  ) {
    getHubPrices.mockImplementation(async (hub: { id: string }, ids: number[]) => {
      const atOrigin = hub.id === FROM.id;
      return new Map(
        ids.map((id) => [
          id,
          atOrigin ? aggregate(100, 90, 100) : aggregate(2000 - (id - 1000), 250, 100),
        ])
      );
    });
    getOrderBook.mockImplementation(async (regionId: number) => {
      const hub = regionId === FROM.regionId ? FROM : TO;
      return {
        orders: [
          {
            price: hub === FROM ? 100 : 300,
            volume_remain: 50_000,
            is_buy_order: false,
            location_id: hub.stationId,
          },
        ],
      };
    });
    const typeIds = Array.from({ length: count }, (_, i) => idAt(i));
    const types = new Map<number, ReturnType<typeof aggregate_>>();
    typeIds.forEach((id, rank) => {
      const found = demand(rank);
      if (found) types.set(id, found);
    });
    loadHaulingDemand.mockResolvedValue({ asOf: '2026-10-14', lastSyncedAt: Date.now(), types });
    return {
      typeIds,
      types: Object.fromEntries(
        typeIds.map((id) => [String(id), { name: `T${id}`, volume: 1 }])
      ) as never,
    };
  }

  const bookedIds = () =>
    getOrderBook.mock.calls
      .filter(([region]) => region === TO.regionId)
      .map(([, id]) => id as number);

  it('books liquid items ranked past the old read cap, with no ESI history call', async () => {
    const count = MAX_HISTORY_READS + 50;
    const { typeIds, types } = setup(count, (rank) =>
      rank >= MAX_HISTORY_READS + 10 ? aggregate_(300) : undefined
    );
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 20,
      types,
      today: TODAY,
    });
    expect(loadPriceHistory).not.toHaveBeenCalled();
    expect(bookedIds()).toHaveLength(MAX_BOOK_CANDIDATES);
    expect(bookedIds().every((id) => id >= idAt(MAX_HISTORY_READS + 10))).toBe(true);
    expect(scan.demandSource).toBe('daily');
    expect(scan.capped).toBeUndefined();
  });

  it('books the best 40 by history score, not the first 40 by price, and says capped', async () => {
    // A higher id sold for more, but ranks lower on the price pass.
    const { typeIds, types } = setup(100, (rank) => aggregate_(300 + rank));
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 21,
      types,
      today: TODAY,
    });
    expect(bookedIds().sort()).toEqual(Array.from({ length: 40 }, (_, i) => idAt(60 + i)));
    expect(scan.capped).toBe(true);
    expect(scan.demandPassed).toBe(100);
    expect(scan.examinedTypeIds).not.toContain(idAt(0));
  });

  it('is not capped when 40 or fewer survive', async () => {
    const { typeIds, types } = setup(100, (rank) => (rank < 40 ? aggregate_(300) : undefined));
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 22,
      types,
      today: TODAY,
    });
    expect(bookedIds()).toHaveLength(40);
    expect(scan.capped).toBeUndefined();
    expect(scan.examinedTypeIds).toHaveLength(100);
  });

  it('falls back to ESI history when the object is missing, and says so', async () => {
    const { typeIds, types } = setup(5, () => aggregate_(300));
    loadHaulingDemand.mockResolvedValue(null);
    loadPriceHistory.mockResolvedValue({ points: [] });
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 23,
      types,
      today: TODAY,
    });
    expect(loadPriceHistory).toHaveBeenCalledTimes(5);
    expect(scan.demandSource).toBe('esi');
  });

  it('never reads the object in instant mode', async () => {
    const { typeIds, types } = setup(5, () => aggregate_(300));
    getHubPrices.mockImplementation(
      async (hub: { id: string }, ids: number[]) =>
        new Map(
          ids.map((id) => [id, hub.id === FROM.id ? aggregate(100, 90) : aggregate(200, 150)])
        )
    );
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 24,
      types,
      today: TODAY,
      mode: 'instant',
    });
    expect(loadHaulingDemand).not.toHaveBeenCalled();
    expect(scan.demandSource).toBeUndefined();
  });
});

describe('runHaulingScan, order books from the R2 snapshot', () => {
  const TODAY = '2026-10-14';
  const COUNT = MAX_BOOK_CANDIDATES * 3;
  const idAt = (rank: number) => 1000 + rank;
  const typeIds = Array.from({ length: COUNT }, (_, i) => idAt(i));

  const level = (price: number, units = 50_000) => ({ price, units, orders: 1 });
  /** Every type: sells at 100 at Jita, sells at 300 and buys at 280 at Amarr. */
  function snapshot(stationId: number, asOf: number) {
    const atFrom = stationId === FROM.stationId;
    return {
      asOf,
      lastSyncedAt: asOf,
      types: new Map(
        typeIds.map((id) => [
          id,
          atFrom
            ? { sell: [level(100)], buy: [level(90)] }
            : { sell: [level(300)], buy: [level(280)] },
        ])
      ),
    };
  }

  beforeEach(() => {
    getHubPrices.mockImplementation(async (hub: { id: string }, ids: number[]) => {
      const atOrigin = hub.id === FROM.id;
      return new Map(
        ids.map((id) => [id, atOrigin ? aggregate(100, 90, 100) : aggregate(300, 280, 100)])
      );
    });
    loadPriceHistory.mockImplementation(async () => ({
      points: Array.from({ length: 30 }, (_, day) =>
        historyPoint({
          date: new Date(Date.parse(`${TODAY}T00:00:00Z`) - day * 86_400_000)
            .toISOString()
            .slice(0, 10),
          average: 300,
          volume: 50,
          orderCount: 10,
        })
      ),
    }));
  });

  it('books every item that passes, with no ESI book request and no cap', async () => {
    const asOf = Date.now() - 20 * 60_000;
    loadHaulingBooks.mockImplementation(async (stationId: number) => snapshot(stationId, asOf));
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 'snap-1',
      types: typesFor(typeIds),
      today: TODAY,
    });
    expect(getOrderBook).not.toHaveBeenCalled();
    expect(scan.rows).toHaveLength(COUNT);
    expect(scan.rows[0].buyLadder).toEqual([level(100)]);
    expect(scan.rows[0].destLadder).toEqual([level(300)]);
    expect(scan.booksSource).toBe('snapshot');
    expect(scan.booksAsOf).toBe(asOf);
    expect(scan.capped).toBeUndefined();
  });

  it('retries a station whose books read failed once before falling back to the capped ESI path', async () => {
    const asOf = Date.now() - 20 * 60_000;
    const failedOnce = new Set<number>();
    loadHaulingBooks.mockImplementation(async (stationId: number) => {
      if (stationId === TO.stationId && !failedOnce.has(stationId)) {
        failedOnce.add(stationId);
        return null;
      }
      return snapshot(stationId, asOf);
    });
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 'snap-retry',
      types: typesFor(typeIds),
      today: TODAY,
    });
    expect(getOrderBook).not.toHaveBeenCalled();
    expect(scan.booksSource).toBe('snapshot');
    expect(scan.capped).toBeUndefined();
  });

  it('instant mode books every price-pass survivor from the snapshot', async () => {
    loadHaulingBooks.mockImplementation(async (stationId: number) =>
      snapshot(stationId, Date.now())
    );
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 'snap-2',
      types: typesFor(typeIds),
      today: TODAY,
      mode: 'instant',
    });
    expect(getOrderBook).not.toHaveBeenCalled();
    expect(scan.rows).toHaveLength(COUNT);
    expect(scan.rows[0].destBuyLadder).toEqual([level(280)]);
    expect(scan.capped).toBeUndefined();
  });

  it('drops an item the snapshot has no orders for, not the scan', async () => {
    loadHaulingBooks.mockImplementation(async (stationId: number) => {
      const books = snapshot(stationId, Date.now());
      books.types.delete(idAt(0));
      return books;
    });
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 'snap-3',
      types: typesFor(typeIds),
      today: TODAY,
      mode: 'instant',
    });
    expect(scan.rows).toHaveLength(COUNT - 1);
  });

  it('falls back to ESI books for the best 40 when one station has no snapshot', async () => {
    loadHaulingBooks.mockImplementation(async (stationId: number) =>
      stationId === FROM.stationId ? snapshot(stationId, Date.now()) : null
    );
    getOrderBook.mockImplementation(async (regionId: number) => {
      const hub = regionId === FROM.regionId ? FROM : TO;
      return {
        orders: [
          {
            price: hub === FROM ? 100 : 300,
            volume_remain: 50_000,
            is_buy_order: false,
            location_id: hub.stationId,
          },
        ],
      };
    });
    const scan = await runHaulingScan({
      from: FROM,
      to: TO,
      typeIds,
      scope: 'snap-4',
      types: typesFor(typeIds),
      today: TODAY,
    });
    expect(scan.booksSource).toBe('esi');
    expect(scan.booksAsOf).toBeUndefined();
    expect(scan.rows).toHaveLength(MAX_BOOK_CANDIDATES);
    expect(scan.capped).toBe(true);
  });
});
