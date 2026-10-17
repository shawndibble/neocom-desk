import { describe, expect, it } from 'vitest';
import { openOrderRow } from './__fixtures__/openOrderRow';
import { orderDoThis } from './orderDoThis';
import type { OpenOrderRow } from './openOrdersModel';

const COST_BASIS = { kind: 'build' } as unknown as OpenOrderRow['costBasis'];

const stationUndercut = (overrides: Partial<OpenOrderRow> = {}) =>
  openOrderRow({
    problem: 'undercutStation',
    problems: ['undercutStation'],
    worstScope: 'station',
    station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
    ...overrides,
  });

describe('orderDoThis', () => {
  it('raises a below-floor order to the rounded-up floor', () => {
    const row = openOrderRow({
      problem: 'belowFloor',
      problems: ['belowFloor'],
      floor: { relist: 612.34, fill: 600 },
      costBasis: COST_BASIS,
    });
    expect(orderDoThis(row)).toEqual({ kind: 'raisePrice', price: 612.4 });
  });

  it('undercuts a station rival by one legal tick when no floor says otherwise', () => {
    // The common case: no cost basis linked, so no verdict to weigh it.
    expect(orderDoThis(stationUndercut())).toEqual({ kind: 'undercutTo', price: 449.9 });
  });

  it('undercuts when the floor says it still pays', () => {
    const row = stationUndercut({ floor: { relist: 400, fill: 390 }, costBasis: COST_BASIS });
    expect(orderDoThis(row)).toEqual({ kind: 'undercutTo', price: 449.9 });
  });

  it('says not to chase a rival whose price would sell under the floor', () => {
    const row = stationUndercut({ floor: { relist: 480, fill: 470 }, costBasis: COST_BASIS });
    expect(orderDoThis(row)).toEqual({ kind: 'doNotChase' });
  });

  it('bids one tick over the rival on an outbid buy order', () => {
    const row = openOrderRow({
      isBuyOrder: true,
      problem: 'outbid',
      problems: ['outbid'],
      worstScope: 'station',
      price: 3.92,
      station: { bestPrice: 3.94, beatsMe: true, gapIsk: 0.02, gapPct: 0.5 },
    });
    expect(orderDoThis(row)).toEqual({ kind: 'bid', price: 3.95 });
  });

  it('relists an expiring order', () => {
    const row = openOrderRow({ problem: 'expiringOrStale', problems: ['expiringOrStale'] });
    expect(orderDoThis(row)).toEqual({ kind: 'relist' });
  });

  it('leaves a system or region undercut alone with no floor to weigh it', () => {
    const row = openOrderRow({ problem: 'undercutRegion', problems: ['undercutRegion'] });
    expect(orderDoThis(row)).toEqual({ kind: 'leaveItAlone' });
  });

  it('has nothing to do yet for an order nobody could check', () => {
    const row = openOrderRow({ competitionUnchecked: true });
    expect(orderDoThis(row)).toEqual({ kind: 'nothingYet' });
    // Even with a floor, whose verdict would otherwise say "leave it alone".
    const withFloor = openOrderRow({
      competitionUnchecked: true,
      floor: { relist: 400, fill: 390 },
      costBasis: COST_BASIS,
    });
    expect(orderDoThis(withFloor)).toEqual({ kind: 'nothingYet' });
  });

  it('leaves a healthy order alone, cost basis or not', () => {
    expect(orderDoThis(openOrderRow())).toEqual({ kind: 'leaveItAlone' });
    expect(orderDoThis(openOrderRow({ frequentlyUndercut: true }))).toEqual({
      kind: 'leaveItAlone',
    });
  });

  it("falls back to the badge's advice when a fix-now row has no price to name", () => {
    const row = openOrderRow({
      isBuyOrder: true,
      problem: 'outbid',
      problems: ['outbid'],
      worstScope: null,
    });
    expect(orderDoThis(row)).toEqual({ kind: 'badgeAdvice' });
  });
});
