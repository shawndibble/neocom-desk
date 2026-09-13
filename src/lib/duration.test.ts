import { describe, it, expect } from 'vitest';
import { formatCountdown, formatDuration, stepFinish } from './duration';

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

describe('formatCountdown', () => {
  it('drops the minutes once there is a day to show', () => {
    expect(formatCountdown(90_125)).toBe('1d 1h');
  });

  it('keeps a zero hours place so the shape does not change day to day', () => {
    expect(formatCountdown(86_520)).toBe('1d 0h');
  });

  it('truncates rather than rounds, so the countdown never reads early', () => {
    expect(formatCountdown(4 * 86_400 + 4 * 3_600 + 59 * 60)).toBe('4d 4h');
  });

  it('keeps the minutes when there is no day to show', () => {
    expect(formatCountdown(3_725)).toBe('1h 2m');
    expect(formatCountdown(125)).toBe('2m');
  });

  it('floors negative or zero to 0m', () => {
    expect(formatCountdown(0)).toBe('0m');
    expect(formatCountdown(-5)).toBe('0m');
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
