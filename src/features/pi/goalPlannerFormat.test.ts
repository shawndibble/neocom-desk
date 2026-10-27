import { describe, it, expect } from 'vitest';
import { parseDecimal } from './goalPlannerFormat';

describe('parseDecimal', () => {
  it('reads a dot or a comma as the decimal separator', () => {
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 200 ')).toBe(200);
    expect(parseDecimal('.5')).toBe(0.5);
  });

  it('refuses blanks, signs, garbage and thousands-separated input', () => {
    for (const text of ['', ' ', '-1', 'abc', '1e3', '1,000.5', '12a', '1.2.3']) {
      expect(parseDecimal(text)).toBeNull();
    }
  });
});
