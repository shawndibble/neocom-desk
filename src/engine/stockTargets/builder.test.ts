import { describe, expect, it } from 'vitest';
import { runsToCover, timePerRunAtTe } from './builder';

describe('runsToCover', () => {
  it('rounds up to whole runs of the blueprint output', () => {
    expect(runsToCover(15_800, 100)).toBe(158);
    expect(runsToCover(15_801, 100)).toBe(159);
    expect(runsToCover(40, 1)).toBe(40);
  });

  it('is at least one run, and treats a missing output size as one unit per run', () => {
    expect(runsToCover(0, 100)).toBe(1);
    expect(runsToCover(3, 0)).toBe(3);
  });
});

describe('timePerRunAtTe', () => {
  it('takes the blueprint time efficiency off the base time, rounded to a second', () => {
    expect(timePerRunAtTe(7800, 20)).toBe(6240);
    expect(timePerRunAtTe(100, 0)).toBe(100);
  });
});
