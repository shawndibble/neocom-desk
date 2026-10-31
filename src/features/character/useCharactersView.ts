import { useMemo } from 'react';
import type { CharacterRecord } from '@/db';
import type { AttentionEntry } from '@/features/character/rosterAttention';
import type { RosterCore } from '@/features/character/rosterView';
import {
  availableCharacterColumns,
  type CharacterColumnId,
} from '@/features/character/characterColumns';
import { isSpFarmCharacter } from '@/features/character/spExtractionSettings';
import { isCharacterStarred, partitionStarredFirst } from '@/features/character/starredCharacters';
import {
  sortCharacterIds,
  ungroupedCharacterIds,
  type CharacterGroup,
  type CharacterSortKey,
  type CharacterSortStats,
  type SortDirection,
} from '@/features/character/groups';
import { UNGROUPED_VALUE } from '@/features/character/rosterQueueChip';
import { type QueueState } from '@/engine/skills/queueStatus';
import {
  boolParam,
  enumParam,
  nullableTextParam,
  optionalEnumParam,
  optionalSortParam,
  textParam,
} from '@/lib/urlState';
import { useUrlParam, useUrlParams } from '@/lib/useUrlState';
import type { WhereaboutsLookup } from '@/features/character/useCharacterWhereabouts';
import type { CharacterRow } from '@/features/character/charactersTableColumns';

export const SORT_KEYS: readonly CharacterSortKey[] = [
  'name',
  'skillPoints',
  'wallet',
  'group',
  'alerts',
];
export const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];
/** `unknown` left out: it means "no cached queue yet", not a state anyone filters for. */
export const QUEUE_FILTER_STATES: readonly QueueState[] = [
  'training',
  'endingSoon',
  'paused',
  'idle',
];
/** Radix `SelectItem` can't take `''`, so "any corporation" needs a sentinel. */
export const ALL_CORPS_VALUE = '__all__';
/** Same reasoning as `ALL_CORPS_VALUE` — "any Group" needs a non-empty sentinel. `UNGROUPED_VALUE` (above) doubles as this filter's "no Group" option, same as the group column's Select. */
export const ALL_GROUPS_VALUE = '__all_groups__';

/**
 * The filter bar, in the URL (ADR 0015) as one group: the bar hands back sort
 * and filters together, and the search box shares the group so a pending
 * keystroke flushes with a sort change instead of being dropped.
 */
export const FILTER_PARAMS = {
  q: textParam(),
  sort: enumParam(SORT_KEYS, 'name'),
  dir: enumParam(SORT_DIRECTIONS, 'asc'),
  queue: optionalEnumParam(QUEUE_FILTER_STATES),
  corp: nullableTextParam(),
  group: nullableTextParam(),
  starred: boolParam(),
  alerts: boolParam(),
};

/** Everything behind the funnel — the search box stays out, it commits on its own. */
export interface RosterFilter {
  sortKey: CharacterSortKey;
  sortDirection: SortDirection;
  queue: QueueState | null;
  corp: string | null;
  /** A group id, `UNGROUPED_VALUE` for "no group", or null for "any group". */
  group: string | null;
  starredOnly: boolean;
  alertsOnly: boolean;
}

/** Sort is left out: it reorders, it never hides anyone, so it isn't a "filter on". */
export function activeRosterFilterCount(filter: RosterFilter): number {
  return [
    filter.queue !== null,
    filter.corp !== null,
    filter.group !== null,
    filter.starredOnly,
    filter.alertsOnly,
  ].filter(Boolean).length;
}

/**
 * Table view's header-click sort, over the whole roster in one flat table
 * (decision 20260927-071415 dropped the old one-`DataTable`-per-group-section
 * layout). Unsorted (the filter bar's order) by default.
 */
export const TABLE_SORT = optionalSortParam();

interface CharactersViewInput {
  characters: readonly CharacterRecord[] | undefined;
  corporationNameById: Record<number, string>;
  rosterCore: ReadonlyMap<number, RosterCore>;
  attentionById: ReadonlyMap<number, AttentionEntry>;
  groups: readonly CharacterGroup[];
  starred: readonly number[];
  /** Character ids marked SP Farm: the only ones SP extraction readiness applies to. */
  spFarm: readonly number[];
  alertCounts: ReadonlyMap<number, number>;
  notTrainingAlertEnabledFor: (characterId: number) => boolean;
  visibleColumns: readonly CharacterColumnId[];
  spExtractionEnabled: boolean;
  whereabouts: WhereaboutsLookup;
}

/**
 * What the Characters page shows, derived from the roster and the URL: the
 * search/filter/sort params, which characters match, their order, the table's
 * rows and the filter menus' options. Not `useMemo`'d: several inputs are
 * `Map`s the React Compiler lint can't trust as memo dependencies, and the
 * work is roster-sized.
 */
export function useCharactersView(input: CharactersViewInput) {
  const {
    characters,
    corporationNameById,
    rosterCore,
    attentionById,
    groups,
    starred,
    spFarm,
    alertCounts,
    notTrainingAlertEnabledFor,
    visibleColumns,
    spExtractionEnabled,
    whereabouts,
  } = input;
  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const { q: search, sort: sortKey, dir: sortDirection } = filterParams;
  const rosterFilter: RosterFilter = {
    sortKey,
    sortDirection,
    queue: filterParams.queue,
    corp: filterParams.corp,
    group: filterParams.group,
    starredOnly: filterParams.starred,
    alertsOnly: filterParams.alerts,
  };
  const [tableSortParam, setTableSort] = useUrlParam('table.sort', TABLE_SORT);
  const charactersById = useMemo(
    () => new Map((characters ?? []).map((character) => [character.characterId, character])),
    [characters]
  );

  const availableColumnIds = availableCharacterColumns(spExtractionEnabled, groups.length > 0);
  // `id` is already known available here, so this is just "is it checked" —
  // `visibleAvailableColumns` (below, `handleToggleColumn`'s own zero-columns
  // guard) is for narrowing the *raw stored* list, which can hold ids that
  // aren't available right now; this list already excludes those.
  const activeColumnIds = availableColumnIds.filter((id) => visibleColumns.includes(id));

  // A sort on a column that isn't on screen (hand-edited link, or since
  // hidden in the Columns picker) reads as unsorted.
  const tableSort =
    tableSortParam && (activeColumnIds as readonly string[]).includes(tableSortParam.columnId)
      ? tableSortParam
      : null;

  const groupIdByCharacterId = new Map<number, string>();
  for (const group of groups) {
    for (const characterId of group.characterIds) groupIdByCharacterId.set(characterId, group.id);
  }

  /**
   * `rosterCore`'s own `stats` (`rosterCoreMap`) plus the two fields it can't
   * carry itself — group name and alert count both live in stores outside
   * `groups.ts`'s Dexie-free scope (`groups.ts`'s `CharacterSortStats`
   * doc comment). Built here, not in `rosterCore` state, so `applyRoster`/
   * `mergeRosterEntry` stay a pure roster-snapshot mirror; this just layers
   * the two extra keys on top for `sortCharacterIds` to read when `sortKey`
   * is `'group'`/`'alerts'`.
   *
   * Not `useMemo`: its only stable-looking input, `groupIdByCharacterId`, is
   * a `Map` — the React Compiler lint (`react-hooks/preserve-manual-
   * memoization`) can't prove a `Map` dependency is never mutated in place,
   * so it refuses to trust this memo (and, transitively, the one that builds
   * `groupIdByCharacterId`). `renderTable`/`renderCardList` already rebuild
   * their `CharacterRow[]` unmemoized every render for the same roster-sized
   * data, so recomputing this map alongside them costs nothing extra.
   */
  const sortStatsById = new Map<number, CharacterSortStats>();
  for (const [characterId, core] of rosterCore) {
    const base = core.stats;
    const groupId = groupIdByCharacterId.get(characterId);
    const groupName = groupId ? groups.find((group) => group.id === groupId)?.name : undefined;
    sortStatsById.set(characterId, {
      ...base,
      groupName,
      alertCount: alertCounts.get(characterId) ?? 0,
    });
  }

  const query = search.trim().toLowerCase();
  const narrowing = query.length > 0 || activeRosterFilterCount(rosterFilter) > 0;
  /** Search and funnel filters as one test, so card view, table view and the "nothing matches" state can't disagree. */
  function matchesFilters(characterId: number): boolean {
    const corpName = corporationNameById[characterId] ?? '';
    if (query) {
      const character = charactersById.get(characterId);
      const hit =
        (character?.name.toLowerCase().includes(query) ?? false) ||
        corpName.toLowerCase().includes(query);
      if (!hit) return false;
    }
    if (
      rosterFilter.queue !== null &&
      rosterCore.get(characterId)?.queue.state !== rosterFilter.queue
    ) {
      return false;
    }
    if (rosterFilter.corp !== null && corpName !== rosterFilter.corp) return false;
    if (rosterFilter.group !== null) {
      const characterGroupId = groupIdByCharacterId.get(characterId) ?? null;
      if (rosterFilter.group === UNGROUPED_VALUE) {
        if (characterGroupId !== null) return false;
      } else if (characterGroupId !== rosterFilter.group) {
        return false;
      }
    }
    if (rosterFilter.starredOnly && !isCharacterStarred(starred, characterId)) return false;
    if (rosterFilter.alertsOnly && (alertCounts.get(characterId) ?? 0) === 0) return false;
    return true;
  }

  /**
   * The table's rows: the whole (filtered) roster, in the roster sort. Built
   * up here, not inside `renderTable`, because the export hook below needs
   * them before the loading early return — which also lets card view export
   * the same rows (the DataTable's own column sort applies only while it's
   * mounted).
   */
  const tableRows: CharacterRow[] = partitionStarredFirst(
    sortCharacterIds(
      (characters ?? [])
        .map((character) => character.characterId)
        .filter((characterId) => matchesFilters(characterId)),
      sortStatsById,
      sortKey,
      sortDirection
    ),
    starred
  )
    .map((characterId) => charactersById.get(characterId))
    .filter((character): character is CharacterRecord => character !== undefined)
    .map((character) => {
      const core = rosterCore.get(character.characterId);
      return {
        character,
        corporationName: corporationNameById[character.characterId],
        stats: core?.stats,
        queue: core?.queue,
        notTrainingAlertEnabled: notTrainingAlertEnabledFor(character.characterId),
        attention: attentionById.get(character.characterId),
        alertCount: alertCounts.get(character.characterId) ?? 0,
        jobSlotSkills: core?.jobSlotSkills,
        totalSp: core?.totalSp,
        starred: isCharacterStarred(starred, character.characterId),
        spFarm: isSpFarmCharacter(spFarm, character.characterId),
        groupId: groupIdByCharacterId.get(character.characterId) ?? null,
        whereabouts: whereabouts.of(character.characterId),
        locationGranted: whereabouts.hasLocationGrant(character.characterId),
        shipGranted: whereabouts.hasShipGrant(character.characterId),
      };
    });
  const allIds = (characters ?? []).map((character) => character.characterId);
  const ungroupedIds = ungroupedCharacterIds(groups, allIds);
  const noMatches = narrowing && !allIds.some((id) => matchesFilters(id));
  // Only corps the roster actually has, plus a pasted-link value that isn't
  // one of them — dropping it would blank the trigger while the badge still
  // counts it, a filter the pilot can neither see nor clear.
  const corpOptions = [
    ...new Set(
      [...allIds.map((id) => corporationNameById[id]), rosterFilter.corp ?? undefined].filter(
        (name): name is string => !!name
      )
    ),
  ].sort((a, b) => a.localeCompare(b));
  // Same "keep a stale selection visible so it can be cleared" reasoning as
  // `corpOptions` — a group filtered on, then deleted, would otherwise blank
  // the Select's trigger while the filter chip count still counts it.
  const groupFilterOptions =
    rosterFilter.group !== null &&
    rosterFilter.group !== UNGROUPED_VALUE &&
    !groups.some((group) => group.id === rosterFilter.group)
      ? [...groups, { id: rosterFilter.group, name: rosterFilter.group, characterIds: [] }]
      : groups;

  return {
    search,
    sortKey,
    sortDirection,
    rosterFilter,
    setFilterParams,
    tableSort,
    setTableSort,
    narrowing,
    noMatches,
    matchesFilters,
    charactersById,
    groupIdByCharacterId,
    sortStatsById,
    tableRows,
    ungroupedIds,
    corpOptions,
    groupFilterOptions,
    availableColumnIds,
    activeColumnIds,
  };
}
