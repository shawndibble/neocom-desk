import { describe, it, expect, afterAll } from 'vitest';
import { formatLocalDate } from './localDate';

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('formatLocalDate', () => {
  it('renders in the host local timezone, not UTC', () => {
    process.env.TZ = 'America/Los_Angeles';
    // Just after UTC midnight — still the previous day in a negative-offset zone.
    expect(formatLocalDate(new Date('2026-09-01T00:00:00Z'))).toBe('2026-08-31');
  });

  it('renders as the same day in UTC', () => {
    process.env.TZ = 'UTC';
    expect(formatLocalDate(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
  });

  it('renders as the next local day in a positive-offset zone', () => {
    process.env.TZ = 'Pacific/Kiritimati';
    expect(formatLocalDate(new Date('2026-08-31T23:45:00Z'))).toBe('2026-09-01');
  });
});
