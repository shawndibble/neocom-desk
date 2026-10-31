import { describe, expect, it } from 'vitest';
import type { NetWorthSnapshotRow } from './snapshot';
import { GOAL_MIN_SPAN_DAYS, goalProgress, iskWaiting, walletChange } from './waiting';

const row = (
  day: string,
  o: Partial<NetWorthSnapshotRow> = {},
  characterId = 1
): NetWorthSnapshotRow => ({
  id: `${characterId}:${day}`,
  characterId,
  day,
  wallet: 100,
  assetValue: 50,
  escrow: 10,
  sellStock: 5,
  contractStock: 2,
  hubId: 'jita',
  updatedAt: 1,
  ...o,
});

describe('iskWaiting', () => {
  it('reads each Character at its newest day and sums them', () => {
    const rows = [
      row('2026-10-29', { escrow: 999, sellStock: 999 }),
      row('2026-10-30', { escrow: 10, sellStock: 20, contractStock: 30 }),
      row('2026-10-30', { escrow: 1, sellStock: 2, contractStock: 3 }, 2),
    ];
    expect(iskWaiting(rows, '2026-10-31')).toEqual({
      sellOrders: 22,
      escrow: 11,
      contracts: 33,
      total: 66,
    });
  });

  it('reads a layer an older row lacks as zero', () => {
    const rows = [row('2026-10-30', { sellStock: undefined, contractStock: undefined })];
    expect(iskWaiting(rows, '2026-10-31')).toEqual({
      sellOrders: 0,
      escrow: 10,
      contracts: 0,
      total: 10,
    });
  });

  it('is all zeros with no snapshot', () => {
    expect(iskWaiting([], '2026-10-31')).toEqual({
      sellOrders: 0,
      escrow: 0,
      contracts: 0,
      total: 0,
    });
  });
});

describe('stale Characters', () => {
  it('leaves out a Character whose newest snapshot is over a week old', () => {
    const rows = [
      row('2026-10-30', { escrow: 10, sellStock: 0, contractStock: 0, wallet: 100 }),
      row('2026-08-01', { escrow: 500, sellStock: 500, contractStock: 500, wallet: 9000 }, 2),
    ];
    expect(iskWaiting(rows, '2026-10-31').total).toBe(10);
    expect(goalProgress({ target: 1000, rows, today: '2026-10-31' }).current).toBe(100);
    expect(walletChange(rows, '2026-10-31')).toBeNull();
  });
});

describe('goalProgress', () => {
  it('sums the newest wallet of each Character and clamps the fraction', () => {
    const rows = [row('2026-10-30', { wallet: 300 }), row('2026-10-30', { wallet: 200 }, 2)];
    const p = goalProgress({ target: 1000, rows, today: '2026-10-31' });
    expect(p).toMatchObject({ current: 500, target: 1000, fraction: 0.5, reached: false });
    expect(goalProgress({ target: 400, rows, today: '2026-10-31' })).toMatchObject({
      fraction: 1,
      reached: true,
      projectedDay: null,
    });
  });

  it('projects the day from the wallet gain per day over the window', () => {
    // +300 over 10 days = 30/day; 700 left = 24 days (rounded up) after 2026-10-30.
    const rows = [row('2026-10-20', { wallet: 300 }), row('2026-10-30', { wallet: 600 })];
    const p = goalProgress({ target: 1300, rows, today: '2026-10-31' });
    expect(p.perDay).toBe(30);
    expect(p.projectedDay).toBe('2026-11-23');
  });

  it('only counts snapshots inside the window', () => {
    const rows = [
      row('2026-08-01', { wallet: 0 }),
      row('2026-10-20', { wallet: 300 }),
      row('2026-10-30', { wallet: 600 }),
    ];
    expect(goalProgress({ target: 1300, rows, today: '2026-10-31' }).perDay).toBe(30);
  });

  it('gives no pace when the span is too short or the wallet fell', () => {
    const short = [row('2026-10-29', { wallet: 1 }), row('2026-10-30', { wallet: 900 })];
    expect(GOAL_MIN_SPAN_DAYS).toBeGreaterThan(1);
    expect(goalProgress({ target: 1300, rows: short, today: '2026-10-31' })).toMatchObject({
      perDay: null,
      projectedDay: null,
    });
    const falling = [row('2026-10-20', { wallet: 600 }), row('2026-10-30', { wallet: 300 })];
    expect(goalProgress({ target: 1300, rows: falling, today: '2026-10-31' })).toMatchObject({
      perDay: null,
      projectedDay: null,
    });
  });

  it('has no fraction without a positive target', () => {
    expect(
      goalProgress({ target: 0, rows: [row('2026-10-30')], today: '2026-10-31' }).fraction
    ).toBe(0);
  });
});

describe('walletChange', () => {
  it("sums each Character's gain across the window", () => {
    const rows = [
      row('2026-08-01', { wallet: 0 }),
      row('2026-10-05', { wallet: 100 }),
      row('2026-10-30', { wallet: 400 }),
      row('2026-10-10', { wallet: 50 }, 2),
      row('2026-10-30', { wallet: 20 }, 2),
    ];
    expect(walletChange(rows, '2026-10-31')).toBe(270);
  });

  it('is null with nothing to compare', () => {
    expect(walletChange([], '2026-10-31')).toBeNull();
    expect(walletChange([row('2026-10-30')], '2026-10-31')).toBeNull();
  });
});
