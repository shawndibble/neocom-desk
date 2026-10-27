import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import { loadMarketSnapshots } from '@/features/industry/marketData';
import { loadLoyaltyStoreOffers } from './store';

vi.mock('./store', () => ({ loadLoyaltyStoreOffers: vi.fn() }));
vi.mock('@/features/industry/marketData', () => ({ loadMarketSnapshots: vi.fn() }));
// One blueprint: BPC 900 builds 100 units of product 901 from mineral 34.
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

/** An item offer: `quantity` of `typeId` for `lp` LP and no ISK. */
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
    // Corp 10's middle offer sells for 150k on 100 LP, less full fees.
    expect(values.get(10)).toBeGreaterThan(1_300);
    expect(values.get(10)).toBeLessThan(1_500);
    expect(values.get(20)!).toBeGreaterThan(values.get(10)!);
  });
});

describe('loadMarketLpValue', () => {
  it('measures a blueprint offer’s depth in its product’s units per run', async () => {
    vi.mocked(loadLoyaltyStoreOffers).mockResolvedValue({
      data: [itemOffer(1, 900, 100), itemOffer(2, 41, 100), itemOffer(3, 42, 100)],
      fetchedAt: new Date(),
      fromCache: true,
    } as never);
    // 300 units for sale is 3 runs of 100: too thin, so only two offers count — no rate.
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
    await loadMarketLpValue(50, JITA, () => 0);
    await loadMarketLpValue(50, JITA, () => 60_000);
    expect(loadLoyaltyStoreOffers).toHaveBeenCalledTimes(1);
    await loadMarketLpValue(50, JITA, () => 16 * 60_000);
    expect(loadLoyaltyStoreOffers).toHaveBeenCalledTimes(2);
  });
});
