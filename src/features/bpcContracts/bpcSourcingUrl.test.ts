import { describe, it, expect } from 'vitest';
import { BPC_SOURCING_PARAMS, bpcSourcingCommunityHref, bpcSourcingHref } from './bpcSourcingUrl';

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
