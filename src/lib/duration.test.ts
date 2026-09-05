import { describe, it, expect } from 'vitest';
import { formatDuration, stepFinish } from './duration';

describe('formatDuration', () => {
  it('formats minutes only under an hour', () => {
    expect(formatDuration(125)).toBe('2m');
  });

  it('formats hours and minutes under a day', () => {
    expect(formatDuration(3_725)).toBe('1h 2m');
  });

  it('formats days, hours, and minutes', () => {
    expect(formatDuration(90_125)).toBe('1d 1h 2m');
  });

  it('floors negative or zero to 0m', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-5)).toBe('0m');
  });
});

describe('stepFinish', () => {
  it('offsets the plan start date by the cumulative seconds', () => {
    const startDate = new Date('2026-01-01T00:00:00Z');
    expect(stepFinish(7_200, startDate).toISOString()).toBe('2026-01-01T02:00:00.000Z');
  });

  it('finishes the first step at its own duration past the start date', () => {
    const startDate = new Date('2026-01-01T00:00:00Z');
    expect(stepFinish(500, startDate).getTime()).toBe(startDate.getTime() + 500_000);
  });
});
