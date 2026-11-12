import { describe, it, expect } from 'vitest';
import { stillRunning, type CalendarRetentionEntry } from './calendarRetention';

/** 2026-09-08 14:00 local, whatever zone the test host runs in. */
const TODAY_2PM = new Date(2026, 8, 8, 14, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

function entry(id: number, startMs: number): CalendarRetentionEntry {
  return { id, startMs };
}

describe('stillRunning', () => {
  it('keeps an event that started earlier today and is gone from the fresh read', () => {
    const previous = [entry(1, TODAY_2PM - 2 * HOUR)];
    expect(stillRunning(previous, [], TODAY_2PM)).toEqual([1]);
  });

  it('keeps a started event for two weeks, across days', () => {
    const yesterday = new Date(2026, 8, 7, 22, 0, 0).getTime();
    const tenDaysAgo = TODAY_2PM - 10 * 24 * HOUR;
    expect(stillRunning([entry(1, yesterday), entry(2, tenDaysAgo)], [], TODAY_2PM)).toEqual([
      1, 2,
    ]);
  });

  it('drops a started event once two weeks have passed', () => {
    const start = TODAY_2PM - 14 * 24 * HOUR;
    expect(stillRunning([entry(1, start + 1)], [], TODAY_2PM)).toEqual([1]);
    expect(stillRunning([entry(1, start)], [], TODAY_2PM)).toEqual([]);
  });

  it('never retains an event the fresh read still carries — that read is the truth for it', () => {
    const started = entry(1, TODAY_2PM - HOUR);
    expect(stillRunning([started], [started], TODAY_2PM)).toEqual([]);
  });

  it('drops an event that has not started yet and vanished — that is a real cancellation', () => {
    // ESI keeps returning events until they start, so one missing while still
    // upcoming was deleted in game. Retaining it would show a cancelled event.
    expect(stillRunning([entry(1, TODAY_2PM + HOUR)], [], TODAY_2PM)).toEqual([]);
  });

  it('keeps an event starting exactly now', () => {
    expect(stillRunning([entry(1, TODAY_2PM)], [], TODAY_2PM)).toEqual([1]);
  });

  it('returns ids once each, in the order previously seen', () => {
    const previous = [
      entry(3, TODAY_2PM - HOUR),
      entry(1, TODAY_2PM - 2 * HOUR),
      entry(3, TODAY_2PM - HOUR),
    ];
    expect(stillRunning(previous, [], TODAY_2PM)).toEqual([3, 1]);
  });

  it('retains nothing when there is nothing previously seen', () => {
    expect(stillRunning([], [entry(1, TODAY_2PM + HOUR)], TODAY_2PM)).toEqual([]);
  });
});
