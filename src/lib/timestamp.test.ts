import { describe, expect, it } from 'vitest';
import { formatCalendarTimestamp, formatTimeOfDay, formatTimestamp } from './timestamp';

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
