import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDecimalMark } from '@/lib/numberLocale';
import { formatIskExact } from './chargeFormat';
import { fmt } from './implantFinderFormat';

beforeEach(() => setDecimalMark('.'));
afterEach(() => setDecimalMark('.'));

describe('chargeFormat formatIskExact', () => {
  it('is exact: no K/M suffix without a hover to the whole figure', () => {
    expect(formatIskExact(62)).toBe('62');
    expect(formatIskExact(1240.4)).toBe('1,240');
    expect(formatIskExact(12_500)).toBe('12,500');
    expect(formatIskExact(3_400_000)).toBe('3,400,000');
  });

  it('follows the Number format setting', () => {
    setDecimalMark(',');
    expect(formatIskExact(3_400_000)).toBe('3.400.000');
  });
});

describe('implantFinderFormat fmt', () => {
  it('pads to the requested decimals and follows the Number format setting', () => {
    expect(fmt(1234.5, 2)).toBe('1,234.50');
    setDecimalMark(',');
    expect(fmt(1234.5, 2)).toBe('1.234,50');
  });
});
