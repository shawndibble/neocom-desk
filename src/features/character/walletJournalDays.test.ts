import { describe, expect, it } from 'vitest';
import type { JournalRow } from '@/engine/journalNetting';
import { journalDayKey, journalDayLabel, journalDayNet } from './walletJournalDays';

const row = (over: Partial<JournalRow>): JournalRow => ({
  id: 1,
  date: '2026-10-16T06:42:00Z',
  ref_type: 'bounty_prize',
  amount: 100,
  description: '',
  ...over,
});

describe('walletJournalDays', () => {
  it('keys a line by its UTC day, not the local one', () => {
    expect(journalDayKey(row({ date: '2026-10-15T23:59:00Z' }))).toBe('2026-10-15');
    expect(journalDayKey(row({ date: '2026-10-16T00:00:00Z' }))).toBe('2026-10-16');
    expect(journalDayKey(row({ date: 'nope' }))).toBeNull();
  });

  it('sums a day without own-Character transfers', () => {
    expect(
      journalDayNet([
        row({ amount: 500 }),
        row({ amount: -200 }),
        row({ amount: 9_000, internal: true }),
        row({ amount: undefined }),
      ])
    ).toBe(300);
  });

  it('labels a day with weekday, day and month', () => {
    expect(journalDayLabel('2026-10-16')).toMatch(/Fri/);
    expect(journalDayLabel('2026-10-16')).toMatch(/16/);
  });
});
