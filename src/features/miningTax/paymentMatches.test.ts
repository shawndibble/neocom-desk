import { describe, expect, it } from 'vitest';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { amountMatches, findPaymentCandidates } from './paymentMatches';

const NOW = new Date('2026-09-06T12:00:00Z');

function entry(overrides: Partial<WalletJournalEntry>): WalletJournalEntry {
  return {
    id: 1,
    date: '2026-09-05T20:00:00Z',
    ref_type: 'player_donation',
    description: 'x',
    amount: -21_547_000,
    ...overrides,
  };
}

describe('amountMatches', () => {
  it('accepts an outgoing amount within half a percent, rejects a wider miss', () => {
    expect(amountMatches(entry({ amount: -21_547_000 }), 21_547_000)).toBe(true);
    expect(amountMatches(entry({ amount: -21_600_000 }), 21_547_000)).toBe(true);
    expect(amountMatches(entry({ amount: -20_000_000 }), 21_547_000)).toBe(false);
    expect(amountMatches(entry({ amount: undefined }), 21_547_000)).toBe(false);
  });
});

describe('findPaymentCandidates', () => {
  it('keeps only recent outgoing donations and contract payments, amount matches first, newest next', () => {
    const entries = [
      entry({ id: 1, date: '2026-09-05T20:00:00Z', amount: -5_000_000 }),
      entry({ id: 2, date: '2026-09-04T20:00:00Z', amount: -21_547_000 }),
      entry({ id: 3, date: '2026-09-03T20:00:00Z', ref_type: 'contract_price', amount: -1 }),
      entry({ id: 4, date: '2026-09-02T20:00:00Z', ref_type: 'bounty_prizes', amount: -9 }),
      entry({ id: 5, date: '2026-09-01T20:00:00Z', amount: 21_547_000 }), // incoming
      entry({ id: 6, date: '2026-07-01T20:00:00Z', amount: -21_547_000 }), // too old
    ];

    const result = findPaymentCandidates(entries, 21_547_000, { now: NOW });

    expect(result.map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it('caps the list', () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      entry({ id: i, date: `2026-09-0${(i % 5) + 1}T00:00:00Z`, amount: -100 })
    );
    expect(findPaymentCandidates(entries, 1, { now: NOW, limit: 3 })).toHaveLength(3);
  });
});
