import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { WalletTransaction } from '@/esi/endpoints';
import {
  marginPercentOf,
  transactionTotal,
  walletTransactionsCsvColumns,
} from './walletTransactionsCsv';

const t = (k: string) => k;
const nameFor = (typeId: number) => `Item ${typeId}`;

function txn(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    transaction_id: 1,
    date: '2026-08-29T12:00:00Z',
    location_id: 60003760,
    type_id: 100,
    unit_price: 10,
    quantity: 5,
    client_id: 999,
    is_buy: true,
    is_personal: true,
    journal_ref_id: 1,
    ...overrides,
  };
}

describe('transactionTotal', () => {
  it('is negative for a buy (money out)', () => {
    expect(transactionTotal(txn({ is_buy: true, unit_price: 10, quantity: 5 }))).toBe(-50);
  });

  it('is positive for a sell (money in)', () => {
    expect(transactionTotal(txn({ is_buy: false, unit_price: 10, quantity: 5 }))).toBe(50);
  });
});

describe('walletTransactionsCsvColumns', () => {
  it('orders columns date, item, side, quantity, unit price, total using the wallet DataTable headers', () => {
    const columns = walletTransactionsCsvColumns(t, nameFor);
    expect(columns.map((c) => c.header)).toEqual([
      'wallet.date',
      'wallet.item',
      'wallet.side',
      'wallet.quantity',
      'wallet.unitPrice',
      'wallet.total',
    ]);
  });

  it('resolves the item name via nameFor', () => {
    const columns = walletTransactionsCsvColumns(t, nameFor);
    const itemColumn = columns.find((c) => c.header === 'wallet.item')!;
    expect(itemColumn.value(txn({ type_id: 555 }))).toBe('Item 555');
  });

  it('translates side through wallet.buy / wallet.sell', () => {
    const columns = walletTransactionsCsvColumns(t, nameFor);
    const sideColumn = columns.find((c) => c.header === 'wallet.side')!;
    expect(sideColumn.value(txn({ is_buy: true }))).toBe('wallet.buy');
    expect(sideColumn.value(txn({ is_buy: false }))).toBe('wallet.sell');
  });

  it('emits raw numbers for quantity, unit price, and total', () => {
    const columns = walletTransactionsCsvColumns(t, nameFor);
    const row = txn({ unit_price: 12.5, quantity: 3, is_buy: false });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[3]).toBe('3');
    expect(fields[4]).toBe('12.5');
    expect(fields[5]).toBe('37.5');
  });
});

describe('walletTransactionsCsvColumns extras', () => {
  const margins = {
    margins: new Map([[2, { unitCost: 8, salesTax: 1, margin: 9 }]]),
    gaps: new Map<number, 'noBuy' | 'outside' | 'noTax'>([[3, 'noBuy']]),
  };
  const columns = walletTransactionsCsvColumns(t, nameFor, {
    character: () => 'Alpha',
    location: (row) => `Station ${row.location_id}`,
    margins,
  });
  const at = (header: string, row: WalletTransaction) =>
    columns.find((c) => c.header === header)!.value(row);

  it('adds character, margin, margin %, unit cost, gap and location in table order', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'wallet.date',
      'wallet.character',
      'wallet.item',
      'wallet.side',
      'wallet.quantity',
      'wallet.unitPrice',
      'wallet.total',
      'wallet.margin',
      'wallet.marginPercent',
      'wallet.unitCost',
      'wallet.csvMarginGap',
      'wallet.location',
    ]);
  });

  it('exports a sale margin, percent and unit cost; blank on a buy or a sale with no margin', () => {
    const sale = txn({ transaction_id: 2, is_buy: false, quantity: 5 });
    expect(at('wallet.margin', sale)).toBe(9);
    expect(at('wallet.unitCost', sale)).toBe(8);
    expect(at('wallet.marginPercent', sale)).toBeCloseTo(22.5);
    expect(at('wallet.csvMarginGap', sale)).toBeNull();
    expect(at('wallet.margin', txn({ transaction_id: 2, is_buy: true }))).toBeNull();
    const gapSale = txn({ transaction_id: 3, is_buy: false });
    expect(at('wallet.margin', gapSale)).toBeNull();
    expect(at('wallet.csvMarginGap', gapSale)).toBe('wallet.marginGap.noBuy');
    expect(at('wallet.location', sale)).toBe('Station 60003760');
    expect(at('wallet.character', sale)).toBe('Alpha');
  });

  it('marginPercentOf is blank without a margin', () => {
    expect(marginPercentOf({ quantity: 1 }, undefined)).toBeNull();
  });
});
