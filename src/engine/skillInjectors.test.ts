import { describe, it, expect } from 'vitest';
import { largeInjectorYield, injectorsToCover } from './skillInjectors';

describe('largeInjectorYield', () => {
  it('yields 500k just under the first bracket', () => {
    expect(largeInjectorYield(4_999_999)).toBe(500_000);
  });

  it('yields 400k at exactly 5,000,000', () => {
    expect(largeInjectorYield(5_000_000)).toBe(400_000);
  });

  it('yields 300k at exactly 50,000,000', () => {
    expect(largeInjectorYield(50_000_000)).toBe(300_000);
  });

  it('yields 150k at exactly 80,000,000', () => {
    expect(largeInjectorYield(80_000_000)).toBe(150_000);
  });
});

describe('injectorsToCover', () => {
  it('needs none for a gap of 0', () => {
    expect(injectorsToCover(0, 4_800_000)).toEqual({ count: 0, deliveredSp: 0, surplusSp: 0 });
  });

  it('needs none for a negative gap (already covered by unallocated)', () => {
    expect(injectorsToCover(-1_000_000, 4_800_000)).toEqual({
      count: 0,
      deliveredSp: 0,
      surplusSp: 0,
    });
  });

  it('crosses the 5M bracket mid-run', () => {
    // 4.8M -> 500k (crosses to 5.3M) -> 400k (5.7M) -> 400k (6.1M), covering
    // the 1M gap on the third injector with 300k left over.
    expect(injectorsToCover(1_000_000, 4_800_000)).toEqual({
      count: 3,
      deliveredSp: 1_300_000,
      surplusSp: 300_000,
    });
  });

  it('crosses the 50M bracket mid-run', () => {
    // 49.8M -> 400k (50.2M, now in the 300k bracket) -> 300k, covering the
    // 500k gap on the second injector with 200k left over.
    expect(injectorsToCover(500_000, 49_800_000)).toEqual({
      count: 2,
      deliveredSp: 700_000,
      surplusSp: 200_000,
    });
  });

  it('uses the 150k bracket once already over 80M', () => {
    expect(injectorsToCover(300_000, 90_000_000)).toEqual({
      count: 2,
      deliveredSp: 300_000,
      surplusSp: 0,
    });
  });
});
