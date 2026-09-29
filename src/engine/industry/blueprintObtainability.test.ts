import { describe, it, expect } from 'vitest';
import { blueprintSource, type BlueprintSourceSets } from './blueprintObtainability';

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

  it('ignores other blueprints in a source', () => {
    expect(blueprintSource(501, { ...NONE, market: new Set([502]) })).toBeNull();
  });
});
