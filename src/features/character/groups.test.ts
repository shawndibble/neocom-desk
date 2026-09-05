import { describe, it, expect } from 'vitest';
import {
  pruneGroups,
  groupsNeedPruning,
  ungroupedCharacterIds,
  addGroup,
  renameGroup,
  removeGroup,
  moveCharacterToGroup,
  reorderGroups,
  sortCharacterIds,
  rosterSortStats,
  type CharacterGroup,
  type CharacterSortStats,
} from './groups';
import type { RosterEntry } from './roster';

describe('pruneGroups', () => {
  it('drops character ids that no longer exist, keeping the group', () => {
    const groups: CharacterGroup[] = [{ id: 'g1', name: 'Alts', characterIds: [1, 2, 3] }];
    expect(pruneGroups(groups, new Set([1, 3]))).toEqual([
      { id: 'g1', name: 'Alts', characterIds: [1, 3] },
    ]);
  });

  it('keeps a group with an empty characterIds array rather than deleting it', () => {
    const groups: CharacterGroup[] = [{ id: 'g1', name: 'Alts', characterIds: [1] }];
    expect(pruneGroups(groups, new Set())).toEqual([{ id: 'g1', name: 'Alts', characterIds: [] }]);
  });
});

describe('groupsNeedPruning', () => {
  it('is true when a group references a character id that does not exist', () => {
    const groups: CharacterGroup[] = [{ id: 'g1', name: 'Alts', characterIds: [1, 2] }];
    expect(groupsNeedPruning(groups, new Set([1]))).toBe(true);
  });

  it('is false when every referenced character id exists', () => {
    const groups: CharacterGroup[] = [{ id: 'g1', name: 'Alts', characterIds: [1, 2] }];
    expect(groupsNeedPruning(groups, new Set([1, 2, 3]))).toBe(false);
  });
});

describe('ungroupedCharacterIds', () => {
  it('returns ids not claimed by any group, preserving order', () => {
    const groups: CharacterGroup[] = [{ id: 'g1', name: 'Alts', characterIds: [2] }];
    expect(ungroupedCharacterIds(groups, [1, 2, 3])).toEqual([1, 3]);
  });
});

describe('addGroup / renameGroup / removeGroup', () => {
  it('appends a new group', () => {
    expect(addGroup([], { id: 'g1', name: 'Alts', characterIds: [] })).toEqual([
      { id: 'g1', name: 'Alts', characterIds: [] },
    ]);
  });

  it('renames only the matching group', () => {
    const groups: CharacterGroup[] = [
      { id: 'g1', name: 'Alts', characterIds: [] },
      { id: 'g2', name: 'Mains', characterIds: [] },
    ];
    const result = renameGroup(groups, 'g2', 'Mains (PVP)');
    expect(result[0].name).toBe('Alts');
    expect(result[1].name).toBe('Mains (PVP)');
  });

  it('removes a group, leaving its characters ungrouped rather than deleted', () => {
    const groups: CharacterGroup[] = [{ id: 'g1', name: 'Alts', characterIds: [1] }];
    expect(removeGroup(groups, 'g1')).toEqual([]);
  });
});

describe('moveCharacterToGroup', () => {
  it('moves a character from one group to another', () => {
    const groups: CharacterGroup[] = [
      { id: 'g1', name: 'Alts', characterIds: [1, 2] },
      { id: 'g2', name: 'Mains', characterIds: [] },
    ];
    expect(moveCharacterToGroup(groups, 1, 'g2')).toEqual([
      { id: 'g1', name: 'Alts', characterIds: [2] },
      { id: 'g2', name: 'Mains', characterIds: [1] },
    ]);
  });

  it('ungroups a character when groupId is null', () => {
    const groups: CharacterGroup[] = [{ id: 'g1', name: 'Alts', characterIds: [1, 2] }];
    expect(moveCharacterToGroup(groups, 1, null)).toEqual([
      { id: 'g1', name: 'Alts', characterIds: [2] },
    ]);
  });
});

describe('reorderGroups', () => {
  it('moves a group from one index to another', () => {
    const groups: CharacterGroup[] = [
      { id: 'g1', name: 'A', characterIds: [] },
      { id: 'g2', name: 'B', characterIds: [] },
      { id: 'g3', name: 'C', characterIds: [] },
    ];
    expect(reorderGroups(groups, 0, 2).map((g) => g.id)).toEqual(['g2', 'g3', 'g1']);
  });

  it('is a no-op for an out-of-range index', () => {
    const groups: CharacterGroup[] = [{ id: 'g1', name: 'A', characterIds: [] }];
    expect(reorderGroups(groups, 0, 5)).toEqual(groups);
  });
});

describe('sortCharacterIds', () => {
  const stats = new Map<number, CharacterSortStats>([
    [1, { name: 'Zed', skillPoints: 1000, wallet: 50 }],
    [2, { name: 'Amy', skillPoints: 3000, wallet: 10 }],
    [3, { name: 'Mid', wallet: 20 }],
  ]);

  it('sorts by name ascending', () => {
    expect(sortCharacterIds([1, 2, 3], stats, 'name', 'asc')).toEqual([2, 3, 1]);
  });

  it('sorts by skillPoints descending', () => {
    expect(sortCharacterIds([1, 2, 3], stats, 'skillPoints', 'desc')).toEqual([2, 1, 3]);
  });

  it('sinks a missing value to the end regardless of direction', () => {
    expect(sortCharacterIds([1, 2, 3], stats, 'skillPoints', 'asc')).toEqual([1, 2, 3]);
  });

  it('keeps original relative order for ids missing from stats entirely', () => {
    expect(sortCharacterIds([9, 1], stats, 'name', 'asc')).toEqual([1, 9]);
  });
});

describe('rosterSortStats', () => {
  const spFetchedAt = new Date('2026-01-01T00:00:00Z');
  const walletFetchedAt = new Date('2026-01-02T00:00:00Z');

  function entry(overrides: Partial<RosterEntry>): RosterEntry {
    return {
      characterId: 1,
      name: 'Zed',
      wallet: null,
      skills: null,
      queue: null,
      correctedTotalSp: null,
      ...overrides,
    };
  }

  it('carries each field alongside its own fetchedAt', () => {
    const stats = rosterSortStats([
      entry({
        characterId: 1,
        wallet: { data: 500, fetchedAt: walletFetchedAt, fromCache: true, truncated: false },
        skills: {
          data: { skills: [], total_sp: 1000 },
          fetchedAt: spFetchedAt,
          fromCache: true,
          truncated: false,
        },
        correctedTotalSp: 1000,
      }),
    ]);
    expect(stats.get(1)).toEqual({
      name: 'Zed',
      skillPoints: 1000,
      skillPointsFetchedAt: spFetchedAt,
      wallet: 500,
      walletFetchedAt,
    });
  });

  it('leaves both value and fetchedAt undefined for a never-fetched field', () => {
    const stats = rosterSortStats([entry({ characterId: 2, name: 'Mid' })]);
    expect(stats.get(2)).toEqual({
      name: 'Mid',
      skillPoints: undefined,
      skillPointsFetchedAt: undefined,
      wallet: undefined,
      walletFetchedAt: undefined,
    });
  });

  it('a stat with no value carries no timestamp — skills cached but corrected SP unavailable', () => {
    const stats = rosterSortStats([
      entry({
        characterId: 3,
        skills: {
          data: { skills: [], total_sp: 1000 },
          fetchedAt: spFetchedAt,
          fromCache: true,
          truncated: false,
        },
        correctedTotalSp: null,
      }),
    ]);
    expect(stats.get(3)?.skillPoints).toBeUndefined();
    expect(stats.get(3)?.skillPointsFetchedAt).toBeUndefined();
  });
});
