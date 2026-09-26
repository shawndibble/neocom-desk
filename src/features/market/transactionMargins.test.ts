import { describe, expect, it } from 'vitest';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { transactionMargins } from './transactionMargins';

function fill(over: Partial<WalletTransaction>): WalletTransaction {
  return {
    transaction_id: 1,
    date: '2026-01-01T00:00:00Z',
    location_id: 1,
    type_id: 34,
    unit_price: 100,
    quantity: 10,
    client_id: 1,
    is_buy: true,
    journal_ref_id: 1,
    is_personal: true,
    ...over,
  };
}

function taxLine(over: Partial<WalletJournalEntry>): WalletJournalEntry {
  return {
    id: 900,
    date: '2026-01-02T00:00:00Z',
    ref_type: 'transaction_tax',
    description: '',
    amount: -24,
    context_id_type: 'market_transaction_id',
    ...over,
  };
}

const BUY = fill({ transaction_id: 1, journal_ref_id: 11 });
const SALE = fill({
  transaction_id: 2,
  journal_ref_id: 12,
  date: '2026-01-02T00:00:00Z',
  is_buy: false,
  quantity: 4,
  unit_price: 150,
});

describe('transactionMargins', () => {
  it("subtracts the sale's own transaction_tax line", () => {
    const margins = transactionMargins([BUY, SALE], [taxLine({ context_id: 2 })]);
    expect(margins.get(2)).toEqual({ unitCost: 100, salesTax: 24, margin: 600 - 400 - 24 });
  });

  it('gives no margin when the journal has no tax line for the sale', () => {
    const margins = transactionMargins(
      [BUY, SALE],
      [taxLine({ context_id: 2, ref_type: 'brokers_fee' }), taxLine({ context_id: 99 })]
    );
    expect(margins.has(2)).toBe(false);
  });
});
