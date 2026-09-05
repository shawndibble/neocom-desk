import { describe, it, expect } from 'vitest';
import { formatIsk, formatIskCompact, parseIskAmount } from './isk';

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

describe('formatIskCompact', () => {
  it('abbreviates large balances', () => {
    expect(formatIskCompact(5_234_000)).toBe('5.2M');
  });

  it('clamps a rounding-noise negative near zero to "0" instead of "-0"', () => {
    expect(formatIskCompact(-0.3)).toBe('0');
  });
});

describe('parseIskAmount', () => {
  it('parses a plain integer', () => {
    expect(parseIskAmount('10500000')).toBe(10_500_000);
  });

  it('parses comma-separated thousands', () => {
    expect(parseIskAmount('10,500,000')).toBe(10_500_000);
  });

  it('parses a decimal with the "m" (million) suffix', () => {
    expect(parseIskAmount('10.5m')).toBe(10_500_000);
  });

  it('parses the "b" (billion) suffix', () => {
    expect(parseIskAmount('1.2b')).toBe(1_200_000_000);
  });

  it('parses the "t" (thousand) suffix', () => {
    expect(parseIskAmount('500t')).toBe(500_000);
  });

  it('is case-insensitive on the suffix', () => {
    expect(parseIskAmount('10.5M')).toBe(10_500_000);
    expect(parseIskAmount('1.2B')).toBe(1_200_000_000);
    expect(parseIskAmount('500T')).toBe(500_000);
  });

  it('allows whitespace around the value', () => {
    expect(parseIskAmount('  10.5m  ')).toBe(10_500_000);
  });

  it('allows a suffix combined with comma-separated thousands', () => {
    expect(parseIskAmount('1,500m')).toBe(1_500_000_000);
  });

  it('returns null for an empty or whitespace-only string', () => {
    expect(parseIskAmount('')).toBeNull();
    expect(parseIskAmount('   ')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseIskAmount('abc')).toBeNull();
    expect(parseIskAmount('10x')).toBeNull();
    expect(parseIskAmount('m10')).toBeNull();
  });
});
