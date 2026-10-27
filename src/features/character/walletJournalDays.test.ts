import { describe, expect, it } from 'vitest';
import type { JournalRow } from '@/engine/journalNetting';
import { journalDayKey, journalDayLabel, newestJournalDays } from './walletJournalDays';

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

  it('picks the newest distinct days', () => {
    const rows = ['2026-10-01', '2026-10-03', '2026-10-03', '2026-10-02'].map((d, id) =>
      row({ id, date: `${d}T05:00:00Z` })
    );
    expect(newestJournalDays(rows, 2)).toEqual(['2026-10-03', '2026-10-02']);
  });

  it('labels a day with weekday, day and month', () => {
    expect(journalDayLabel('2026-10-15', 'en')).toBe('Thu 15 Oct');
  });
});
