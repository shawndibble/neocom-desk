import { describe, it, expect } from 'vitest';
import type { WalletJournalEntry } from '@/esi/endpoints';
import {
  EMPTY_WALLET_JOURNAL_FILTER,
  activeWalletJournalFilterCount,
  filterWalletJournal,
  journalPartyBreakdown,
  toggleBreakdownParty,
  journalRefTypeBreakdown,
  toggleBreakdownRefType,
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

  it('keeps only rows for the selected player', () => {
    const rows = [
      { ...entry({ id: 1 }), playerId: 5 },
      { ...entry({ id: 2 }), playerId: 7 },
      entry({ id: 3 }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, player: '7' };
    expect(filterWalletJournal(rows, filter).map((r) => r.id)).toEqual([2]);
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

  it('matches free text against the reason too, case-insensitively', () => {
    const rows = [
      entry({ id: 1, description: 'Tax', reason: 'moon tax Aug' }),
      entry({ id: 2, description: 'Tax', reason: 'office rental' }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, text: 'MOON TAX' };
    expect(filterWalletJournal(rows, filter).map((r) => r.id)).toEqual([1]);
  });

  it("does not match a bounty line's raw kill list, which the journal never shows", () => {
    const rows = [
      entry({ id: 1, ref_type: 'bounty_prizes', description: 'Bounty prizes', reason: '17039: 2' }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, text: '17039' };
    expect(filterWalletJournal(rows, filter)).toEqual([]);
  });

  it("does not match a daily goal line's raw message id, which the journal shows as the goal's name", () => {
    const rows = [
      entry({ id: 1, ref_type: 'daily_goal_payouts', description: '-', reason: '697658' }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, text: '697658' };
    expect(filterWalletJournal(rows, filter)).toEqual([]);
  });

  it('matches free text against the description the journal shows, when given one', () => {
    const rows = [
      entry({ id: 1, ref_type: 'daily_goal_payouts', description: '-', reason: '1004953' }),
    ];
    const filter: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, text: 'jumps' };
    expect(filterWalletJournal(rows, filter, () => 'Complete 3 Jumps').map((e) => e.id)).toEqual([
      1,
    ]);
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
      player: null,
      party: null,
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
        player: null,
        party: null,
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

describe('journalRefTypeBreakdown', () => {
  it('is all zero for an empty journal', () => {
    expect(journalRefTypeBreakdown([])).toEqual({
      totalIn: 0,
      totalOut: 0,
      net: 0,
      rows: [],
      internalCount: 0,
    });
  });

  it('splits income and expense per ref type and sums the totals', () => {
    const result = journalRefTypeBreakdown([
      entry({ id: 1, ref_type: 'market_transaction', amount: 500 }),
      entry({ id: 2, ref_type: 'market_transaction', amount: -200 }),
      entry({ id: 3, ref_type: 'bounty_prize', amount: 100 }),
      entry({ id: 4, ref_type: 'broker_fee', amount: -50 }),
    ]);
    expect(result.totalIn).toBe(600);
    expect(result.totalOut).toBe(250);
    expect(result.net).toBe(350);
    expect(result.rows.find((r) => r.refType === 'market_transaction')).toEqual({
      refType: 'market_transaction',
      income: 500,
      expense: 200,
      net: 300,
      count: 2,
    });
  });

  it('sorts by absolute net, largest first, ties by ref type', () => {
    const result = journalRefTypeBreakdown([
      entry({ id: 1, ref_type: 'b', amount: 10 }),
      entry({ id: 2, ref_type: 'a', amount: -10 }),
      entry({ id: 3, ref_type: 'c', amount: -500 }),
    ]);
    expect(result.rows.map((r) => r.refType)).toEqual(['c', 'a', 'b']);
  });

  it('counts a missing amount as zero', () => {
    const result = journalRefTypeBreakdown([entry({ amount: undefined })]);
    expect(result.net).toBe(0);
    expect(result.rows[0].net).toBe(0);
  });
});

describe('toggleBreakdownRefType', () => {
  it('sets the ref type, keeping the other criteria', () => {
    const f: WalletJournalFilter = {
      ...EMPTY_WALLET_JOURNAL_FILTER,
      text: 'x',
      startDate: '2026-01-01',
    };
    expect(toggleBreakdownRefType(f, 'tax')).toEqual({ ...f, refType: 'tax' });
  });

  it('clears it when already active', () => {
    const f: WalletJournalFilter = { ...EMPTY_WALLET_JOURNAL_FILTER, refType: 'tax' };
    expect(toggleBreakdownRefType(f, 'tax').refType).toBeNull();
  });
});

describe('journalRefTypeBreakdown netting', () => {
  it('leaves internal lines out of every figure and counts them', () => {
    const result = journalRefTypeBreakdown([
      {
        id: 1,
        date: '2026-10-01T00:00:00Z',
        ref_type: 'bounty_prize',
        amount: 100,
        description: '',
      },
      {
        id: 2,
        date: '2026-10-01T00:00:00Z',
        ref_type: 'player_donation',
        amount: 250,
        description: '',
        internal: true,
      },
    ]);
    expect(result).toMatchObject({ totalIn: 100, totalOut: 0, net: 100, internalCount: 1 });
    expect(result.rows.map((r) => r.refType)).toEqual(['bounty_prize']);
  });

  it('groups a PLEX line under its own key', () => {
    const result = journalRefTypeBreakdown([
      {
        id: 1,
        date: '2026-10-01T00:00:00Z',
        ref_type: 'market_transaction',
        amount: -5,
        description: '',
        refKey: 'plex_bought',
      },
    ]);
    expect(result.rows[0].refType).toBe('plex_bought');
  });
});

describe('party filter and breakdown', () => {
  const rows = [
    { ...entry({ id: 1, amount: 100 }), partyId: 7 },
    { ...entry({ id: 2, amount: -30 }), partyId: 7 },
    { ...entry({ id: 3, amount: 500 }), partyId: 9 },
    { ...entry({ id: 4, amount: 20, ref_type: 'market_transaction' }), partyId: 11 },
    { ...entry({ id: 5, amount: -25, ref_type: 'market_transaction' }), partyId: 12 },
    { ...entry({ id: 6, amount: 900 }), partyId: 7, internal: true },
    { ...entry({ id: 7, amount: 5 }) },
  ];

  it('filters to one party', () => {
    const out = filterWalletJournal(rows, { ...EMPTY_WALLET_JOURNAL_FILTER, party: '7' });
    expect(out.map((r) => r.id)).toEqual([1, 2, 6]);
  });

  it('counts the party as an active criterion', () => {
    expect(activeWalletJournalFilterCount({ ...EMPTY_WALLET_JOURNAL_FILTER, party: '7' })).toBe(1);
  });

  it('rolls up In / Out / Net per party, groups market fills, skips internal and party-less lines', () => {
    expect(journalPartyBreakdown(rows)).toEqual([
      { key: '9', partyId: 9, income: 500, expense: 0, net: 500, count: 1 },
      { key: '7', partyId: 7, income: 100, expense: 30, net: 70, count: 2 },
      { key: 'market', partyId: null, income: 20, expense: 25, net: -5, count: 2 },
    ]);
  });

  it('toggles the party filter', () => {
    const on = toggleBreakdownParty(EMPTY_WALLET_JOURNAL_FILTER, 7);
    expect(on.party).toBe('7');
    expect(toggleBreakdownParty(on, 7).party).toBeNull();
  });
});
