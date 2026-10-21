import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegionOrder } from '@/esi/endpoints';

const mocks = vi.hoisted(() => ({
  fetchAggregates: vi.fn(),
  fetchOrderCounts: vi.fn(),
  getMarketOrders: vi.fn(),
  loadStoredOpenPrices: vi.fn(),
  lookupNpcStation: vi.fn(),
  lookupSolarSystem: vi.fn(),
}));

vi.mock('./fuzzwork', () => ({
  fetchAggregates: mocks.fetchAggregates,
  fetchOrderCounts: mocks.fetchOrderCounts,
}));
vi.mock('@/esi/endpoints', () => ({ getMarketOrders: mocks.getMarketOrders }));
vi.mock('@/features/market/marketOpenPrices', () => ({
  loadStoredOpenPrices: mocks.loadStoredOpenPrices,
}));
vi.mock('@/sde/npcStations', () => ({ lookupNpcStation: mocks.lookupNpcStation }));
vi.mock('@/sde/solarSystems', () => ({ lookupSolarSystem: mocks.lookupSolarSystem }));

import {
  ESI_FALLBACK_MAX_TYPES,
  FUZZWORK_BACKOFF_MS,
  fetchAggregatesWithFallback,
  fetchOrderCountsWithFallback,
  resetPriceFallback,
} from './priceFallback';

const JITA = 60003760;
const THE_FORGE = 10000002;

const live = { sellMin: 4, buyMax: 3, sellVolume: 10, buyVolume: 5 };
const none = { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 };

const order = (o: Partial<RegionOrder>): RegionOrder =>
  ({
    is_buy_order: false,
    location_id: JITA,
    price: 10,
    volume_remain: 5,
    ...o,
  }) as RegionOrder;

beforeEach(() => {
  vi.resetAllMocks();
  resetPriceFallback();
  mocks.fetchOrderCounts.mockRejectedValue(new Error('down'));
});

describe('fetchAggregatesWithFallback', () => {
  it('serves Fuzzwork untouched when it has prices', async () => {
    mocks.fetchAggregates.mockResolvedValue(new Map([[34, live]]));
    const out = await fetchAggregatesWithFallback(JITA, [34]);
    expect(out.prices.get(34)).toEqual(live);
    expect(out.stale.size).toBe(0);
    expect(mocks.getMarketOrders).not.toHaveBeenCalled();
  });

  it('falls to ESI orders folded to the station when Fuzzwork throws', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.getMarketOrders.mockResolvedValue({
      truncated: false,
      items: [
        order({ price: 12 }),
        order({ price: 9, location_id: 1 }),
        order({ is_buy_order: true, price: 3, volume_remain: 8 }),
      ],
    });
    const out = await fetchAggregatesWithFallback(JITA, [34]);
    expect(mocks.getMarketOrders).toHaveBeenCalledWith(THE_FORGE, 34);
    expect(out.prices.get(34)).toEqual({ sellMin: 12, buyMax: 3, sellVolume: 5, buyVolume: 8 });
    expect(out.stale.size).toBe(0);
  });

  it('treats a batch with no price on any type as a failure', async () => {
    mocks.fetchAggregates.mockResolvedValue(
      new Map([
        [34, none],
        [35, none],
      ])
    );
    mocks.getMarketOrders.mockResolvedValue({ truncated: false, items: [order({ price: 7 })] });
    const out = await fetchAggregatesWithFallback(JITA, [34, 35]);
    expect(out.prices.get(34)?.sellMin).toBe(7);
  });

  it('resolves a non-hub NPC station to its region through the SDE', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.lookupNpcStation.mockResolvedValue({ systemId: 30001 });
    mocks.lookupSolarSystem.mockResolvedValue({ regionId: 10000099 });
    mocks.getMarketOrders.mockResolvedValue({
      truncated: false,
      items: [order({ location_id: 61000001, price: 5 })],
    });
    const out = await fetchAggregatesWithFallback(61000001, [34]);
    expect(mocks.getMarketOrders).toHaveBeenCalledWith(10000099, 34);
    expect(out.prices.get(34)?.sellMin).toBe(5);
  });

  it('region scope keeps every order in the region', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.getMarketOrders.mockResolvedValue({
      truncated: false,
      items: [order({ price: 12 }), order({ price: 9, location_id: 1 })],
    });
    const out = await fetchAggregatesWithFallback(THE_FORGE, [34], 'region');
    expect(out.prices.get(34)?.sellMin).toBe(9);
  });

  it('serves a hub from yesterday’s R2 close, flagged stale, when ESI cannot answer', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.getMarketOrders.mockRejectedValue(new Error('esi down'));
    mocks.loadStoredOpenPrices.mockResolvedValue({
      stations: new Map([
        [JITA, { dates: ['2026-10-19', '2026-10-20'], buy: [1, 3], sell: [2, 4] }],
      ]),
    });
    const out = await fetchAggregatesWithFallback(JITA, [34], 'station', () =>
      Date.parse('2026-10-21T12:00:00Z')
    );
    expect(out.prices.get(34)).toEqual({ sellMin: 4, buyMax: 3, sellVolume: 0, buyVolume: 0 });
    expect([...out.stale]).toEqual([34]);
  });

  it('does not offer an R2 close older than a few days as yesterday\u2019s price', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.getMarketOrders.mockRejectedValue(new Error('esi down'));
    mocks.loadStoredOpenPrices.mockResolvedValue({
      stations: new Map([[JITA, { dates: ['2026-10-01'], buy: [3], sell: [4] }]]),
    });
    const now = () => Date.parse('2026-10-21T12:00:00Z');
    await expect(fetchAggregatesWithFallback(JITA, [34], 'station', now)).rejects.toThrow();
  });

  it('skips ESI past the type cap and goes to R2', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.loadStoredOpenPrices.mockResolvedValue({
      stations: new Map([[JITA, { dates: ['2026-10-20'], buy: [3], sell: [4] }]]),
    });
    const ids = Array.from({ length: ESI_FALLBACK_MAX_TYPES + 1 }, (_, i) => i + 1);
    const out = await fetchAggregatesWithFallback(JITA, ids, 'station', () =>
      Date.parse('2026-10-21T12:00:00Z')
    );
    expect(mocks.getMarketOrders).not.toHaveBeenCalled();
    expect(out.stale.size).toBe(ids.length);
  });

  it('abandons ESI when a book is truncated rather than quote a partial best price', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.getMarketOrders.mockResolvedValue({ truncated: true, items: [order({})] });
    mocks.loadStoredOpenPrices.mockResolvedValue(null);
    await expect(fetchAggregatesWithFallback(JITA, [34])).rejects.toThrow();
  });

  it('rejects for a non-hub station when ESI cannot answer: no R2 for it', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.lookupNpcStation.mockResolvedValue(null);
    await expect(fetchAggregatesWithFallback(1_000_000_000_001, [34])).rejects.toThrow();
    expect(mocks.loadStoredOpenPrices).not.toHaveBeenCalled();
  });

  it('returns Fuzzwork’s empty answer when nothing else can contradict it', async () => {
    mocks.fetchAggregates.mockResolvedValue(new Map([[34, none]]));
    mocks.getMarketOrders.mockRejectedValue(new Error('esi down'));
    mocks.loadStoredOpenPrices.mockResolvedValue(null);
    const out = await fetchAggregatesWithFallback(JITA, [34]);
    expect(out.prices.get(34)).toEqual(none);
  });

  it('goes straight to the fallback for a minute after Fuzzwork throws', async () => {
    mocks.fetchAggregates.mockRejectedValue(new Error('503'));
    mocks.getMarketOrders.mockResolvedValue({ truncated: false, items: [order({})] });
    let t = 1_000;
    await fetchAggregatesWithFallback(JITA, [34], 'station', () => t);
    await fetchAggregatesWithFallback(JITA, [34], 'station', () => t);
    expect(mocks.fetchAggregates).toHaveBeenCalledTimes(1);
    t += FUZZWORK_BACKOFF_MS;
    await fetchAggregatesWithFallback(JITA, [34], 'station', () => t);
    expect(mocks.fetchAggregates).toHaveBeenCalledTimes(2);
  });
});

describe('fetchOrderCountsWithFallback', () => {
  it('counts the station’s orders from ESI when Fuzzwork throws', async () => {
    mocks.getMarketOrders.mockResolvedValue({
      truncated: false,
      items: [
        order({ volume_remain: 2 }),
        order({ is_buy_order: true, volume_remain: 7 }),
        order({ is_buy_order: true, volume_remain: 1 }),
        order({ location_id: 1 }),
      ],
    });
    const out = await fetchOrderCountsWithFallback(JITA, [34]);
    expect(out.get(34)).toEqual({ buyOrders: 2, sellOrders: 1, buyVolume: 8, sellVolume: 2 });
  });

  it('rejects when neither source answers', async () => {
    mocks.getMarketOrders.mockRejectedValue(new Error('esi down'));
    await expect(fetchOrderCountsWithFallback(JITA, [34])).rejects.toThrow();
  });
});
