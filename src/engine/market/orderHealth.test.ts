import { describe, it, expect } from 'vitest';
import { orderExpiry, sellThrough } from './orderHealth';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-06T00:00:00Z');

describe('orderExpiry', () => {
  it('computes expiresAt from issued + duration days', () => {
    const issued = '2026-09-01T00:00:00Z';
    const result = orderExpiry(issued, 90, NOW);
    expect(result).not.toBeNull();
    expect(result?.expiresAt).toBe(Date.parse(issued) + 90 * DAY_MS);
  });

  it('truncates daysLeft toward zero for a future expiry (part-day never rounds up)', () => {
    // Issued 4.5 days ago, 90 day duration -> expiresAt is 85.5 days from now.
    const issued = new Date(NOW - 4.5 * DAY_MS).toISOString();
    const result = orderExpiry(issued, 90, NOW);
    // 85.5 days remaining must truncate to 85, never round up to 86.
    expect(result?.daysLeft).toBe(85);
    expect(result?.expired).toBe(false);
  });

  it('is expired with negative daysLeft once past expiresAt', () => {
    const issued = new Date(NOW - 100 * DAY_MS).toISOString();
    const result = orderExpiry(issued, 90, NOW);
    expect(result?.expired).toBe(true);
    expect(result?.daysLeft).toBeLessThan(0);
    expect(result?.daysLeft).toBe(-10);
  });

  it('returns null for an unparseable issued date', () => {
    expect(orderExpiry('not-a-date', 90, NOW)).toBeNull();
  });

  it('returns null for a non-finite durationDays', () => {
    expect(orderExpiry('2026-09-01T00:00:00Z', Number.NaN, NOW)).toBeNull();
    expect(orderExpiry('2026-09-01T00:00:00Z', Number.POSITIVE_INFINITY, NOW)).toBeNull();
  });

  it('returns null for a negative durationDays', () => {
    expect(orderExpiry('2026-09-01T00:00:00Z', -1, NOW)).toBeNull();
  });

  it('accepts a zero durationDays (expires the instant it is issued)', () => {
    const issued = '2026-09-01T00:00:00Z';
    const result = orderExpiry(issued, 0, NOW);
    expect(result?.expiresAt).toBe(Date.parse(issued));
    expect(result?.expired).toBe(true);
  });
});

describe('sellThrough', () => {
  it('is known and computes unitsPerDay/daysToClear from volumeRemain / (regionUnitsPerDay * myShare)', () => {
    const result = sellThrough({
      volumeRemain: 100,
      regionUnitsPerDay: 50,
      myShare: 0.5,
    });
    // rate = 50 * 0.5 = 25 units/day my share of the market clears
    expect(result).toEqual({ kind: 'known', unitsPerDay: 25, daysToClear: 4 });
  });

  it('rounds daysToClear up (a part-day still needs that day) but keeps unitsPerDay unrounded', () => {
    const result = sellThrough({
      volumeRemain: 10,
      regionUnitsPerDay: 3,
      myShare: 1,
    });
    expect(result).toEqual({ kind: 'known', unitsPerDay: 3, daysToClear: 4 });
  });

  it('is known with daysToClear 0 when volumeRemain is 0', () => {
    const result = sellThrough({
      volumeRemain: 0,
      regionUnitsPerDay: 10,
      myShare: 0.5,
    });
    expect(result).toEqual({ kind: 'known', unitsPerDay: 5, daysToClear: 0 });
  });

  it('is unknown noSales when regionUnitsPerDay is 0', () => {
    const result = sellThrough({
      volumeRemain: 10,
      regionUnitsPerDay: 0,
      myShare: 1,
    });
    expect(result).toEqual({ kind: 'unknown', reason: 'noSales' });
  });

  it('is unknown noSales when myShare is 0 (nobody buying at my price)', () => {
    const result = sellThrough({
      volumeRemain: 10,
      regionUnitsPerDay: 50,
      myShare: 0,
    });
    expect(result).toEqual({ kind: 'unknown', reason: 'noSales' });
  });

  it('clamps a negative myShare up into (0, 1]', () => {
    const negative = sellThrough({ volumeRemain: 10, regionUnitsPerDay: 10, myShare: -0.5 });
    // negative share is not "noSales" (a real answer), clamp behavior: treated as 0 -> noSales
    // per spec myShare clamped into (0,1]; a share of zero (or below) means noSales.
    expect(negative).toEqual({ kind: 'unknown', reason: 'noSales' });
  });

  it('clamps a myShare above 1 down to 1', () => {
    const result = sellThrough({ volumeRemain: 10, regionUnitsPerDay: 10, myShare: 2 });
    expect(result).toEqual({ kind: 'known', unitsPerDay: 10, daysToClear: 1 });
  });

  it('is unknown noHistory when hasHistory is explicitly false, even with nonzero rate inputs', () => {
    const result = sellThrough({
      volumeRemain: 10,
      regionUnitsPerDay: 50,
      myShare: 0.5,
      hasHistory: false,
    });
    expect(result).toEqual({ kind: 'unknown', reason: 'noHistory' });
  });

  it('noHistory takes precedence over noSales when both would apply', () => {
    const result = sellThrough({
      volumeRemain: 10,
      regionUnitsPerDay: 0,
      myShare: 0,
      hasHistory: false,
    });
    expect(result).toEqual({ kind: 'unknown', reason: 'noHistory' });
  });

  it('never returns Infinity/NaN even for a huge volumeRemain against a tiny rate', () => {
    const result = sellThrough({
      volumeRemain: Number.MAX_SAFE_INTEGER,
      regionUnitsPerDay: 0.0001,
      myShare: 0.0001,
    });
    expect(result.kind).toBe('known');
    if (result.kind === 'known') {
      expect(Number.isFinite(result.daysToClear)).toBe(true);
      expect(Number.isFinite(result.unitsPerDay)).toBe(true);
      expect(Number.isNaN(result.daysToClear)).toBe(false);
    }
  });
});
