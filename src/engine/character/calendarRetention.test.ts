import { describe, it, expect } from 'vitest';
import { stillRunningToday, type CalendarRetentionEntry } from './calendarRetention';

/** 2026-09-08 14:00 local, whatever zone the test host runs in. */
const TODAY_2PM = new Date(2026, 8, 8, 14, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

function entry(id: number, startMs: number): CalendarRetentionEntry {
  return { id, startMs };
}

describe('stillRunningToday', () => {
  it('keeps an event that started earlier today and is gone from the fresh read', () => {
    const previous = [entry(1, TODAY_2PM - 2 * HOUR)];
    expect(stillRunningToday(previous, [], TODAY_2PM)).toEqual([1]);
  });

  it('drops an event whose local day has passed', () => {
    const yesterday = new Date(2026, 8, 7, 22, 0, 0).getTime();
    expect(stillRunningToday([entry(1, yesterday)], [], TODAY_2PM)).toEqual([]);
  });

  it('drops an event that started before midnight even when under 24 hours ago', () => {
    // 23:00 "yesterday" is 15 hours back, well inside a rolling day — the rule
    // is the local calendar day, not a rolling window.
    const lateYesterday = new Date(2026, 8, 7, 23, 0, 0).getTime();
    expect(stillRunningToday([entry(1, lateYesterday)], [], TODAY_2PM)).toEqual([]);
  });

  it('never retains an event the fresh read still carries — that read is the truth for it', () => {
    const started = entry(1, TODAY_2PM - HOUR);
    expect(stillRunningToday([started], [started], TODAY_2PM)).toEqual([]);
  });

  it('drops an event that has not started yet and vanished — that is a real cancellation', () => {
    // ESI keeps returning events until they start, so one missing while still
    // upcoming was deleted in game. Retaining it would show a cancelled event.
    expect(stillRunningToday([entry(1, TODAY_2PM + HOUR)], [], TODAY_2PM)).toEqual([]);
  });

  it('keeps an event starting exactly now', () => {
    expect(stillRunningToday([entry(1, TODAY_2PM)], [], TODAY_2PM)).toEqual([1]);
  });

  it('returns ids once each, in the order previously seen', () => {
    const previous = [
      entry(3, TODAY_2PM - HOUR),
      entry(1, TODAY_2PM - 2 * HOUR),
      entry(3, TODAY_2PM - HOUR),
    ];
    expect(stillRunningToday(previous, [], TODAY_2PM)).toEqual([3, 1]);
  });

  it('retains nothing when there is nothing previously seen', () => {
    expect(stillRunningToday([], [entry(1, TODAY_2PM + HOUR)], TODAY_2PM)).toEqual([]);
  });
});
