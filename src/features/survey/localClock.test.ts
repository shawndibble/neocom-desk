import { describe, expect, it } from 'vitest';
import { formatLocalClock } from './localClock';

// 06:44 UTC on a January day: 00:44 in Chicago (CST).
const AT = Date.UTC(2026, 0, 15, 6, 44);

describe('formatLocalClock', () => {
  it('reads 12-hour with the zone name where the locale does', () => {
    expect(formatLocalClock(AT, 'en-US', 'America/Chicago').replace(/\s/g, ' ')).toBe(
      '12:44 AM CST'
    );
  });

  it('reads 24-hour where the locale does, still with the zone name', () => {
    const text = formatLocalClock(AT, 'de-DE', 'Europe/Berlin');
    expect(text).toMatch(/^07:44 /);
    expect(text).not.toMatch(/local/i);
  });
});
