import { describe, it, expect } from 'vitest';
import { formatIsk } from './isk';

describe('formatIsk', () => {
  describe('default (0 decimals — Industry/Market Browser)', () => {
    it('formats with thousands separators, no decimals', () => {
      expect(formatIsk(1234567.891)).toBe('1,234,568');
    });

    it('formats negative values with a leading minus', () => {
      expect(formatIsk(-11724000)).toBe('-11,724,000');
    });

    it('clamps a rounding-noise negative near zero to "0" instead of "-0"', () => {
      expect(formatIsk(-0.3)).toBe('0');
      expect(formatIsk(-0.6)).toBe('-1');
    });
  });

  describe('2 decimals — Wallet/Overview/Orders/Contracts', () => {
    it('formats with thousands separators and 2 decimals', () => {
      expect(formatIsk(1234567.891, 2)).toBe('1,234,567.89');
    });

    it('formats negative values with a leading minus', () => {
      expect(formatIsk(-11724000, 2)).toBe('-11,724,000.00');
    });

    it('clamps a rounding-noise negative near zero to "0.00" instead of "-0.00" (BUG #9)', () => {
      expect(formatIsk(-0.004, 2)).toBe('0.00');
      expect(formatIsk(-0.006, 2)).toBe('-0.01');
    });
  });

  it('clamps exact negative zero regardless of precision', () => {
    expect(formatIsk(-0)).toBe('0');
    expect(formatIsk(-0, 2)).toBe('0.00');
  });
});
