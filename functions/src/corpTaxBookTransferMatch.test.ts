import { describe, expect, it } from 'vitest';
import {
  PAYOUT_LINK_WINDOW_DAYS,
  isSameJournalTransfer,
  matchesStatedTransfer,
} from './corpTaxBookTransferMatch.js';

describe('isSameJournalTransfer: the corporation’s and the member’s journal entry of one transfer', () => {
  const held = { characterId: 5, amount: 1_000_000, at: '2026-11-01T12:00:00Z' };
  it('is the same sender and amount within minutes', () => {
    expect(
      isSameJournalTransfer(held, { ...held, amount: 1_000_000.4, at: '2026-11-01T12:09:00Z' })
    ).toBe(true);
    expect(isSameJournalTransfer(held, { ...held, at: '2026-11-01T12:11:00Z' })).toBe(false);
    expect(isSameJournalTransfer(held, { ...held, characterId: 6 })).toBe(false);
    expect(isSameJournalTransfer(held, { ...held, amount: 1_000_001 })).toBe(false);
  });
});

describe('matchesStatedTransfer: a transfer someone states against one the book holds', () => {
  const held = { characterId: 5, amount: 1_000_000, at: '2026-11-01T12:00:00Z' };
  it('is the same sender and amount within two days either way', () => {
    expect(matchesStatedTransfer({ ...held, at: '2026-11-03T11:00:00Z' }, held)).toBe(true);
    expect(matchesStatedTransfer({ ...held, at: '2026-10-30T13:00:00Z' }, held)).toBe(true);
    expect(matchesStatedTransfer({ ...held, at: '2026-11-03T13:00:00Z' }, held)).toBe(false);
    expect(matchesStatedTransfer({ ...held, amount: 999_998 }, held)).toBe(false);
    expect(matchesStatedTransfer({ ...held, characterId: 6 }, held)).toBe(false);
  });
  it('a moon owner payout links within three days, at the exact amount', () => {
    expect(PAYOUT_LINK_WINDOW_DAYS).toBe(3);
  });
});
