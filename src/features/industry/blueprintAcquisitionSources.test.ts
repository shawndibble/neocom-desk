import { describe, it, expect } from 'vitest';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { LoyaltyStoreOffer, RegionOrder } from '@/esi/endpoints';
import type { LpOfferMatch } from '@/features/market/appraisalLpAcquisition';
import {
  cheapestRow,
  contractOfferRows,
  isCurrentPick,
  lpOfferRows,
  lpPickPrice,
  marketSellRows,
  overridePatchFor,
  ownedTierRows,
} from './blueprintAcquisitionSources';

const ASTERO_BP = 33468;
const THE_FORGE = 10000002;
const DOMAIN = 10000043;

function contract(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: 1,
    regionId: THE_FORGE,
    locationId: 60003760,
    typeId: ASTERO_BP,
    price: 30_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 10,
    quantity: 1,
    dateExpired: 0,
    isMultiType: false,
    ...overrides,
  };
}

describe('contractOfferRows', () => {
  it("lists this blueprint's copies and originals in the chosen region, cheapest first", () => {
    const rows = contractOfferRows({
      copies: [
        contract({ contractId: 1, price: 30_000_000 }),
        contract({ contractId: 2, price: 10_000_000 }),
        contract({ contractId: 3, typeId: 999 }),
        contract({ contractId: 4, regionId: DOMAIN }),
      ],
      originals: [contract({ contractId: 5, runs: -1, price: 20_000_000, me: 0, te: 0 })],
      blueprintTypeID: ASTERO_BP,
      regionId: THE_FORGE,
    });
    expect(rows.map((row) => row.contractId)).toEqual([2, 5, 1]);
  });

  it('lists every region when no region is chosen', () => {
    const rows = contractOfferRows({
      copies: [contract({ contractId: 1 }), contract({ contractId: 4, regionId: DOMAIN })],
      originals: [],
      blueprintTypeID: ASTERO_BP,
      regionId: null,
    });
    expect(rows.map((row) => row.contractId).sort()).toEqual([1, 4]);
  });

  it('gives a copy its ISK/run over every run the listing buys, and an original none', () => {
    const [copyRow, originalRow] = contractOfferRows({
      copies: [contract({ price: 30_000_000, runs: 10, quantity: 3 })],
      originals: [contract({ contractId: 5, runs: -1, price: 900_000_000 })],
      blueprintTypeID: ASTERO_BP,
      regionId: null,
    });
    expect(copyRow).toMatchObject({ runs: 10, quantity: 3, iskPerRun: 1_000_000 });
    expect(originalRow).toMatchObject({ runs: null, iskPerRun: null });
  });

  it('prices an auction at its buyout when it has one, else flags the price as a starting bid', () => {
    const rows = contractOfferRows({
      copies: [
        contract({ contractId: 1, isAuction: true, price: 1_000_000, buyout: 50_000_000 }),
        contract({ contractId: 2, isAuction: true, price: 2_000_000 }),
      ],
      originals: [],
      blueprintTypeID: ASTERO_BP,
      regionId: null,
    });
    expect(rows.find((row) => row.contractId === 1)).toMatchObject({
      price: 50_000_000,
      isStartingBid: false,
    });
    expect(rows.find((row) => row.contractId === 2)).toMatchObject({
      price: 2_000_000,
      isStartingBid: true,
    });
  });

  it('never lets a multi-type bundle or a zero-price barter be picked, and sorts them last', () => {
    const rows = contractOfferRows({
      copies: [
        contract({ contractId: 1, price: 1_000_000, isMultiType: true }),
        contract({ contractId: 2, price: 0 }),
        contract({ contractId: 3, price: 40_000_000 }),
      ],
      originals: [],
      blueprintTypeID: ASTERO_BP,
      regionId: null,
    });
    expect(rows.map((row) => row.contractId)).toEqual([3, 1, 2]);
    expect(rows.map((row) => row.pickable)).toEqual([true, false, false]);
    expect(rows[1].iskPerRun).toBeNull();
  });
});

describe('cheapestRow', () => {
  it('is the first pickable row', () => {
    const rows = contractOfferRows({
      copies: [
        contract({ contractId: 1, price: 1_000_000, isMultiType: true }),
        contract({ contractId: 3, price: 40_000_000 }),
      ],
      originals: [],
      blueprintTypeID: ASTERO_BP,
      regionId: null,
    });
    expect(cheapestRow(rows)?.contractId).toBe(3);
  });

  it('is null when nothing can be picked', () => {
    expect(cheapestRow([])).toBeNull();
  });
});

const JITA_44 = 60003760;

function order(overrides: Partial<RegionOrder> = {}): RegionOrder {
  return {
    duration: 90,
    is_buy_order: false,
    issued: '2026-09-01T00:00:00Z',
    location_id: JITA_44,
    min_volume: 1,
    order_id: 1,
    price: 5_000_000,
    range: 'region',
    system_id: 30000142,
    type_id: ASTERO_BP,
    volume_remain: 3,
    volume_total: 3,
    ...overrides,
  };
}

describe('marketSellRows', () => {
  it('lists every sell order in the region cheapest first, ignoring buy orders', () => {
    const rows = marketSellRows(
      [
        order({ order_id: 1, price: 9_000_000 }),
        order({ order_id: 2, price: 4_000_000, location_id: 60008494 }),
        order({ order_id: 3, price: 1_000_000, is_buy_order: true }),
      ],
      JITA_44
    );
    expect(rows.map((row) => row.orderId)).toEqual([2, 1]);
  });

  it("marks orders at the hub's own station, and prices every market BPO as ME0/TE0", () => {
    const rows = marketSellRows(
      [order({ order_id: 1 }), order({ order_id: 2, location_id: 60008494, price: 6_000_000 })],
      JITA_44
    );
    expect(rows).toEqual([
      expect.objectContaining({ orderId: 1, atHub: true, me: 0, te: 0, pickable: true }),
      expect.objectContaining({ orderId: 2, atHub: false }),
    ]);
  });
});

const LP_OFFER: LoyaltyStoreOffer = {
  offer_id: 1,
  type_id: ASTERO_BP,
  quantity: 1,
  isk_cost: 12_000_000,
  lp_cost: 950_000,
  required_items: [],
};

function lpMatch(overrides: Partial<LpOfferMatch> = {}): LpOfferMatch {
  return {
    corporationId: 1000125,
    corpName: 'Sisters of EVE',
    offer: LP_OFFER,
    playerLp: 0,
    ...overrides,
  };
}

describe('lpPickPrice', () => {
  it("adds the LP at the pilot's ISK-per-LP rate to the ISK cost", () => {
    expect(lpPickPrice(12_000_000, 950_000, 1_000)).toBe(962_000_000);
  });

  it('is the ISK cost alone at a zero rate', () => {
    expect(lpPickPrice(12_000_000, 950_000, 0)).toBe(12_000_000);
  });
});

describe('lpOfferRows', () => {
  it('prices every offer at ISK + LP x rate, cheapest first, as ME0/TE0', () => {
    const rows = lpOfferRows(
      [
        lpMatch({ corporationId: 1 }),
        lpMatch({
          corporationId: 2,
          offer: { ...LP_OFFER, isk_cost: 5_000_000, lp_cost: 2_000_000 },
        }),
      ],
      10
    );
    expect(rows.map((row) => [row.corporationId, row.price])).toEqual([
      [1, 21_500_000],
      [2, 25_000_000],
    ]);
    expect(rows[0]).toMatchObject({ me: 0, te: 0, pickable: true, lpPriced: true });
  });

  it('says the price is ISK only when no rate is set', () => {
    expect(lpOfferRows([lpMatch()], 0)[0]).toMatchObject({ price: 12_000_000, lpPriced: false });
  });
});

describe('ownedTierRows', () => {
  it('groups copies into one row per tier, runs summed, best tier first', () => {
    expect(
      ownedTierRows([
        { me: 8, te: 16, runs: 5 },
        { me: 10, te: 20, runs: 2 },
        { me: 8, te: 16, runs: 3 },
      ])
    ).toEqual([
      expect.objectContaining({ kind: 'owned', me: 10, te: 20, runs: 2 }),
      expect.objectContaining({ kind: 'owned', me: 8, te: 16, runs: 8 }),
    ]);
  });

  it('reports a tier holding an original as unlimited', () => {
    expect(
      ownedTierRows([
        { me: 10, te: 20, runs: 4 },
        { me: 10, te: 20, runs: -1 },
      ])
    ).toEqual([expect.objectContaining({ runs: null })]);
  });
});

describe('overridePatchFor', () => {
  it('forces an owned tier without a price — the engine prices owned stock itself', () => {
    const [owned] = ownedTierRows([{ me: 8, te: 16, runs: 5 }]);
    expect(overridePatchFor(owned)).toEqual({
      acquisitionTierOverride: { me: 8, te: 16 },
      overridePrice: undefined,
    });
  });

  it("forces a contract listing's tier at its whole asking price", () => {
    const [row] = contractOfferRows({
      copies: [contract({ me: 9, te: 18, price: 30_000_000, runs: 10, quantity: 3 })],
      originals: [],
      blueprintTypeID: ASTERO_BP,
      regionId: null,
    });
    expect(overridePatchFor(row)).toEqual({
      acquisitionTierOverride: { me: 9, te: 18 },
      overridePrice: 30_000_000,
    });
  });

  it('forces a market BPO at ME0/TE0 and its order price', () => {
    const [row] = marketSellRows([order({ price: 7_500_000 })], JITA_44);
    expect(overridePatchFor(row)).toEqual({
      acquisitionTierOverride: { me: 0, te: 0 },
      overridePrice: 7_500_000,
    });
  });

  it('forces an LP copy at ME0/TE0 and its ISK + LP-at-rate price', () => {
    const [row] = lpOfferRows([lpMatch()], 10);
    expect(overridePatchFor(row)).toEqual({
      acquisitionTierOverride: { me: 0, te: 0 },
      overridePrice: 21_500_000,
    });
  });
});

describe('isCurrentPick', () => {
  const [owned] = ownedTierRows([{ me: 0, te: 0, runs: -1 }]);
  const [market] = marketSellRows([order({ price: 7_500_000 })], JITA_44);

  it('matches an owned tier only when no price was forced with it', () => {
    expect(isCurrentPick(owned, { acquisitionTierOverride: { me: 0, te: 0 } })).toBe(true);
    expect(
      isCurrentPick(owned, { acquisitionTierOverride: { me: 0, te: 0 }, overridePrice: 7_500_000 })
    ).toBe(false);
  });

  it('matches a priced row on tier and price both, so two ME0/TE0 sources never both read selected', () => {
    expect(
      isCurrentPick(market, { acquisitionTierOverride: { me: 0, te: 0 }, overridePrice: 7_500_000 })
    ).toBe(true);
    expect(
      isCurrentPick(market, { acquisitionTierOverride: { me: 0, te: 0 }, overridePrice: 9_000_000 })
    ).toBe(false);
    expect(isCurrentPick(market, { acquisitionTierOverride: { me: 0, te: 0 } })).toBe(false);
  });

  it('matches nothing without an override', () => {
    expect(isCurrentPick(owned, undefined)).toBe(false);
    expect(isCurrentPick(market, { overridePrice: 7_500_000 })).toBe(false);
  });
});
