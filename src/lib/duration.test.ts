import { describe, it, expect } from 'vitest';
import { formatDate, formatDuration, stepTimeline } from './duration';

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

describe('stepTimeline', () => {
  it('derives start and finish from cumulative seconds and step duration', () => {
    const startDate = new Date('2026-01-01T00:00:00Z');
    const { start, finish } = stepTimeline({ seconds: 3_600, cumulativeSeconds: 7_200 }, startDate);
    expect(start.toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(finish.toISOString()).toBe('2026-01-01T02:00:00.000Z');
  });

  it('starts the first step at the plan start date', () => {
    const startDate = new Date('2026-01-01T00:00:00Z');
    const { start } = stepTimeline({ seconds: 500, cumulativeSeconds: 500 }, startDate);
    expect(start.getTime()).toBe(startDate.getTime());
  });
});

describe('formatDate', () => {
  it('formats as YYYY-MM-DD regardless of time-of-day', () => {
    expect(formatDate(new Date('2026-08-31T23:45:00Z'))).toBe('2026-08-31');
  });
});
