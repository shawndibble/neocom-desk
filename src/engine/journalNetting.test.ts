import { describe, it, expect } from 'vitest';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';
import { PLEX_TYPE_ID } from './contracts/contractOffers';
import { classifyJournal, journalCoverage, type OwnedJournalEntry } from './journalNetting';

const A = 1001;
const B = 1002;
const C = 1003; // tracked, but its journal is missing
const CORP = 98000001;
const STRANGER = 2112345678;

function entry(over: Partial<OwnedJournalEntry> & { id: number }): OwnedJournalEntry {
  return {
    date: '2026-10-07T12:00:00Z',
    ref_type: 'player_donation',
    description: '',
    amount: 100,
    characterId: A,
    ...over,
  };
}

const loaded = new Set([A, B]);
const noLink = () => undefined;

describe('classifyJournal netting', () => {
  it('marks both sides of a donation between two tracked Characters internal', () => {
    const rows = classifyJournal(
      [
        entry({ id: 1, characterId: B, amount: 250, first_party_id: A, second_party_id: B }),
        entry({ id: 2, characterId: A, amount: -250, first_party_id: A, second_party_id: B }),
      ],
      { trackedIds: loaded, linkFor: noLink }
    );
    expect(rows.every((r) => r.internal)).toBe(true);
  });

  it('marks an internal contract payment', () => {
    const [row] = classifyJournal(
      [entry({ id: 3, ref_type: 'contract_price', first_party_id: A, second_party_id: B })],
      { trackedIds: loaded, linkFor: noLink }
    );
    expect(row.internal).toBe(true);
  });

  it('marks an internal market fill', () => {
    const [row] = classifyJournal(
      [entry({ id: 4, ref_type: 'market_transaction', first_party_id: B, second_party_id: A })],
      { trackedIds: loaded, linkFor: noLink }
    );
    expect(row.internal).toBe(true);
  });

  it('leaves a transfer with a non-tracked party counted', () => {
    const [row] = classifyJournal(
      [entry({ id: 5, first_party_id: A, second_party_id: STRANGER })],
      {
        trackedIds: loaded,
        linkFor: noLink,
      }
    );
    expect(row.internal).toBeFalsy();
  });

  it('does not net a corporation wallet withdrawal', () => {
    const [row] = classifyJournal(
      [
        entry({
          id: 6,
          ref_type: 'corporation_account_withdrawal',
          first_party_id: CORP,
          second_party_id: A,
        }),
      ],
      { trackedIds: loaded, linkFor: noLink }
    );
    expect(row.internal).toBeFalsy();
  });

  it('keeps counting transfers to a Character whose journal is missing', () => {
    const [row] = classifyJournal([entry({ id: 7, first_party_id: A, second_party_id: C })], {
      trackedIds: loaded,
      linkFor: noLink,
    });
    expect(row.internal).toBeFalsy();
  });

  it('never nets an entry with a missing party', () => {
    const [row] = classifyJournal([entry({ id: 8, first_party_id: A })], {
      trackedIds: loaded,
      linkFor: noLink,
    });
    expect(row.internal).toBeFalsy();
  });
});

describe('classifyJournal PLEX', () => {
  const fill = (over: Partial<WalletTransactionCommon>): WalletTransactionCommon => ({
    transaction_id: 900,
    date: '2026-10-07T12:00:00Z',
    location_id: 60003760,
    type_id: PLEX_TYPE_ID,
    unit_price: 4_000_000,
    quantity: 10,
    client_id: 0,
    is_buy: true,
    journal_ref_id: 10,
    ...over,
  });
  const linkOf = (txn: WalletTransactionCommon) => (e: WalletJournalEntry) =>
    e.id === txn.journal_ref_id ? txn : undefined;

  it('files a PLEX buy under plex_bought', () => {
    const [row] = classifyJournal(
      [entry({ id: 10, ref_type: 'market_transaction', amount: -40_000_000 })],
      { trackedIds: loaded, linkFor: linkOf(fill({})) }
    );
    expect(row.refKey).toBe('plex_bought');
    expect(row.ref_type).toBe('market_transaction');
  });

  it('files a PLEX sell under plex_sold', () => {
    const [row] = classifyJournal([entry({ id: 10, ref_type: 'market_transaction' })], {
      trackedIds: loaded,
      linkFor: linkOf(fill({ is_buy: false })),
    });
    expect(row.refKey).toBe('plex_sold');
  });

  it('leaves a fill of another type as the plain ref type', () => {
    const [row] = classifyJournal([entry({ id: 10, ref_type: 'market_transaction' })], {
      trackedIds: loaded,
      linkFor: linkOf(fill({ type_id: 587 })),
    });
    expect(row.refKey).toBeUndefined();
  });

  it('shows no PLEX row when the join fails', () => {
    const [row] = classifyJournal([entry({ id: 10, ref_type: 'market_transaction' })], {
      trackedIds: loaded,
      linkFor: noLink,
    });
    expect(row.refKey).toBeUndefined();
  });

  it('ignores a PLEX link on a non-market line such as its tax', () => {
    const [row] = classifyJournal([entry({ id: 10, ref_type: 'transaction_tax' })], {
      trackedIds: loaded,
      linkFor: linkOf(fill({})),
    });
    expect(row.refKey).toBeUndefined();
  });
});

describe('journalCoverage', () => {
  it('names the Characters that are tracked but not loaded', () => {
    const cov = journalCoverage(
      [
        { characterId: A, name: 'Alpha' },
        { characterId: B, name: 'Beta' },
        { characterId: C, name: 'Gamma' },
      ],
      new Set([A, B])
    );
    expect(cov).toEqual({ loaded: 2, total: 3, missing: [{ characterId: C, name: 'Gamma' }] });
  });
});

describe('classifyJournal Journal Party', () => {
  const base = {
    id: 1,
    date: '2026-08-02T12:00:00Z',
    ref_type: 'player_donation',
    description: '',
  };
  const none = () => undefined;

  it('is the side that is not the Character, whichever slot it sits in', () => {
    const rows = classifyJournal(
      [
        { ...base, id: 1, amount: 10, first_party_id: 50, second_party_id: 1 },
        { ...base, id: 2, amount: -10, first_party_id: 1, second_party_id: 60 },
      ],
      { trackedIds: new Set([1]), linkFor: none, defaultCharacterId: 1 }
    );
    expect(rows.map((r) => r.partyId)).toEqual([50, 60]);
  });

  it('uses the line own characterId over the default, and none for an own-Character transfer', () => {
    const rows = classifyJournal(
      [
        { ...base, id: 1, amount: 10, first_party_id: 50, second_party_id: 2, characterId: 2 },
        { ...base, id: 2, amount: 10, first_party_id: 1, second_party_id: 2, characterId: 2 },
      ],
      { trackedIds: new Set([1, 2]), linkFor: none, defaultCharacterId: 1 }
    );
    expect(rows[0].partyId).toBe(50);
    expect(rows[1].internal).toBe(true);
    expect(rows[1].partyId).toBeUndefined();
  });
});
