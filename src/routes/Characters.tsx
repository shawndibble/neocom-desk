import { useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TextInput,
  Toast,
  NeedsConnection,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { NeedsLoginNotice } from '@/app/AuthFailureNotice';
import { useAuthFailure } from '@/stores/authFailure';
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';
import { isSyncConfigured } from '@/app/syncStatus';
import { useShallow } from 'zustand/react/shallow';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { useNow } from '@/lib/useNow';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { loadRosterSnapshot, type RosterEntry } from '@/features/character/roster';
import { rosterCoreMap, mergeRosterCore, type RosterCore } from '@/features/character/rosterView';
import { loadRosterAttention, type AttentionEntry } from '@/features/character/rosterAttention';
import { useAlertCountsByCharacter } from '@/features/notifications/alertCountsByCharacter';
import {
  useNotificationPreferences,
  isNotTrainingAlertEnabledFor,
} from '@/features/notifications/preferences';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { extractorCount, isSpExtractionReady } from '@/engine/skills/spExtraction';
import { formatIskCompact } from '@/lib/isk';
import { useExtractionPrices } from '@/features/character/useExtractionPrices';
import {
  migrateVisibleColumns,
  useCharacterColumnsMigrated,
  useCharacterViewMode,
  useVisibleCharacterColumns,
  visibleAvailableColumns,
  type CharacterColumnId,
} from '@/features/character/characterColumns';
import { useTimeZone } from '@/lib/timeFormat';
import { removeCharacterAfterSync } from '@/features/character/removeCharacter';
import { UnsyncedChangesWarning } from '@/features/character/UnsyncedChangesWarning';
import { RemoveSharedOption } from '@/features/communities/RemoveSharedOption';
import { CharacterRowContextMenu } from '@/features/character/CharacterRowContextMenu';
import { updateGroups, useOverviewGroups } from '@/features/character/overviewGroups';
import {
  isCharacterStarred,
  partitionStarredFirst,
  pruneStarredCharacters,
  starredCharactersNeedPruning,
  useStarredCharacters,
  withToggledStar,
} from '@/features/character/starredCharacters';
import {
  addGroup,
  groupsNeedPruning,
  moveCharacterToGroup,
  pruneGroups,
  removeGroup,
  renameGroup,
  reorderGroups,
  sortCharacterIds,
  type CharacterGroup,
  type CharacterSortKey,
} from '@/features/character/groups';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { charactersCsvColumns } from '@/features/character/charactersCsv';
import { CharacterCard } from '@/features/character/CharacterCard';
import { GroupSectionHeader } from '@/features/character/GroupSectionHeader';
import { UNGROUPED_VALUE, characterLastSynced } from '@/features/character/rosterQueueChip';
import {
  useCharactersView,
  activeRosterFilterCount,
  ALL_CORPS_VALUE,
  ALL_GROUPS_VALUE,
  QUEUE_FILTER_STATES,
  SORT_KEYS,
} from '@/features/character/useCharactersView';
import { buildColumns, type CharacterRow } from '@/features/character/charactersTableColumns';

const DENSITY_LABEL_KEYS = {
  0.875: 'characters.densityCompact',
  1: 'characters.densityCozy',
  1.125: 'characters.densityComfortable',
  1.25: 'characters.densitySpacious',
} as const satisfies Record<FontScale, string>;

/** Character wall: pick the active character, group/sort/densify it, or add another via EVE SSO. */
export function Characters() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const characters = useLiveQuery(() => db.characters.orderBy('characterId').toArray());
  // Corp names only: each card reads its own entry, so a fetch that changes
  // no corp name does not re-render the page.
  const corporationNameById = usePublicInfo(
    useShallow((state) => {
      const names: Record<number, string> = {};
      for (const [id, entry] of Object.entries(state.byCharacterId)) {
        if (entry.corporationName) names[Number(id)] = entry.corporationName;
      }
      return names;
    })
  );
  const loadPublicInfoMany = usePublicInfo((state) => state.loadMany);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const now = useNow();

  const groupsValue = useOverviewGroups((state) => state.value);
  const groupsHydrated = useHydratedStore(useOverviewGroups);
  const setGroupsValue = useOverviewGroups((state) => state.setValue);

  const starred = useStarredCharacters((state) => state.value);
  const starredHydrated = useHydratedStore(useStarredCharacters);
  const setStarred = useStarredCharacters((state) => state.setValue);

  const density = useFontScale((state) => state.value);
  const setDensity = useFontScale((state) => state.setValue);

  const viewMode = useCharacterViewMode((state) => state.value);
  const setViewMode = useCharacterViewMode((state) => state.setValue);
  useHydratedStore(useCharacterViewMode);

  const visibleColumns = useVisibleCharacterColumns((state) => state.value);
  const setVisibleColumns = useVisibleCharacterColumns((state) => state.setValue);
  const visibleColumnsHydrated = useHydratedStore(useVisibleCharacterColumns);

  const columnsMigrated = useCharacterColumnsMigrated((state) => state.value);
  const columnsMigratedHydrated = useHydratedStore(useCharacterColumnsMigrated);
  const setColumnsMigrated = useCharacterColumnsMigrated((state) => state.setValue);

  const spExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.value);
  useHydratedStore(useSpExtractionMonitoringEnabled);
  const spExtractionThreshold = useSpExtractionThresholdSp((state) => state.value);
  useHydratedStore(useSpExtractionThresholdSp);

  const extractionPrices = useExtractionPrices();
  const alertCounts = useAlertCountsByCharacter();
  const notificationPrefs = useNotificationPreferences((state) => state.value);
  const notTrainingAlertEnabledFor = (characterId: number) =>
    isNotTrainingAlertEnabledFor(notificationPrefs, characterId);
  const timeZone = useTimeZone();

  const [rosterCore, setRosterCore] = useState<Map<number, RosterCore>>(new Map());
  const [attentionById, setAttentionById] = useState<Map<number, AttentionEntry>>(new Map());

  /** The one place a fresh roster snapshot becomes `rosterCore` — shared by the cache-only load effect and "Refresh all" so a future added field only needs adding to `rosterView.ts`'s `RosterCore`. */
  function applyRoster(roster: readonly RosterEntry[], now: number) {
    setRosterCore(rosterCoreMap(roster, now));
  }

  /** `applyRoster` for one character that just finished refreshing: merges into `rosterCore` rather than replacing it, so the rest of the roster keeps its rows. */
  function mergeRosterEntry(entry: RosterEntry, now: number) {
    setRosterCore((previous) => mergeRosterCore(previous, entry, now));
  }

  const [addingGroup, setAddingGroup] = useState(false);
  const newGroupButton = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const [newGroupName, setNewGroupName] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [removingCharacter, setRemovingCharacter] = useState<{
    id: number;
    name: string;
  } | null>(null);
  /** The removal is running: the confirm stays open and busy until it finishes. */
  const [removing, setRemoving] = useState(false);
  const cancelRemoveRef = useRef<HTMLButtonElement>(null);
  /** Also delete this Character's Shared Blueprints from its Communities (issue #3600). */
  const [removeShared, setRemoveShared] = useState(true);
  /** The Character whose removal just failed — rolled back whole, so it is still listed. */
  const [removeFailedName, setRemoveFailedName] = useState<string | null>(null);
  useEffect(() => {
    if (removeFailedName === null) return;
    const timer = setTimeout(() => setRemoveFailedName(null), 5000);
    return () => clearTimeout(timer);
  }, [removeFailedName]);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [customizingPermissions, setCustomizingPermissions] = useState(false);

  const {
    search,
    sortKey,
    sortDirection,
    rosterFilter,
    setFilterParams,
    tableSort,
    setTableSort,
    noMatches,
    matchesFilters,
    sortStatsById,
    groupIdByCharacterId,
    charactersById,
    tableRows,
    ungroupedIds,
    corpOptions,
    groupFilterOptions,
    availableColumnIds,
    activeColumnIds,
  } = useCharactersView({
    characters,
    corporationNameById,
    rosterCore,
    attentionById,
    groups: groupsValue.groups,
    starred,
    alertCounts,
    notTrainingAlertEnabledFor,
    visibleColumns,
    spExtractionEnabled,
  });

  // Not `useMemo`: `handleToggleStar` below closes over `starred`/`setStarred`
  // and is a fresh function every render anyway, so a memoized wrapper here
  // would just recompute every render regardless — `buildColumns` itself is
  // cheap (a handful of object literals, no per-character work).
  const columnsById = buildColumns(
    t,
    spExtractionThreshold,
    extractionPrices.net,
    (id) => void handleToggleStar(id),
    timeZone,
    groupsValue.groups,
    (id, groupId) => void handleMoveToGroup(id, groupId)
  );
  // One-shot migration (issue #2077, decision 20260927-071415): a stored
  // column list from before `group`/`remove` existed is missing both, not
  // because a pilot hid them. Gated on `columnsMigrated` rather than run on
  // every hydrate, so a pilot who deliberately hides one afterward keeps it
  // hidden. `setColumnsMigrated(true)` fires even when nothing was actually
  // missing, so this never runs a second time on this device.
  useEffect(() => {
    if (!visibleColumnsHydrated || !columnsMigratedHydrated || columnsMigrated) return;
    const migrated = migrateVisibleColumns(visibleColumns);
    void (async () => {
      if (migrated !== visibleColumns) await setVisibleColumns(migrated);
      await setColumnsMigrated(true);
    })();
  }, [
    visibleColumnsHydrated,
    columnsMigratedHydrated,
    columnsMigrated,
    visibleColumns,
    setVisibleColumns,
    setColumnsMigrated,
  ]);

  useEffect(() => {
    // One batched call for the whole roster (issue: /characters page N+1 ESI
    // calls) rather than one `load` per character — see `loadMany`'s doc
    // comment on `usePublicInfo`.
    if (characters && characters.length > 0) {
      void loadPublicInfoMany(characters.map((character) => character.characterId));
    }
  }, [characters, loadPublicInfoMany]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!characters || characters.length === 0) {
        if (!cancelled) setRosterCore(new Map());
        return;
      }
      const now = Date.now();
      const roster = await loadRosterSnapshot();
      if (cancelled) return;
      applyRoster(roster, now);
    })();
    return () => {
      cancelled = true;
    };
  }, [characters]);

  // Mirrors the cache-only effect above, cache-only by default: manufacturing
  // running counts and PI attention across the whole roster.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!characters || characters.length === 0) {
        if (!cancelled) setAttentionById(new Map());
        return;
      }
      const attention = await loadRosterAttention();
      if (cancelled) return;
      setAttentionById(new Map(attention.map((entry) => [entry.characterId, entry])));
    })();
    return () => {
      cancelled = true;
    };
  }, [characters]);

  // Self-heals dangling group entries: a character removed from this device
  // disappears from its group instead of lingering as a stale id.
  useEffect(() => {
    if (!characters || !groupsHydrated) return;
    const existingIds = new Set(characters.map((character) => character.characterId));
    if (groupsNeedPruning(groupsValue.groups, existingIds)) {
      void setGroupsValue(
        updateGroups(groupsValue, (groups) => pruneGroups(groups, existingIds), Date.now())
      );
    }
  }, [characters, groupsValue, groupsHydrated, setGroupsValue]);

  // Same self-heal for stars, and for the same reason — but note this lives
  // here rather than in `confirmRemoveCharacter`: a Character can also leave
  // this device without passing through that button (a sold Character, dropped
  // by `handleOwnerHashChange` — see removeCharacter.ts's header). Reconciling
  // against the roster catches every route out; a hook on the confirm handler
  // would catch one of them.
  useEffect(() => {
    if (!characters || !starredHydrated) return;
    const existingIds = new Set(characters.map((character) => character.characterId));
    if (starredCharactersNeedPruning(starred, existingIds)) {
      void setStarred(pruneStarredCharacters(starred, existingIds));
    }
  }, [characters, starred, starredHydrated, setStarred]);

  async function select(characterId: number) {
    await setActiveCharacter(characterId);
    // Return to wherever the switch started (the tab bar, or the More
    // sheet's portrait+name row) — falling back to Overview when there is
    // nowhere to return to (a fresh load) or the origin was this page itself
    // (#1764).
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/characters' ? from : '/overview');
  }

  /**
   * Live pull for every character, capped-speed — same "cache-first, one
   * explicit button for live" rule the PI alt-colonies view already follows,
   * rather than a new pattern for this page.
   */
  async function handleRefreshAll() {
    // `aria-disabled` keeps the button hoverable so its Tooltip stays readable
    // mid-refresh, but it still takes the click — so the guard lives here.
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      const now = Date.now();
      const [roster, attention] = await Promise.all([
        loadRosterSnapshot({ live: true, now, onEntry: (entry) => mergeRosterEntry(entry, now) }),
        loadRosterAttention({ live: true }),
      ]);
      applyRoster(roster, now);
      setAttentionById(new Map(attention.map((entry) => [entry.characterId, entry])));
    } finally {
      setRefreshingAll(false);
    }
  }

  function handleToggleColumn(id: CharacterColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    // A table with zero *rendered* columns is a blank page with no
    // explanation — guard against the filtered/available count, not the raw
    // stored list: `visibleColumns` can carry ids `availableCharacterColumns`
    // currently excludes (e.g. `spReady` while monitoring is off), so a raw
    // `next.length` check can stay non-zero while every id left actually
    // renders nothing.
    if (
      visibleAvailableColumns(next, spExtractionEnabled, groupsValue.groups.length > 0).length === 0
    )
      return;
    void setVisibleColumns(next);
  }

  async function handleToggleStar(characterId: number) {
    await setStarred(withToggledStar(starred, characterId));
  }

  function requestRemoveCharacter(characterId: number, name: string) {
    setRemoveShared(true);
    setRemovingCharacter({ id: characterId, name });
  }

  async function confirmRemoveCharacter() {
    if (!removingCharacter) return;
    const { id, name } = removingCharacter;
    // Neighbours are read now: the removed card is gone from the DOM afterwards.
    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-select]'),
      (el) => el.dataset.characterSelect
    );
    const at = ids.indexOf(String(id));
    const cardButton = (cardId: string | undefined) => () =>
      cardId ? document.querySelector<HTMLElement>(`[data-character-select="${cardId}"]`) : null;
    // The dialog stays open, busy, while the last push and cleanup run (up to
    // ~24 s offline) — closing it at once looked like the removal had finished.
    setRemoving(true);
    try {
      await removeCharacterAfterSync(id, isSyncConfigured(), removeShared);
      useAuthFailure.getState().dismissNeedsLogin(id);
      // Requested in the same batch as the dialog closing (`finally`), so the
      // request outlives the dialog's own focus return, which it retries past.
      focusAfterCommit(
        cardButton(at >= 0 ? ids[at + 1] : undefined),
        cardButton(at > 0 ? ids[at - 1] : undefined),
        () => document.querySelector<HTMLElement>('h1')
      );
    } catch {
      // The local removal is one transaction, so a failure left every row in
      // place — say so rather than leave the click looking ignored.
      setRemoveFailedName(name);
    } finally {
      setRemovingCharacter(null);
      setRemoving(false);
    }
  }

  async function handleMoveToGroup(characterId: number, groupId: string | null) {
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => moveCharacterToGroup(groups, characterId, groupId),
        // eslint-disable-next-line react-hooks/purity -- fires from a click (the group Select's onValueChange, reached through buildColumns' column-object indirection, same handler CharacterCard's own group Select already calls directly), never during render itself.
        Date.now()
      )
    );
    // The card remounts under its new group, so the Select that ran this is gone.
    focusAfterCommit(() =>
      document.querySelector<HTMLElement>(`[data-group-select="${characterId}"]`)
    );
  }

  /** `returnFocus` is false on blur: the user already went elsewhere. */
  async function handleCreateGroup(returnFocus: boolean) {
    const name = newGroupName.trim();
    setAddingGroup(false);
    setNewGroupName('');
    if (returnFocus) focusAfterCommit(newGroupButton);
    if (!name) return;
    const group: CharacterGroup = { id: crypto.randomUUID(), name, characterIds: [] };
    if (returnFocus) {
      focusAfterCommit(() =>
        document.querySelector<HTMLElement>(`[data-group-heading="${group.id}"]`)
      );
    }
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => addGroup(groups, group), Date.now())
    );
  }

  async function handleRenameGroup(groupId: string, name: string) {
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => renameGroup(groups, groupId, name), Date.now())
    );
  }

  async function handleRemoveGroup(groupId: string) {
    const at = groupsValue.groups.findIndex((group) => group.id === groupId);
    const nextId = groupsValue.groups[at + 1]?.id;
    setDeletingGroupId(null);
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => removeGroup(groups, groupId), Date.now())
    );
    focusAfterCommit(
      () => document.querySelector<HTMLElement>(`[data-group-heading="${nextId}"]`),
      () => document.querySelector<HTMLElement>('[data-ungrouped-heading]'),
      newGroupButton
    );
  }

  async function handleMoveGroup(index: number, direction: -1 | 1) {
    const groupId = groupsValue.groups[index]?.id;
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => reorderGroups(groups, index, index + direction),
        Date.now()
      )
    );
    // At the top or bottom the pressed button turns disabled; the sibling takes focus.
    const enabledMove = (side: 'up' | 'down') => () => {
      const el = document.querySelector<HTMLButtonElement>(
        `[data-move-group="${groupId}:${side}"]`
      );
      return el && !el.disabled ? el : null;
    };
    const [same, other] = direction === -1 ? (['up', 'down'] as const) : (['down', 'up'] as const);
    focusAfterCommit(enabledMove(same), enabledMove(other));
  }

  /** Card view only — called once per group section plus once for Ungrouped, same as before (decision 20260927-071415 keeps group sectioning card-view-only). */
  function renderCardList(characterIds: readonly number[]) {
    // A group (or the ungrouped section) that the filter emptied just shows
    // nothing here — repeating a "no matches" line under every such section
    // would be noise once any other section still has results. The one case
    // worth telling the user about, the whole roster coming up empty, is
    // handled once, above every section, by the caller.
    const filteredIds = characterIds.filter((characterId) => matchesFilters(characterId));
    if (filteredIds.length === 0) return null;

    // Starred first, then the chosen sort key — a layer on top of the sort,
    // not a replacement for it, so a star raises one card and leaves the order
    // of everything around it exactly as the user asked for.
    const sortedIds = partitionStarredFirst(
      sortCharacterIds(filteredIds, sortStatsById, sortKey, sortDirection),
      starred
    );

    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sortedIds.map((characterId) => {
          const character = charactersById.get(characterId);
          if (!character) return null;
          return (
            <CharacterCard
              key={characterId}
              character={character}
              stats={rosterCore.get(characterId)?.stats}
              queue={rosterCore.get(characterId)?.queue}
              notTrainingAlertEnabled={notTrainingAlertEnabledFor(characterId)}
              groups={groupsValue.groups}
              groupId={groupIdByCharacterId.get(characterId) ?? null}
              starred={isCharacterStarred(starred, characterId)}
              isActive={activeCharacterId === characterId}
              alertCount={alertCounts.get(characterId) ?? 0}
              attention={attentionById.get(characterId)}
              now={now}
              onSelect={(id) => void select(id)}
              onToggleStar={(id) => void handleToggleStar(id)}
              onMoveToGroup={(id, groupId) => void handleMoveToGroup(id, groupId)}
              onRemove={(id, name) => requestRemoveCharacter(id, name)}
            />
          );
        })}
      </ul>
    );
  }

  const groupList = groupsValue.groups;
  const csvColumns = useMemo(
    () =>
      charactersCsvColumns(t, {
        groupNameById: new Map(groupList.map((group) => [group.id, group.name])),
        spExtractionEnabled,
        spExtractionThresholdSp: spExtractionThreshold,
        lastSynced: (row) => characterLastSynced(row.stats, row.queue),
      }),
    [t, groupList, spExtractionEnabled, spExtractionThreshold]
  );
  const charactersExport = useTableExport({
    surface: 'characters',
    rows: tableRows,
    columns: csvColumns,
  });

  /**
   * Table view — one flat `DataTable` over the whole (filtered) roster, not
   * one per group section (decision 20260927-071415): the new `group` column
   * carries membership per row instead, and `GroupSectionHeader`'s
   * rename/reorder/delete stay card-view only.
   */
  const extractorsReady = tableRows.reduce(
    (sum, row) =>
      row.totalSp !== undefined && isSpExtractionReady(row.totalSp, spExtractionThreshold)
        ? sum + extractorCount(row.totalSp)
        : sum,
    0
  );
  const extractionSummary =
    !spExtractionEnabled || !extractionPrices.loaded || extractorsReady === 0
      ? null
      : extractionPrices.net === null
        ? t('characters.extractionUnpriced', { hub: extractionPrices.hubName })
        : t('characters.extractionTotal', {
            isk: formatIskCompact(extractionPrices.net * extractorsReady),
            each: formatIskCompact(extractionPrices.net),
            hub: extractionPrices.hubName,
          });

  function renderTable(rows: readonly CharacterRow[]) {
    return (
      // Deliberate deviation from DataTable's usual `.dt-stack` collapse on
      // mobile (docs/context/decisions/20260909-130638-characters-table-
      // view-mobile-scroll-roster-overview-split.md): a real, comparable
      // table stays a table, and scrolls sideways instead, at every width.
      <div className="overflow-x-auto">
        {extractionSummary && (
          <p className="mb-2 text-[0.6875rem] text-text-dim">{extractionSummary}</p>
        )}
        <DataTable
          {...charactersExport.tableProps}
          columns={activeColumnIds.map((id) => columnsById[id])}
          rows={rows}
          rowKey={(row) => row.character.characterId}
          label={t('characters.title')}
          responsive="table"
          sort={tableSort}
          onSortChange={setTableSort}
          onRowClick={(row) => void select(row.character.characterId)}
          rowMoreActions
          rowContextMenu={(row, tr) => (
            <CharacterRowContextMenu
              characterId={row.character.characterId}
              name={row.character.name}
              onRemove={() => requestRemoveCharacter(row.character.characterId, row.character.name)}
            >
              {tr}
            </CharacterRowContextMenu>
          )}
        />
      </div>
    );
  }

  if (!characters) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('characters.title')}
        actions={
          <>
            {/*
              `Tooltip`, not a native `title=`: a touch device has no hover, so
              the "may take a moment" warning was unreachable on a phone exactly
              where the wait is longest (#1102). The tap belongs to the refresh,
              so no `openOnTap` — touch-and-hold reads it. And `aria-disabled`
              rather than the native attribute while refreshing, per DESIGN.md's
              `FilterChip` rule: a natively disabled button takes no hover and no
              focus, which would make the bubble unreadable by either route just
              as the wait it explains is actually happening.
            */}
            {characters.length > 0 && (
              <IconButton
                label={refreshingAll ? t('characters.refreshingAll') : t('characters.refreshAll')}
                tooltip={`${t('characters.refreshAll')}. ${t('characters.refreshAllHint')}`}
                icon={refreshingAll ? <Spinner size="sm" /> : <Icon.Refresh />}
                onClick={() => void handleRefreshAll()}
                aria-disabled={refreshingAll || undefined}
                className="aria-disabled:cursor-default aria-disabled:opacity-40"
              />
            )}
            {/*
              The add-a-character branch, not a re-auth: SSO decides who comes
              back, so unioning with the *active* Character's grant would ask
              the newcomer to consent to scopes aimed at somebody else (#295).
              The arrow reuses the login page's own Customize dialog, so
              adding several alts with one hand-picked grant stays one click each.
            */}
            <div className="flex">
              <NeedsConnection tooltip={t('characters.add')}>
                <Button
                  variant="primary"
                  size="md"
                  className="rounded-r-none"
                  aria-label={t('characters.add')}
                  onClick={() => void beginAddCharacterLogin()}
                >
                  <Icon.AddCharacter />
                  {/* Icon-only below `sm`: no room beside the split trigger. */}
                  <span className="hidden sm:inline">{t('characters.addLabel')}</span>
                </Button>
              </NeedsConnection>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="primary"
                    size="md"
                    className="rounded-l-none border-l-accent-contrast/30 px-1!"
                    aria-label={t('characters.addMenuLabel')}
                  >
                    <Icon.Expanded aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setCustomizingPermissions(true)}>
                    {t('characters.addWithPermissions')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        }
      />

      <NeedsLoginNotice />

      {characters.length === 0 ? (
        <EmptyState title={t('characters.emptyTitle')} hint={t('characters.emptyHint')} />
      ) : (
        <>
          <FilterBar
            value={rosterFilter}
            onChange={(next) =>
              setFilterParams({
                sort: next.sortKey,
                dir: next.sortDirection,
                queue: next.queue,
                corp: next.corp,
                group: next.group,
                starred: next.starredOnly,
                alerts: next.alertsOnly,
              })
            }
            activeCount={activeRosterFilterCount(rosterFilter)}
            search={
              <SearchInput
                value={search}
                onChange={(e) => setFilterParams({ q: e.target.value })}
                placeholder={t('characters.searchPlaceholder')}
                className="min-w-40 flex-1"
              />
            }
            // Card view has no columns to pick or table to export, so these
            // only exist alongside the table they act on.
            actions={
              viewMode === 'table' ? (
                <>
                  <ColumnPickerMenu
                    available={availableColumnIds}
                    visible={activeColumnIds}
                    columnsById={columnsById}
                    onToggle={handleToggleColumn}
                    buttonLabel={t('characters.columnsButton')}
                    menuTitle={t('characters.columnsMenuTitle')}
                  />
                  <TableActionsMenu
                    name={t('characters.title')}
                    tableExport={charactersExport}
                    size="md"
                  />
                </>
              ) : undefined
            }
          >
            {(draft, setDraft) => (
              <>
                <div
                  role="group"
                  aria-label={t('characters.filterQueueLabel')}
                  className="flex flex-wrap gap-2"
                >
                  {QUEUE_FILTER_STATES.map((state) => (
                    <FilterChip
                      key={state}
                      label={t(`characters.queueStates.${state}`)}
                      selected={draft.queue === state}
                      onToggle={() =>
                        setDraft({ ...draft, queue: draft.queue === state ? null : state })
                      }
                    />
                  ))}
                </div>
                {/* One corp has nothing to narrow to — unless a link already set one, which must stay visible to be cleared. */}
                {(corpOptions.length > 1 || draft.corp !== null) && (
                  <FilterField label={t('characters.filterCorpLabel')}>
                    <Select
                      value={draft.corp ?? ALL_CORPS_VALUE}
                      onValueChange={(value) =>
                        setDraft({ ...draft, corp: value === ALL_CORPS_VALUE ? null : value })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t('characters.filterCorpLabel')}
                        className="w-48"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_CORPS_VALUE}>
                          {t('characters.allCorporations')}
                        </SelectItem>
                        {corpOptions.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                )}
                {/* No Groups yet has nothing to narrow to — same gate as the corp filter above. */}
                {groupsValue.groups.length > 0 && (
                  <FilterField label={t('characters.filterGroupLabel')}>
                    <Select
                      value={draft.group ?? ALL_GROUPS_VALUE}
                      onValueChange={(value) =>
                        setDraft({ ...draft, group: value === ALL_GROUPS_VALUE ? null : value })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t('characters.filterGroupLabel')}
                        className="w-48"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_GROUPS_VALUE}>
                          {t('characters.allGroups')}
                        </SelectItem>
                        <SelectItem value={UNGROUPED_VALUE}>{t('characters.ungrouped')}</SelectItem>
                        {groupFilterOptions.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                )}
                <FilterChip
                  label={t('characters.filterStarredOnly')}
                  selected={draft.starredOnly}
                  onToggle={() => setDraft({ ...draft, starredOnly: !draft.starredOnly })}
                />
                <FilterChip
                  label={t('characters.filterHasAlerts')}
                  selected={draft.alertsOnly}
                  onToggle={() => setDraft({ ...draft, alertsOnly: !draft.alertsOnly })}
                />
                <FilterField label={t('characters.sortBy')}>
                  <Select
                    value={draft.sortKey}
                    onValueChange={(value) =>
                      setDraft({ ...draft, sortKey: value as CharacterSortKey })
                    }
                  >
                    <SelectTrigger size="sm" aria-label={t('characters.sortBy')} className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`characters.sortKeys.${key}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
                <FilterField label={t('characters.sortDirection')} stretch={false}>
                  <IconButton
                    size="sm"
                    icon={draft.sortDirection === 'asc' ? <Icon.Ascending /> : <Icon.Descending />}
                    label={t(
                      draft.sortDirection === 'asc'
                        ? 'characters.sortDirectionAsc'
                        : 'characters.sortDirectionDesc'
                    )}
                    tooltip={t('characters.sortDirection')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        sortDirection: draft.sortDirection === 'asc' ? 'desc' : 'asc',
                      })
                    }
                  />
                </FilterField>
              </>
            )}
          </FilterBar>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {addingGroup ? (
                <TextInput
                  autoFocus
                  size="sm"
                  value={newGroupName}
                  aria-label={t('characters.newGroupName')}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCreateGroup(true);
                    }
                    if (e.key === 'Escape') {
                      setNewGroupName('');
                      setAddingGroup(false);
                      focusAfterCommit(newGroupButton);
                    }
                  }}
                  onBlur={() => void handleCreateGroup(false)}
                  className="w-40"
                />
              ) : (
                <Button ref={newGroupButton} size="sm" onClick={() => setAddingGroup(true)}>
                  {t('characters.newGroup')}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Shared app-wide text-size control (`useFontScale`), also on Settings' Display
                  tab — relabeled Compact/Cozy/Comfortable/Spacious here, but changing it here
                  changes text size everywhere. */}
              <Select
                value={String(density)}
                onValueChange={(value) => void setDensity(Number(value) as FontScale)}
              >
                <SelectTrigger size="sm" aria-label={t('characters.densityLabel')} className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SCALE_STEPS.map((step) => (
                    <SelectItem key={step} value={String(step)}>
                      {t(DENSITY_LABEL_KEYS[step])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div role="group" aria-label={t('characters.viewModeLabel')} className="flex gap-2">
                <IconButton
                  size="sm"
                  icon={<Icon.CardsView />}
                  label={t('characters.viewCards')}
                  pressed={viewMode === 'card'}
                  onClick={() => void setViewMode('card')}
                />
                <IconButton
                  size="sm"
                  icon={<Icon.TableView />}
                  label={t('characters.viewTable')}
                  pressed={viewMode === 'table'}
                  onClick={() => void setViewMode('table')}
                />
              </div>
            </div>
          </div>

          {noMatches ? (
            <EmptyState
              title={t('characters.noSearchMatches')}
              hint={t('characters.noSearchMatchesHint')}
            />
          ) : viewMode === 'table' ? (
            // One flat table over the whole roster, not one per group section
            // (decision 20260927-071415) — the `group` column carries
            // membership per row, and group management stays in card view.
            renderTable(tableRows)
          ) : (
            <div className="space-y-4">
              {groupsValue.groups.map((group, index) => (
                <section key={group.id} className="space-y-2">
                  <GroupSectionHeader
                    group={group}
                    index={index}
                    groupCount={groupsValue.groups.length}
                    onRename={(id, name) => void handleRenameGroup(id, name)}
                    onRemove={(id) => setDeletingGroupId(id)}
                    onMove={(index2, direction) => void handleMoveGroup(index2, direction)}
                  />
                  {group.characterIds.length === 0 ? (
                    <p className="text-xs text-text-dim">{t('characters.emptyGroup')}</p>
                  ) : (
                    renderCardList(group.characterIds)
                  )}
                </section>
              ))}

              {(groupsValue.groups.length === 0 || ungroupedIds.length > 0) && (
                <section className="space-y-2">
                  {groupsValue.groups.length > 0 && (
                    <h2
                      data-ungrouped-heading
                      className="text-xs font-semibold tracking-widest text-text-dim uppercase focus:outline-none"
                    >
                      {t('characters.ungrouped')}
                    </h2>
                  )}
                  {renderCardList(ungroupedIds)}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {removeFailedName !== null && (
        <Toast message={t('characters.removeFailed', { name: removeFailedName })} />
      )}

      <Modal
        open={removingCharacter !== null}
        onClose={() => {
          if (!removing) setRemovingCharacter(null);
        }}
        title={t('characters.remove')}
        initialFocusRef={cancelRemoveRef}
      >
        <p className="text-xs text-text-dim">
          {removingCharacter && t('characters.removeConfirm', { name: removingCharacter.name })}
        </p>
        {removingCharacter && (
          <RemoveSharedOption
            characterIds={[removingCharacter.id]}
            checked={removeShared}
            onChange={setRemoveShared}
          />
        )}
        {removingCharacter && (
          <UnsyncedChangesWarning
            characterIds={[removingCharacter.id]}
            syncConfigured={isSyncConfigured()}
          />
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            ref={cancelRemoveRef}
            size="sm"
            disabled={removing}
            onClick={() => setRemovingCharacter(null)}
          >
            {t('characters.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={removing}
            onClick={() => void confirmRemoveCharacter()}
          >
            {t('characters.remove')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deletingGroupId !== null}
        onClose={() => setDeletingGroupId(null)}
        title={t('characters.deleteGroup')}
      >
        <p className="text-xs text-text-dim">{t('characters.deleteGroupConfirm')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeletingGroupId(null)}>
            {t('characters.cancel')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => deletingGroupId && void handleRemoveGroup(deletingGroupId)}
          >
            {t('characters.deleteGroup')}
          </Button>
        </div>
      </Modal>

      <CustomizePermissionsDialog
        open={customizingPermissions}
        onClose={() => setCustomizingPermissions(false)}
        title={t('characters.customizePermissionsTitle')}
      />
    </div>
  );
}
