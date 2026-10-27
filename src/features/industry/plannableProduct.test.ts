import { describe, it, expect } from 'vitest';
import { buildPlannableIndex, plannableProductTypeID } from './plannableProduct';
import type { BlueprintMap } from '@/sde/types';

const BLUEPRINTS: BlueprintMap = {
  // Rifter Blueprint -> Rifter
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  // A reaction formula -> its output
  '46167': {
    name: 'Caesarium Cadmide Reaction Formula',
    time: 10800,
    materials: [],
    products: [{ typeID: 16659, quantity: 10000 }],
    skills: [],
    activity: 'reaction',
  },
  // Pathological data: a blueprint with no product at all.
  '99999': {
    name: 'Broken Blueprint',
    time: 60,
    materials: [],
    products: [],
    skills: [],
    activity: 'manufacturing',
  },
};

const index = buildPlannableIndex(BLUEPRINTS);

describe('plannableProductTypeID', () => {
  it('resolves a blueprint to the item it manufactures', () => {
    expect(plannableProductTypeID(index, 638)).toBe(587);
  });

  it('resolves a reaction formula to its output', () => {
    expect(plannableProductTypeID(index, 46167)).toBe(16659);
  });

  it('resolves a manufacturable item to itself', () => {
    expect(plannableProductTypeID(index, 587)).toBe(587);
  });

  it('is null for an item nothing produces and no blueprint of its own', () => {
    expect(plannableProductTypeID(index, 34)).toBeNull();
  });

  it('is null for a blueprint with no product rather than throwing', () => {
    expect(plannableProductTypeID(index, 99999)).toBeNull();
  });

  it('prefers the blueprint reading when a typeID is somehow both', () => {
    // A blueprint that produces another blueprint would otherwise resolve to
    // itself and open a plan for the copy rather than for what it builds.
    const weird = buildPlannableIndex({
      '1': {
        name: 'Blueprint Of Blueprints',
        time: 1,
        materials: [],
        products: [{ typeID: 2, quantity: 1 }],
        skills: [],
        activity: 'manufacturing',
      },
      '2': {
        name: 'Inner Blueprint',
        time: 1,
        materials: [],
        products: [{ typeID: 3, quantity: 1 }],
        skills: [],
        activity: 'manufacturing',
      },
    });
    expect(plannableProductTypeID(weird, 2)).toBe(3);
  });
});
