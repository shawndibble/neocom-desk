import { afterEach, describe, expect, it } from 'vitest';
import { formatCount } from './formatCount';
import { setDecimalMark } from './numberLocale';

describe('formatCount', () => {
  afterEach(() => {
    setDecimalMark('.');
  });

  it('rounds and groups in English', () => {
    expect(formatCount(12345.6)).toBe('12,346');
    expect(formatCount(0.4)).toBe('0');
  });

  it('follows the number format', () => {
    setDecimalMark(',');
    expect(formatCount(1234567)).toBe('1.234.567');
  });
});
