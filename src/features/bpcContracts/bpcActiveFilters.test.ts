import { describe, expect, it } from 'vitest';
import { SPACE_KINDS } from '@/engine/space';
import { DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { DEFAULT_SOURCE_TOGGLES } from './bpcSourcingUrl';
import {
  bpcActiveFilterChips,
  bpcActiveFilterCount,
  type BpcFilterState,
  type BpcHideDefaults,
} from './bpcActiveFilters';

const NO_HIDE: BpcHideDefaults = { hideAuctions: false, hidePlex: false };

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
    expect(bpcActiveFilterChips(EMPTY, NO_HIDE)).toEqual([]);
  });

  it('has one chip per filter set away from its default, in the filter sheet’s order', () => {
    expect(bpcActiveFilterChips(EVERYTHING, NO_HIDE).map((chip) => chip.id)).toEqual([
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
    const byId = new Map(bpcActiveFilterChips(EVERYTHING, NO_HIDE).map((chip) => [chip.id, chip]));
    expect(byId.get('region')?.value).toBe(10000002);
    expect(byId.get('jumps')?.value).toBe('10');
    expect(byId.get('minMe')?.value).toBe('8');
    expect(byId.get('maxPrice')?.value).toBe('50m');
    expect(byId.get('sources')?.value).toEqual(['contract', 'market']);
    expect(byId.get('space')?.value).toEqual(['highsec']);
  });

  it('ignores a whitespace-only number field, the same as the filter does', () => {
    const state = { ...EMPTY, filter: { ...EMPTY.filter, minMe: '  ' } };
    expect(bpcActiveFilterChips(state, NO_HIDE)).toEqual([]);
  });

  it('never chips the search text — the search box already shows it', () => {
    const state = { ...EMPTY, filter: { ...EMPTY.filter, typeQuery: 'rifter' } };
    expect(bpcActiveFilterChips(state, NO_HIDE)).toEqual([]);
  });

  it('clears exactly its own filter back to the default', () => {
    for (const chip of bpcActiveFilterChips(EVERYTHING, NO_HIDE)) {
      const cleared = chip.clear(EVERYTHING);
      const remaining = bpcActiveFilterChips(cleared, NO_HIDE).map((c) => c.id);
      expect(remaining).not.toContain(chip.id);
      expect(remaining).toHaveLength(bpcActiveFilterChips(EVERYTHING, NO_HIDE).length - 1);
      expect(cleared.filter.typeQuery).toBe('rifter');
    }
  });
});

describe('bpcActiveFilterChips with Exclude defaults', () => {
  const HIDE_PLEX: BpcHideDefaults = { hideAuctions: false, hidePlex: true };
  const hidingPlex = { ...EMPTY, filter: { ...EMPTY.filter, hidePlex: true } };

  it('gives no chip to hiding something the pilot hides by default', () => {
    expect(bpcActiveFilterChips(hidingPlex, HIDE_PLEX)).toEqual([]);
    expect(bpcActiveFilterCount(hidingPlex, HIDE_PLEX)).toBe(0);
  });

  it('clears a chip back to the default, which Clear all then leaves alone', () => {
    const both = { ...hidingPlex, filter: { ...hidingPlex.filter, hideAuctions: true } };
    const [auctions] = bpcActiveFilterChips(both, HIDE_PLEX);
    expect(auctions.id).toBe('hideAuctions');
    const cleared = auctions.clear(both);
    expect(cleared.filter.hideAuctions).toBe(false);
    expect(cleared.filter.hidePlex).toBe(true);
  });
});

describe('bpcActiveFilterCount', () => {
  it('is the chips plus the search text, so the funnel badge and the chips never disagree', () => {
    expect(bpcActiveFilterCount(EMPTY, NO_HIDE)).toBe(0);
    expect(bpcActiveFilterCount(EVERYTHING, NO_HIDE)).toBe(
      bpcActiveFilterChips(EVERYTHING, NO_HIDE).length + 1
    );
    const noSearch = { ...EVERYTHING, filter: { ...EVERYTHING.filter, typeQuery: '' } };
    expect(bpcActiveFilterCount(noSearch, NO_HIDE)).toBe(
      bpcActiveFilterChips(noSearch, NO_HIDE).length
    );
  });
});
