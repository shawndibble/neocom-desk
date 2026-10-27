import { describe, expect, it } from 'vitest';
import { clamp, upperMedian, median, sum } from './math';

describe('median', () => {
  it('takes the middle of an odd count', () => expect(median([3, 1, 2])).toBe(2));
  it('averages the middle two of an even count', () => expect(median([4, 1, 3, 2])).toBe(2.5));
  it('is NaN for an empty list', () => expect(median([])).toBeNaN());
  it('does not mutate its input', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('upperMedian', () => {
  it('takes the middle of an odd count', () => expect(upperMedian([3, 1, 2])).toBe(2));
  it('takes the higher of the middle two for an even count', () =>
    expect(upperMedian([4, 1, 3, 2])).toBe(3));
  it('is NaN for an empty list', () => expect(upperMedian([])).toBeNaN());
});

describe('sum', () => {
  it('adds', () => expect(sum([1, 2, 3.5])).toBe(6.5));
  it('is 0 for an empty list', () => expect(sum([])).toBe(0));
});

describe('clamp', () => {
  it('pins below the floor', () => expect(clamp(-1, 0, 5)).toBe(0));
  it('pins above the ceiling', () => expect(clamp(9, 0, 5)).toBe(5));
  it('passes a value in range', () => expect(clamp(3, 0, 5)).toBe(3));
});
