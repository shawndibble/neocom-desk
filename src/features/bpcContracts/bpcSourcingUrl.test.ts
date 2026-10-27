import { describe, it, expect } from 'vitest';
import {
  BPC_SOURCING_PARAMS,
  bpcSourcingCommunityHref,
  bpcSourcingHref,
  sourceToggleKey,
  sourceToggleSet,
} from './bpcSourcingUrl';

describe('sourceToggleKey', () => {
  it('is equal for equal sets built in any order', () => {
    expect(sourceToggleKey(new Set(['owned', 'contract']))).toBe(
      sourceToggleKey(new Set(['contract', 'owned']))
    );
  });

  it('differs when the sets differ', () => {
    expect(sourceToggleKey(new Set(['owned']))).not.toBe(sourceToggleKey(new Set(['contract'])));
  });

  it('round-trips through sourceToggleSet, including the empty set', () => {
    for (const sources of [new Set<'owned' | 'lp'>(), new Set<'owned' | 'lp'>(['owned', 'lp'])]) {
      expect(sourceToggleSet(sourceToggleKey(sources))).toEqual(sources);
    }
  });
});

describe('bpcSourcingHref', () => {
  it('opens the Sourcing tab pinned to the blueprint', () => {
    expect(bpcSourcingHref(638)).toBe('/industry/sourcing?sourcing.type=638');
  });

  it('round-trips through the pinned-type param', () => {
    const search = new URL(bpcSourcingHref(638), 'https://x').searchParams;
    expect(BPC_SOURCING_PARAMS['sourcing.type'].parse(search.get('sourcing.type'))).toBe(638);
  });
});

describe('bpcSourcingCommunityHref', () => {
  it('opens the Sourcing tab on the Community and Owned sources only', () => {
    expect(bpcSourcingCommunityHref()).toBe('/industry/sourcing?sourcing.src=community%2Cowned');
  });

  it('round-trips through the source param, with no market, contract or LP source', () => {
    const search = new URL(bpcSourcingCommunityHref(), 'https://x').searchParams;
    const sources = BPC_SOURCING_PARAMS['sourcing.src'].parse(search.get('sourcing.src'));
    expect([...sources].sort()).toEqual(['community', 'owned']);
  });
});
