import { describe, it, expect } from 'vitest';
import { formatDuration } from './duration';

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
