import { describe, expect, it } from 'vitest';
import { withMeasuredRates } from './fuelRatePref';

describe('withMeasuredRates', () => {
  it('adds and updates measured rates, keeping the rest', () => {
    expect(
      withMeasuredRates(
        { 1: 120, 2: 96 },
        new Map([
          [1, 24],
          [3, 48],
        ])
      )
    ).toEqual({
      1: 24,
      2: 96,
      3: 48,
    });
  });

  it('hands back the same rates when none moved enough to rewrite', () => {
    const rates = { 1: 120 };
    expect(withMeasuredRates(rates, new Map([[1, 120.2]]))).toBe(rates);
    expect(withMeasuredRates(rates, new Map())).toBe(rates);
  });
});
