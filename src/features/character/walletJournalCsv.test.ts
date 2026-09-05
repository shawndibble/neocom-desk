import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { walletJournalCsvColumns } from './walletJournalCsv';

const t = (k: string) => k;

function entry(overrides: Partial<WalletJournalEntry> = {}): WalletJournalEntry {
  return {
    id: 1,
    date: '2026-08-29T12:00:00Z',
    ref_type: 'contract_price_payment_corp',
    description: 'Contract Payment',
    amount: 1000,
    balance: 5000,
    ...overrides,
  };
}

describe('walletJournalCsvColumns', () => {
  it('orders columns date, ref type, description, amount, balance, then the widened detail columns', () => {
    const columns = walletJournalCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'wallet.date',
      'wallet.refType',
      'wallet.description',
      'wallet.amount',
      'wallet.balanceCol',
      'wallet.tax',
      'wallet.reason',
      'wallet.contextId',
      'wallet.contextIdType',
      'wallet.firstPartyId',
      'wallet.secondPartyId',
    ]);
  });

  it('emits the widened columns blank when ESI omitted them', () => {
    const columns = walletJournalCsvColumns(t);
    const row = entry({
      tax: undefined,
      reason: undefined,
      context_id: undefined,
      context_id_type: undefined,
      first_party_id: undefined,
      second_party_id: undefined,
    });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields.slice(5)).toEqual(['', '', '', '', '', '']);
  });

  it('passes tax, reason, context id/type, and party ids through when present', () => {
    const columns = walletJournalCsvColumns(t);
    const row = entry({
      tax: 12.5,
      reason: 'Contract collateral',
      context_id: 555,
      context_id_type: 'contract_id',
      first_party_id: 1001,
      second_party_id: 2002,
    });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields.slice(5)).toEqual([
      '12.5',
      'Contract collateral',
      '555',
      'contract_id',
      '1001',
      '2002',
    ]);
  });

  it('passes date through unchanged as a raw ISO string', () => {
    const columns = walletJournalCsvColumns(t);
    const dateColumn = columns.find((c) => c.header === 'wallet.date')!;
    expect(dateColumn.value(entry({ date: '2026-08-29T12:00:00Z' }))).toBe('2026-08-29T12:00:00Z');
  });

  it('humanizes ref_type', () => {
    const columns = walletJournalCsvColumns(t);
    const refTypeColumn = columns.find((c) => c.header === 'wallet.refType')!;
    expect(refTypeColumn.value(entry({ ref_type: 'contract_price_payment_corp' }))).toBe(
      'Contract price payment corp'
    );
  });

  it('emits a blank cell for a missing amount or balance, never a string', () => {
    const columns = walletJournalCsvColumns(t);
    const row = entry({ amount: undefined, balance: undefined });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[3]).toBe('');
    expect(fields[4]).toBe('');
  });

  it('emits 0 (not blank) for an amount or balance that is exactly 0', () => {
    const columns = walletJournalCsvColumns(t);
    const row = entry({ amount: 0, balance: 0 });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[3]).toBe('0');
    expect(fields[4]).toBe('0');
  });
});
