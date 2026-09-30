import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/esi/endpoints', () => ({ getUniverseType: vi.fn() }));

const { clearHaulingScanCache, haulingScanCacheKey, runHaulingScan } =
  await import('./haulingData');

const FROM = TRADE_HUBS.find((h) => h.id === 'jita')!;
const TO = TRADE_HUBS.find((h) => h.id === 'amarr')!;
const TYPES = { '34': { name: 'Tritanium', volume: 0.01 } } as never;

function aggregate(sellMin: number | null, buyMax: number | null) {
  return { sellMin, buyMax, sellVolume: 100, buyVolume: 100 };
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
