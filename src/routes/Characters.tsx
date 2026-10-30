import { useEffect, useMemo, useState } from 'react';
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
  SplitButtonChevron,
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
  useSpFarmCharacters,
  withToggledSpFarm,
} from '@/features/character/spExtractionSettings';
import { extractorCount, isSpExtractionReady } from '@/engine/skills/spExtraction';
import { formatIskCompact } from '@/lib/isk';
import { useExtractionPrices } from '@/features/character/useExtractionPrices';
import {
  useCharacterColumnsMigrated,
  useCharacterViewMode,
  useVisibleCharacterColumns,
  visibleAvailableColumns,
  type CharacterColumnId,
} from '@/features/character/characterColumns';
import { useTimeZone } from '@/lib/timeFormat';
import { useOverviewGroups } from '@/features/character/overviewGroups';
import { useStarredCharacters, withToggledStar } from '@/features/character/starredCharacters';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { charactersCsvColumns } from '@/features/character/charactersCsv';
import { CharactersFilterFields } from '@/features/character/CharactersFilterFields';
import { CharactersCardView } from '@/features/character/CharactersCardView';
import { useCharacterGroupActions } from '@/features/character/useCharacterGroupActions';
import { useCharactersHousekeeping } from '@/features/character/useCharactersHousekeeping';
import { characterLastSynced } from '@/features/character/rosterQueueChip';
import { useCharactersView, activeRosterFilterCount } from '@/features/character/useCharactersView';
import { buildColumns } from '@/features/character/charactersTableColumns';
import { useCharacterWhereabouts } from '@/features/character/useCharacterWhereabouts';
import { useCharacterAchievements } from '@/features/character/useCharacterAchievements';
import { returnPathAfterSwitch } from '@/features/character/characterSwitchReturn';

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
  const spFarm = useSpFarmCharacters((state) => state.value);
  const setSpFarm = useSpFarmCharacters((state) => state.setValue);
  const spFarmHydrated = useHydratedStore(useSpFarmCharacters);

  const extractionPrices = useExtractionPrices();
  const alertCounts = useAlertCountsByCharacter();
  const notificationPrefs = useNotificationPreferences((state) => state.value);
  const notTrainingAlertEnabledFor = (characterId: number) =>
    isNotTrainingAlertEnabledFor(notificationPrefs, characterId);
  const timeZone = useTimeZone();

  const { rosterCore, attentionById, refreshingAll, refreshAll } = useRosterData(characters);

  const {
    addingGroup,
    setAddingGroup,
    newGroupButton,
    newGroupName,
    setNewGroupName,
    deletingGroupId,
    setDeletingGroupId,
    handleMoveToGroup,
    handleCreateGroup,
    cancelCreateGroup,
    handleRenameGroup,
    handleRemoveGroup,
    handleMoveGroup,
  } = useCharacterGroupActions(groupsValue, setGroupsValue);
  const [removingCharacter, setRemovingCharacter] = useState<RemoveTarget | null>(null);
  /** The Character whose removal just failed — rolled back whole, so it is still listed. */
  const [removeFailedName, setRemoveFailedName] = useState<string | null>(null);
  useEffect(() => {
    if (removeFailedName === null) return;
    const timer = setTimeout(() => setRemoveFailedName(null), 5000);
    return () => clearTimeout(timer);
  }, [removeFailedName]);
  const [customizingPermissions, setCustomizingPermissions] = useState(false);

  // Read only while the table shows one of the two optional columns.
  const whereabouts = useCharacterWhereabouts(
    useMemo(() => (characters ?? []).map((character) => character.characterId), [characters]),
    viewMode === 'table' && (visibleColumns.includes('dockedAt') || visibleColumns.includes('ship'))
  );

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
    spFarm,
    alertCounts,
    notTrainingAlertEnabledFor,
    visibleColumns,
    spExtractionEnabled,
    whereabouts,
  });

  // One batched read for the roster: every card's line, or the table's column while it shows.
  const achievements = useCharacterAchievements(
    useMemo(() => (characters ?? []).map((character) => character.characterId), [characters]),
    viewMode === 'card' || activeColumnIds.includes('achievement')
  );

  // Not `useMemo`: `handleToggleStar` below closes over `starred`/`setStarred`
  // and is a fresh function every render anyway, so a memoized wrapper here
  // would just recompute every render regardless — `buildColumns` itself is
  // cheap (a handful of object literals, no per-character work).
  const columnsById = buildColumns(
    t,
    spExtractionThreshold,
    extractionPrices.net,
    (id) => void handleToggleStar(id),
    (id) => void handleToggleSpFarm(id),
    timeZone,
    groupsValue.groups,
    (id, groupId) => void handleMoveToGroup(id, groupId),
    achievements
  );

  useCharactersHousekeeping({
    characters,
    groupsValue,
    groupsHydrated,
    setGroupsValue,
    starred,
    starredHydrated,
    setStarred,
    visibleColumns,
    visibleColumnsHydrated,
    setVisibleColumns,
    columnsMigrated,
    columnsMigratedHydrated,
    setColumnsMigrated,
  });

  async function select(characterId: number) {
    await setActiveCharacter(characterId);
    // Return to wherever the switch started (the rail portrait, the tab bar,
    // or the More sheet's portrait+name row) — see `returnPathAfterSwitch`.
    const from = (location.state as { from?: string } | null)?.from;
    navigate(returnPathAfterSwitch(from));
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

  async function handleToggleSpFarm(characterId: number) {
    await setSpFarm(withToggledSpFarm(spFarm, characterId));
  }

  async function handleToggleStar(characterId: number) {
    await setStarred(withToggledStar(starred, characterId));
  }

  function requestRemoveCharacter(characterId: number, name: string) {
    setRemovingCharacter({ id: characterId, name });
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
      row.spFarm &&
      row.totalSp !== undefined &&
      isSpExtractionReady(row.totalSp, spExtractionThreshold)
        ? sum + extractorCount(row.totalSp)
        : sum,
    0
  );
  const extractionSummary =
    spExtractionEnabled &&
    spFarmHydrated &&
    spFarm.length === 0 &&
    activeColumnIds.includes('spReady')
      ? t('characters.spFarmHint')
      : !spExtractionEnabled || !extractionPrices.loaded || extractorsReady === 0
        ? null
        : extractionPrices.net === null
          ? t('characters.extractionUnpriced', { hub: extractionPrices.hubName })
          : t('characters.extractionTotal', {
              isk: formatIskCompact(extractionPrices.net * extractorsReady),
              each: formatIskCompact(extractionPrices.net),
              hub: extractionPrices.hubName,
            });

  if (!characters) {
    return <Spinner block="page" label={t('common.loading')} />;
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
                  <SplitButtonChevron label={t('characters.addMenuLabel')} />
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
                      cancelCreateGroup();
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
              spExtractionEnabled={spExtractionEnabled}
              onToggleSpFarm={(id) => void handleToggleSpFarm(id)}
              tableProps={charactersExport.tableProps}
              sort={tableSort}
              onSortChange={setTableSort}
              onSelect={(id) => void select(id)}
              onRemove={requestRemoveCharacter}
            />
          ) : (
            <CharactersCardView
              achievements={achievements}
              groups={groupsValue.groups}
              ungroupedIds={ungroupedIds}
              charactersById={charactersById}
              rosterCore={rosterCore}
              attentionById={attentionById}
              alertCounts={alertCounts}
              groupIdByCharacterId={groupIdByCharacterId}
              starred={starred}
              activeCharacterId={activeCharacterId}
              now={now}
              sortKey={sortKey}
              sortDirection={sortDirection}
              sortStatsById={sortStatsById}
              matchesFilters={matchesFilters}
              notTrainingAlertEnabledFor={notTrainingAlertEnabledFor}
              onSelect={(id) => void select(id)}
              onToggleStar={(id) => void handleToggleStar(id)}
              onMoveToGroup={(id, groupId) => void handleMoveToGroup(id, groupId)}
              onRemove={requestRemoveCharacter}
              onRenameGroup={(id, name) => void handleRenameGroup(id, name)}
              onRemoveGroup={setDeletingGroupId}
              onMoveGroup={(index, direction) => void handleMoveGroup(index, direction)}
            />
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
