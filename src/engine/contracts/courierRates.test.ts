import { describe, expect, it } from 'vitest';
import { collateralToRewardRatio, iskPerJump, iskPerVolume } from './courierRates';

describe('iskPerVolume', () => {
  it('divides the reward by the cargo it moves', () => {
    expect(iskPerVolume(10_000_000, 50_000)).toBe(200);
  });

  it('has no rate for a haul that states no cargo, rather than an infinite one', () => {
    expect(iskPerVolume(10_000_000, 0)).toBeNull();
  });

  it('is zero, not null, for a favour run that pays nothing', () => {
    expect(iskPerVolume(0, 50_000)).toBe(0);
  });

  it('has no rate when neither figure is usable', () => {
    expect(iskPerVolume(0, 0)).toBeNull();
  });
});

describe('iskPerJump', () => {
  it('divides the reward by the jumps flown', () => {
    expect(iskPerJump(10_000_000, 5)).toBe(2_000_000);
  });

  it('credits a same-system haul with the whole reward rather than dividing by zero', () => {
    expect(iskPerJump(10_000_000, 0)).toBe(10_000_000);
  });

  it('has no rate when the distance is unknown', () => {
    expect(iskPerJump(10_000_000, null)).toBeNull();
  });
});

describe('collateralToRewardRatio', () => {
  it('says how many times the reward the hauler has to put up', () => {
    expect(collateralToRewardRatio(1_000_000_000, 10_000_000)).toBe(100);
  });

  it('is zero for a haul that asks for no collateral at all', () => {
    expect(collateralToRewardRatio(0, 10_000_000)).toBe(0);
  });

  it('has no ratio against a reward of zero, rather than an infinite one', () => {
    expect(collateralToRewardRatio(1_000_000_000, 0)).toBeNull();
  });
});
