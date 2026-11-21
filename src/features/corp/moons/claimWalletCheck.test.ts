import { describe, expect, it } from 'vitest';
import type { WalletJournalEntry } from '@/esi/endpoints';
import {
  autoCredited,
  entryMatchesTransfer,
  findOwnEntry,
  oldestEntryDate,
  paidToOwn,
} from './claimWalletCheck';

const transfer = { amount: 10_000_000, at: '2026-11-10T12:00:00.000Z' };
const entry = (over: Partial<WalletJournalEntry> = {}): WalletJournalEntry => ({
  id: 1,
  date: '2026-11-10T12:30:00Z',
  ref_type: 'player_donation',
  description: '',
  amount: 10_000_000,
  first_party_id: 50,
  ...over,
});

describe('entryMatchesTransfer', () => {
  it('matches an incoming donation of the same amount from the member within 48 hours', () => {
    expect(entryMatchesTransfer(entry(), transfer, [50])).toBe(true);
    expect(entryMatchesTransfer(entry({ amount: 10_000_000.5 }), transfer, [50])).toBe(true);
    expect(entryMatchesTransfer(entry({ date: '2026-11-12T11:00:00Z' }), transfer, [50])).toBe(
      true
    );
  });
  it('rejects another amount, another sender, outgoing, another type, or too far apart', () => {
    expect(entryMatchesTransfer(entry({ amount: 10_000_001 }), transfer, [50])).toBe(false);
    expect(entryMatchesTransfer(entry({ first_party_id: 99 }), transfer, [50])).toBe(false);
    expect(entryMatchesTransfer(entry({ amount: -10_000_000 }), transfer, [50])).toBe(false);
    expect(entryMatchesTransfer(entry({ ref_type: 'market_escrow' }), transfer, [50])).toBe(false);
    expect(entryMatchesTransfer(entry({ date: '2026-11-13T00:00:00Z' }), transfer, [50])).toBe(
      false
    );
  });
  it('matches on amount and time alone when the sender is unknown', () => {
    expect(entryMatchesTransfer(entry({ first_party_id: 99 }), transfer, [])).toBe(true);
  });
});

describe('findOwnEntry / oldestEntryDate / paidToOwn', () => {
  it('finds the closest match and the oldest date read', () => {
    const near = entry({ id: 2, date: '2026-11-10T12:01:00Z' });
    expect(findOwnEntry([entry(), near], transfer, [50])?.id).toBe(2);
    expect(oldestEntryDate([entry(), entry({ date: '2026-10-01T00:00:00Z' })])).toBe(
      '2026-10-01T00:00:00Z'
    );
    expect(oldestEntryDate([])).toBeUndefined();
  });
  it('names the tracked recipient of a transfer paid to a person', () => {
    const own = new Set([7]);
    expect(
      paidToOwn({ ...transfer, journalRef: 1, recipient: 'character', recipientId: 7 }, own)
    ).toBe(7);
    expect(
      paidToOwn({ ...transfer, journalRef: 1, recipient: 'character', recipientId: 8 }, own)
    ).toBeUndefined();
    expect(
      paidToOwn({ ...transfer, journalRef: 1, recipient: 'corporation' }, own)
    ).toBeUndefined();
  });
});

describe('autoCredited', () => {
  const now = Date.parse('2026-11-16T00:00:00Z');
  const d = (kind: 'confirmed' | 'rejected', at: string, by?: number) => ({
    resolution: { kind, at, ...(by === undefined ? {} : { by }) },
  });
  it('keeps only the book-confirmed ones from the last 7 days', () => {
    const list = [
      d('confirmed', '2026-11-15T00:00:00Z', 0),
      d('confirmed', '2026-11-01T00:00:00Z', 0),
      d('confirmed', '2026-11-15T00:00:00Z', 5),
      d('rejected', '2026-11-15T00:00:00Z', 0),
      {},
    ];
    expect(autoCredited(list, now)).toHaveLength(1);
  });
});
