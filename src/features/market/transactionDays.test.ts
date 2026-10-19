import { describe, expect, it } from 'vitest';
import { summarizeTransactions } from './transactionDays';

const txn = (id: number, date: string, isBuy: boolean, qty: number, unit: number) => ({
  transaction_id: id,
  date,
  is_buy: isBuy,
  quantity: qty,
  unit_price: unit,
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
