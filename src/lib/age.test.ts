import { describe, it, expect } from 'vitest';
import { formatAge, MINUTE_MS, HOUR_MS, DAY_MS } from './age';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts && 'count' in opts ? `${key}:${String(opts.count)}` : key;

describe('formatAge', () => {
  it('reads "just now" under a minute', () => {
    expect(formatAge(0, t)).toBe('common.age.justNow');
    expect(formatAge(MINUTE_MS - 1, t)).toBe('common.age.justNow');
  });

  it('counts whole minutes under an hour', () => {
    expect(formatAge(MINUTE_MS, t)).toBe('common.age.minutes:1');
    expect(formatAge(HOUR_MS - 1, t)).toBe('common.age.minutes:59');
  });

  it('counts whole hours under a day', () => {
    expect(formatAge(HOUR_MS, t)).toBe('common.age.hours:1');
    expect(formatAge(DAY_MS - 1, t)).toBe('common.age.hours:23');
  });

  it('counts whole days from a day up', () => {
    expect(formatAge(DAY_MS, t)).toBe('common.age.days:1');
    expect(formatAge(DAY_MS * 9, t)).toBe('common.age.days:9');
  });
});
