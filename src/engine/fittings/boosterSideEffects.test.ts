import { describe, expect, it } from 'vitest';
import { boosterSideEffects, sideEffectsSwitchedOn } from './boosterSideEffects';

describe('boosterSideEffects', () => {
  it('lists a booster’s four side effects with the penalty each carries', () => {
    expect(boosterSideEffects(9950)).toEqual([
      { effectId: 2737, penaltyPct: -20 },
      { effectId: 2739, penaltyPct: -20 },
      { effectId: 2745, penaltyPct: -20 },
      { effectId: 2749, penaltyPct: -20 },
    ]);
    // A Strong one bites harder.
    expect(boosterSideEffects(10156)[0]).toEqual({ effectId: 2737, penaltyPct: -30 });
  });

  it('has none for a booster without side effects, or anything else', () => {
    expect(boosterSideEffects(28670)).toEqual([]);
    expect(boosterSideEffects(587)).toEqual([]);
  });

  it('keeps only the chosen side effects that are this booster’s own', () => {
    expect(sideEffectsSwitchedOn(9950, [2737, 2741, 2749])).toEqual([2737, 2749]);
    expect(sideEffectsSwitchedOn(9950, undefined)).toEqual([]);
  });
});
