import { describe, expect, it } from 'vitest';
import { dayEndTime } from './dayEndTime';

describe('dayEndTime', () => {
  it('adds the grace to 00:00', () => {
    expect(dayEndTime(0.5)).toBe('00:30');
    expect(dayEndTime(6)).toBe('06:00');
    expect(dayEndTime(1.25)).toBe('01:15');
  });
});
