import { describe, it, expect } from 'vitest';
import { EXORDIUM_REGION_ID, regionalJobTaxPct } from '@/engine/industry/regionalTax';

describe('regionalJobTaxPct', () => {
  it('is 5 in Exordium (Manifest V job: 19,342 ISK on a 386,830 ISK EIV, measured)', () => {
    expect(regionalJobTaxPct(EXORDIUM_REGION_ID)).toBe(5);
  });

  it('is 0 anywhere else, and for an unknown region', () => {
    expect(regionalJobTaxPct(10000002)).toBe(0); // The Forge
    expect(regionalJobTaxPct(undefined)).toBe(0);
  });
});
