import { afterEach, describe, expect, it } from 'vitest';
import { setDecimalMark } from '@/lib/numberLocale';
import { formatCostIndex } from './format';

describe('formatCostIndex', () => {
  afterEach(() => setDecimalMark('.'));

  it('writes the percent with a period', () => {
    setDecimalMark('.');
    expect(formatCostIndex(0.0464)).toBe('4.64%');
  });

  it('follows the comma mark', () => {
    setDecimalMark(',');
    expect(formatCostIndex(0.0464)).toBe('4,64%');
  });
});
