import { describe, it, expect, afterEach } from 'vitest';
import { eveWhen, formatEveDateTime } from './eveTime';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('formatEveDateTime', () => {
  it('renders the instant in EVE time (UTC), not the host zone', () => {
    process.env.TZ = 'America/New_York';
    expect(formatEveDateTime(new Date('2026-09-05T18:42:00Z'))).toBe('09-05 18:42');
  });

  it('is the same string in every host zone', () => {
    const date = new Date('2026-01-01T00:30:00Z');
    process.env.TZ = 'Pacific/Auckland';
    const east = formatEveDateTime(date);
    process.env.TZ = 'America/Los_Angeles';
    expect(formatEveDateTime(date)).toBe(east);
    expect(east).toBe('01-01 00:30');
  });
});

const NOW = Date.UTC(2026, 9, 15, 12, 0); // Thu 12:00

describe('eveWhen', () => {
  it('reads a weekday and EVE time inside the coming week', () => {
    expect(eveWhen(NOW + 26.5 * 3_600_000, NOW)).toBe('Fri 14:30');
  });

  it('falls back to the date once the weekday would repeat', () => {
    expect(eveWhen(NOW + 8 * 86_400_000, NOW)).toBe('10-23 12:00');
  });
});
