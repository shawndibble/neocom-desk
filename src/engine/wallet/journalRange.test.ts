import { describe, expect, it } from 'vitest';
import { journalRangeOptions, journalRangeStart } from './journalRange';

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
  it('keeps the selected preset on offer before its history is known', () => {
    expect(journalRangeOptions([], 90)).toEqual([7, 30, 90, 'all']);
    expect(journalRangeOptions([], 7)).toEqual([7, 30, 'all']);
    expect(journalRangeOptions([], 45)).toEqual([7, 30, 'all']);
  });
  it('ignores a reached range that is not a preset', () => {
    expect(journalRangeOptions([45])).toEqual([7, 30, 'all']);
  });
});

describe('journalRangeStart', () => {
  it('counts today as the first day: N days is today and the N - 1 before it', () => {
    expect(journalRangeStart(7, NOW)).toBe('2026-10-10');
    expect(journalRangeStart(30, NOW)).toBe('2026-09-17');
    expect(journalRangeStart(90, NOW)).toBe('2026-07-19');
    expect(journalRangeStart(180, NOW)).toBe('2026-04-20');
    expect(journalRangeStart(365, NOW)).toBe('2025-10-17');
  });
  it('rolls over at midnight UTC', () => {
    expect(journalRangeStart(7, Date.UTC(2026, 9, 16, 23, 59))).toBe('2026-10-10');
    expect(journalRangeStart(7, Date.UTC(2026, 9, 17, 0, 1))).toBe('2026-10-11');
  });
});
