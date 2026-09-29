import { describe, it, expect } from 'vitest';
import {
  BLUEPRINT_SOURCE_RANK,
  blueprintSource,
  isNpcSeededProduct,
  type BlueprintSourceSets,
} from './blueprintObtainability';

const NONE: BlueprintSourceSets = {
  owned: new Set(),
  market: new Set(),
  contract: new Set(),
  lpStore: new Set(),
};

describe('blueprintSource', () => {
  it('is null when no source carries the blueprint', () => {
    expect(blueprintSource(501, NONE)).toBeNull();
  });

  it.each([
    ['owned', { ...NONE, owned: new Set([501]) }],
    ['market', { ...NONE, market: new Set([501]) }],
    ['contract', { ...NONE, contract: new Set([501]) }],
    ['lpStore', { ...NONE, lpStore: new Set([501]) }],
  ] as const)('names %s when only that source carries it', (expected, sets) => {
    expect(blueprintSource(501, sets)).toBe(expected);
  });

  it('prefers owned over every way to buy it, then market, contract, LP store', () => {
    const all = new Set([501]);
    expect(blueprintSource(501, { owned: all, market: all, contract: all, lpStore: all })).toBe(
      'owned'
    );
    expect(blueprintSource(501, { ...NONE, market: all, contract: all, lpStore: all })).toBe(
      'market'
    );
    expect(blueprintSource(501, { ...NONE, contract: all, lpStore: all })).toBe('contract');
  });

  it('ranks sources in the order blueprintSource prefers them', () => {
    expect(BLUEPRINT_SOURCE_RANK).toEqual({ owned: 0, market: 1, contract: 2, lpStore: 3 });
  });

  it('ignores other blueprints in a source', () => {
    expect(blueprintSource(501, { ...NONE, market: new Set([502]) })).toBeNull();
  });
});

describe('isNpcSeededProduct', () => {
  it.each([
    ['no meta group (T1 components, capitals, fuel)', undefined],
    ['Tech I', 1],
    ['Structure Tech I', 54],
  ] as const)('is true for %s', (_label, metaGroupId) => {
    expect(isNpcSeededProduct(metaGroupId)).toBe(true);
  });

  // CCP market-groups these blueprints too (the old T2 lottery BPOs, faction
  // LP blueprints), but no NPC sells them.
  it.each([
    ['Tech II', 2],
    ['Storyline', 3],
    ['Faction', 4],
    ['Officer', 5],
    ['Tech III', 14],
    ['Limited Time', 19],
    ['Structure Faction', 52],
    ['Structure Tech II', 53],
  ] as const)('is false for %s', (_label, metaGroupId) => {
    expect(isNpcSeededProduct(metaGroupId)).toBe(false);
  });
});
