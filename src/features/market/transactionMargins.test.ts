import { describe, expect, it } from 'vitest';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import {
  pooledTransactionMargins,
  transactionMarginReport,
  transactionMargins,
} from './transactionMargins';

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

describe('transactionMarginReport', () => {
  it('says a covered sale with no tax line in the journal has no sales tax line found', () => {
    const { margins, gaps } = transactionMarginReport([BUY, SALE], []);
    expect(margins.has(2)).toBe(false);
    expect(gaps.get(2)).toBe('noTax');
  });

  it('says a sale with no wallet buy behind it is not covered by one', () => {
    const { gaps } = transactionMarginReport([SALE], [taxLine({ context_id: 2 })]);
    expect(gaps.get(2)).toBe('noBuy');
  });
});

describe('pooledTransactionMargins', () => {
  it("prices a main's sale against an alt's buy, keeping each journal to its own Character", () => {
    // Same ids on both wallets: renumbering keeps them apart.
    const altBuy = fill({ transaction_id: 1, journal_ref_id: 11 });
    const mainSale = fill({ ...SALE, transaction_id: 1, journal_ref_id: 12 });
    const { rows, margins } = pooledTransactionMargins([
      { characterId: 10, name: 'Alt', transactions: [altBuy], journal: [] },
      {
        characterId: 20,
        name: 'Main',
        transactions: [mainSale],
        journal: [taxLine({ id: 901, context_id: 1 })],
      },
    ]);
    const sale = rows.find((r) => !r.is_buy);
    expect(sale?.characterName).toBe('Main');
    expect(new Set(rows.map((r) => r.transaction_id)).size).toBe(2);
    expect(margins.get(sale!.transaction_id)?.margin).toBe(600 - 400 - 24);
  });

  it('leaves the same sale without a margin in its own single view', () => {
    const mainSale = fill({ ...SALE, transaction_id: 1 });
    expect(transactionMargins([mainSale], [taxLine({ context_id: 1 })]).size).toBe(0);
  });
});

describe('pooledTransactionMargins gaps', () => {
  it("keys a pooled sale's gap by its renumbered id", () => {
    const mainSale = fill({ ...SALE, transaction_id: 1, journal_ref_id: 12 });
    const { rows, gaps } = pooledTransactionMargins([
      { characterId: 20, name: 'Main', transactions: [mainSale], journal: [] },
    ]);
    expect(gaps.get(rows[0].transaction_id)).toBe('noBuy');
  });
});
