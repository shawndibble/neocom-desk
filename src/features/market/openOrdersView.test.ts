import { describe, expect, it } from 'vitest';
import { buildOpenOrdersView, isGroupFolded } from './openOrdersView';
import { EMPTY_OPEN_ORDERS_FILTER, type OpenOrdersFilter } from './openOrdersFilter';
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
    frequentlyUndercut: false,
    ...overrides,
  };
}

const HIDE_HEALTHY: OpenOrdersFilter = { ...EMPTY_OPEN_ORDERS_FILTER, hideHealthy: true };

describe('buildOpenOrdersView', () => {
  it('groups by problem and summarises each group, worst-first', () => {
    const rows = [
      makeRow({ orderId: 1, problem: 'belowFloor', problems: ['belowFloor'] }),
      makeRow({ orderId: 2, problem: 'healthy', problems: ['healthy'] }),
    ];
    const view = buildOpenOrdersView(rows, EMPTY_OPEN_ORDERS_FILTER);
    expect(view.groups.map((g) => g.problem)).toEqual(['belowFloor', 'healthy']);
    expect(view.groupSummaries.get('belowFloor')?.iskTiedUp).toBe(5000);
    expect(view.groupSummaries.get('healthy')?.iskTiedUp).toBe(5000);
  });

  it('groupingRows always includes healthy rows regardless of hideHealthy', () => {
    const rows = [makeRow({ orderId: 1, problem: 'healthy', problems: ['healthy'] })];
    const view = buildOpenOrdersView(rows, HIDE_HEALTHY);
    expect(view.visibleRows).toHaveLength(0);
    expect(view.groupingRows).toHaveLength(1);
    expect(view.groups.map((g) => g.problem)).toEqual(['healthy']);
  });

  it('regression #2032: all-healthy with hideHealthy on hides the match-count line, not "0 of N"', () => {
    const rows = [
      makeRow({ orderId: 1, problem: 'healthy', problems: ['healthy'] }),
      makeRow({ orderId: 2, problem: 'healthy', problems: ['healthy'] }),
    ];
    const view = buildOpenOrdersView(rows, HIDE_HEALTHY);
    expect(view.matchCountVisible).toBe(false);
  });

  it('shows the match-count line ("0 of 0") when there are no rows at all', () => {
    const view = buildOpenOrdersView([], HIDE_HEALTHY);
    expect(view.matchCountVisible).toBe(true);
    expect(view.visibleRows).toHaveLength(0);
    expect(view.groupingRows).toHaveLength(0);
  });

  it('shows the match-count line when a real (non-healthy-fold) search genuinely matches nothing', () => {
    const rows = [makeRow({ orderId: 1, problem: 'belowFloor', problems: ['belowFloor'] })];
    const view = buildOpenOrdersView(rows, {
      ...EMPTY_OPEN_ORDERS_FILTER,
      text: 'nonexistent-item',
    });
    expect(view.visibleRows).toHaveLength(0);
    expect(view.groupingRows).toHaveLength(0);
    expect(view.matchCountVisible).toBe(true);
  });
});

describe('isGroupFolded', () => {
  const filter = HIDE_HEALTHY;

  it('healthy group folds by filter.hideHealthy, ignoring collapsedGroups', () => {
    expect(isGroupFolded('healthy', null, filter, new Set())).toBe(true);
    expect(
      isGroupFolded(
        'healthy',
        null,
        { ...filter, hideHealthy: false },
        new Set<OrderProblem>(['healthy'])
      )
    ).toBe(false);
  });

  it('non-healthy group folds by collapsedGroups membership', () => {
    expect(isGroupFolded('belowFloor', null, filter, new Set(['belowFloor']))).toBe(true);
    expect(isGroupFolded('belowFloor', null, filter, new Set())).toBe(false);
  });

  it('the highlighted row own group is never folded, overriding both mechanisms', () => {
    const highlighted = makeRow({ orderId: 9, problem: 'healthy', problems: ['healthy'] });
    expect(isGroupFolded('healthy', highlighted, filter, new Set())).toBe(false);
    const collapsedBelowFloor = makeRow({
      orderId: 9,
      problem: 'belowFloor',
      problems: ['belowFloor'],
    });
    expect(isGroupFolded('belowFloor', collapsedBelowFloor, filter, new Set(['belowFloor']))).toBe(
      false
    );
  });
});
