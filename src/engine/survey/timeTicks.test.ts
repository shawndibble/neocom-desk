import { MINUTE_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import { timeTicks } from './timeTicks';

const at = (h: number, m = 0) => Date.UTC(2026, 9, 8, h, m);

describe('timeTicks', () => {
  it('lands on the clock, at most six across the span', () => {
    const ticks = timeTicks(at(16, 40), at(19, 36));
    expect(ticks[0]).toBe(at(17));
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.every((t) => t % (30 * MINUTE_MS) === 0)).toBe(true);
  });

  it('uses finer steps for a short span', () => {
    const ticks = timeTicks(at(18, 2), at(18, 28));
    expect(ticks[0]).toBe(at(18, 5));
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(ticks.every((t) => t % (5 * MINUTE_MS) === 0)).toBe(true);
  });

  it('steps by half days across a multi-day span, still at most six ticks', () => {
    const ticks = timeTicks(at(0), at(0) + 47 * 60 * MINUTE_MS);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.every((t) => t % (12 * 60 * MINUTE_MS) === 0)).toBe(true);
  });

  it('is empty for an empty span', () => {
    expect(timeTicks(at(18), at(18))).toEqual([at(18)]);
  });
});
