import { describe, expect, it } from 'vitest';
import {
  activeFilterChips,
  activeFilterCount,
  EMPTY_OPEN_ORDERS_FILTER,
  filterOpenOrders,
  sortOpenOrders,
  type OpenOrdersFilter,
} from './openOrdersFilter';
import type { OpenOrderRow } from './openOrdersModel';
import type { OrderProblem } from '@/engine/market/orderProblems';

function makeRow(overrides: Partial<OpenOrderRow> = {}): OpenOrderRow {
  return {
    orderId: 1,
    characterId: 1,
    characterName: 'Ryn Vashti',
    typeId: 100,
    typeName: 'Tritanium',
    isBuyOrder: false,
    price: 1000,
    volumeRemain: 5,
    volumeTotal: 10,
    locationId: 60003760,
    regionId: 10000002,
    stationName: null,
    issued: '2026-09-01T00:00:00Z',
    durationDays: 90,
    expiry: { expiresAt: Date.now() + 90 * 86400000, daysLeft: 90, expired: false },
    floor: null,
    costBasis: null,
    station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
    deepUndercut: null,
    worstScope: null,
    problem: 'healthy',
    problems: ['healthy'],
    iskTiedUp: 5000,
    belowFloor: false,
    ...overrides,
  };
}

describe('filterOpenOrders', () => {
  it('passes every row through the empty filter', () => {
    const rows = [makeRow({ orderId: 1 }), makeRow({ orderId: 2, isBuyOrder: true })];
    expect(filterOpenOrders(rows, EMPTY_OPEN_ORDERS_FILTER)).toEqual(rows);
  });

  it('matches text against the item name case-insensitively', () => {
    const rows = [makeRow({ typeName: 'Tritanium' }), makeRow({ orderId: 2, typeName: 'Pyerite' })];
    const result = filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, text: 'tri' });
    expect(result.map((r) => r.typeName)).toEqual(['Tritanium']);
  });

  it('matches text against the character name too', () => {
    const rows = [
      makeRow({ characterName: 'Ryn Vashti' }),
      makeRow({ orderId: 2, characterName: 'Some Alt' }),
    ];
    const result = filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, text: 'Ryn' });
    expect(result.map((r) => r.orderId)).toEqual([1]);
  });

  it('ignores a blank/whitespace-only text filter', () => {
    const rows = [makeRow()];
    expect(filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, text: '   ' })).toEqual(rows);
  });

  it('filters by side', () => {
    const rows = [
      makeRow({ orderId: 1, isBuyOrder: false }),
      makeRow({ orderId: 2, isBuyOrder: true }),
    ];
    expect(
      filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, side: 'buy' }).map((r) => r.orderId)
    ).toEqual([2]);
    expect(
      filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, side: 'sell' }).map((r) => r.orderId)
    ).toEqual([1]);
  });

  it('filters by characterIds, empty meaning every character', () => {
    const rows = [makeRow({ orderId: 1, characterId: 1 }), makeRow({ orderId: 2, characterId: 2 })];
    expect(
      filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, characterIds: [2] }).map(
        (r) => r.orderId
      )
    ).toEqual([2]);
    expect(filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, characterIds: [] })).toEqual(rows);
  });

  it("filters by problems against the row's problems array (overlap-honest)", () => {
    const rows = [
      makeRow({
        orderId: 1,
        problem: 'undercutStation',
        problems: ['undercutStation', 'expiringOrStale'],
      }),
      makeRow({ orderId: 2, problem: 'healthy', problems: ['healthy'] }),
    ];
    const result = filterOpenOrders(rows, {
      ...EMPTY_OPEN_ORDERS_FILTER,
      problems: ['expiringOrStale'] as OrderProblem[],
    });
    expect(result.map((r) => r.orderId)).toEqual([1]);
  });

  it('excludes a row with unknown (null) expiry from an expiringWithinDays filter', () => {
    const rows = [makeRow({ orderId: 1, expiry: null })];
    expect(filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, expiringWithinDays: 7 })).toEqual(
      []
    );
  });

  it('includes an already-expired row (negative daysLeft) in an expiringWithinDays filter', () => {
    const rows = [makeRow({ orderId: 1, expiry: { expiresAt: 0, daysLeft: -3, expired: true } })];
    expect(
      filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, expiringWithinDays: 7 }).map(
        (r) => r.orderId
      )
    ).toEqual([1]);
  });

  it('excludes a row past the expiringWithinDays threshold', () => {
    const rows = [makeRow({ orderId: 1, expiry: { expiresAt: 0, daysLeft: 30, expired: false } })];
    expect(filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, expiringWithinDays: 7 })).toEqual(
      []
    );
  });

  it('filters by costBasis linked/missing', () => {
    const linked = makeRow({
      orderId: 1,
      costBasis: { unitCost: 1, runId: 'r', runQuantity: 1, materialCost: 1, jobFee: 1 },
    });
    const missing = makeRow({ orderId: 2, costBasis: null });
    expect(
      filterOpenOrders([linked, missing], { ...EMPTY_OPEN_ORDERS_FILTER, costBasis: 'linked' }).map(
        (r) => r.orderId
      )
    ).toEqual([1]);
    expect(
      filterOpenOrders([linked, missing], {
        ...EMPTY_OPEN_ORDERS_FILTER,
        costBasis: 'missing',
      }).map((r) => r.orderId)
    ).toEqual([2]);
  });

  it('filters by minIskTiedUp', () => {
    const rows = [
      makeRow({ orderId: 1, iskTiedUp: 500 }),
      makeRow({ orderId: 2, iskTiedUp: 5000 }),
    ];
    expect(
      filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, minIskTiedUp: 1000 }).map(
        (r) => r.orderId
      )
    ).toEqual([2]);
  });

  it('hideHealthy drops only healthy rows', () => {
    const rows = [
      makeRow({ orderId: 1, problem: 'healthy' }),
      makeRow({ orderId: 2, problem: 'undercutStation' }),
    ];
    expect(
      filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, hideHealthy: true }).map(
        (r) => r.orderId
      )
    ).toEqual([2]);
  });

  it('combines constraints with AND', () => {
    const rows = [
      makeRow({ orderId: 1, isBuyOrder: false, typeName: 'Tritanium' }),
      makeRow({ orderId: 2, isBuyOrder: true, typeName: 'Tritanium' }),
      makeRow({ orderId: 3, isBuyOrder: false, typeName: 'Pyerite' }),
    ];
    const result = filterOpenOrders(rows, {
      ...EMPTY_OPEN_ORDERS_FILTER,
      side: 'sell',
      text: 'tri',
    });
    expect(result.map((r) => r.orderId)).toEqual([1]);
  });
});

describe('sortOpenOrders', () => {
  it('never mutates its input', () => {
    const rows = [makeRow({ orderId: 2 }), makeRow({ orderId: 1 })];
    const original = [...rows];
    sortOpenOrders(rows, 'item');
    expect(rows).toEqual(original);
  });

  it("worstFirst matches the model builder's own worst-first order", () => {
    const rows = [
      makeRow({ orderId: 1, problem: 'healthy', iskTiedUp: 9999 }),
      makeRow({ orderId: 2, problem: 'belowFloor', iskTiedUp: 1 }),
    ];
    expect(sortOpenOrders(rows, 'worstFirst').map((r) => r.orderId)).toEqual([2, 1]);
  });

  it('expirySoonest sorts null-expiry rows last', () => {
    const rows = [
      makeRow({ orderId: 1, expiry: null }),
      makeRow({ orderId: 2, expiry: { expiresAt: 0, daysLeft: 3, expired: false } }),
    ];
    expect(sortOpenOrders(rows, 'expirySoonest').map((r) => r.orderId)).toEqual([2, 1]);
  });

  it('expirySoonest orders by ascending daysLeft', () => {
    const rows = [
      makeRow({ orderId: 1, expiry: { expiresAt: 0, daysLeft: 10, expired: false } }),
      makeRow({ orderId: 2, expiry: { expiresAt: 0, daysLeft: -1, expired: true } }),
      makeRow({ orderId: 3, expiry: { expiresAt: 0, daysLeft: 3, expired: false } }),
    ];
    expect(sortOpenOrders(rows, 'expirySoonest').map((r) => r.orderId)).toEqual([2, 3, 1]);
  });

  it('iskTiedUp sorts descending', () => {
    const rows = [makeRow({ orderId: 1, iskTiedUp: 100 }), makeRow({ orderId: 2, iskTiedUp: 900 })];
    expect(sortOpenOrders(rows, 'iskTiedUp').map((r) => r.orderId)).toEqual([2, 1]);
  });

  it('item sorts alphabetically by typeName', () => {
    const rows = [
      makeRow({ orderId: 1, typeName: 'Zydrine' }),
      makeRow({ orderId: 2, typeName: 'Isogen' }),
    ];
    expect(sortOpenOrders(rows, 'item').map((r) => r.orderId)).toEqual([2, 1]);
  });

  it('character sorts alphabetically by characterName', () => {
    const rows = [
      makeRow({ orderId: 1, characterName: 'Zeta' }),
      makeRow({ orderId: 2, characterName: 'Alpha' }),
    ];
    expect(sortOpenOrders(rows, 'character').map((r) => r.orderId)).toEqual([2, 1]);
  });

  it('is stable/deterministic via the orderId tiebreak when the sort key ties', () => {
    const rows = [makeRow({ orderId: 5, iskTiedUp: 100 }), makeRow({ orderId: 3, iskTiedUp: 100 })];
    expect(sortOpenOrders(rows, 'iskTiedUp').map((r) => r.orderId)).toEqual([3, 5]);
  });
});

describe('activeFilterChips / activeFilterCount', () => {
  it('is empty for the empty filter', () => {
    expect(activeFilterChips(EMPTY_OPEN_ORDERS_FILTER)).toEqual([]);
    expect(activeFilterCount(EMPTY_OPEN_ORDERS_FILTER)).toBe(0);
  });

  it('does not produce a chip for sort', () => {
    const filter: OpenOrdersFilter = { ...EMPTY_OPEN_ORDERS_FILTER, sort: 'iskTiedUp' };
    expect(activeFilterChips(filter)).toEqual([]);
  });

  it('produces one chip per selected value for array fields, each clearing only its own value', () => {
    const filter: OpenOrdersFilter = {
      ...EMPTY_OPEN_ORDERS_FILTER,
      characterIds: [1, 2],
      problems: ['belowFloor', 'outbid'],
    };
    const chips = activeFilterChips(filter);
    const ids = chips.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(['character:1', 'character:2', 'problem:belowFloor', 'problem:outbid'])
    );
    expect(new Set(ids).size).toBe(ids.length);

    const characterChip = chips.find((c) => c.id === 'character:1')!;
    const cleared = characterChip.clear(filter);
    expect(cleared.characterIds).toEqual([2]);
    expect(cleared.problems).toEqual(['belowFloor', 'outbid']);
  });

  it('clear on each scalar chip removes only that constraint', () => {
    const filter: OpenOrdersFilter = {
      text: 'trit',
      side: 'buy',
      characterIds: [1],
      problems: ['outbid'],
      expiringWithinDays: 7,
      costBasis: 'linked',
      minIskTiedUp: 1000,
      hideHealthy: true,
      sort: 'item',
    };
    const chips = activeFilterChips(filter);
    // Every constraint present should have produced a chip.
    expect(chips.length).toBe(8);

    for (const chip of chips) {
      const cleared = chip.clear(filter);
      // The rest of the filter is untouched.
      const untouched: Partial<OpenOrdersFilter> = { ...filter };
      switch (chip.id) {
        case 'text':
          expect(cleared.text).toBe('');
          delete untouched.text;
          break;
        case 'side':
          expect(cleared.side).toBeNull();
          delete untouched.side;
          break;
        case 'character:1':
          expect(cleared.characterIds).toEqual([]);
          delete untouched.characterIds;
          break;
        case 'problem:outbid':
          expect(cleared.problems).toEqual([]);
          delete untouched.problems;
          break;
        case 'expiringWithinDays':
          expect(cleared.expiringWithinDays).toBeNull();
          delete untouched.expiringWithinDays;
          break;
        case 'costBasis':
          expect(cleared.costBasis).toBeNull();
          delete untouched.costBasis;
          break;
        case 'minIskTiedUp':
          expect(cleared.minIskTiedUp).toBeNull();
          delete untouched.minIskTiedUp;
          break;
        case 'hideHealthy':
          expect(cleared.hideHealthy).toBe(false);
          delete untouched.hideHealthy;
          break;
        default:
          throw new Error(`unexpected chip id ${chip.id}`);
      }
      for (const key of Object.keys(untouched) as (keyof OpenOrdersFilter)[]) {
        expect(cleared[key]).toEqual(filter[key]);
      }
    }
  });

  it('activeFilterCount equals the number of chips', () => {
    const filter: OpenOrdersFilter = {
      ...EMPTY_OPEN_ORDERS_FILTER,
      side: 'buy',
      hideHealthy: true,
    };
    expect(activeFilterCount(filter)).toBe(activeFilterChips(filter).length);
    expect(activeFilterCount(filter)).toBe(2);
  });
});
