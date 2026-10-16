import { beforeEach, describe, expect, it, vi } from 'vitest';
import { historyPoint } from '@/engine/market/__fixtures__/priceHistory';
import { TRADE_HUBS } from '@/market/hubs';

const getHubPrices = vi.fn();
const loadPriceHistory = vi.fn();
const getOrderBook = vi.fn();

vi.mock('@/market/prices', () => ({ getHubPrices: (...a: unknown[]) => getHubPrices(...a) }));
vi.mock('@/features/market/priceHistory', () => ({
  loadPriceHistory: (...a: unknown[]) => loadPriceHistory(...a),
}));
vi.mock('@/features/market/orderBook', () => ({
  getOrderBook: (...a: unknown[]) => getOrderBook(...a),
}));
const loadUniverseTypeOnce = vi.fn();
vi.mock('@/features/skills/data', () => ({
  loadUniverseTypeOnce: (...a: unknown[]) => loadUniverseTypeOnce(...a),
}));

const {
  clearHaulingScanCache,
  evictHaulingScan,
  haulingScanCacheKey,
  MAX_BOOK_CANDIDATES,
  MAX_PRICED_CANDIDATES,
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
  /** More high-ratio, thin items than the price pass keeps, and one bulk steady seller at a lower ratio. */
  const THIN = Array.from({ length: MAX_PRICED_CANDIDATES + 5 }, (_, i) => 2000 + i);
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
  const THIN_HISTORY = history(300, 1);

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
    // Ranked by price ratio it was cut at the price pass, behind every thin item.
    expect(loadPriceHistory).toHaveBeenCalledWith(TO.regionId, BULK);
    expect(getOrderBook).toHaveBeenCalledWith(TO.regionId, BULK);
    expect(scan.rows.map((r) => r.typeId)).toContain(BULK);
    expect(scan.capped).toBe(true);
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
