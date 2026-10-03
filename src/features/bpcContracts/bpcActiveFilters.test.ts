import { describe, expect, it } from 'vitest';
import { SPACE_KINDS } from '@/engine/space';
import { DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { DEFAULT_SOURCE_TOGGLES } from './bpcSourcingUrl';
import {
  bpcActiveFilterChips,
  bpcActiveFilterCount,
  type BpcFilterState,
} from './bpcActiveFilters';

const EMPTY: BpcFilterState = {
  filter: {
    typeQuery: '',
    regionId: null,
    minMe: '',
    minTe: '',
    minRuns: '',
    maxPrice: '',
    hideAuctions: false,
    hidePlex: false,
  },
  sources: new Set(DEFAULT_SOURCE_TOGGLES),
  spaceKinds: SPACE_KINDS,
  jumps: DEFAULT_JUMP_RANGE,
};

const EVERYTHING: BpcFilterState = {
  filter: {
    typeQuery: 'rifter',
    regionId: 10000002,
    minMe: '8',
    minTe: '16',
    minRuns: '5',
    maxPrice: '50m',
    hideAuctions: true,
    hidePlex: true,
  },
  sources: new Set(['contract', 'market'] as const),
  spaceKinds: ['highsec'],
  jumps: '10',
};

describe('bpcActiveFilterChips', () => {
  it('has no chips at the defaults', () => {
    expect(bpcActiveFilterChips(EMPTY)).toEqual([]);
  });

  it('has one chip per filter set away from its default, in the filter sheet’s order', () => {
    expect(bpcActiveFilterChips(EVERYTHING).map((chip) => chip.id)).toEqual([
      'region',
      'jumps',
      'minMe',
      'minTe',
      'minRuns',
      'maxPrice',
      'hideAuctions',
      'hidePlex',
      'sources',
      'space',
    ]);
  });

  it('carries the value a label needs', () => {
    const byId = new Map(bpcActiveFilterChips(EVERYTHING).map((chip) => [chip.id, chip]));
    expect(byId.get('region')?.value).toBe(10000002);
    expect(byId.get('jumps')?.value).toBe('10');
    expect(byId.get('minMe')?.value).toBe('8');
    expect(byId.get('maxPrice')?.value).toBe('50m');
    expect(byId.get('sources')?.value).toEqual(['contract', 'market']);
    expect(byId.get('space')?.value).toEqual(['highsec']);
  });

  it('ignores a whitespace-only number field, the same as the filter does', () => {
    const state = { ...EMPTY, filter: { ...EMPTY.filter, minMe: '  ' } };
    expect(bpcActiveFilterChips(state)).toEqual([]);
  });

  it('never chips the search text — the search box already shows it', () => {
    const state = { ...EMPTY, filter: { ...EMPTY.filter, typeQuery: 'rifter' } };
    expect(bpcActiveFilterChips(state)).toEqual([]);
  });

  it('clears exactly its own filter back to the default', () => {
    for (const chip of bpcActiveFilterChips(EVERYTHING)) {
      const cleared = chip.clear(EVERYTHING);
      const remaining = bpcActiveFilterChips(cleared).map((c) => c.id);
      expect(remaining).not.toContain(chip.id);
      expect(remaining).toHaveLength(bpcActiveFilterChips(EVERYTHING).length - 1);
      expect(cleared.filter.typeQuery).toBe('rifter');
    }
  });
});

describe('bpcActiveFilterCount', () => {
  it('is the chips plus the search text, so the funnel badge and the chips never disagree', () => {
    expect(bpcActiveFilterCount(EMPTY)).toBe(0);
    expect(bpcActiveFilterCount(EVERYTHING)).toBe(bpcActiveFilterChips(EVERYTHING).length + 1);
    const noSearch = { ...EVERYTHING, filter: { ...EVERYTHING.filter, typeQuery: '' } };
    expect(bpcActiveFilterCount(noSearch)).toBe(bpcActiveFilterChips(noSearch).length);
  });
});
