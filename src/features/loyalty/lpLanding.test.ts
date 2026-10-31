import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LP_LANDING_FILTERS,
  lpLandingActiveFilterCount,
  lpLandingHoldings,
  lpLandingOffers,
  lpLandingStores,
  type LpLandingFilters,
  type LpLandingOffer,
  type LpLandingStoreFacts,
} from '@/features/loyalty/lpLanding';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';

function store(
  over: Partial<LpLandingStoreFacts> & { corporationId: number }
): LpLandingStoreFacts {
  return {
    name: `Corp ${over.corporationId}`,
    factionId: 500001,
    factionWarfare: false,
    nearest: { systemId: 30000142, jumps: 3 },
    yourLp: null,
    lpValue: 1000,
    offerCount: 0,
    ...over,
  };
}

function offer(
  facts: LpLandingStoreFacts,
  over: {
    id: number;
    name?: string;
    iskPerLp?: number | null;
    sellsPerDay?: number | null;
    lpCost?: number;
    required?: number;
    categoryId?: number | null;
  }
): LpLandingOffer {
  const row = {
    offer: {
      offer_id: over.id,
      type_id: 1000 + over.id,
      quantity: 1,
      isk_cost: 0,
      lp_cost: over.lpCost ?? 1000,
      required_items: Array.from({ length: over.required ?? 0 }, (_, i) => ({
        type_id: 9000 + i,
        quantity: 1,
      })),
    },
    itemName: over.name ?? `Item ${over.id}`,
    sellsPerDay: over.sellsPerDay === undefined ? 10 : over.sellsPerDay,
    profit: { iskPerLp: over.iskPerLp === undefined ? 1000 : over.iskPerLp },
  } as unknown as LoyaltyOfferRow;
  return { row, store: facts, categoryId: over.categoryId === undefined ? 9 : over.categoryId };
}

const ANY: LpLandingFilters = { ...DEFAULT_LP_LANDING_FILTERS, minSellsPerDay: 0 };

describe('lpLandingOffers', () => {
  const a = store({ corporationId: 1, name: 'Sisters of EVE', yourLp: 5000 });
  const b = store({ corporationId: 2, name: 'Caldari Navy', factionWarfare: true });
  const offers = [
    offer(a, { id: 1, name: 'Sisters Core Probe Launcher', sellsPerDay: 0.5 }),
    offer(a, { id: 2, name: 'Navy Cap Booster 800', required: 1, lpCost: 9000 }),
    offer(b, { id: 3, name: 'Navy Cap Booster 800', sellsPerDay: null, categoryId: 11 }),
  ];
  const ids = (list: LpLandingOffer[]) => list.map((o) => o.row.offer.offer_id);

  it('keeps every offer with no filter and no query', () => {
    expect(ids(lpLandingOffers(offers, ANY, ''))).toEqual([1, 2, 3]);
  });

  it('drops offers under the daily sales floor but keeps unknown volume', () => {
    expect(ids(lpLandingOffers(offers, DEFAULT_LP_LANDING_FILTERS, ''))).toEqual([2, 3]);
  });

  it('applies the offer filters', () => {
    expect(ids(lpLandingOffers(offers, { ...ANY, noTurnIns: true }, ''))).toEqual([1, 3]);
    expect(ids(lpLandingOffers(offers, { ...ANY, affordableOnly: true }, ''))).toEqual([1]);
    expect(ids(lpLandingOffers(offers, { ...ANY, categories: [11] }, ''))).toEqual([3]);
  });

  it("applies the store filters to each offer's store", () => {
    expect(ids(lpLandingOffers(offers, { ...ANY, hideFactionWarfare: true }, ''))).toEqual([1, 2]);
    expect(ids(lpLandingOffers(offers, { ...ANY, mineOnly: true }, ''))).toEqual([1, 2]);
  });

  it('matches the query on the item name or the store name', () => {
    expect(ids(lpLandingOffers(offers, ANY, 'cap booster'))).toEqual([2, 3]);
    expect(ids(lpLandingOffers(offers, ANY, 'sisters'))).toEqual([1, 2]);
  });
});

describe('lpLandingStores', () => {
  const near = store({ corporationId: 1, nearest: { systemId: 1, jumps: 2 } });
  const far = store({ corporationId: 2, nearest: { systemId: 2, jumps: 12 }, factionId: null });
  const unplaced = store({ corporationId: 3, nearest: null });
  const offers = [
    offer(near, { id: 1, iskPerLp: 2100, sellsPerDay: 0.2 }),
    offer(near, { id: 2, iskPerLp: 1500, required: 2 }),
    offer(near, { id: 3, iskPerLp: 1200 }),
    offer(near, { id: 4, iskPerLp: null }),
    offer(far, { id: 5, iskPerLp: 900, sellsPerDay: 0 }),
  ];
  const stores = [near, far, unplaced];
  const bestOf = (filters: LpLandingFilters) =>
    lpLandingStores(stores, offers, filters, '').map((s) => [
      s.corporationId,
      s.best?.row.offer.offer_id ?? null,
    ]);

  it("names each store's best-priced offer", () => {
    expect(bestOf(ANY)).toEqual([
      [1, 1],
      [2, 5],
      [3, null],
    ]);
  });

  it('re-picks the best offer under the offer filters (scope decision 2A)', () => {
    expect(bestOf(DEFAULT_LP_LANDING_FILTERS)).toEqual([
      [1, 2],
      [2, null],
      [3, null],
    ]);
    expect(bestOf({ ...DEFAULT_LP_LANDING_FILTERS, noTurnIns: true })).toEqual([
      [1, 3],
      [2, null],
      [3, null],
    ]);
  });

  it('never filters a store out for having no passing offer', () => {
    expect(lpLandingStores(stores, offers, { ...ANY, categories: [4] }, '')).toHaveLength(3);
  });

  it('applies the store filters', () => {
    const listed = (filters: LpLandingFilters, query = '') =>
      lpLandingStores(stores, offers, filters, query).map((s) => s.corporationId);
    expect(listed({ ...ANY, range: '5' })).toEqual([1]);
    expect(listed({ ...ANY, faction: 'none' })).toEqual([2]);
    expect(listed({ ...ANY, faction: 500001 })).toEqual([1, 3]);
    expect(listed(ANY, 'corp 2')).toEqual([2]);
  });
});

describe('lpLandingActiveFilterCount', () => {
  it('counts the sales floor the landing opens with', () => {
    expect(lpLandingActiveFilterCount(DEFAULT_LP_LANDING_FILTERS)).toBe(1);
    expect(lpLandingActiveFilterCount(ANY)).toBe(0);
  });

  it('counts each filter set', () => {
    expect(
      lpLandingActiveFilterCount({
        ...ANY,
        faction: 'none',
        range: '10',
        mineOnly: true,
        hideFactionWarfare: true,
        noTurnIns: true,
        affordableOnly: true,
        categories: [9, 11],
      })
    ).toBe(7);
  });
});

describe('lpLandingHoldings', () => {
  const held = [
    store({ corporationId: 1, name: 'Sisters of EVE', yourLp: 300_000, lpValue: 1600 }),
    store({ corporationId: 2, name: 'Caldari Navy', yourLp: 50_000, lpValue: 1200 }),
    store({ corporationId: 3, name: 'Paragon', yourLp: 1_000, lpValue: null }),
    store({ corporationId: 4, yourLp: null, lpValue: 2000 }),
  ];

  it('totals the LP held and values it at each store’s LP Value', () => {
    const summary = lpLandingHoldings(held, 0);
    expect(summary).toMatchObject({
      stores: 3,
      lp: 351_000,
      worth: 300_000 * 1600 + 50_000 * 1200,
      unpriced: 1,
    });
    expect(summary?.best?.corporationId).toBe(1);
  });

  it("values every store's LP at the pilot's own LP Value when set", () => {
    expect(lpLandingHoldings(held, 1000)).toMatchObject({ worth: 351_000 * 1000, unpriced: 0 });
  });

  it('is null when the Character holds no LP', () => {
    expect(lpLandingHoldings([held[3]!], 0)).toBeNull();
  });
});
