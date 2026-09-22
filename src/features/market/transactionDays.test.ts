import { describe, expect, it } from 'vitest';
import { groupTransactionsByDay, summarizeTransactions } from './transactionDays';

const txn = (id: number, date: string, isBuy: boolean, qty: number, unit: number) => ({
  transaction_id: id,
  date,
  is_buy: isBuy,
  quantity: qty,
  unit_price: unit,
});

describe('groupTransactionsByDay', () => {
  it('buckets by calendar day in the given zone, keeping input order within and across days', () => {
    const rows = [
      txn(1, '2026-09-20T13:27:00Z', false, 2, 70_970),
      txn(2, '2026-09-20T02:20:00Z', false, 1, 9_988),
      txn(3, '2026-09-19T18:21:00Z', false, 1, 5_900),
    ];
    const days = groupTransactionsByDay(rows, 'UTC');
    expect(days.map((d) => d.dayKey)).toEqual(['2026-09-20', '2026-09-19']);
    expect(days[0].rows.map((r) => r.transaction_id)).toEqual([1, 2]);
    expect(days[1].rows.map((r) => r.transaction_id)).toEqual([3]);
  });

  it('nets each day: sells add, buys subtract', () => {
    const days = groupTransactionsByDay(
      [txn(1, '2026-09-20T10:00:00Z', false, 2, 100), txn(2, '2026-09-20T09:00:00Z', true, 1, 50)],
      'UTC'
    );
    expect(days[0].net).toBe(150);
  });

  it('reads the day in the viewer zone, not UTC', () => {
    // 02:20 UTC on the 20th is still the 19th in New York.
    const days = groupTransactionsByDay(
      [txn(1, '2026-09-20T02:20:00Z', false, 1, 1)],
      'America/New_York'
    );
    expect(days[0].dayKey).toBe('2026-09-19');
  });

  it('starts a new group when a day recurs out of order rather than merging it', () => {
    const days = groupTransactionsByDay(
      [
        txn(1, '2026-09-20T10:00:00Z', false, 1, 1),
        txn(2, '2026-09-19T10:00:00Z', false, 1, 1),
        txn(3, '2026-09-20T09:00:00Z', false, 1, 1),
      ],
      'UTC'
    );
    expect(days.map((d) => d.dayKey)).toEqual(['2026-09-20', '2026-09-19', '2026-09-20']);
  });

  it('returns nothing for no rows', () => {
    expect(groupTransactionsByDay([], 'UTC')).toEqual([]);
  });
});

describe('summarizeTransactions', () => {
  it('splits sold and bought ISK and nets them', () => {
    const summary = summarizeTransactions([
      txn(1, '2026-09-20T10:00:00Z', false, 2, 70_970),
      txn(2, '2026-09-19T10:00:00Z', true, 3, 1_000),
    ]);
    expect(summary).toEqual({
      sold: 141_940,
      bought: 3_000,
      net: 138_940,
      oldest: '2026-09-19T10:00:00Z',
      newest: '2026-09-20T10:00:00Z',
    });
  });

  it('has no range for no rows', () => {
    expect(summarizeTransactions([])).toEqual({
      sold: 0,
      bought: 0,
      net: 0,
      oldest: null,
      newest: null,
    });
  });
});
