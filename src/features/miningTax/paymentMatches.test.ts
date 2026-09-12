import { describe, expect, it } from 'vitest';
import { amountsMatch } from './paymentMatches';

describe('amountsMatch', () => {
  it('accepts figures within half a percent, rejects a wider miss', () => {
    expect(amountsMatch(21_547_000, 21_547_000)).toBe(true);
    expect(amountsMatch(21_600_000, 21_547_000)).toBe(true);
    expect(amountsMatch(20_000_000, 21_547_000)).toBe(false);
  });

  it('falls back to a flat one-ISK tolerance for tiny amounts', () => {
    expect(amountsMatch(2, 1)).toBe(true);
    expect(amountsMatch(3, 1)).toBe(false);
  });
});
