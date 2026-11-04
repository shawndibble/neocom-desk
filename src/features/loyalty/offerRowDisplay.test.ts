import { describe, expect, it } from 'vitest';
import { isLowVolume, lpShortfall, LOW_SELLS_PER_DAY } from './offerRowDisplay';
import type { LoyaltyOfferRow } from './offerRows';

const row = (over: { sellsPerDay?: number | null; lpCost?: number }) =>
  ({
    sellsPerDay: over.sellsPerDay ?? null,
    offer: { lp_cost: over.lpCost ?? 1000 },
  }) as unknown as LoyaltyOfferRow;

describe('isLowVolume', () => {
  it('flags an offer that sells under a unit a day, a real zero included', () => {
    expect(isLowVolume(row({ sellsPerDay: 0 }))).toBe(true);
    expect(isLowVolume(row({ sellsPerDay: LOW_SELLS_PER_DAY - 0.1 }))).toBe(true);
  });
  it('does not flag one at the threshold or above, or one with no volume data', () => {
    expect(isLowVolume(row({ sellsPerDay: LOW_SELLS_PER_DAY }))).toBe(false);
    expect(isLowVolume(row({ sellsPerDay: 15 }))).toBe(false);
    expect(isLowVolume(row({ sellsPerDay: null }))).toBe(false);
  });
});

describe('lpShortfall', () => {
  it('is the LP still missing for an offer the pilot cannot yet afford', () => {
    expect(lpShortfall(row({ lpCost: 2400 }), 1200)).toBe(1200);
  });
  it('is null when affordable, when LP is unknown, and when the pilot holds none', () => {
    expect(lpShortfall(row({ lpCost: 1000 }), 1000)).toBeNull();
    expect(lpShortfall(row({ lpCost: 1000 }), null)).toBeNull();
    // With 0 LP every offer is out of reach; dimming all of them says nothing.
    expect(lpShortfall(row({ lpCost: 1000 }), 0)).toBeNull();
  });
});
