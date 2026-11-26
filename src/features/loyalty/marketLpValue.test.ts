import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import { loadMarketSnapshots } from '@/features/industry/marketData';
import { loadLoyaltyStoreOffers } from './store';
import { loadHaulingDemand } from '@/features/market/haulingDemand';

vi.mock('./store', () => ({ loadLoyaltyStoreOffers: vi.fn() }));
vi.mock('@/features/industry/marketData', () => ({ loadMarketSnapshots: vi.fn() }));
vi.mock('@/features/market/haulingDemand', () => ({ loadHaulingDemand: vi.fn(async () => null) }));
vi.mock('@/features/industry/blueprintCatalog', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadBlueprintCatalog: async () => ({
    byBlueprintTypeID: new Map([
      [
        900,
        {
          productTypeID: 901,
          blueprint: {
            blueprintTypeID: 900,
            products: [{ typeID: 901, quantity: 100 }],
            materials: [{ typeID: 34, quantity: 1 }],
            time: 1,
          },
        },
      ],
    ]),
    byProductTypeID: new Map(),
    typesById: {},
  }),
}));

const { loadMarketLpValue, loadMarketLpValues } = await import('./marketLpValue');
const JITA = getTradeHub('jita')!;

const itemOffer = (offerId: number, typeId: number, lp: number, quantity = 1) => ({
  offer_id: offerId,
  type_id: typeId,
  quantity,
  isk_cost: 0,
  lp_cost: lp,
  ak_cost: 0,
  required_items: [],
});

function snapshot(prices: Record<number, number>, volumes: Record<number, number>) {
  return {
    hubPrices: prices,
    hubBuyPrices: {},
    hubSellVolumes: volumes,
    adjustedPrices: null,
    systemCostIndex: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadMarketLpValues', () => {
  it('prices several stores with one market fetch', async () => {
    vi.mocked(loadLoyaltyStoreOffers).mockImplementation(
      async (corp) =>
        ({
          data: [
            itemOffer(1, corp + 1, 100),
            itemOffer(2, corp + 2, 100),
            itemOffer(3, corp + 3, 100),
          ],
          fetchedAt: new Date(),
          fromCache: true,
        }) as never
    );
    vi.mocked(loadMarketSnapshots).mockImplementation((requests) =>
      requests.map(() =>
        Promise.resolve(
          snapshot(
            { 11: 200_000, 12: 150_000, 13: 100_000, 21: 400_000, 22: 300_000, 23: 200_000 },
            { 11: 50, 12: 50, 13: 50, 21: 50, 22: 50, 23: 50 }
          )
        )
      )
    );
    const values = await loadMarketLpValues([10, 20], JITA);
    expect(loadMarketSnapshots).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadMarketSnapshots).mock.calls[0]![0]).toHaveLength(2);
    expect(values.get(10)).toBeGreaterThan(1_300);
    expect(values.get(10)).toBeLessThan(1_500);
    expect(values.get(20)!).toBeGreaterThan(values.get(10)!);
  });
  it('prices offers the caller already holds without asking ESI for them', async () => {
    vi.mocked(loadMarketSnapshots).mockImplementation((requests) =>
      requests.map(() =>
        Promise.resolve(
          snapshot({ 61: 200_000, 62: 150_000, 63: 100_000 }, { 61: 50, 62: 50, 63: 50 })
        )
      )
    );
    const offers = new Map([
      [60, [itemOffer(1, 61, 100), itemOffer(2, 62, 100), itemOffer(3, 63, 100)]],
    ]);
    vi.mocked(loadHaulingDemand).mockResolvedValueOnce({
      asOf: '2026-10-29',
      lastSyncedAt: 1,
      types: new Map(
        [61, 62, 63].map((id) => [
          id,
          {
            volume: 300,
            daysWithTrades: 30,
            orderSum: 300,
            recentSalePrice: 200_000,
            latestDay: { date: '2026-10-29', highest: 200_000, lowest: 100_000 },
          },
        ])
      ),
    });
    const values = await loadMarketLpValues([60], JITA, { held: offers });
    expect(loadLoyaltyStoreOffers).not.toHaveBeenCalled();
    expect(values.get(60)).toBeGreaterThan(1_300);
    expect(await loadMarketLpValue(60, JITA)).toBe(values.get(60));
    expect(loadLoyaltyStoreOffers).not.toHaveBeenCalled();
  });
});

describe('loadMarketLpValues against recent trades', () => {
  it('values a lone listing far above its trades at the trades', async () => {
    vi.mocked(loadMarketSnapshots).mockImplementation((requests) =>
      requests.map(() =>
        Promise.resolve(
          snapshot({ 71: 50_000_000, 72: 40_000_000, 73: 100_000 }, { 71: 50, 72: 50, 73: 50 })
        )
      )
    );
    const traded = (price: number) => ({
      volume: 100,
      daysWithTrades: 30,
      orderSum: 300,
      recentSalePrice: price,
      latestDay: { date: '2026-10-29', highest: price, lowest: price },
    });
    vi.mocked(loadHaulingDemand).mockResolvedValue({
      asOf: '2026-10-29',
      lastSyncedAt: 1,
      types: new Map([
        [71, traded(200_000)],
        [72, traded(150_000)],
        [73, traded(100_000)],
      ]),
    });
    const offers = new Map([
      [70, [itemOffer(1, 71, 100), itemOffer(2, 72, 100), itemOffer(3, 73, 100)]],
    ]);
    const values = await loadMarketLpValues([70], JITA, { held: offers });
    expect(values.get(70)).toBeGreaterThan(1_300);
    expect(values.get(70)).toBeLessThan(1_500);
  });
});

describe('loadMarketLpValues against thin markets', () => {
  const prices = { 81: 9_000_000, 82: 200_000, 83: 150_000, 84: 100_000 };
  const volumes = { 81: 50, 82: 50, 83: 50, 84: 50 };
  const storeOffers = [
    itemOffer(1, 81, 100),
    itemOffer(2, 82, 100),
    itemOffer(3, 83, 100),
    itemOffer(4, 84, 100),
  ];
  const offers = (corporationId: number) => new Map([[corporationId, storeOffers]]);
  const demandOf = (perMonth: Record<number, number>) => ({
    asOf: '2026-10-29',
    lastSyncedAt: 1,
    types: new Map(
      Object.entries(perMonth).map(([id, volume]) => {
        const price = prices[Number(id) as keyof typeof prices];
        return [
          Number(id),
          {
            volume,
            daysWithTrades: 30,
            orderSum: 300,
            recentSalePrice: price,
            latestDay: { date: '2026-10-29', highest: price, lowest: price },
          },
        ];
      })
    ),
  });

  beforeEach(() => {
    vi.mocked(loadMarketSnapshots).mockImplementation((requests) =>
      requests.map(() => Promise.resolve(snapshot(prices, volumes)))
    );
  });

  it('leaves out an offer whose item barely trades, however high its price', async () => {
    vi.mocked(loadHaulingDemand).mockResolvedValue(demandOf({ 81: 3, 82: 300, 83: 300, 84: 300 }));
    const values = await loadMarketLpValues([80], JITA, { held: offers(80) });
    expect(values.get(80)).toBeLessThan(1_500);
  });

  it('does not remember a value priced without recent trades', async () => {
    vi.mocked(loadHaulingDemand).mockResolvedValueOnce(null);
    await loadMarketLpValues([90], JITA, { held: offers(90) });
    vi.mocked(loadHaulingDemand).mockResolvedValue(demandOf({ 81: 3, 82: 300, 83: 300, 84: 300 }));
    const values = await loadMarketLpValues([90], JITA, { held: offers(90) });
    expect(loadHaulingDemand).toHaveBeenCalledTimes(2);
    expect(values.get(90)).toBeLessThan(1_500);
  });
});

describe('loadMarketLpValue', () => {
  it('measures a blueprint offer’s depth in its product’s units per run', async () => {
    vi.mocked(loadLoyaltyStoreOffers).mockResolvedValue({
      data: [itemOffer(1, 900, 100), itemOffer(2, 41, 100), itemOffer(3, 42, 100)],
      fetchedAt: new Date(),
      fromCache: true,
    } as never);
    vi.mocked(loadMarketSnapshots).mockImplementation((requests) =>
      requests.map(() =>
        Promise.resolve(
          snapshot({ 901: 5_000, 34: 1, 41: 120_000, 42: 110_000 }, { 901: 300, 41: 50, 42: 50 })
        )
      )
    );
    expect(await loadMarketLpValue(30, JITA)).toBeNull();
  });

  it('tries again after a failed load instead of remembering the failure', async () => {
    vi.mocked(loadLoyaltyStoreOffers).mockRejectedValueOnce(new Error('ESI down'));
    expect(await loadMarketLpValue(40, JITA)).toBeNull();
    vi.mocked(loadLoyaltyStoreOffers).mockResolvedValue({
      data: [],
      fetchedAt: new Date(),
      fromCache: true,
    } as never);
    await loadMarketLpValue(40, JITA);
    expect(loadLoyaltyStoreOffers).toHaveBeenCalledTimes(2);
  });

  it('remembers a store’s value for a while', async () => {
    vi.mocked(loadLoyaltyStoreOffers).mockResolvedValue({
      data: [],
      fetchedAt: new Date(),
      fromCache: true,
    } as never);
    await loadMarketLpValue(50, JITA, { now: () => 0 });
    await loadMarketLpValue(50, JITA, { now: () => 60_000 });
    expect(loadLoyaltyStoreOffers).toHaveBeenCalledTimes(1);
    await loadMarketLpValue(50, JITA, { now: () => 16 * 60_000 });
    expect(loadLoyaltyStoreOffers).toHaveBeenCalledTimes(2);
  });
});

describe('loadMarketLpValues on the instant basis', () => {
  it('prices the store at the hub buy price, remembered apart from the listing rate', async () => {
    vi.mocked(loadHaulingDemand).mockResolvedValue(null);
    vi.mocked(loadMarketSnapshots).mockImplementation((requests) =>
      requests.map(() =>
        Promise.resolve({
          ...snapshot({ 91: 200_000, 92: 150_000, 93: 100_000 }, { 91: 50, 92: 50, 93: 50 }),
          hubBuyPrices: { 91: 100_000, 92: 75_000, 93: 50_000 },
        })
      )
    );
    const offers = new Map([
      [95, [itemOffer(1, 91, 100), itemOffer(2, 92, 100), itemOffer(3, 93, 100)]],
    ]);
    const listed = await loadMarketLpValues([95], JITA, { held: offers });
    const now = await loadMarketLpValues([95], JITA, { held: offers, basis: 'buy' });
    expect(listed.get(95)).toBeGreaterThan(1_300);
    expect(now.get(95)).toBeGreaterThan(600);
    expect(now.get(95)).toBeLessThan(800);
  });
});
