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

  // ESI's real transaction_tax lines carry no context, and a sale's
  // journal_ref_id names neither its market_transaction line nor its tax line.
  describe('with a bare journal, as ESI sends it', () => {
    const at = '2026-01-02T00:00:00Z';
    const proceeds = (id: number, amount = 600): WalletJournalEntry => ({
      id,
      date: at,
      ref_type: 'market_transaction',
      description: '',
      amount,
    });
    const bareTax = (id: number, amount: number): WalletJournalEntry => ({
      id,
      date: at,
      ref_type: 'transaction_tax',
      description: '',
      amount,
    });

    it('pairs a sale with the tax line that follows its proceeds line of the same amount', () => {
      const margins = transactionMargins([BUY, SALE], [proceeds(500), bareTax(501, -25.2)]);
      expect(margins.get(2)).toEqual({ unitCost: 100, salesTax: 25.2, margin: 600 - 400 - 25.2 });
    });

    it('keeps two same-priced sales at one timestamp from taking the same tax line', () => {
      const twin = { ...SALE, transaction_id: 3, journal_ref_id: 13 };
      const buys = { ...BUY, quantity: 8 };
      const { margins } = transactionMarginReport(
        [buys, SALE, twin],
        [proceeds(500), bareTax(501, -25.2), proceeds(502), bareTax(503, -25.2)]
      );
      expect(margins.get(2)?.salesTax).toBe(25.2);
      expect(margins.get(3)?.salesTax).toBe(25.2);
    });

    it('gives no margin when no proceeds line matches the sale amount', () => {
      const margins = transactionMargins([BUY, SALE], [proceeds(500, 999), bareTax(501, -41.9)]);
      expect(margins.has(2)).toBe(false);
    });

    it("leaves a sale without a tax when its own tax line is missing, never taking the next sale's", () => {
      const small = {
        ...SALE,
        transaction_id: 3,
        journal_ref_id: 13,
        quantity: 2,
        unit_price: 100,
      };
      const { margins } = transactionMarginReport(
        [BUY, SALE, small],
        // SALE's proceeds line has no tax line after it; `small`'s is complete.
        [proceeds(500), proceeds(502, 200), bareTax(503, -8.4)]
      );
      expect(margins.has(2)).toBe(false);
      expect(margins.get(3)?.salesTax).toBe(8.4);
    });

    it("ignores a buy's proceeds line of the same size", () => {
      const margins = transactionMargins([BUY, SALE], [proceeds(500, -600), bareTax(501, -25.2)]);
      expect(margins.has(2)).toBe(false);
    });

    it('pairs by the journal order for All characters too', () => {
      const { margins } = pooledTransactionMargins([
        {
          characterId: 1,
          name: 'A',
          transactions: [BUY, SALE],
          journal: [proceeds(500), bareTax(501, -25.2)],
        },
      ]);
      expect([...margins.values()].map((m) => m.salesTax)).toEqual([25.2]);
    });

    it('does not take a tax line from another timestamp', () => {
      const late = { ...bareTax(501, -25.2), date: '2026-01-03T00:00:00Z' };
      const margins = transactionMargins([BUY, SALE], [proceeds(500), late]);
      expect(margins.has(2)).toBe(false);
    });
  });
});
