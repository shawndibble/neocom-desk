import { describe, expect, it } from 'vitest';
import { eveClock, eveDateLabel } from './eveTime';

describe('eveClock', () => {
  it('reads UTC as HH:MM, zero padded', () => {
    expect(eveClock(Date.UTC(2026, 9, 23, 4, 7, 59))).toBe('04:07');
  });

  it('rolls over at UTC midnight', () => {
    expect(eveClock(Date.UTC(2026, 9, 23, 23, 59, 59))).toBe('23:59');
    expect(eveClock(Date.UTC(2026, 9, 24, 0, 0, 0))).toBe('00:00');
  });

  it('ignores the machine zone', () => {
    const ms = Date.UTC(2026, 0, 1, 12, 30);
    expect(eveClock(ms)).toBe('12:30');
  });
});

describe('eveDateLabel', () => {
  it('is the UTC calendar date as YYYY-MM-DD', () => {
    expect(eveDateLabel(Date.UTC(2026, 9, 23, 23, 59))).toBe('2026-10-23');
    expect(eveDateLabel(Date.UTC(2026, 9, 24, 0, 0))).toBe('2026-10-24');
  });
});
