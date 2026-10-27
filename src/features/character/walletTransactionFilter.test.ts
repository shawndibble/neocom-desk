import { describe, expect, it } from 'vitest';
import {
  EMPTY_WALLET_TRANSACTION_FILTER,
  activeWalletTransactionFilterCount,
  filterWalletTransactions,
  type WalletTransactionFilter,
} from './walletTransactionFilter';
import type { WalletTransactionCommon } from '@/esi/endpoints';

const txn = (
  transaction_id: number,
  date: string,
  type_id: number,
  is_buy: boolean
): WalletTransactionCommon => ({
  transaction_id,
  date,
  location_id: 60003760,
  type_id,
  unit_price: 100,
  quantity: 1,
  client_id: 90000001,
  is_buy,
  journal_ref_id: transaction_id,
});

const NAMES = new Map([
  [34, 'Tritanium'],
  [11399, 'Morphite'],
]);
const nameFor = (typeId: number) => NAMES.get(typeId) ?? `Type #${typeId}`;

const ROWS: WalletTransactionCommon[] = [
  txn(1, '2026-09-01T10:00:00Z', 34, true),
  txn(2, '2026-09-04T10:00:00Z', 11399, false),
  txn(3, '2026-09-07T10:00:00Z', 99999, false),
];

const filter = (patch: Partial<WalletTransactionFilter>): WalletTransactionFilter => ({
  ...EMPTY_WALLET_TRANSACTION_FILTER,
  ...patch,
});

const ids = (rows: readonly WalletTransactionCommon[]) => rows.map((row) => row.transaction_id);

describe('filterWalletTransactions', () => {
  it('passes everything through when nothing is set', () => {
    expect(filterWalletTransactions(ROWS, EMPTY_WALLET_TRANSACTION_FILTER, nameFor)).toEqual(ROWS);
  });

  it('keeps one side at a time', () => {
    expect(ids(filterWalletTransactions(ROWS, filter({ side: 'buy' }), nameFor))).toEqual([1]);
    expect(ids(filterWalletTransactions(ROWS, filter({ side: 'sell' }), nameFor))).toEqual([2, 3]);
  });

  it('treats both ends of the date range as inclusive', () => {
    expect(
      ids(
        filterWalletTransactions(
          ROWS,
          filter({ startDate: '2026-09-01', endDate: '2026-09-04' }),
          nameFor
        )
      )
    ).toEqual([1, 2]);
  });

  it('matches text against the item name', () => {
    expect(ids(filterWalletTransactions(ROWS, filter({ text: 'morph' }), nameFor))).toEqual([2]);
  });

  it('matches an unresolved name on the text the table draws for it', () => {
    // The whole point: the panel prints `Type #99999`, so searching for that
    // must find the row rather than silently dropping it.
    expect(ids(filterWalletTransactions(ROWS, filter({ text: '99999' }), nameFor))).toEqual([3]);
    expect(ids(filterWalletTransactions(ROWS, filter({ text: 'type #' }), nameFor))).toEqual([3]);
  });

  it('ignores surrounding space and case in the text', () => {
    expect(ids(filterWalletTransactions(ROWS, filter({ text: '  TRITANIUM ' }), nameFor))).toEqual([
      1,
    ]);
  });

  it('applies every set filter together', () => {
    expect(
      ids(
        filterWalletTransactions(
          ROWS,
          filter({ side: 'sell', startDate: '2026-09-05', text: 'type' }),
          nameFor
        )
      )
    ).toEqual([3]);
  });
});

describe('activeWalletTransactionFilterCount', () => {
  it('counts nothing for an empty filter', () => {
    expect(activeWalletTransactionFilterCount(EMPTY_WALLET_TRANSACTION_FILTER)).toBe(0);
  });

  it('counts side and each date end', () => {
    expect(
      activeWalletTransactionFilterCount(
        filter({ side: 'buy', startDate: '2026-09-01', endDate: '2026-09-04' })
      )
    ).toBe(3);
  });

  it('leaves the text out, because its box never hides', () => {
    expect(activeWalletTransactionFilterCount(filter({ text: 'tritanium' }))).toBe(0);
  });
});
