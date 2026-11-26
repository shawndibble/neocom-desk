import { useMemo } from 'react';
import type { CharacterAcceleratorRecord, CharacterRecord } from '@/db';
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
import type { CorpStanding } from '@/features/corp/corpStanding';
import { alertsRowState, type AlertsGrantRecord } from '@/features/notifications/alertsGrant';
import { isSyncConfigured } from '@/app/syncStatus';
import type { LatestNetWorth } from '@/engine/netWorth/latest';
import type { CharacterRow } from '@/features/character/charactersTableColumns';
import type { ActiveFilter } from '@/components/ui';
import type { Translate } from '@/lib/translate';

export const SORT_KEYS: readonly CharacterSortKey[] = [
  'name',
  'skillPoints',
  'wallet',
  'group',
  'alerts',
];
export const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];
export const QUEUE_FILTER_STATES: readonly QueueState[] = [
  'training',
  'endingSoon',
  'paused',
  'idle',
];
export const ALL_CORPS_VALUE = '__all__';
export const ALL_GROUPS_VALUE = '__all_groups__';

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

export interface RosterFilter {
  sortKey: CharacterSortKey;
  sortDirection: SortDirection;
  queue: QueueState | null;
  corp: string | null;
  group: string | null;
  starredOnly: boolean;
  alertsOnly: boolean;
}

export function activeRosterFilterCount(filter: RosterFilter): number {
  return [
    filter.queue !== null,
    filter.corp !== null,
    filter.group !== null,
    filter.starredOnly,
    filter.alertsOnly,
  ].filter(Boolean).length;
}

export function activeRosterFilters(
  filter: RosterFilter,
  t: Translate,
  groups: readonly Pick<CharacterGroup, 'id' | 'name'>[]
): ActiveFilter<RosterFilter>[] {
  const active: ActiveFilter<RosterFilter>[] = [];
  if (filter.queue !== null)
    active.push({
      label: t('characters.filterQueueLabel'),
      value: t(`characters.queueStates.${filter.queue}`),
      clear: (value) => ({ ...value, queue: null }),
    });
  if (filter.corp !== null)
    active.push({
      label: t('characters.filterCorpLabel'),
      value: filter.corp,
      clear: (value) => ({ ...value, corp: null }),
    });
  const { group } = filter;
  if (group !== null)
    active.push({
      label: t('characters.filterGroupLabel'),
      value:
        group === UNGROUPED_VALUE
          ? t('characters.ungrouped')
          : (groups.find((option) => option.id === group)?.name ?? group),
      clear: (value) => ({ ...value, group: null }),
    });
  if (filter.starredOnly)
    active.push({
      label: t('characters.filterStarredOnly'),
      clear: (value) => ({ ...value, starredOnly: false }),
    });
  if (filter.alertsOnly)
    active.push({
      label: t('characters.filterHasAlerts'),
      clear: (value) => ({ ...value, alertsOnly: false }),
    });
  return active;
}

export const TABLE_SORT = optionalSortParam();

interface CharactersViewInput {
  characters: readonly CharacterRecord[] | undefined;
  corporationNameById: Record<number, string>;
  rosterCore: ReadonlyMap<number, RosterCore>;
  attentionById: ReadonlyMap<number, AttentionEntry>;
  groups: readonly CharacterGroup[];
  starred: readonly number[];
  spFarm: readonly number[];
  alertCounts: ReadonlyMap<number, number>;
  notTrainingAlertEnabledFor: (characterId: number) => boolean;
  visibleColumns: readonly CharacterColumnId[];
  spExtractionEnabled: boolean;
  whereabouts: WhereaboutsLookup;
  netWorthById: ReadonlyMap<number, LatestNetWorth>;
  acceleratorById: ReadonlyMap<number, CharacterAcceleratorRecord>;
  detectedAcceleratorById: ReadonlyMap<number, number | null>;
  corpStandingById: ReadonlyMap<number, CorpStanding>;
  alertsGrants: Readonly<Record<number, AlertsGrantRecord>>;
}

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
    netWorthById,
    acceleratorById,
    detectedAcceleratorById,
    corpStandingById,
    alertsGrants,
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

  const availableColumnIds = availableCharacterColumns(
    spExtractionEnabled,
    groups.length > 0,
    isSyncConfigured()
  );
  const activeColumnIds = availableColumnIds.filter((id) => visibleColumns.includes(id));

  const tableSort =
    tableSortParam && (activeColumnIds as readonly string[]).includes(tableSortParam.columnId)
      ? tableSortParam
      : null;

  const groupIdByCharacterId = new Map<number, string>();
  for (const group of groups) {
    for (const characterId of group.characterIds) groupIdByCharacterId.set(characterId, group.id);
  }

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
        netWorth: netWorthById.get(character.characterId),
        acceleratorRecord: acceleratorById.get(character.characterId),
        detectedAccelerator: detectedAcceleratorById.get(character.characterId) ?? null,
        corpStanding: corpStandingById.get(character.characterId),
        alertsWhenClosed: alertsRowState(alertsGrants[character.characterId]),
      };
    });
  const allIds = (characters ?? []).map((character) => character.characterId);
  const ungroupedIds = ungroupedCharacterIds(groups, allIds);
  const noMatches = narrowing && !allIds.some((id) => matchesFilters(id));
  const corpOptions = [
    ...new Set(
      [...allIds.map((id) => corporationNameById[id]), rosterFilter.corp ?? undefined].filter(
        (name): name is string => !!name
      )
    ),
  ].sort((a, b) => a.localeCompare(b));
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
