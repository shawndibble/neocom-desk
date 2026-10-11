import { describe, expect, it } from 'vitest';
import { fatigueEndsAt, longestRemainingSeconds, secondsLeft } from './jumpTimers';

const NOW = Date.parse('2026-10-11T12:00:00Z');

describe('fatigueEndsAt', () => {
  it('reads the expiry date', () => {
    expect(fatigueEndsAt('2026-10-11T15:00:00Z')).toBe(Date.parse('2026-10-11T15:00:00Z'));
  });
  it('is null when absent or not a date', () => {
    expect(fatigueEndsAt(undefined)).toBeNull();
    expect(fatigueEndsAt(null)).toBeNull();
    expect(fatigueEndsAt('nope')).toBeNull();
  });
});

describe('secondsLeft', () => {
  it('counts down to the end', () => {
    expect(secondsLeft(NOW + 90_000, NOW)).toBe(90);
  });
  it('is 0 with no timer or one that has passed', () => {
    expect(secondsLeft(null, NOW)).toBe(0);
    expect(secondsLeft(NOW - 1, NOW)).toBe(0);
    expect(secondsLeft(NOW, NOW)).toBe(0);
  });
});

describe('longestRemainingSeconds', () => {
  it('is the longest of the running timers', () => {
    expect(longestRemainingSeconds([NOW + 60_000, NOW + 3_600_000, null], NOW)).toBe(3600);
  });
  it('is 0 when none is running', () => {
    expect(longestRemainingSeconds([null, NOW - 5], NOW)).toBe(0);
    expect(longestRemainingSeconds([], NOW)).toBe(0);
  });
});
