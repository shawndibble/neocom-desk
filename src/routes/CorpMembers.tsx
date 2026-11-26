import { useCallback, useMemo, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useIsPhone } from '@/lib/useIsPhone';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import { parsePositiveInt } from '@/engine/market/urlState';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  CachedNotice,
  Tabs,
  useTabsId,
  type ActiveFilter,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpRolesGate } from '@/features/corp/CorpRolesGate';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { CorpDenied } from '@/features/corp/CorpDenied';
import {
  CorpRoleAudit,
  MembersTabPanel,
  type MembersTabsSlot,
} from '@/features/corp/CorpRoleAudit';
import {
  CorpRosterColumnPicker,
  CorpRosterStats,
  CorpRosterSummary,
  CorpRosterTable,
  type RosterRow,
} from '@/features/corp/CorpRoster';
import { useRosterGrouping } from '@/features/corp/useRosterGrouping';
import { PlayersView } from '@/features/corp/PlayersView';
import { GroupMinersView } from '@/features/corp/moons/GroupMinersDialog';
import { membersCsvColumns } from '@/features/corp/membersCsv';
import { loadCorporationId } from '@/features/corp/boardData';
import {
  EMPTY_MEMBER_LABELS,
  loadCorporationMemberIds,
  loadCorporationCeoId,
  loadCorporationMemberRoles,
  loadCorporationMemberTracking,
  loadMemberLabels,
  toMemberActivity,
  toMemberRoles,
  type MemberLabels,
} from '@/features/corp/members';
import { readPreviousRoster, recordRoster } from '@/features/corp/rosterState';
import {
  EMPTY_ROSTER_DIFF,
  diffRoster,
  filterRosterRows,
  label,
  memberStanding,
  type MemberActivity,
  type RosterDiff,
} from '@/engine/corp/members';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { DataGate } from '@/components/DataGate';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useUrlParams } from '@/lib/useUrlState';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { boolParam, enumParam, optionalIdParam, textParam } from '@/lib/urlState';
import { tabPath } from '@/lib/pageTabs';
import { usePageTab } from '@/lib/usePageTab';
import { CORP_MEMBERS_TABS } from '@/features/corp/corpMembersTabs';

const FILTER_PARAMS = {
  q: textParam(),
  dark: boolParam(),
  ship: optionalIdParam(),
  loc: optionalIdParam(),
  view: enumParam(['characters', 'players'] as const, 'characters'),
};

interface RosterFilter {
  dark: boolean;
  ship: number | null;
  loc: number | null;
}

const ANY = '__any';

interface RosterOption {
  id: number;
  label: string;
}

function rosterOptions(
  rows: readonly RosterRow[],
  pick: (row: RosterRow) => { id: number | null; name: string | null }
): RosterOption[] {
  const byId = new Map<number, string>();
  for (const row of rows) {
    const { id, name } = pick(row);
    if (id !== null && !byId.has(id)) byId.set(id, label(name, id));
  }
  return [...byId]
    .map(([id, text]) => ({ id, label: text }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function activeMemberFilters(
  filter: RosterFilter,
  labels: {
    darkLabel: string;
    shipLabel: string;
    locationLabel: string;
    shipOptions: readonly RosterOption[];
    locationOptions: readonly RosterOption[];
  }
): ActiveFilter<RosterFilter>[] {
  const optionLabel = (options: readonly RosterOption[], id: number) =>
    options.find((option) => option.id === id)?.label ?? label(null, id);
  const active: ActiveFilter<RosterFilter>[] = [];
  if (filter.dark)
    active.push({ label: labels.darkLabel, clear: (next) => ({ ...next, dark: false }) });
  if (filter.ship !== null)
    active.push({
      label: labels.shipLabel,
      value: optionLabel(labels.shipOptions, filter.ship),
      clear: (next) => ({ ...next, ship: null }),
    });
  if (filter.loc !== null)
    active.push({
      label: labels.locationLabel,
      value: optionLabel(labels.locationOptions, filter.loc),
      clear: (next) => ({ ...next, loc: null }),
    });
  return active;
}

interface MembersSnapshot {
  corporationId: number | null;
  ceoId: number | null;
  members: MemberActivity[] | null;
  roles: ReadonlyMap<number, readonly string[]>;
  labels: MemberLabels;
  diff: RosterDiff;
  fetchedAt: Date | null;
  fromCache: boolean;
  loadedAt: number;
}

const EMPTY_SNAPSHOT: MembersSnapshot = {
  corporationId: null,
  ceoId: null,
  members: null,
  roles: new Map(),
  labels: EMPTY_MEMBER_LABELS,
  diff: EMPTY_ROSTER_DIFF,
  fetchedAt: null,
  fromCache: false,
  loadedAt: 0,
};

async function loadMembersSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<MembersSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  const loadedAt = Date.now();
  if (corporationId === null || signal.cancelled) {
    return { ...EMPTY_SNAPSHOT, corporationId, loadedAt };
  }

  const [roster, tracking, memberRoles, ceoId] = await Promise.all([
    loadCorporationMemberIds(characterId, corporationId),
    loadCorporationMemberTracking(characterId, corporationId),
    loadCorporationMemberRoles(characterId, corporationId),
    loadCorporationCeoId(corporationId),
  ]);

  const memberIds = roster.cached?.data ?? null;
  let diff = EMPTY_ROSTER_DIFF;
  if (memberIds !== null) {
    diff = diffRoster(await readPreviousRoster(characterId, corporationId), memberIds);
    if (!signal.cancelled && tracking.cached)
      await recordRoster(characterId, corporationId, memberIds, loadedAt);
  }

  const members = tracking.cached ? toMemberActivity(tracking.cached.data) : null;
  const roles = toMemberRoles(memberRoles.cached?.data ?? []);
  const labels = await loadMemberLabels(characterId, members ?? [], diff.left);

  const fetchedAts = [roster, tracking]
    .map((result) => result.cached?.fetchedAt)
    .filter((date): date is Date => date !== undefined);
  const fetchedAt =
    fetchedAts.length === 0
      ? null
      : fetchedAts.reduce((oldest, date) => (date < oldest ? date : oldest));

  const fromCache = [roster, tracking].some((result) => result.cached?.fromCache);

  return { corporationId, ceoId, members, roles, labels, diff, fetchedAt, fromCache, loadedAt };
}

function ViewSwitch({
  value,
  onChange,
}: {
  value: 'characters' | 'players';
  onChange: (view: 'characters' | 'players') => void;
}) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const options = [
    { value: 'characters' as const, label: t('corp.members.players.viewCharacters') },
    { value: 'players' as const, label: t('corp.members.players.viewPlayers') },
  ];
  if (!phone)
    return (
      <SegmentedControl
        label={t('corp.members.players.viewLabel')}
        value={value}
        onChange={onChange}
        uppercase={false}
        options={options}
      />
    );
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<Icon.AllCharacters />}
          label={t('corp.members.players.viewWithValue', { value: current })}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as 'characters' | 'players')}
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CorpMembersView({ tabs }: { tabs: MembersTabsSlot | null }) {
  const { t } = useTranslation();
  const darkAfterDays = useDarkThreshold((state) => state.value);
  useHydratedStore(useDarkThreshold);
  const snapshot = useRouteSnapshot<MembersSnapshot>(loadMembersSnapshot, undefined, {
    staleWhileRevalidate: true,
    cacheKey: 'corp-members',
  });
  const data = snapshot.data;
  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);

  const grouping = useRosterGrouping(activeCharacterId, data?.corporationId ?? null);
  const [groupingFor, setGroupingFor] = useState<number | null>(null);
  const onGroupWith = useCallback((row: RosterRow) => setGroupingFor(row.characterId), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [coldHighlight, setColdHighlight] = useState<number | null>(() =>
    searchParams.get('view') === 'players'
      ? parsePositiveInt(searchParams.get(HIGHLIGHT_PARAM))
      : null
  );
  const onShowInPlayers = useCallback(
    (row: RosterRow) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('view', 'players');
        next.set('highlight', String(row.characterId));
        return next;
      }),
    [setSearchParams]
  );

  const rows = useMemo<RosterRow[]>(() => {
    if (data === null || data.members === null) return [];
    return data.members.map((member) => ({
      ...(() => {
        const g = grouping.groupOf(member.characterId);
        return g
          ? {
              group: {
                size: g.characterIds.length,
                names: g.characterIds
                  .filter((id) => id !== member.characterId)
                  .map((id) => grouping.source.name(id)),
              },
            }
          : {};
      })(),
      characterId: member.characterId,
      name: data.labels.characters.get(member.characterId) ?? null,
      standing: memberStanding(member, data.loadedAt, darkAfterDays),
      shipTypeId: member.shipTypeId,
      shipName:
        member.shipTypeId === null ? null : (data.labels.ships.get(member.shipTypeId) ?? null),
      locationId: member.locationId,
      locationName:
        member.locationId === null ? null : (data.labels.locations.get(member.locationId) ?? null),
      startMs: member.startMs,
      roles: data.roles.get(member.characterId) ?? null,
      isSelf: member.characterId === activeCharacterId,
      isCeo: member.characterId === data.ceoId,
    }));
  }, [data, darkAfterDays, activeCharacterId, grouping]);

  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const search = filterParams.q;
  const darkOnly = filterParams.dark;
  const { ship, loc } = filterParams;
  const playersView = grouping.canGroup && filterParams.view === 'players';
  const rosterIds = useMemo(() => new Set(rows.map((r) => r.characterId)), [rows]);
  const rosterFilter = useMemo<RosterFilter>(
    () => ({ dark: darkOnly, ship, loc }),
    [darkOnly, ship, loc]
  );
  const shipOptions = useMemo(
    () => rosterOptions(rows, (row) => ({ id: row.shipTypeId, name: row.shipName })),
    [rows]
  );
  const locationOptions = useMemo(
    () => rosterOptions(rows, (row) => ({ id: row.locationId, name: row.locationName })),
    [rows]
  );
  const darkLabel = t('corp.members.dark', { days: darkAfterDays });
  const activeFilters = useMemo(
    () =>
      activeMemberFilters(rosterFilter, {
        darkLabel,
        shipLabel: t('corp.members.shipFilterLabel'),
        locationLabel: t('corp.members.locationFilterLabel'),
        shipOptions,
        locationOptions,
      }),
    [rosterFilter, darkLabel, t, shipOptions, locationOptions]
  );
  const darkCount = rows.filter((row) => row.standing.isDark).length;
  const [debouncedSearch] = useDebouncedValue(search);
  const visibleRows = useMemo(
    () =>
      filterRosterRows(rows, debouncedSearch).filter(
        (row) =>
          (!darkOnly || row.standing.isDark) &&
          (ship === null || row.shipTypeId === ship) &&
          (loc === null || row.locationId === loc)
      ),
    [rows, debouncedSearch, darkOnly, ship, loc]
  );
  const csvColumns = useMemo(() => membersCsvColumns(t), [t]);
  const membersExport = useTableExport({
    surface: 'corp-members',
    rows: visibleRows,
    columns: csvColumns,
  });

  const loadFailed = data === null || data.members === null;

  if (!snapshot.hydrated) return <Spinner />;

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title={t('corp.members.title')}
        meta={
          data?.fetchedAt ? (
            <DataAgeBadge date={data.fetchedAt} note={t('corp.dataAgeNote')} />
          ) : undefined
        }
        actions={
          <>
            <TableActionsMenu
              name={t('corp.members.title')}
              tableExport={membersExport}
              size="md"
            />
            <IconButton
              icon={<Icon.Refresh />}
              label={t('corp.members.refresh')}
              onClick={snapshot.refresh}
              busy={snapshot.loading}
            />
          </>
        }
      />

      {tabs?.bar}

      <MembersTabPanel slot={tabs}>
        <DataGate
          status={snapshot.loading && data === null ? 'busy' : loadFailed ? 'failed' : 'ok'}
          title={t('common.couldntLoad')}
          hint={t('corp.members.loadFailedHint')}
          onRetry={snapshot.refresh}
          resetKey={snapshot.activeCharacterId}
          busy={<Spinner />}
        >
          <div className="space-y-2">
            {data?.fromCache && (
              <CachedNotice
                withBadge
                fetchedAt={data.fetchedAt}
                refreshFailed={snapshot.refreshCount > 0}
              />
            )}
            <FilterBar
              value={rosterFilter}
              onChange={(next) => setFilterParams(next)}
              active={activeFilters}
              resultCount={visibleRows.length}
              search={
                <SearchInput
                  value={search}
                  onChange={(e) => setFilterParams({ q: e.target.value })}
                  placeholder={t('corp.members.searchPlaceholder')}
                  className="min-w-48 flex-1"
                />
              }
              actions={
                <>
                  {grouping.canGroup && (
                    <ViewSwitch
                      value={filterParams.view}
                      onChange={(view) => setFilterParams({ view })}
                    />
                  )}
                  <CorpRosterColumnPicker />
                </>
              }
            >
              {(draft, setDraft) => (
                <>
                  <FilterField label={darkLabel} stretch={false} hideCaption>
                    <FilterChip
                      label={darkLabel}
                      count={darkCount}
                      selected={draft.dark}
                      onToggle={() => setDraft({ ...draft, dark: !draft.dark })}
                      tooltip={t('corp.members.darkHint', { days: darkAfterDays })}
                      size="md"
                    />
                  </FilterField>
                  <FilterField label={t('corp.members.shipFilterLabel')}>
                    <Select
                      value={draft.ship === null ? ANY : String(draft.ship)}
                      onValueChange={(value) =>
                        setDraft({ ...draft, ship: value === ANY ? null : Number(value) })
                      }
                    >
                      <SelectTrigger
                        aria-label={t('corp.members.shipFilterLabel')}
                        active={draft.ship !== null}
                        className="w-44"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY}>{t('corp.members.shipFilterAll')}</SelectItem>
                        {shipOptions.map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                  <FilterField label={t('corp.members.locationFilterLabel')}>
                    <Select
                      value={draft.loc === null ? ANY : String(draft.loc)}
                      onValueChange={(value) =>
                        setDraft({ ...draft, loc: value === ANY ? null : Number(value) })
                      }
                    >
                      <SelectTrigger
                        aria-label={t('corp.members.locationFilterLabel')}
                        active={draft.loc !== null}
                        className="w-56"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY}>{t('corp.members.locationFilterAll')}</SelectItem>
                        {locationOptions.map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                </>
              )}
            </FilterBar>
            <Panel padded={false}>
              <div className="space-y-2 p-3">
                <CorpRosterStats rows={rows} />
                <CorpRosterSummary
                  diff={data?.diff ?? EMPTY_ROSTER_DIFF}
                  names={data?.labels.characters ?? EMPTY_MEMBER_LABELS.characters}
                />
              </div>
              {playersView ? (
                <PlayersView
                  rows={rows}
                  visibleRows={visibleRows}
                  grouping={grouping}
                  search={debouncedSearch}
                  otherFilters={darkOnly || ship !== null || loc !== null}
                  onGroupWith={setGroupingFor}
                  highlightId={coldHighlight}
                  onHighlightSeen={() => setColdHighlight(null)}
                  onResetFilters={() =>
                    setFilterParams({ q: '', dark: false, ship: null, loc: null })
                  }
                />
              ) : rows.length > 0 && visibleRows.length === 0 ? (
                <EmptyState
                  title={t('corp.members.noFilterMatches')}
                  hint={t('corp.members.noFilterMatchesHint')}
                  className="py-8"
                  action={
                    <Button
                      size="sm"
                      onClick={() => setFilterParams({ q: '', dark: false, ship: null, loc: null })}
                    >
                      {t('common.resetFilters')}
                    </Button>
                  }
                />
              ) : (
                <CorpRosterTable
                  rows={visibleRows}
                  tableProps={membersExport.tableProps}
                  {...(grouping.canGroup ? { onGroupWith, onShowInPlayers } : {})}
                />
              )}
            </Panel>
            {groupingFor !== null && grouping.canGroup && (
              <GroupMinersView
                open
                onClose={() => setGroupingFor(null)}
                miner={
                  grouping.groupOf(groupingFor) ?? {
                    id: `solo:${groupingFor}`,
                    mainCharacterId: groupingFor,
                    characterIds: [groupingFor],
                  }
                }
                source={grouping.source}
                wording="player"
                rosterIds={rosterIds}
              />
            )}
          </div>
        </DataGate>
      </MembersTabPanel>
    </div>
  );
}

function CorpMembersTabs({ canReadRoleAudit }: { canReadRoleAudit: boolean }) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const location = useLocation();
  const [tab, selectTab] = usePageTab(CORP_MEMBERS_TABS);
  if (!canReadRoleAudit) {
    if (tab === 'roles') {
      return (
        <Navigate
          replace
          to={{ pathname: tabPath(CORP_MEMBERS_TABS, 'roster'), search: location.search }}
        />
      );
    }
    return <CorpMembersView tabs={null} />;
  }
  const tabs: MembersTabsSlot = {
    tabsId,
    tabId: tab,
    bar: (
      <Tabs
        tabsId={tabsId}
        label={t('corp.members.title')}
        value={tab}
        onChange={(id) => selectTab(id as typeof tab)}
        tabs={[
          { id: 'roster', label: t('corp.members.rosterTab') },
          { id: 'roles', label: t('corp.roles.tab') },
        ]}
      />
    ),
  };
  return tab === 'roles' ? <CorpRoleAudit tabs={tabs} /> : <CorpMembersView tabs={tabs} />;
}

export function CorpMembers() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadMembers);

  const content =
    gate.status === 'denied' ? (
      <div className="mx-auto max-w-page space-y-4">
        <PageHeader title={t('corp.members.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('corp.members.noAccessTitle')}
          hint={t('corp.members.noAccessHint')}
          roleLine={t('corp.members.roleLine')}
        />
      </div>
    ) : gate.status === 'ready' ? (
      <CorpMembersTabs canReadRoleAudit={gate.capabilities.canReadRoleAudit} />
    ) : null;

  return <CorpRolesGate gate={gate}>{content}</CorpRolesGate>;
}
