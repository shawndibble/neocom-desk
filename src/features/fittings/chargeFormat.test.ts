import { describe, expect, it } from 'vitest';
import { formatIsk } from './chargeFormat';

describe('chargeFormat formatIsk', () => {
  it('is exact: no K/M suffix without a hover to the whole figure', () => {
    expect(formatIsk(62)).toBe('62');
    expect(formatIsk(1240.4)).toBe('1,240');
    expect(formatIsk(12_500)).toBe('12,500');
    expect(formatIsk(3_400_000)).toBe('3,400,000');
  });
});
