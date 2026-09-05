import { describe, it, expect } from 'vitest';
import { filterMarketTree, addAncestors, MARKET_TREE_MATCH_LIMIT } from './marketTree';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

// Ships (1)
//   Frigates (2, hasTypes)
//     Rifter (type 587)
//     Punisher (type 597)
//   Cruisers (3, hasTypes)
//     Rupture (type 620)
// Blueprints (4, hasTypes) — no matches, should disappear entirely under 'rifter'
const GROUPS: MarketGroupNode[] = [
  { id: 1, name: 'Ships', parentId: null, hasTypes: false },
  { id: 2, name: 'Frigates', parentId: 1, hasTypes: true },
  { id: 3, name: 'Cruisers', parentId: 1, hasTypes: true },
  { id: 4, name: 'Blueprints', parentId: null, hasTypes: true },
];

const TYPES: MarketTypeEntry[] = [
  { typeId: 587, name: 'Rifter', marketGroupId: 2 },
  { typeId: 597, name: 'Punisher', marketGroupId: 2 },
  { typeId: 620, name: 'Rupture', marketGroupId: 3 },
];

describe('addAncestors', () => {
  const groupsById = new Map(GROUPS.map((g) => [g.id, g]));

  it('adds a group and every ancestor up to the root', () => {
    const into = new Set<number>();
    addAncestors(2, groupsById, into);
    expect(into).toEqual(new Set([2, 1]));
  });

  it('stops at a root with no parent', () => {
    const into = new Set<number>();
    addAncestors(4, groupsById, into);
    expect(into).toEqual(new Set([4]));
  });

  it('is a no-op once the id is already in `into` — the cycle guard', () => {
    const into = new Set([2]);
    addAncestors(2, groupsById, into);
    expect(into).toEqual(new Set([2]));
  });

  it('stops instead of looping forever on a cyclic parentId chain', () => {
    const cyclic = new Map([
      [10, { id: 10, name: 'A', parentId: 11, hasTypes: false }],
      [11, { id: 11, name: 'B', parentId: 10, hasTypes: false }],
    ]);
    const into = new Set<number>();
    addAncestors(10, cyclic, into);
    expect(into).toEqual(new Set([10, 11]));
  });
});

describe('filterMarketTree', () => {
  it('returns null (no filter) for a query under 3 characters', () => {
    expect(filterMarketTree(GROUPS, TYPES, 'ri')).toBeNull();
    expect(filterMarketTree(GROUPS, TYPES, '')).toBeNull();
  });

  it('matches a leaf item and keeps its whole ancestor chain visible, hiding unrelated branches', () => {
    const result = filterMarketTree(GROUPS, TYPES, 'rifter');
    expect(result).not.toBeNull();
    expect(result?.visibleGroupIds).toEqual(new Set([1, 2]));
    expect(result?.matchedTypesByGroup.get(2)?.map((t) => t.name)).toEqual(['Rifter']);
    expect(result?.totalMatches).toBe(1);
    expect(result?.capped).toBe(false);
  });

  it('is case-insensitive and matches substrings, not just prefixes', () => {
    const result = filterMarketTree(GROUPS, TYPES, 'unis');
    expect(result?.matchedTypesByGroup.get(2)?.map((t) => t.name)).toEqual(['Punisher']);
    expect(result?.visibleGroupIds).toEqual(new Set([1, 2]));
  });

  it('excludes a branch with no matching descendant entirely', () => {
    const result = filterMarketTree(GROUPS, TYPES, 'rifter');
    expect(result?.visibleGroupIds.has(3)).toBe(false);
    expect(result?.visibleGroupIds.has(4)).toBe(false);
  });

  it('caps total displayed matches and reports when it has capped them', () => {
    const manyTypes: MarketTypeEntry[] = Array.from(
      { length: MARKET_TREE_MATCH_LIMIT + 10 },
      (_, i) => ({ typeId: i, name: `Widget ${i}`, marketGroupId: 2 })
    );
    const result = filterMarketTree(GROUPS, manyTypes, 'widget');
    expect(result?.totalMatches).toBe(MARKET_TREE_MATCH_LIMIT + 10);
    expect(result?.capped).toBe(true);
    expect(result?.matchedTypesByGroup.get(2)?.length).toBe(MARKET_TREE_MATCH_LIMIT);
  });

  it('reports no match anywhere as an empty result, not an error', () => {
    const result = filterMarketTree(GROUPS, TYPES, 'nonexistent');
    expect(result?.visibleGroupIds.size).toBe(0);
    expect(result?.totalMatches).toBe(0);
    expect(result?.capped).toBe(false);
  });
});
