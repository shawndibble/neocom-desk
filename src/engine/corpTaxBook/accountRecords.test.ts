import { describe, expect, it } from 'vitest';
import { accountRecords } from './accountRecords';
import type { BookView } from './bookView';

const view = (running: boolean) =>
  ({
    input: {
      ...(running ? { runningAccountFrom: '2026-11-01T00:00:00Z' } : {}),
      payments: [
        { id: 'p1', minerId: 'm1', characterId: 1, amount: 100.4, at: 'x', source: 'donation' },
        {
          id: 'p2',
          minerId: 'm1',
          characterId: 1,
          amount: 50,
          notTaxAmount: 20,
          at: 'x',
          source: 'donation',
        },
        { id: 'p3', characterId: 9, amount: 7, at: 'x', source: 'donation' },
      ],
    },
    miners: [
      {
        id: 'm1',
        owed: 300.6,
        account: {
          paidThrough: '2026-11-02',
          owes: { amount: 300.6, days: 2, oldest: '2026-11-03' },
        },
      },
      { id: 'm2', owed: 0, account: { paidThrough: null, owes: null } },
    ],
  }) as unknown as BookView;

describe('accountRecords', () => {
  it('records each Miner’s account in whole ISK, with the net payments counted', () => {
    expect(accountRecords(view(true))).toEqual([
      {
        minerId: 'm1',
        owed: 301,
        paid: 130,
        days: 2,
        oldest: '2026-11-03',
        paidThrough: '2026-11-02',
      },
      { minerId: 'm2', owed: 0, paid: 0, days: 0 },
    ]);
  });

  it('keeps only the Miner a scoped page read, and nothing on a calendar book', () => {
    expect(accountRecords(view(true), 'm2').map((a) => a.minerId)).toEqual(['m2']);
    expect(accountRecords(view(false))).toEqual([]);
  });
});
