import { describe, expect, it } from 'vitest';
import { formatIskExact } from './chargeFormat';

describe('chargeFormat formatIskExact', () => {
  it('is exact: no K/M suffix without a hover to the whole figure', () => {
    expect(formatIskExact(62)).toBe('62');
    expect(formatIskExact(1240.4)).toBe('1,240');
    expect(formatIskExact(12_500)).toBe('12,500');
    expect(formatIskExact(3_400_000)).toBe('3,400,000');
  });
});
