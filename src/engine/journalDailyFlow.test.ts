import { describe, it, expect } from 'vitest';
import type { JournalRow } from './journalNetting';
import { journalDailyFlow } from './journalDailyFlow';

function row(over: Partial<JournalRow> & { id: number }): JournalRow {
  return { date: '2026-10-07T12:00:00Z', ref_type: 'bounty_prizes', description: '', ...over };
}

describe('journalDailyFlow', () => {
  it('returns nothing for no rows', () => {
    expect(journalDailyFlow([])).toEqual([]);
  });

  it('sums In and Out per EVE (UTC) day, Out as a positive magnitude', () => {
    const days = journalDailyFlow([
      row({ id: 1, date: '2026-10-07T00:00:01Z', amount: 100 }),
      row({ id: 2, date: '2026-10-07T23:59:59Z', amount: -30 }),
      row({ id: 3, date: '2026-10-07T10:00:00Z', amount: 50 }),
    ]);
    expect(days).toEqual([{ day: '2026-10-07', in: 150, out: 30, net: 120 }]);
  });

  it('skips own-Character transfers and counts a missing amount as zero', () => {
    const days = journalDailyFlow([
      row({ id: 1, amount: 900, internal: true }),
      row({ id: 2 }),
      row({ id: 3, amount: -5 }),
    ]);
    expect(days).toEqual([{ day: '2026-10-07', in: 0, out: 5, net: -5 }]);
  });

  it('fills quiet days between the first and last so the axis is even', () => {
    const days = journalDailyFlow([
      row({ id: 1, date: '2026-10-09T01:00:00Z', amount: 10 }),
      row({ id: 2, date: '2026-10-06T01:00:00Z', amount: -4 }),
    ]);
    expect(days.map((d) => d.day)).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
    expect(days[1]).toEqual({ day: '2026-10-07', in: 0, out: 0, net: 0 });
  });

  it('crosses a month boundary', () => {
    const days = journalDailyFlow([
      row({ id: 1, date: '2026-10-31T01:00:00Z', amount: 1 }),
      row({ id: 2, date: '2026-11-02T01:00:00Z', amount: 1 }),
    ]);
    expect(days.map((d) => d.day)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });
});
