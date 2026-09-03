import { describe, it, expect } from 'vitest';
import { programBarGeometry, TIMELINE_WINDOW_MS } from './timelineGeometry';

const NOW = Date.parse('2026-09-03T00:00:00Z');
const DAY_MS = 86_400_000;

describe('programBarGeometry', () => {
  it('measures remaining time as a fraction of the window', () => {
    expect(programBarGeometry(NOW + 7 * DAY_MS, NOW)).toEqual({
      leftPercent: 0,
      widthPercent: 50,
      capped: false,
    });
  });

  it('gives an expired program zero width at the now-edge, never a leftward bar', () => {
    const past = programBarGeometry(NOW - 5 * DAY_MS, NOW);
    expect(past).toEqual({ leftPercent: 0, widthPercent: 0, capped: false });
    // The invariant that matters: nothing is ever drawn before "now", however
    // long ago the program expired.
    expect(programBarGeometry(NOW - 400 * DAY_MS, NOW).leftPercent).toBe(0);
    expect(programBarGeometry(NOW - 400 * DAY_MS, NOW).widthPercent).toBe(0);
  });

  it('treats a program expiring exactly now as expired', () => {
    expect(programBarGeometry(NOW, NOW).widthPercent).toBe(0);
  });

  it('clamps a program longer than the window to the full track and flags it', () => {
    const beyond = programBarGeometry(NOW + TIMELINE_WINDOW_MS + 3 * DAY_MS, NOW);
    expect(beyond.widthPercent).toBe(100);
    expect(beyond.capped).toBe(true);
  });

  it('does not flag a program that exactly fills the window', () => {
    expect(programBarGeometry(NOW + TIMELINE_WINDOW_MS, NOW)).toEqual({
      leftPercent: 0,
      widthPercent: 100,
      capped: false,
    });
  });
});
