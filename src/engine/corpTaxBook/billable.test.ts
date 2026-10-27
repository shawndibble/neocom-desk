import { describe, it, expect } from 'vitest';
import { DEFAULT_GRACE_HOURS, dayClosesAt, isDayBillable, lastBillableDate } from './billable';

describe('dayClosesAt', () => {
  it('is the end of the UTC day plus the grace, 30 minutes by default', () => {
    expect(DEFAULT_GRACE_HOURS).toBe(0.5);
    expect(dayClosesAt('2026-07-12')).toBe('2026-07-13T00:30:00.000Z');
    expect(dayClosesAt('2026-07-12', 6)).toBe('2026-07-13T06:00:00.000Z');
    expect(dayClosesAt('2026-07-12', 12)).toBe('2026-07-13T12:00:00.000Z');
  });
});

describe('isDayBillable', () => {
  it('is not Billable before day end + grace, even with a fresh sync', () => {
    expect(
      isDayBillable('2026-07-12', {
        now: '2026-07-13T00:29:00Z',
        lastSyncedAt: '2026-07-13T00:29:00Z',
      })
    ).toBe(false);
  });

  it('is not Billable once the grace has passed until a sync happens after it', () => {
    expect(
      isDayBillable('2026-07-12', {
        now: '2026-07-15T00:00:00Z',
        lastSyncedAt: '2026-07-13T00:00:00Z',
      })
    ).toBe(false);
  });

  it('is Billable once the grace has passed and a sync happened after that', () => {
    expect(
      isDayBillable('2026-07-12', {
        now: '2026-07-15T00:00:00Z',
        lastSyncedAt: '2026-07-13T00:30:00Z',
      })
    ).toBe(true);
  });

  it('is never Billable with no sync at all', () => {
    expect(isDayBillable('2026-07-12', { now: '2026-08-01T00:00:00Z' })).toBe(false);
  });

  it('honours an adjusted grace', () => {
    const at = { now: '2026-07-13T08:00:00Z', lastSyncedAt: '2026-07-13T08:00:00Z' };
    expect(isDayBillable('2026-07-12', { ...at, graceHours: 2 })).toBe(true);
    expect(isDayBillable('2026-07-12', { ...at, graceHours: 12 })).toBe(false);
  });
});

describe('default 30-minute grace', () => {
  it('closes the day for the 00:30 sync tick (stamped after the tick starts), not before', () => {
    const now = '2026-07-13T00:30:40Z';
    expect(isDayBillable('2026-07-12', { now, lastSyncedAt: '2026-07-13T00:30:35Z' })).toBe(true);
    expect(isDayBillable('2026-07-12', { now, lastSyncedAt: '2026-07-13T00:29:59Z' })).toBe(false);
    expect(
      isDayBillable('2026-07-12', {
        now: '2026-07-13T00:29:59Z',
        lastSyncedAt: '2026-07-13T00:29:59Z',
      })
    ).toBe(false);
    expect(lastBillableDate({ now, lastSyncedAt: '2026-07-13T00:30:35Z' })).toBe('2026-07-12');
    expect(lastBillableDate({ now, lastSyncedAt: '2026-07-13T00:29:59Z' })).toBe('2026-07-11');
  });

  it('keeps an explicit 6h grace at 06:00', () => {
    const at = { now: '2026-07-13T01:00:00Z', lastSyncedAt: '2026-07-13T01:00:00Z' };
    expect(isDayBillable('2026-07-12', { ...at, graceHours: 6 })).toBe(false);
  });
});

describe('lastBillableDate', () => {
  it('is the latest day the last sync closed', () => {
    expect(
      lastBillableDate({ now: '2026-07-20T00:00:00Z', lastSyncedAt: '2026-07-13T00:30:00Z' })
    ).toBe('2026-07-12');
    expect(
      lastBillableDate({ now: '2026-07-20T00:00:00Z', lastSyncedAt: '2026-07-13T00:29:00Z' })
    ).toBe('2026-07-11');
  });

  it('is undefined with no sync', () => {
    expect(lastBillableDate({ now: '2026-07-20T00:00:00Z' })).toBeUndefined();
  });
});
