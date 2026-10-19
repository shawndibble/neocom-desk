import { useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  Button,
  ColumnPickerMenu,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
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
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';
import { useShallow } from 'zustand/react/shallow';
import { usePublicInfo } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { useNow } from '@/lib/useNow';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useRosterData } from '@/features/character/useRosterData';
import {
  RemoveCharacterDialog,
  type RemoveTarget,
} from '@/features/character/RemoveCharacterDialog';
import { CharactersTableView } from '@/features/character/CharactersTableView';
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
} from '@/features/character/groups';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { charactersCsvColumns } from '@/features/character/charactersCsv';
import { CharactersFilterFields } from '@/features/character/CharactersFilterFields';
import { CharacterCard } from '@/features/character/CharacterCard';
import { GroupSectionHeader } from '@/features/character/GroupSectionHeader';
import { characterLastSynced } from '@/features/character/rosterQueueChip';
import { useCharactersView, activeRosterFilterCount } from '@/features/character/useCharactersView';
import { buildColumns } from '@/features/character/charactersTableColumns';

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

  const { rosterCore, attentionById, refreshingAll, refreshAll } = useRosterData(characters);

  const [addingGroup, setAddingGroup] = useState(false);
  const newGroupButton = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const [newGroupName, setNewGroupName] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [removingCharacter, setRemovingCharacter] = useState<RemoveTarget | null>(null);
  /** The Character whose removal just failed — rolled back whole, so it is still listed. */
  const [removeFailedName, setRemoveFailedName] = useState<string | null>(null);
  useEffect(() => {
    if (removeFailedName === null) return;
    const timer = setTimeout(() => setRemoveFailedName(null), 5000);
    return () => clearTimeout(timer);
  }, [removeFailedName]);
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
    setRemovingCharacter({ id: characterId, name });
  }

  async function handleMoveToGroup(characterId: number, groupId: string | null) {
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => moveCharacterToGroup(groups, characterId, groupId),

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
                onClick={() => void refreshAll()}
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
              <CharactersFilterFields
                draft={draft}
                setDraft={setDraft}
                corpOptions={corpOptions}
                hasGroups={groupsValue.groups.length > 0}
                groupFilterOptions={groupFilterOptions}
              />
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
            <CharactersTableView
              rows={tableRows}
              columns={activeColumnIds.map((id) => columnsById[id])}
              extractionSummary={extractionSummary}
              tableProps={charactersExport.tableProps}
              sort={tableSort}
              onSortChange={setTableSort}
              onSelect={(id) => void select(id)}
              onRemove={requestRemoveCharacter}
            />
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

      <RemoveCharacterDialog
        target={removingCharacter}
        onClose={() => setRemovingCharacter(null)}
        onFailed={setRemoveFailedName}
      />

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
