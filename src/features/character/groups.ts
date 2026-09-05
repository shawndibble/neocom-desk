/**
 * Pure character-grouping and sort helpers for the Overview character wall.
 * No Dexie, no fetch — storage lives in overviewGroups.ts, this module only
 * shuffles arrays. `RosterEntry` is a type-only import (roster.ts does the
 * actual Dexie/ESI reads); this module stays dependency-free.
 */
import type { RosterEntry } from './roster';

export interface CharacterGroup {
  id: string;
  name: string;
  characterIds: number[];
}

export type CharacterSortKey = 'name' | 'skillPoints' | 'wallet';
export type SortDirection = 'asc' | 'desc';

/**
 * Flat, not nested `{value, fetchedAt}` pairs: `sortCharacterIds` indexes
 * `stats[key]` directly, and a flat shape keeps that untouched. `*FetchedAt`
 * is undefined exactly when its value is — never show a badge for a value
 * that isn't there (#483).
 */
export interface CharacterSortStats {
  name: string;
  skillPoints?: number;
  skillPointsFetchedAt?: Date;
  wallet?: number;
  walletFetchedAt?: Date;
}

/**
 * Roster snapshot -> the map both the sort control and the character card
 * read from — one pass over `loadRosterSnapshot()`'s result, no second fetch.
 * SP's age is the underlying `/skills` read's `fetchedAt`: `correctedTotalSp`
 * is that same row's total_sp adjusted by queue data in hand, not a fetch of
 * its own.
 */
export function rosterSortStats(entries: readonly RosterEntry[]): Map<number, CharacterSortStats> {
  return new Map(
    entries.map((entry) => [
      entry.characterId,
      {
        name: entry.name,
        skillPoints: entry.correctedTotalSp ?? undefined,
        skillPointsFetchedAt: entry.correctedTotalSp === null ? undefined : entry.skills?.fetchedAt,
        wallet: entry.wallet?.data,
        walletFetchedAt: entry.wallet?.fetchedAt,
      },
    ])
  );
}

/** Drops character ids no longer on this device. A group is kept even if emptied. */
export function pruneGroups(
  groups: readonly CharacterGroup[],
  existingCharacterIds: ReadonlySet<number>
): CharacterGroup[] {
  return groups.map((group) => ({
    ...group,
    characterIds: group.characterIds.filter((id) => existingCharacterIds.has(id)),
  }));
}

/** True if pruning would change anything — lets a caller skip a no-op write. */
export function groupsNeedPruning(
  groups: readonly CharacterGroup[],
  existingCharacterIds: ReadonlySet<number>
): boolean {
  return groups.some((group) => group.characterIds.some((id) => !existingCharacterIds.has(id)));
}

/** Ids claimed by no group, in their original order. */
export function ungroupedCharacterIds(
  groups: readonly CharacterGroup[],
  allCharacterIds: readonly number[]
): number[] {
  const claimed = new Set(groups.flatMap((group) => group.characterIds));
  return allCharacterIds.filter((id) => !claimed.has(id));
}

export function addGroup(
  groups: readonly CharacterGroup[],
  group: CharacterGroup
): CharacterGroup[] {
  return [...groups, group];
}

export function renameGroup(
  groups: readonly CharacterGroup[],
  groupId: string,
  name: string
): CharacterGroup[] {
  return groups.map((group) => (group.id === groupId ? { ...group, name } : group));
}

/** Removes the group; its characters become ungrouped rather than deleted. */
export function removeGroup(groups: readonly CharacterGroup[], groupId: string): CharacterGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

/** Moves a character into `groupId`, clearing it from any other group first. `null` ungroups it. */
export function moveCharacterToGroup(
  groups: readonly CharacterGroup[],
  characterId: number,
  groupId: string | null
): CharacterGroup[] {
  const withoutCharacter = groups.map((group) => ({
    ...group,
    characterIds: group.characterIds.filter((id) => id !== characterId),
  }));
  if (groupId === null) return withoutCharacter;
  return withoutCharacter.map((group) =>
    group.id === groupId ? { ...group, characterIds: [...group.characterIds, characterId] } : group
  );
}

export function reorderGroups(
  groups: readonly CharacterGroup[],
  fromIndex: number,
  toIndex: number
): CharacterGroup[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= groups.length ||
    toIndex < 0 ||
    toIndex >= groups.length
  ) {
    return [...groups];
  }
  const next = [...groups];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Stable sort by the chosen key; a character with no value for that key sinks
 * to the end regardless of direction — mirrors DataTable's `sortValue` convention.
 */
export function sortCharacterIds(
  ids: readonly number[],
  statsById: ReadonlyMap<number, CharacterSortStats>,
  key: CharacterSortKey,
  direction: SortDirection
): number[] {
  function valueOf(id: number): string | number | undefined {
    const stats = statsById.get(id);
    if (!stats) return undefined;
    return key === 'name' ? stats.name : stats[key];
  }

  return ids
    .map((id, index) => ({ id, index, value: valueOf(id) }))
    .sort((a, b) => {
      if (a.value === undefined && b.value === undefined) return a.index - b.index;
      if (a.value === undefined) return 1;
      if (b.value === undefined) return -1;
      const cmp = a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
      if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
      return a.index - b.index;
    })
    .map((entry) => entry.id);
}
