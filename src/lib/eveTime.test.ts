import { describe, it, expect, afterEach } from 'vitest';
import { formatEveDateTime } from './eveTime';

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
