import { describe, it, expect } from 'vitest';
import type { JournalRow } from './journalNetting';
import { journalDailyFlow, journalFlowWindow } from './journalDailyFlow';

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

describe('journalDailyFlow window', () => {
  it('zero-fills the whole window, edges included', () => {
    const days = journalDailyFlow([row({ id: 1, amount: 5 })], {
      from: '2026-10-05',
      to: '2026-10-09',
    });
    expect(days.map((d) => d.day)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
    expect(days[2]?.in).toBe(5);
    expect(days[0]?.in).toBe(0);
  });
});

describe('journalFlowWindow', () => {
  const today = '2026-10-16';
  it('is the last 30 days with no filter', () => {
    expect(journalFlowWindow(null, null, today)).toEqual({
      from: '2026-09-17',
      to: today,
      truncated: false,
    });
  });
  it('uses the filter range as the axis', () => {
    expect(journalFlowWindow('2026-10-01', '2026-10-10', today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-10',
      truncated: false,
    });
  });
  it('keeps the last 92 days of a longer range', () => {
    const w = journalFlowWindow('2026-01-01', '2026-10-10', today);
    expect(w.truncated).toBe(true);
    expect(w.to).toBe('2026-10-10');
    expect(w.from).toBe('2026-07-11');
  });
  it('keeps the default window around a one-day filter', () => {
    expect(journalFlowWindow('2026-10-07', '2026-10-07', today).to).toBe(today);
    const old = journalFlowWindow('2026-06-01', '2026-06-01', today);
    expect(old.from <= '2026-06-01' && '2026-06-01' <= old.to).toBe(true);
  });
});

describe('journalDailyFlow malformed dates', () => {
  it('skips a row whose date does not parse instead of throwing', () => {
    const days = journalDailyFlow([
      row({ id: 1, amount: 100 }),
      row({ id: 2, date: 'garbage', amount: 999 }),
    ]);
    expect(days).toEqual([{ day: '2026-10-07', in: 100, out: 0, net: 100 }]);
  });
});
