import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';
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
      'wallet.journalBetweenMarker',
      'wallet.dailyGoal',
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
    expect(fields.slice(5, 11)).toEqual(['', '', '', '', '', '']);
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
    expect(fields.slice(5, 11)).toEqual([
      '12.5',
      '"Contract collateral"',
      '555',
      '"contract_id"',
      '1001',
      '2002',
    ]);
  });

  it('passes date through unchanged as a raw ISO string', () => {
    const columns = walletJournalCsvColumns(t);
    const dateColumn = columns.find((c) => c.header === 'wallet.date')!;
    expect(dateColumn.value(entry({ date: '2026-08-29T12:00:00Z' }))).toBe('2026-08-29T12:00:00Z');
  });

  it('writes the date as a bare UTC timestamp a spreadsheet reads as a date', () => {
    const csv = toCsv([entry({ date: '2026-09-28T03:32:04Z' })], walletJournalCsvColumns(t));
    expect(csv.split('\r\n')[1].split(',')[0]).toBe('2026-09-28 03:32:04');
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

  it('exports PLEX rows under the same names the table shows', () => {
    const csv = toCsv(
      [{ ...entry({ ref_type: 'market_transaction' }), refKey: 'plex_bought' }],
      walletJournalCsvColumns(t)
    );
    expect(csv.split('\r\n')[1].split(',')[1]).toBe('"wallet.refTypePlexBought"');
  });

  it('adds a Character column after the date in the multi-Character view', () => {
    const columns = walletJournalCsvColumns(t, (id) => `Pilot ${id}`);
    expect(columns.slice(0, 3).map((c) => c.header)).toEqual([
      'wallet.date',
      'wallet.balanceCharacterColumn',
      'wallet.refType',
    ]);
    const csv = toCsv([{ ...entry(), characterId: 7 }], columns);
    expect(csv.split('\r\n')[1].split(',')[1]).toBe('"Pilot 7"');
  });

  it("flags a line between the pilot's own Characters", () => {
    const column = walletJournalCsvColumns(t).find(
      (c) => c.header === 'wallet.journalBetweenMarker'
    )!;
    expect(column.value({ ...entry(), internal: true })).toBe('wallet.csvYes');
    expect(column.value(entry())).toBe('wallet.csvNo');
  });

  it("names a daily goal payout's goal, falling back to the plain label", () => {
    const column = walletJournalCsvColumns(t).find((c) => c.header === 'wallet.dailyGoal')!;
    const goal = entry({ ref_type: 'daily_goal_payouts', reason: '1004953' });
    // The test translator echoes its key, so an unnamed goal reads as the key.
    expect(column.value(goal)).toBe('wallet.dailyGoalNames.1004953');
    expect(column.value(entry())).toBeNull();
  });

  it('carries the linked market fill: item, side, quantity and unit price', () => {
    const fill = {
      transaction_id: 9,
      date: '2026-08-29T12:00:00Z',
      type_id: 34,
      is_buy: false,
      quantity: 12,
      unit_price: 5.5,
    } as WalletTransactionCommon;
    const columns = walletJournalCsvColumns(t, undefined, undefined, {
      linkFor: (line) => (line.id === 1 ? fill : undefined),
      nameFor: () => 'Tritanium',
    });
    const values = (row: WalletJournalEntry) =>
      Object.fromEntries(columns.map((c) => [c.header + '#' + columns.indexOf(c), c.value(row)]));
    const linked = Object.values(values(entry({ id: 1 })));
    expect(linked.slice(-4)).toEqual(['Tritanium', 'wallet.sell', 12, 5.5]);
    expect(Object.values(values(entry({ id: 2 }))).slice(-4)).toEqual([null, null, null, null]);
  });
});
