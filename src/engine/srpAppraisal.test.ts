import { describe, expect, it } from 'vitest';
import {
  formatPercentDifference,
  percentDifference,
  repaymentHidden,
  shipFitValue,
} from './srpAppraisal';

describe('percentDifference', () => {
  it('is the value against the base, one decimal', () => {
    expect(percentDifference(112_400_000, 100_000_000)).toBe(12.4);
    expect(percentDifference(92_000_000, 100_000_000)).toBe(-8);
    expect(percentDifference(100_000_000, 100_000_000)).toBe(0);
  });
  it('is null when either side is missing or the base is not positive', () => {
    expect(percentDifference(null, 100)).toBeNull();
    expect(percentDifference(100, null)).toBeNull();
    expect(percentDifference(100, 0)).toBeNull();
  });
});

describe('formatPercentDifference', () => {
  it('signs and keeps one decimal', () => {
    expect(formatPercentDifference(12.4)).toBe('+12.4%');
    expect(formatPercentDifference(-8)).toBe('-8.0%');
    expect(formatPercentDifference(0)).toBe('0.0%');
  });
});

describe('shipFitValue', () => {
  it('adds hull and fit, and needs both', () => {
    expect(shipFitValue(71, 116)).toBe(187);
    expect(shipFitValue(71, null)).toBeNull();
    expect(shipFitValue(null, 116)).toBeNull();
  });
});

describe('repaymentHidden', () => {
  it('hides only when the repayment exceeds the ship and fit value', () => {
    expect(repaymentHidden(200, 187)).toBe(true);
    expect(repaymentHidden(187, 187)).toBe(false);
    expect(repaymentHidden(130, 187)).toBe(false);
  });
  it('shows it when there is nothing to compare with', () => {
    expect(repaymentHidden(200, null)).toBe(false);
  });
});
