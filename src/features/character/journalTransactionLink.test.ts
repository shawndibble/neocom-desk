import { describe, expect, it } from 'vitest';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';
import { journalTransactionLinks } from './journalTransactionLink';

function txn(overrides: Partial<WalletTransactionCommon>): WalletTransactionCommon {
  return {
    transaction_id: 1,
    date: '2026-09-20T12:00:00Z',
    location_id: 60003760,
    type_id: 34,
    unit_price: 5,
    quantity: 100,
    client_id: 9000,
    is_buy: true,
    journal_ref_id: 500,
    ...overrides,
  };
}

function entry(overrides: Partial<WalletJournalEntry>): WalletJournalEntry {
  return {
    id: 500,
    date: '2026-09-20T12:00:00Z',
    ref_type: 'market_transaction',
    description: 'Market: Pilot bought stuff',
    ...overrides,
  };
}

describe('journalTransactionLinks', () => {
  it('links a journal entry to the transaction whose journal_ref_id names it', () => {
    const fill = txn({ transaction_id: 7, journal_ref_id: 500 });
    const linkFor = journalTransactionLinks([fill]);
    expect(linkFor(entry({ id: 500 }))).toBe(fill);
  });

  it('links an entry whose context is a market transaction id, whatever its ref type', () => {
    const fill = txn({ transaction_id: 7, journal_ref_id: 500 });
    const linkFor = journalTransactionLinks([fill]);
    const tax = entry({
      id: 501,
      ref_type: 'transaction_tax',
      context_id: 7,
      context_id_type: 'market_transaction_id',
    });
    expect(linkFor(tax)).toBe(fill);
  });

  it('ignores a context id of another kind that happens to equal a transaction id', () => {
    const linkFor = journalTransactionLinks([txn({ transaction_id: 7, journal_ref_id: 500 })]);
    const contract = entry({
      id: 502,
      ref_type: 'contract_price',
      context_id: 7,
      context_id_type: 'contract_id',
    });
    expect(linkFor(contract)).toBeUndefined();
  });

  it('returns undefined for an entry with no fill loaded — older than the transaction page cap', () => {
    const linkFor = journalTransactionLinks([txn({ journal_ref_id: 500 })]);
    expect(linkFor(entry({ id: 1 }))).toBeUndefined();
  });

  it('returns undefined for everything when no transactions are loaded', () => {
    expect(journalTransactionLinks([])(entry({}))).toBeUndefined();
  });
});
