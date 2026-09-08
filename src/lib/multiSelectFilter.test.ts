import { describe, it, expect } from 'vitest';
import { toggleFilterMember } from './multiSelectFilter';

describe('toggleFilterMember', () => {
  const universe = [1, 2, 3];

  it('starts a subset from "all" by toggling one member out', () => {
    expect(toggleFilterMember('all', 2, universe)).toEqual(new Set([1, 3]));
  });

  it('toggles a member into an existing subset', () => {
    const next = toggleFilterMember(new Set([1]), 2, universe);
    expect(next).toEqual(new Set([1, 2]));
  });

  it('toggles a member out of a subset', () => {
    const next = toggleFilterMember(new Set([1, 2]), 1, universe);
    expect(next).toEqual(new Set([2]));
  });

  it('collapses to "all" once every member is selected', () => {
    const next = toggleFilterMember(new Set([1, 2]), 3, universe);
    expect(next).toBe('all');
  });

  it('collapses to "all" rather than leaving an empty set', () => {
    const next = toggleFilterMember(new Set([1]), 1, universe);
    expect(next).toBe('all');
  });
});
