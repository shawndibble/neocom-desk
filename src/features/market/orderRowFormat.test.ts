import { afterEach, describe, expect, it } from 'vitest';
import { setDecimalMark } from '@/lib/numberLocale';
import { formatOrderRemaining } from './orderRowFormat';

afterEach(() => setDecimalMark('.'));

describe('formatOrderRemaining', () => {
  it('groups with the Period format', () => {
    setDecimalMark('.');
    expect(formatOrderRemaining(1234, 1234567)).toBe('1,234 / 1,234,567');
  });

  it('follows the Comma format', () => {
    setDecimalMark(',');
    expect(formatOrderRemaining(1234, 1234567)).toBe('1.234 / 1.234.567');
  });
});
