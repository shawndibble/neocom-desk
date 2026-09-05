import { describe, it, expect } from 'vitest';
import type { WalletJournalEntry } from '@/esi/endpoints';
import {
  EMPTY_WALLET_JOURNAL_FILTER,
  activeWalletJournalFilterCount,
  filterWalletJournal,
  journalRefTypes,
  type WalletJournalFilter,
} from './walletJournalFilter';

function entry(overrides: Partial<WalletJournalEntry> = {}): WalletJournalEntry {
  return {
    id: 1,
    date: '2026-08-02T12:00:00Z',
    ref_type: 'bounty_prize',
    description: 'Bounty',
    amount: 1000,
    balance: 5000,
    ...overrides,
  };
}

describe('filterWalletJournal', () => {
  it('returns every row unchanged when the filter is empty', () => {
    const rows = [entry({ id: 1 }), entry({ id: 2 })];
    expect(filterWalletJournal(rows, EMPTY_WALLET_JOURNAL_FILTER)).toEqual(rows);
  });

  it('keeps only rows matching the selected ref type', () => {
    const rows = [
      entry({ id: 1, ref_type: 'bounty_prize' }),
      entry({ id: 2, ref_type: 'player_donation' }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, refType: 'bounty_prize' };
    expect(filterWalletJournal(rows, filter).map((r) => r.id)).toEqual([1]);
  });

  it('keeps rows on or after startDate', () => {
    const rows = [
      entry({ id: 1, date: '2026-08-01T00:00:00Z' }),
      entry({ id: 2, date: '2026-08-03T00:00:00Z' }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, startDate: '2026-08-02' };
    expect(filterWalletJournal(rows, filter).map((r) => r.id)).toEqual([2]);
  });

  it('keeps rows on or before endDate', () => {
    const rows = [
      entry({ id: 1, date: '2026-08-01T00:00:00Z' }),
      entry({ id: 2, date: '2026-08-03T00:00:00Z' }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, endDate: '2026-08-02' };
    expect(filterWalletJournal(rows, filter).map((r) => r.id)).toEqual([1]);
  });

  it('matches free text against the description, case-insensitively', () => {
    const rows = [
      entry({ id: 1, description: 'Bounty prize payout' }),
      entry({ id: 2, description: 'Contract collateral' }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, text: 'BOUNTY' };
    expect(filterWalletJournal(rows, filter).map((r) => r.id)).toEqual([1]);
  });

  it('combines every active criterion with AND', () => {
    const rows = [
      entry({ id: 1, ref_type: 'bounty_prize', date: '2026-08-01T00:00:00Z', description: 'x' }),
      entry({ id: 2, ref_type: 'bounty_prize', date: '2026-08-05T00:00:00Z', description: 'x' }),
      entry({ id: 3, ref_type: 'player_donation', date: '2026-08-05T00:00:00Z', description: 'x' }),
    ];
    const filter: WalletJournalFilter = {
      refType: 'bounty_prize',
      startDate: '2026-08-02',
      endDate: null,
      text: 'x',
    };
    expect(filterWalletJournal(rows, filter).map((r) => r.id)).toEqual([2]);
  });
});

describe('journalRefTypes', () => {
  it('returns the distinct ref_type values present, sorted', () => {
    const rows = [
      entry({ ref_type: 'player_donation' }),
      entry({ ref_type: 'bounty_prize' }),
      entry({ ref_type: 'bounty_prize' }),
    ];
    expect(journalRefTypes(rows)).toEqual(['bounty_prize', 'player_donation']);
  });

  it('returns an empty array for no rows', () => {
    expect(journalRefTypes([])).toEqual([]);
  });
});

describe('activeWalletJournalFilterCount', () => {
  it('is zero for the identity filter', () => {
    expect(activeWalletJournalFilterCount(EMPTY_WALLET_JOURNAL_FILTER)).toBe(0);
  });

  it('counts each active criterion', () => {
    expect(
      activeWalletJournalFilterCount({
        refType: 'bounty_prizes',
        startDate: '2026-01-01',
        endDate: null,
        text: '',
      })
    ).toBe(2);
  });

  it('ignores the search text, which stays in the row rather than the sheet', () => {
    expect(
      activeWalletJournalFilterCount({ ...EMPTY_WALLET_JOURNAL_FILTER, text: 'concord' })
    ).toBe(0);
  });
});
