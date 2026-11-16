import { describe, expect, it } from 'vitest';
import { oldestOwedMs, payeesOwed, type OwedBalance } from './miningTaxPayees';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const DAY = 86_400_000;

const balance = (id: string, name: string, owed: number, ...daysAgo: number[]): OwedBalance => ({
  payee: { id, name },
  owed,
  members: daysAgo.map((d) => ({ assignment: { date: new Date(NOW - d * DAY).toISOString() } })),
});

describe('payeesOwed', () => {
  it('lists each owed Payee, the most owed first', () => {
    const owed = payeesOwed(
      [balance('p1', 'Corp Tax', 150, 3, 5), balance('p2', 'Alliance', 400, 1)],
      NOW
    );
    expect(owed).toEqual([
      { payeeId: 'p2', name: 'Alliance', unpaidIsk: 400, oldestDays: 1, entries: 1 },
      { payeeId: 'p1', name: 'Corp Tax', unpaidIsk: 150, oldestDays: 5, entries: 2 },
    ]);
  });

  it('leaves out a Payee owed nothing', () => {
    const owed = payeesOwed([balance('p1', 'Corp Tax', 0), balance('p2', 'Alliance', 10, 2)], NOW);
    expect(owed).toEqual([
      { payeeId: 'p2', name: 'Alliance', unpaidIsk: 10, oldestDays: 2, entries: 1 },
    ]);
  });

  it('counts its oldest day in whole days', () => {
    expect(payeesOwed([balance('p1', 'Corp Tax', 3, 2.9, 1)], NOW)[0]).toMatchObject({
      oldestDays: 2,
      entries: 2,
    });
  });
});

describe('oldestOwedMs', () => {
  it('is the oldest owed entry across Payees, null when nothing is owed', () => {
    expect(oldestOwedMs([balance('p1', 'A', 5, 1), balance('p2', 'B', 5, 4)])).toBe(NOW - 4 * DAY);
    expect(oldestOwedMs([balance('p1', 'A', 0, 9)])).toBeNull();
  });
});
