import { describe, expect, it } from 'vitest';
import { runningAccountRecords } from './runningAccountRecords';
import type { BookView } from './bookView';

const view = () =>
  ({
    input: {
      now: '2026-11-05T12:00:00Z',
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
    internals: {
      byMiner: new Map([
        [
          'm1',
          {
            account: {
              paidThrough: '2026-11-02',
              owes: { amount: 300.6, days: 2, oldest: '2026-11-03' },
              closableThrough: (today: string) => (today === '2026-11-05' ? '2026-11-02' : null),
              owedDays: () => [
                { date: '2026-11-03', owed: 900, tax: 900 },
                { date: '2026-11-04', owed: 400, tax: 1000 },
              ],
            },
          },
        ],
        [
          'm2',
          {
            account: {
              paidThrough: null,
              owes: null,
              closableThrough: () => null,
              owedDays: () => [],
            },
          },
        ],
      ]),
    },
    miners: [
      { id: 'm1', owed: 300.6, credit: 0 },
      { id: 'm2', owed: 0, credit: 49.6 },
    ],
  }) as unknown as BookView;

describe('runningAccountRecords', () => {
  it('records each Miner’s account in whole ISK, with the net payments counted and the days still owed (oldest first, none held or settled)', () => {
    expect(runningAccountRecords(view())).toEqual([
      {
        minerId: 'm1',
        owed: 301,
        paid: 130,
        credit: 0,
        days: 2,
        oldest: '2026-11-03',
        paidThrough: '2026-11-02',
        unpaidDays: [
          { date: '2026-11-03', owed: 900, tax: 900 },
          { date: '2026-11-04', owed: 400, tax: 1000 },
        ],
        settledThrough: '2026-11-02',
      },
      { minerId: 'm2', owed: 0, paid: 0, credit: 50, days: 0, unpaidDays: [] },
    ]);
  });

  it('keeps only the Miner a scoped page read', () => {
    expect(runningAccountRecords(view(), 'm2').map((a) => a.minerId)).toEqual(['m2']);
  });
});
