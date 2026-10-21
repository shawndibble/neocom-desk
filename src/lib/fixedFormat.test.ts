import { afterEach, describe, expect, it } from 'vitest';
import { fixed0, fixed1, fixed2 } from './fixedFormat';
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
  });
});
