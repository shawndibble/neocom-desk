import { describe, expect, it } from 'vitest';
import { journalRangeOptions, journalRangeStart, matchJournalRange } from './journalRange';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 12);

describe('journalRangeOptions', () => {
  it('always offers 7 days, 30 days and all history', () => {
    expect(journalRangeOptions([])).toEqual([7, 30, 'all']);
  });
  it('adds the longer presets the history reaches, in order', () => {
    expect(journalRangeOptions([90])).toEqual([7, 30, 90, 'all']);
    expect(journalRangeOptions([90, 180, 365])).toEqual([7, 30, 90, 180, 365, 'all']);
    expect(journalRangeOptions([365, 90])).toEqual([7, 30, 90, 365, 'all']);
  });
  it('ignores a reached range that is not a preset', () => {
    expect(journalRangeOptions([45])).toEqual([7, 30, 'all']);
  });
});

describe('journalRangeStart', () => {
  it('is today minus N EVE days, as a UTC day', () => {
    expect(journalRangeStart(7, NOW)).toBe('2026-10-09');
    expect(journalRangeStart(365, NOW)).toBe('2025-10-16');
  });
  it('is null for all history', () => {
    expect(journalRangeStart('all', NOW)).toBeNull();
  });
});

describe('matchJournalRange', () => {
  const options = journalRangeOptions([90]);
  it('is all history with no date set', () => {
    expect(matchJournalRange({ startDate: null, endDate: null }, options, NOW)).toBe('all');
  });
  it('matches an open-ended From that equals a preset start', () => {
    expect(matchJournalRange({ startDate: '2026-10-09', endDate: null }, options, NOW)).toBe(7);
    expect(matchJournalRange({ startDate: '2026-07-18', endDate: null }, options, NOW)).toBe(90);
  });
  it('is custom for a To date, an odd From, or a preset not on offer', () => {
    expect(
      matchJournalRange({ startDate: '2026-10-09', endDate: '2026-10-12' }, options, NOW)
    ).toBe('custom');
    expect(matchJournalRange({ startDate: '2026-10-01', endDate: null }, options, NOW)).toBe(
      'custom'
    );
    expect(matchJournalRange({ startDate: null, endDate: '2026-10-12' }, options, NOW)).toBe(
      'custom'
    );
    expect(matchJournalRange({ startDate: '2026-04-19', endDate: null }, options, NOW)).toBe(
      'custom'
    );
  });
  it('stays on the day it was set until midnight UTC', () => {
    expect(
      matchJournalRange({ startDate: '2026-10-09', endDate: null }, options, NOW + 11 * 3_600_000)
    ).toBe(7);
    expect(matchJournalRange({ startDate: '2026-10-09', endDate: null }, options, NOW + DAY)).toBe(
      'custom'
    );
  });
});
