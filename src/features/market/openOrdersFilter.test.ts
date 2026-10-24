import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  EMPTY_OPEN_ORDERS_FILTER,
  filterOpenOrders,
  locationFilterOptions,
  openOrdersHref,
  OPEN_ORDERS_FILTER_PARAMS,
  sortOpenOrders,
  type OpenOrdersFilter,
} from './openOrdersFilter';
import type { OpenOrderRow } from './openOrdersModel';
import { UNDERCUT_PROBLEMS, type OrderProblem } from '@/engine/market/orderProblems';
import type { UrlParamCodec } from '@/lib/urlState';

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
    frequentlyUndercut: false,
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

  it('filters by locationIds, empty meaning every location', () => {
    const rows = [
      makeRow({ orderId: 1, locationId: 60003760 }),
      makeRow({ orderId: 2, locationId: 60008494 }),
    ];
    expect(
      filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, locationIds: [60008494] }).map(
        (r) => r.orderId
      )
    ).toEqual([2]);
    expect(filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, locationIds: [] })).toEqual(rows);
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

  it('ignores the view: the segment splits what the funnel matched', () => {
    const rows = [
      makeRow({ orderId: 1, problem: 'healthy' }),
      makeRow({ orderId: 2, problem: 'undercutRegion' }),
    ];
    expect(
      filterOpenOrders(rows, { ...EMPTY_OPEN_ORDERS_FILTER, view: 'act' }).map((r) => r.orderId)
    ).toEqual([1, 2]);
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

describe('locationFilterOptions', () => {
  const unknownLabel = (id: number) => `Unknown structure #${id}`;

  it('produces one option per distinct locationId, alphabetised by name', () => {
    const rows = [
      makeRow({ orderId: 1, locationId: 2, stationName: 'Rens VI' }),
      makeRow({ orderId: 2, locationId: 1, stationName: 'Amarr VIII' }),
      makeRow({ orderId: 3, locationId: 1, stationName: 'Amarr VIII' }),
    ];
    expect(locationFilterOptions(rows, unknownLabel)).toEqual([
      { locationId: 1, label: 'Amarr VIII' },
      { locationId: 2, label: 'Rens VI' },
    ]);
  });

  it('names an unresolved structure (null stationName) with the fallback', () => {
    const rows = [makeRow({ orderId: 1, locationId: 1000000123456, stationName: null })];
    expect(locationFilterOptions(rows, unknownLabel)).toEqual([
      { locationId: 1000000123456, label: 'Unknown structure #1000000123456' },
    ]);
  });

  it('is empty for no rows', () => {
    expect(locationFilterOptions([], unknownLabel)).toEqual([]);
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

describe('activeFilterCount', () => {
  it('is zero for the empty filter, and ignores sort and view', () => {
    expect(activeFilterCount(EMPTY_OPEN_ORDERS_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_OPEN_ORDERS_FILTER, sort: 'item', view: 'all' })).toBe(0);
  });

  it('ignores whitespace-only search text', () => {
    expect(activeFilterCount({ ...EMPTY_OPEN_ORDERS_FILTER, text: '   ' })).toBe(0);
  });

  it('counts each selected value of an array field and each set scalar', () => {
    const filter: OpenOrdersFilter = {
      text: 'trit',
      side: 'buy',
      characterIds: [1, 2],
      locationIds: [60003760],
      problems: ['belowFloor', 'outbid'],
      expiringWithinDays: 7,
      costBasis: 'linked',
      minIskTiedUp: 1000,
      view: 'watch',
      sort: 'item',
    };
    expect(activeFilterCount(filter)).toBe(10);
  });
});

/*
 * The Overview board's count tiles link here already narrowed to what they
 * counted, so these two are the deep-link vocabulary: one writes it, one reads
 * it, and the round-trip below is what stops them drifting apart.
 */
describe('the deep-link vocabulary', () => {
  const problemsCodec = OPEN_ORDERS_FILTER_PARAMS['orders.problems'] as UrlParamCodec<
    readonly string[]
  >;
  const charactersCodec = OPEN_ORDERS_FILTER_PARAMS['orders.characters'] as UrlParamCodec<
    readonly number[]
  >;

  function parseHref(href: string): {
    problems: readonly string[];
    characterIds: readonly number[];
  } {
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    return {
      problems: problemsCodec.parse(params.get('orders.problems')),
      characterIds: charactersCodec.parse(params.get('orders.characters')),
    };
  }

  it('reads a comma-separated problems param as the OR the filter already means', () => {
    expect(problemsCodec.parse('undercutStation,undercutRegion')).toEqual([
      'undercutStation',
      'undercutRegion',
    ]);
  });

  it('reads a comma-separated characters param, sorted', () => {
    expect(charactersCodec.parse('91,42')).toEqual([42, 91]);
  });

  it('reads a comma-separated locations param, sorted', () => {
    const locationsCodec = OPEN_ORDERS_FILTER_PARAMS['orders.locations'] as UrlParamCodec<
      readonly number[]
    >;
    expect(locationsCodec.parse('60008494,60003760')).toEqual([60003760, 60008494]);
  });

  /*
   * A URL is typed, shared and edited by hand. Every one of these is somebody
   * arriving with a link that has rotted or been mangled, and the page they
   * asked for — orders — is still the right answer.
   */
  it('drops what it does not recognise instead of throwing', () => {
    expect(problemsCodec.parse('undercutStation,nonsense')).toEqual(['undercutStation']);
    expect(charactersCodec.parse('91,abc')).toEqual([]);
  });

  /*
   * `healthy` is a real word in this vocabulary and still not one this
   * endpoint can honour: healthy orders sit under the All segment, so a filter
   * naming it empties the default Needs you segment — nought, with a chip the
   * reader cannot reason about. The
   * funnel already cannot produce that state (`PROBLEM_FILTER_OPTIONS` leaves
   * `healthy` out); only a URL can.
   */
  it('refuses `healthy`, which would filter to a guaranteed empty page', () => {
    expect(problemsCodec.parse('healthy')).toEqual([]);
    expect(problemsCodec.parse('healthy,outbid')).toEqual(['outbid']);
  });

  it('hands back the empty list when the URL says nothing', () => {
    expect(problemsCodec.parse(null)).toEqual([]);
    expect(charactersCodec.parse(null)).toEqual([]);
  });

  it('round-trips what the board links to', () => {
    const href = openOrdersHref({ problems: UNDERCUT_PROBLEMS, characterIds: [91] });
    const parsed = parseHref(href);
    expect(parsed.problems).toEqual([...UNDERCUT_PROBLEMS]);
    expect(parsed.characterIds).toEqual([91]);
  });

  it('opens on the segment that holds the problems it names', () => {
    const view = (href: string) =>
      new URLSearchParams(href.slice(href.indexOf('?') + 1)).get('orders.view');
    expect(view(openOrdersHref({ problems: ['belowFloor'] }))).toBeNull();
    expect(view(openOrdersHref({ problems: ['undercutRegion'] }))).toBe('watch');
    expect(view(openOrdersHref({ problems: UNDERCUT_PROBLEMS }))).toBe('all');
  });

  it('is the plain Orders page when there is nothing to narrow by', () => {
    expect(openOrdersHref({})).toBe('/market/orders');
  });

  it('asks the page to start the work-through queue', () => {
    expect(openOrdersHref({ workThrough: true })).toBe('/market/orders?orders.workThrough=1');
  });
});
