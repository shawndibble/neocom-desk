import { describe, it, expect } from 'vitest';
import {
  contractRowToSearchRow,
  ownedBlueprintToSearchRow,
  type BpcContractRow,
} from '@/engine/contracts/bpcSearch';
import type { RegionOrder } from '@/esi/endpoints';
import {
  bpoBadgeRows,
  bpoMayBeCheaper,
  cheapestBpoSourcesByType,
  cheapestComparableCopy,
  cheapestSourcingCard,
  marketBpoOffers,
  type BpoAvailabilityInput,
} from './bpoAvailability';

const RIFTER_BP = 691;
const CARACAL_BP = 950;
const THE_FORGE = 10000002;
const JITA_44 = 60003760;
const PERIMETER = 60000001;

function contract(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: 1,
    regionId: THE_FORGE,
    locationId: JITA_44,
    typeId: RIFTER_BP,
    price: 5_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 5,
    quantity: 1,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    isMultiType: false,
    ...overrides,
  };
}

function original(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return contract({ runs: -1, price: 40_000_000, ...overrides });
}

function order(overrides: Partial<RegionOrder> = {}): RegionOrder {
  return {
    duration: 90,
    is_buy_order: false,
    issued: '2026-09-01T00:00:00Z',
    location_id: JITA_44,
    min_volume: 1,
    order_id: 1,
    price: 12_500_000,
    range: 'region',
    system_id: 30000142,
    type_id: RIFTER_BP,
    volume_remain: 3,
    volume_total: 3,
    ...overrides,
  };
}

function book(sell: RegionOrder[], regionId = THE_FORGE) {
  return { regionId, sell };
}

describe('marketBpoOffers', () => {
  it('lists one region’s sell orders cheapest first, carrying the region and marking the hub station', () => {
    const offers = marketBpoOffers(
      [
        order({ order_id: 1, price: 20_000_000, location_id: JITA_44 }),
        order({ order_id: 2, price: 10_000_000, location_id: PERIMETER }),
        order({ order_id: 3, price: 1, is_buy_order: true }),
      ],
      THE_FORGE,
      JITA_44
    );
    expect(offers.map((o) => [o.orderId, o.regionId, o.atHub])).toEqual([
      [2, THE_FORGE, false],
      [1, THE_FORGE, true],
    ]);
  });
});

describe('bpoMayBeCheaper', () => {
  const bpo = { price: 10_000_000 };

  it('is true when the BPO costs less than, or the same as, the copy offer', () => {
    expect(bpoMayBeCheaper(bpo, contract({ price: 12_000_000 }))).toBe(true);
    expect(bpoMayBeCheaper(bpo, contract({ price: 10_000_000 }))).toBe(true);
  });

  it('is false when the BPO costs more', () => {
    expect(bpoMayBeCheaper(bpo, contract({ price: 9_999_999 }))).toBe(false);
  });

  it('is false with no BPO', () => {
    expect(bpoMayBeCheaper(null, contract())).toBe(false);
    expect(bpoMayBeCheaper(undefined, contract())).toBe(false);
  });

  it('is false for a multi-type bundle — its price is not this blueprint’s', () => {
    expect(bpoMayBeCheaper(bpo, contract({ price: 50_000_000, isMultiType: true }))).toBe(false);
  });

  it('is false for a zero-price barter — it has no ISK price to compare', () => {
    expect(bpoMayBeCheaper(bpo, contract({ price: 0 }))).toBe(false);
  });

  it('compares an auction on its buyout, and a no-buyout auction on its starting bid (a floor)', () => {
    expect(
      bpoMayBeCheaper(bpo, contract({ isAuction: true, price: 1_000_000, buyout: 20_000_000 }))
    ).toBe(true);
    expect(bpoMayBeCheaper(bpo, contract({ isAuction: true, price: 15_000_000 }))).toBe(true);
    expect(bpoMayBeCheaper(bpo, contract({ isAuction: true, price: 1_000_000 }))).toBe(false);
  });

  it('is false for a BPO with no real price', () => {
    expect(bpoMayBeCheaper({ price: 0 }, contract())).toBe(false);
  });
});

describe('cheapestBpoSourcesByType', () => {
  it('keeps the cheapest market and contract original apart, one of each', () => {
    const input: BpoAvailabilityInput = {
      originals: [
        original({ contractId: 1, price: 30_000_000 }),
        original({ contractId: 2, price: 20_000_000 }),
      ],
      contractRegionId: null,
      marketBooks: new Map([
        [
          RIFTER_BP,
          book([
            order({ order_id: 1, price: 25_000_000 }),
            order({ order_id: 2, price: 12_000_000 }),
          ]),
        ],
      ]),
      hubStationId: JITA_44,
    };
    const sources = cheapestBpoSourcesByType([RIFTER_BP], input).get(RIFTER_BP);
    expect(sources?.contract).toMatchObject({ kind: 'contract', contractId: 2, price: 20_000_000 });
    expect(sources?.market).toMatchObject({ kind: 'market', orderId: 2, price: 12_000_000 });
  });

  it('leaves the missing side null, and a type with neither out', () => {
    const input: BpoAvailabilityInput = {
      originals: [original({ price: 20_000_000 })],
      contractRegionId: null,
      marketBooks: new Map([[CARACAL_BP, book([])]]),
      hubStationId: JITA_44,
    };
    const result = cheapestBpoSourcesByType([RIFTER_BP, CARACAL_BP], input);
    expect(result.get(RIFTER_BP)).toMatchObject({ market: null, contract: { price: 20_000_000 } });
    expect(result.has(CARACAL_BP)).toBe(false);
  });
});

describe('cheapestComparableCopy', () => {
  it('picks the cheapest copy with an honest ISK price, skipping bundles and barters', () => {
    const cheapest = cheapestComparableCopy([
      contract({ contractId: 1, price: 5_000_000 }),
      contract({ contractId: 2, price: 1_000_000, isMultiType: true }),
      contract({ contractId: 3, price: 0 }),
      contract({ contractId: 4, price: 3_000_000 }),
    ]);
    expect(cheapest?.contractId).toBe(4);
  });

  it('is null when no copy has a comparable price', () => {
    expect(cheapestComparableCopy([contract({ price: 0 })])).toBeNull();
    expect(cheapestComparableCopy([])).toBeNull();
  });
});

describe('bpoBadgeRows', () => {
  it('badges one copy row per type: its cheapest comparable contract copy', () => {
    const dear = contractRowToSearchRow(contract({ contractId: 1, price: 9_000_000 }));
    const cheap = contractRowToSearchRow(contract({ contractId: 2, price: 3_000_000 }));
    const bundle = contractRowToSearchRow(
      contract({ contractId: 3, price: 1_000_000, isMultiType: true })
    );
    const caracal = contractRowToSearchRow(contract({ contractId: 4, typeId: CARACAL_BP }));
    const badged = bpoBadgeRows([dear, bundle, cheap, caracal]);
    expect([...badged]).toEqual([cheap, caracal]);
  });

  it('falls back to the first copy row of a type with no comparable price, and never badges an original', () => {
    const owned = ownedBlueprintToSearchRow({
      itemId: 1,
      typeId: RIFTER_BP,
      runs: 5,
      me: 10,
      te: 20,
      quantity: 1,
      locationName: null,
      regionId: null,
      space: null,
    });
    const bpo = contractRowToSearchRow(original({ typeId: CARACAL_BP }));
    expect([...bpoBadgeRows([bpo, owned])]).toEqual([owned]);
  });
});

describe('cheapestSourcingCard', () => {
  it('keeps the region highlight when no BPO is strictly cheaper', () => {
    expect(cheapestSourcingCard(100_000, [{ kind: 'market', price: 1_700_000 }])).toBe('region');
    expect(cheapestSourcingCard(100_000, [{ kind: 'contract', price: 100_000 }])).toBe('region');
  });

  it('moves the highlight to a BPO only when it is the cheapest box in the row', () => {
    expect(
      cheapestSourcingCard(2_000_000, [
        { kind: 'market', price: 1_700_000 },
        { kind: 'contract', price: 11_900_000 },
      ])
    ).toBe('market');
    expect(
      cheapestSourcingCard(2_000_000, [
        { kind: 'market', price: 1_900_000 },
        { kind: 'contract', price: 1_500_000 },
      ])
    ).toBe('contract');
  });

  it('compares the BPO cards between themselves when no region cells show', () => {
    expect(
      cheapestSourcingCard(null, [
        { kind: 'market', price: 3 },
        { kind: 'contract', price: 2 },
      ])
    ).toBe('contract');
  });

  it('highlights nothing when the row holds a single box', () => {
    expect(cheapestSourcingCard(null, [{ kind: 'market', price: 1 }])).toBeNull();
    expect(cheapestSourcingCard(null, [])).toBeNull();
  });
});
