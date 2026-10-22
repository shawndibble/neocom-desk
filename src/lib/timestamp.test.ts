import { describe, expect, it } from 'vitest';
import {
  formatCalendarTimestamp,
  formatDateOnly,
  formatTimeOfDay,
  formatTimestamp,
  splitTimestamp,
} from './timestamp';

/**
 * Expectations are built from `Intl` rather than hardcoded ("Sep 6"), so the
 * assertions hold on any locale or ICU build — a developer machine and the
 * Linux CI runner do not have to agree on month names.
 */
const SAMPLE = new Date('2026-09-06T14:30:45.000Z');

/**
 * A third clock group (`14:30:45`) is the only shape seconds can take. The
 * `toBe` assertions above each pin the exact format and would also catch a
 * `second` option — but they are satisfiable by editing the expected options
 * to match. These pin the requirement instead, which no format edit can.
 */
const SECONDS = /\d{1,2}:\d{2}:\d{2}/;

describe('formatTimestamp', () => {
  it('renders date and time without seconds', () => {
    expect(formatTimestamp(SAMPLE)).toBe(
      SAMPLE.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    );
  });

  it('never renders seconds, whatever the host locale', () => {
    expect(formatTimestamp(SAMPLE)).not.toMatch(SECONDS);
  });
});

describe('formatCalendarTimestamp', () => {
  it('renders month, day and time without year or seconds', () => {
    expect(formatCalendarTimestamp(SAMPLE)).toBe(
      SAMPLE.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    );
  });

  it('omits the year and the seconds, whatever the host locale', () => {
    expect(formatCalendarTimestamp(SAMPLE)).not.toMatch(/\d{4}/);
    expect(formatCalendarTimestamp(SAMPLE)).not.toMatch(SECONDS);
  });
});

describe('formatTimeOfDay', () => {
  it('renders hours and minutes only', () => {
    expect(formatTimeOfDay(SAMPLE)).toBe(
      SAMPLE.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
    expect(formatTimeOfDay(SAMPLE)).not.toMatch(SECONDS);
  });
});

describe('formatDateOnly', () => {
  it('renders the calendar date with no time at all', () => {
    expect(formatDateOnly(SAMPLE)).toBe(
      SAMPLE.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      })
    );
    expect(formatDateOnly(SAMPLE)).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('honours an explicit time zone, so a late-UTC instant can fall on another day', () => {
    // 2026-09-06T23:30Z is already the 7th in Tokyo and still the 6th in UTC.
    const lateUtc = new Date('2026-09-06T23:30:00.000Z');
    expect(formatDateOnly(lateUtc, 'UTC')).not.toBe(formatDateOnly(lateUtc, 'Asia/Tokyo'));
  });
});

describe('EVE time is a 24-hour clock', () => {
  const afternoon = new Date('2026-09-06T13:28:00.000Z');
  const justAfterMidnight = new Date('2026-09-07T00:05:00.000Z');
  const NOT_12_HOUR = /\b(AM|PM)\b/i;

  it('renders UTC times as 13:28, never 01:28 PM, on every formatter', () => {
    expect(formatTimestamp(afternoon, 'UTC')).toMatch(/\b13:28\b/);
    expect(formatCalendarTimestamp(afternoon, 'UTC')).toMatch(/\b13:28\b/);
    expect(formatTimeOfDay(afternoon, 'UTC')).toBe('13:28');
    expect(splitTimestamp(afternoon, 'UTC').time).toBe('13:28');
    for (const text of [
      formatTimestamp(afternoon, 'UTC'),
      formatCalendarTimestamp(afternoon, 'UTC'),
      formatTimeOfDay(afternoon, 'UTC'),
    ]) {
      expect(text).not.toMatch(NOT_12_HOUR);
    }
  });

  it('reads the first minutes after midnight as 00:05, not 24:05', () => {
    expect(formatTimeOfDay(justAfterMidnight, 'UTC')).toBe('00:05');
    expect(formatTimestamp(justAfterMidnight, 'UTC')).not.toMatch(/\b24:/);
  });

  it('leaves the viewer-locale clock alone when no zone is given', () => {
    expect(formatTimeOfDay(afternoon)).toBe(
      afternoon.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
  });
});
