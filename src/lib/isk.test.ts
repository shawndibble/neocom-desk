import { describe, it, expect } from 'vitest';
import {
  CONTRACT_ISK_CENTS_BELOW,
  formatIsk,
  formatIskAuto,
  formatIskCompact,
  formatIskCompactSigned,
  formatMarketIsk,
  marketIskDecimals,
  parseIskAmount,
} from './isk';

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

describe('formatIskAuto', () => {
  it('keeps 2 decimals at and under 100 ISK, where cents can be the whole story', () => {
    expect(formatIskAuto(100)).toBe('100.00');
    expect(formatIskAuto(4.99)).toBe('4.99');
  });

  it('drops decimals once an amount is over 100 ISK', () => {
    expect(formatIskAuto(100.01)).toBe('100');
    expect(formatIskAuto(31_537_450.72)).toBe('31,537,451');
  });

  it('applies the same 100 ISK threshold to a negative amount by magnitude', () => {
    expect(formatIskAuto(-100.01)).toBe('-100');
    expect(formatIskAuto(-4.99)).toBe('-4.99');
  });

  it('takes a caller-chosen threshold, which the contract screens raise to 1,000', () => {
    expect(formatIskAuto(5_000_000_000, CONTRACT_ISK_CENTS_BELOW)).toBe('5,000,000,000');
    expect(formatIskAuto(1_000, CONTRACT_ISK_CENTS_BELOW)).toBe('1,000.00');
    expect(formatIskAuto(4.99, CONTRACT_ISK_CENTS_BELOW)).toBe('4.99');
  });
});

describe('formatMarketIsk', () => {
  it('keeps cents below 10,000 ISK', () => {
    expect(formatMarketIsk(9_999.99)).toBe('9,999.99');
    expect(formatMarketIsk(4.5)).toBe('4.50');
  });

  it('drops decimals from 10,000 ISK up', () => {
    expect(formatMarketIsk(10_000)).toBe('10,000');
    expect(formatMarketIsk(1_234_567.89)).toBe('1,234,568');
  });

  it('drops them for an amount that would round up to 10,000.00', () => {
    expect(formatMarketIsk(9_999.996)).toBe('10,000');
  });

  it('judges a negative amount by its size', () => {
    expect(formatMarketIsk(-12_345.67)).toBe('-12,346');
    expect(formatMarketIsk(-9_999.99)).toBe('-9,999.99');
  });

  it('names the precision for a caller that formats the text itself', () => {
    expect(marketIskDecimals(9_999.99)).toBe(2);
    expect(marketIskDecimals(-10_000)).toBe(0);
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

describe('formatIskCompactSigned', () => {
  it('prefixes a gain with one plus', () => {
    expect(formatIskCompactSigned(756_000)).toBe('+756K');
  });

  it('keeps a single minus on a loss, never "+-"', () => {
    expect(formatIskCompactSigned(-756_000)).toBe('-756K');
    expect(formatIskCompactSigned(-1_400_000)).not.toContain('+');
  });

  it('prints zero and rounding noise unsigned', () => {
    expect(formatIskCompactSigned(0)).toBe('0');
    expect(formatIskCompactSigned(-0.3)).toBe('0');
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
