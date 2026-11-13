import { describe, expect, it } from 'vitest';
import {
  OVERDUE_AGE_BUCKETS,
  matchesMinerBalance,
  overdueAgeBucketOf,
  overdueAging,
} from './overdueAging';

const miner = (owed: number, overdueDays: number | null, credit = 0) => ({
  owed,
  overdueDays,
  credit,
});

describe('overdueAgeBucketOf', () => {
  it('puts the day it goes Overdue and the first month in the first bucket', () => {
    expect(overdueAgeBucketOf(0)).toBe('0-30');
    expect(overdueAgeBucketOf(30)).toBe('0-30');
  });

  it('splits at 31, 61 and 91 days', () => {
    expect(overdueAgeBucketOf(31)).toBe('31-60');
    expect(overdueAgeBucketOf(60)).toBe('31-60');
    expect(overdueAgeBucketOf(61)).toBe('61-90');
    expect(overdueAgeBucketOf(90)).toBe('61-90');
    expect(overdueAgeBucketOf(91)).toBe('over-90');
    expect(overdueAgeBucketOf(400)).toBe('over-90');
  });
});

describe('overdueAging', () => {
  it('lists every bucket in age order, empty ones at zero', () => {
    expect(overdueAging([]).map((b) => b.id)).toEqual(OVERDUE_AGE_BUCKETS);
    expect(overdueAging([]).every((b) => b.count === 0 && b.amount === 0)).toBe(true);
  });

  it("counts each overdue Miner once, its whole debt in its oldest Statement's bucket", () => {
    const aging = overdueAging([
      miner(100, 3),
      miner(250, 29),
      miner(1_000, 45),
      miner(40, 120),
      miner(500, null),
      miner(0, null, 70),
    ]);
    expect(aging).toEqual([
      { id: '0-30', count: 2, amount: 350 },
      { id: '31-60', count: 1, amount: 1_000 },
      { id: '61-90', count: 0, amount: 0 },
      { id: 'over-90', count: 1, amount: 40 },
    ]);
  });

  it('sums to the Overdue total', () => {
    const miners = [miner(100, 3), miner(1_000, 45), miner(40, 120), miner(9, null)];
    const total = overdueAging(miners).reduce((s, b) => s + b.amount, 0);
    expect(total).toBe(1_140);
  });
});

describe('matchesMinerBalance', () => {
  it('owing: any Miner with something owed', () => {
    expect(matchesMinerBalance(miner(1, null), 'owing')).toBe(true);
    expect(matchesMinerBalance(miner(0, null, 5), 'owing')).toBe(false);
  });

  it('overdue: any Miner with an overdue Statement', () => {
    expect(matchesMinerBalance(miner(10, 0), 'overdue')).toBe(true);
    expect(matchesMinerBalance(miner(10, null), 'overdue')).toBe(false);
  });

  it('an age bucket: overdue Miners whose oldest Statement falls in it', () => {
    expect(matchesMinerBalance(miner(10, 45), 'overdue-31-60')).toBe(true);
    expect(matchesMinerBalance(miner(10, 20), 'overdue-31-60')).toBe(false);
    expect(matchesMinerBalance(miner(10, null), 'overdue-0-30')).toBe(false);
    expect(matchesMinerBalance(miner(10, 91), 'overdue-over-90')).toBe(true);
  });

  it('credit: a Miner holding at least one whole ISK of credit', () => {
    expect(matchesMinerBalance(miner(0, null, 1), 'credit')).toBe(true);
    expect(matchesMinerBalance(miner(0, null, 0.4), 'credit')).toBe(false);
  });
});
