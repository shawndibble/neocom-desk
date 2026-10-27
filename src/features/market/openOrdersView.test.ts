import { describe, expect, it } from 'vitest';
import { openOrderRow } from './__fixtures__/openOrderRow';
import { buildOpenOrdersView, shownView } from './openOrdersView';
import { EMPTY_OPEN_ORDERS_FILTER } from './openOrdersFilter';
import type { OrderProblem } from '@/engine/market/orderProblems';

const row = (orderId: number, problem: OrderProblem, extra = {}) =>
  openOrderRow({ orderId, problem, problems: [problem], ...extra });

const ROWS = [
  row(1, 'healthy'),
  row(2, 'undercutRegion'),
  row(3, 'expiringOrStale'),
  row(4, 'belowFloor'),
  row(5, 'healthy', { competitionUnchecked: true }),
  row(6, 'outbid'),
  row(7, 'undercutSystem'),
];

describe('buildOpenOrdersView', () => {
  it('splits what the funnel matched into Needs you, Watch and Fine', () => {
    const view = buildOpenOrdersView(ROWS, EMPTY_OPEN_ORDERS_FILTER);
    expect(view.act.map((r) => r.orderId)).toEqual([4, 3, 6]);
    expect(view.watch.map((r) => r.orderId)).toEqual([7, 2, 5]);
    expect(view.fine.map((r) => r.orderId)).toEqual([1]);
  });

  it('lists worst first with Needs you ahead of Watch ahead of Fine, never interleaved', () => {
    const view = buildOpenOrdersView(ROWS, EMPTY_OPEN_ORDERS_FILTER);
    expect(view.matching.map((r) => r.orderId)).toEqual([4, 3, 6, 7, 2, 5, 1]);
  });

  it('keeps a sort the pilot picked across the whole list', () => {
    const rows = [row(1, 'healthy', { iskTiedUp: 900 }), row(2, 'belowFloor', { iskTiedUp: 100 })];
    const view = buildOpenOrdersView(rows, { ...EMPTY_OPEN_ORDERS_FILTER, sort: 'iskTiedUp' });
    expect(view.matching.map((r) => r.orderId)).toEqual([1, 2]);
  });

  it('counts each segment from the rows it shows, after the funnel', () => {
    const view = buildOpenOrdersView(ROWS, {
      ...EMPTY_OPEN_ORDERS_FILTER,
      problems: ['belowFloor', 'undercutRegion'],
    });
    expect(view.act.map((r) => r.orderId)).toEqual([4]);
    expect(view.watch.map((r) => r.orderId)).toEqual([2]);
    expect(view.fine).toEqual([]);
    expect(view.matching.map((r) => r.orderId)).toEqual([4, 2]);
  });

  it('totals the ISK tied up in Needs you', () => {
    const view = buildOpenOrdersView(
      [row(1, 'belowFloor', { iskTiedUp: 300 }), row(2, 'outbid', { iskTiedUp: 200 })],
      EMPTY_OPEN_ORDERS_FILTER
    );
    expect(view.actIskTiedUp).toBe(500);
  });
});

describe('shownView', () => {
  const region = row(2, 'undercutRegion');
  const station = row(8, 'undercutStation');

  it('is the picked segment when nothing has to be revealed', () => {
    expect(shownView('act', null)).toBe('act');
    expect(shownView('act', station)).toBe('act');
    expect(shownView('watch', region)).toBe('watch');
  });

  it('opens All when the row to reveal is outside the picked segment', () => {
    expect(shownView('act', region)).toBe('all');
    expect(shownView('watch', station)).toBe('all');
  });
});
