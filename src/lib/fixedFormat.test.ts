import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixed0, fixed1, fixed2, fixedFormat } from './fixedFormat';
import { setDecimalMark } from './numberLocale';

afterEach(() => setDecimalMark('.'));

describe('fixed formatters', () => {
  it('match toFixed under the dot mark, never grouped', () => {
    expect(fixed1(0.5)).toBe('0.5');
    expect(fixed1(12345.67)).toBe('12345.7');
    expect(fixed2(3)).toBe('3.00');
    expect(fixed0(7.4)).toBe('7');
  });

  it('follow the comma mark', () => {
    setDecimalMark(',');
    expect(fixed1(0.5)).toBe('0,5');
    expect(fixed2(12345.678)).toBe('12345,68');
  });

  it('do not print negative zero', () => {
    expect(fixed1(-0.04)).toBe('0.0');
    expect(fixed1(-0.5)).toBe('-0.5');
    setDecimalMark(',');
    expect(fixed2(-0.001)).toBe('0,00');
  });

  it('formats on an engine that rejects signDisplay (NEOCOM-DESK-1Y)', () => {
    const Real = Intl.NumberFormat;
    class OldNumberFormat extends Real {
      constructor(locale?: string | string[], options?: Intl.NumberFormatOptions) {
        if (options && 'signDisplay' in options) {
          throw new RangeError('Value negative out of range for Intl.NumberFormat options');
        }
        super(locale, options);
      }
    }
    vi.stubGlobal('Intl', { ...Intl, NumberFormat: OldNumberFormat });
    try {
      // A digit count no other test has built, so the formatter is made fresh.
      expect(fixedFormat(6)(-0.0000001)).toBe('0.000000');
      expect(fixedFormat(6)(-1.5)).toBe('-1.500000');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
