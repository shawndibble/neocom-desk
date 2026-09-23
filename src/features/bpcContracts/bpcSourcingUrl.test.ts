import { describe, it, expect } from 'vitest';
import { BPC_SOURCING_PARAMS, bpcSourcingHref } from './bpcSourcingUrl';

describe('bpcSourcingHref', () => {
  it('opens the Sourcing tab pinned to the blueprint', () => {
    expect(bpcSourcingHref(638)).toBe('/industry/sourcing?sourcing.type=638');
  });

  it('round-trips through the pinned-type param', () => {
    const search = new URL(bpcSourcingHref(638), 'https://x').searchParams;
    expect(BPC_SOURCING_PARAMS['sourcing.type'].parse(search.get('sourcing.type'))).toBe(638);
  });
});
