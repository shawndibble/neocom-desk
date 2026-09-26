import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHighlightParam } from '@/lib/useHighlightParam';
import {
  Button,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  EmptyState,
  FilterBar,
  FilterChip,
  IconButton,
  IskAmount,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
  Tabs,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  CONTRACTS_HISTORY_COLUMN_IDS,
  contractsHistoryColumnsStore,
  type ContractsHistoryColumnId,
} from './contractsColumns';
import { GrantBanner } from '@/app/GrantNote';
import { loadContracts } from '@/features/character/contracts';
import { contractAmount } from '@/features/character/contractAmount';
import { ContractContextMenu } from '@/features/character/ContractContextMenu';
import { ContractDetailModal } from '@/features/character/ContractDetailModal';
import { ContractIdentity } from '@/features/character/ContractIdentity';
import { IssuerLink } from '@/features/character/IssuerLink';
import { StandingTag } from '@/features/character/StandingTag';
import { loadContacts } from '@/features/character/contacts';
import {
  buildContactStandingIndex,
  type ContactStandingIndex,
} from '@/features/character/contactStandings';
import { resolveAffiliations } from '@/features/character/affiliations';
import { characterStanding } from '@/features/character/entityStanding';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import {
  activeContractsFilterCount,
  EMPTY_CONTRACTS_FILTER,
  isContractsFilterActive,
  contractStatusOptions,
  contractTypeOptions,
  filterContracts,
  type ContractsFilter,
} from '@/features/character/contractsFilter';
import {
  ContractSearchPanel,
  type ContractMode,
  type ContractSearchStatus,
} from '@/features/contractSearch/ContractSearchPanel';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatTimestamp } from '@/lib/timestamp';
import { formatCountdown } from '@/lib/duration';
import { courierDeliveryDeadlineMs } from '@/engine/courierDeadline';
import { useTimeZone } from '@/lib/timeFormat';
import { useIsPhone } from '@/lib/useIsPhone';
import { downloadCsv } from '@/lib/downloadCsv';
import { contractsCsvColumns } from '@/features/character/contractsCsv';
import type { CharacterAffiliation, Contract } from '@/esi/endpoints';
import { usePageTab } from '@/lib/usePageTab';
import { useContractSearchMode } from '@/features/contractSearch/contractSearchModePref';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { boolParam, optionalEnumParam, textParam } from '@/lib/urlState';
import { CONTRACTS_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import type { TabRouteDefaultState } from '@/app/TabRoute';

interface Snapshot {
  contractsResult: CachedResult<Contract[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  contractsNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  contractsTruncated: boolean;
  issuerNames: Map<number, string>;
  /**
   * This character's own contact list, indexed once per snapshot. Empty
   * (never missing) when the contacts scope isn't granted — a stranger's tag
   * is simply absent, not an error the page needs to surface.
   */
  standingIndex: ContactStandingIndex;
  /** Each issuer's corp/alliance/faction, so an issuer with no personal contact entry can still match one the pilot holds on their corp. */
  issuerAffiliations: Map<number, CharacterAffiliation>;
}

const STATUS_TONE: Record<Contract['status'], string> = {
  outstanding: 'text-text',
  in_progress: 'text-warning',
  finished_issuer: 'text-success',
  finished_contractor: 'text-success',
  finished: 'text-success',
  cancelled: 'text-text-dim',
  rejected: 'text-danger',
  failed: 'text-danger',
  deleted: 'text-text-dim',
  reversed: 'text-danger',
};

/** Rows shown before "show all" (same precedent as the market order book). */
const ROW_CAP = 50;

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_STANDING_INDEX: ContactStandingIndex = new Map();
const NO_AFFILIATIONS: ReadonlyMap<number, CharacterAffiliation> = new Map();

/**
 * Lapsed and unclaimed — still `outstanding` past its accept-by deadline.
 * `date_expired` is only ever "the deadline to act", not "when this row
 * stopped mattering": a finished/cancelled/etc. contract's deadline is
 * naturally in the past for anything old, so dimming on date alone (the
 * previous behavior) faded almost every completed contract in the list.
 */
function isStale(contract: Contract): boolean {
  return (
    contract.status === 'outstanding' && new Date(contract.date_expired).getTime() < Date.now()
  );
}

async function loadContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: contractsResult, needsReauth: contractsNeedsReauth } =
    await loadContracts(characterId);
  const contractsTruncated = contractsResult?.truncated ?? false;
  // Already superseded: skip the name/standing lookups, their results would be discarded.
  const issuerIds = signal.cancelled ? [] : (contractsResult?.data ?? []).map((c) => c.issuer_id);
  const [issuerNames, contactsStatus, issuerAffiliations] = await Promise.all([
    resolveNames(issuerIds),
    signal.cancelled ? Promise.resolve(null) : loadContacts(characterId),
    resolveAffiliations(issuerIds),
  ]);
  const standingIndex = buildContactStandingIndex(contactsStatus?.cached?.data ?? []);
  return {
    contractsResult,
    contractsNeedsReauth,
    contractsTruncated,
    issuerNames,
    standingIndex,
    issuerAffiliations,
  };
}

interface ContractsFilterBarProps {
  filter: ContractsFilter;
  onChange: (filter: ContractsFilter) => void;
  statusOptions: Contract['status'][];
  typeOptions: Contract['type'][];
  /** The History table's column picker, drawn beside the filter trigger. */
  actions?: ReactNode;
}

/** Search plus status/type filter chips above the contracts table (issue #417). */
function ContractsFilterBar({
  filter,
  onChange,
  statusOptions,
  typeOptions,
  actions,
}: ContractsFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeContractsFilterCount(filter)}
      actions={actions}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('contracts.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <div
            role="group"
            aria-label={t('contracts.statusFilterLabel')}
            className="flex flex-wrap gap-2"
          >
            {statusOptions.map((status) => (
              <FilterChip
                key={status}
                label={t(CONTRACT_STATUS_KEY[status])}
                selected={draft.status === status}
                onToggle={() =>
                  setDraft({ ...draft, status: draft.status === status ? null : status })
                }
              />
            ))}
          </div>
          <div
            role="group"
            aria-label={t('contracts.typeFilterLabel')}
            className="flex flex-wrap gap-2"
          >
            {typeOptions.map((type) => (
              <FilterChip
                key={type}
                label={t(CONTRACT_TYPE_KEY[type])}
                selected={draft.type === type}
                onToggle={() => setDraft({ ...draft, type: draft.type === type ? null : type })}
              />
            ))}
          </div>
        </>
      )}
    </FilterBar>
  );
}

function contractRowContextMenu(contract: Contract, tr: ReactElement) {
  return <ContractContextMenu contract={contract}>{tr}</ContractContextMenu>;
}

const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_KEY) as Contract['status'][];
const CONTRACT_TYPES = Object.keys(CONTRACT_TYPE_KEY) as Contract['type'][];

/** The History table's own filter, in the URL (ADR 0015) as one group. */
const HISTORY_FILTER_PARAMS = {
  'history.q': textParam(),
  'history.status': optionalEnumParam(CONTRACT_STATUSES),
  'history.type': optionalEnumParam(CONTRACT_TYPES),
  'history.all': boolParam(),
};
/**
 * History had no controlled sort before this — rows sorted by `date_issued`
 * desc, which is not a column and so cannot be expressed as a `UrlSort`.
 * Expires desc is the closest existing column to "most recent activity
 * first" and is what an untouched view now shows.
 */
const HISTORY_SORT = { columnId: 'expires', direction: 'desc' } as const;

/** Contracts: table with status chips, stale offers dimmed, detail on click. Read-only, cached for offline. */
export function Contracts() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadContractsSnapshot,
    undefined,
    { cacheKey: 'contracts' }
  );

  const historyColumnVisibility = useColumnVisibility(
    contractsHistoryColumnsStore,
    CONTRACTS_HISTORY_COLUMN_IDS
  );

  const contractsResult = data?.contractsResult ?? null;
  const contractsNeedsReauth = data?.contractsNeedsReauth ?? false;
  const contractsTruncated = data?.contractsTruncated ?? false;
  const issuerNames = data?.issuerNames ?? NO_NAMES;
  const standingIndex = data?.standingIndex ?? NO_STANDING_INDEX;
  const issuerAffiliations = data?.issuerAffiliations ?? NO_AFFILIATIONS;

  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [historyParams, setHistoryParams] = useUrlParams(HISTORY_FILTER_PARAMS);
  const filter = useMemo<ContractsFilter>(
    () => ({
      text: historyParams['history.q'],
      status: historyParams['history.status'],
      type: historyParams['history.type'],
    }),
    [historyParams]
  );
  const setFilter = (next: ContractsFilter) =>
    setHistoryParams({
      'history.q': next.text,
      'history.status': next.status,
      'history.type': next.type,
    });
  const showAll = historyParams['history.all'];
  const setShowAll = (next: boolean) => setHistoryParams({ 'history.all': next });
  // The contract a `contractAccepted` alert pointed at, if any.
  const highlightedContractId = useHighlightParam();

  /**
   * The Search tab's own freshness and reload, reported up by the panel so the
   * page header can draw them beside the route title — the same slot the
   * History tab's badge and Refresh use, and the same slot every other route
   * puts them in. Null until that panel has mounted and loaded something.
   */
  const [searchStatus, setSearchStatus] = useState<ContractSearchStatus | null>(null);

  /**
   * Phone only: where the Search panel portals its Items/Courier switch, so
   * it shares the tab row rather than taking a panel header strip of its own
   * under it. State (a callback ref), not a ref object, so the panel
   * re-renders with the element once it exists.
   */
  const isPhone = useIsPhone();
  const [modeSwitchSlot, setModeSwitchSlot] = useState<HTMLElement | null>(null);

  /**
   * The page's own tab id is a full path suffix (`search/items`,
   * `search/courier`, `history`) rather than one segment, since Search has
   * its own Items/Courier sub-tab — see `CONTRACTS_TABS`. `tab` and `mode`
   * are both read out of it; switching *to* Search from History restores
   * whichever mode was last active rather than always landing on Items.
   */
  const [tabId, setTabId] = usePageTab(CONTRACTS_TABS);
  const tab: 'search' | 'history' = tabId === 'history' ? 'history' : 'search';
  const mode: ContractMode = tabId === 'search/courier' ? 'courier' : 'items';
  const setTab = useCallback(
    (next: 'search' | 'history') => setTabId(next === 'history' ? 'history' : `search/${mode}`),
    [setTabId, mode]
  );
  const rememberedMode = useContractSearchMode((state) => state.value);
  const rememberedModeHydrated = useContractSearchMode((state) => state.hydrated);
  const hydrateRememberedMode = useContractSearchMode((state) => state.hydrate);
  const setRememberedMode = useContractSearchMode((state) => state.setValue);
  useEffect(() => {
    void hydrateRememberedMode();
  }, [hydrateRememberedMode]);
  const setMode = useCallback(
    (next: ContractMode) => {
      setTabId(`search/${next}`);
      void setRememberedMode(next);
    },
    [setTabId, setRememberedMode]
  );
  /**
   * A bare `/contracts` visit always redirects to `CONTRACTS_TABS`' hardcoded
   * `search/items` (issue #1719) — the route/tab itself stays unpersisted
   * (decision `20260912-141100`), so this only steps in once, right after
   * that redirect, to swap for the last-used mode.
   *
   * `tabId` alone can't tell that redirect apart from an explicit, bookmarked
   * or shared deep link to the literal `/contracts/search/items` path — both
   * resolve to the exact same `tabId`. `TabRoute`'s own `state` marker
   * (`tabRouteDefaulted`) is the one signal that distinguishes them, since
   * only `TabRoute` knows which case produced this landing; a deep link never
   * carries it, so `landedOnDefault` is false and this never touches it.
   *
   * `navigate` directly, not `setTabId`/`setMode`: those always push a new
   * history entry (`usePageTab`'s own contract, so an explicit tab switch is
   * a place Back returns to) — a *silent* restore on first paint is not such
   * a place, and pushing one here would leave a phantom Items entry behind
   * Courier for Back to bounce off of. Skipped entirely when the remembered
   * mode already matches (`rememberedMode` is `'items'`, the hardcoded
   * default) — nothing to change, and the only cost of leaving the marker in
   * place is that it can ride along on a later URL-param write within this
   * mount, which nothing here or elsewhere ever reads again.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const landedOnDefault = Boolean(
    (location.state as TabRouteDefaultState | null)?.tabRouteDefaulted
  );
  const appliedRememberedMode = useRef(false);
  useEffect(() => {
    if (appliedRememberedMode.current || !rememberedModeHydrated) return;
    appliedRememberedMode.current = true;
    if (!landedOnDefault || rememberedMode !== 'courier') return;
    navigate(
      {
        pathname: tabPath(CONTRACTS_TABS, 'search/courier'),
        search: location.search,
        hash: location.hash,
      },
      { replace: true, state: null }
    );
  }, [
    rememberedModeHydrated,
    landedOnDefault,
    rememberedMode,
    location.search,
    location.hash,
    navigate,
  ]);
  const pageTabs = useMemo(
    () => [
      { id: 'search' as const, label: t('contracts.searchTab') },
      { id: 'history' as const, label: t('contracts.historyTab') },
    ],
    [t]
  );

  // The identity column (never hidden — it opens the detail modal) plus the
  // optional columns the picker controls, in table order —
  // `CONTRACTS_HISTORY_COLUMN_IDS`' own order.
  const optionalHistoryColumns = useMemo<
    Record<ContractsHistoryColumnId, DataTableColumn<Contract>>
  >(
    () => ({
      status: {
        id: 'status',
        header: t('contracts.status'),
        className: 'font-semibold',
        cellClassName: (contract) => STATUS_TONE[contract.status],
        sortValue: (contract) => t(CONTRACT_STATUS_KEY[contract.status]),
        render: (contract) => {
          const label = t(CONTRACT_STATUS_KEY[contract.status]);
          return isStale(contract) ? (
            <Tooltip content={t('contracts.staleTooltip')} openOnTap>
              <span className="inline-flex items-center gap-1">
                <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0" />
                {label}
              </span>
            </Tooltip>
          ) : (
            label
          );
        },
      },
      issuer: {
        id: 'issuer',
        header: t('contracts.issuer'),
        sortValue: (contract) => issuerNames.get(contract.issuer_id) ?? `#${contract.issuer_id}`,
        render: (contract) => (
          <span className="inline-flex items-center gap-1.5">
            <IssuerLink
              issuerId={contract.issuer_id}
              name={issuerNames.get(contract.issuer_id) ?? `#${contract.issuer_id}`}
              className="text-left"
            />
            <StandingTag
              standing={characterStanding(standingIndex, contract.issuer_id, issuerAffiliations)}
            />
          </span>
        ),
      },
      price: {
        id: 'price',
        header: t('contracts.price'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (contract) => contractAmount(contract),
        render: (contract) => {
          const amount = contractAmount(contract);
          return amount !== undefined ? (
            <IskAmount value={amount} revealOn="longPress" />
          ) : (
            t('common.unknown')
          );
        },
      },
      expires: {
        id: 'expires',
        header: t('contracts.expires'),
        className: 'whitespace-nowrap text-text-dim',
        // An accepted courier's clock is delivery, not the accept-by expiry.
        sortValue: (contract) =>
          courierDeliveryDeadlineMs(contract) ?? new Date(contract.date_expired).getTime(),
        render: (contract) => {
          const deadlineMs = courierDeliveryDeadlineMs(contract);
          if (deadlineMs === null)
            return formatTimestamp(new Date(contract.date_expired), timeZone);
          const time = formatTimestamp(new Date(deadlineMs), timeZone);
          const remainingMs = deadlineMs - Date.now();
          return remainingMs <= 0 ? (
            <span className="text-danger">{t('contracts.deliverOverdue', { time })}</span>
          ) : (
            t('contracts.deliverDue', { time, duration: formatCountdown(remainingMs / 1000) })
          );
        },
      },
    }),
    [t, issuerNames, timeZone, standingIndex, issuerAffiliations]
  );
  const columns = useMemo<DataTableColumn<Contract>[]>(
    () => [
      {
        id: 'type',
        header: t('contracts.type'),
        sortValue: (contract) => contract.title || t(CONTRACT_TYPE_KEY[contract.type]),
        render: (contract) => (
          <button
            type="button"
            onClick={() => setSelectedContract(contract)}
            className="flex min-h-11 w-full items-center text-left font-medium text-accent hover:underline md:block md:min-h-0 md:w-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ContractIdentity contract={contract} characterId={activeCharacterId} />
          </button>
        ),
      },
      ...CONTRACTS_HISTORY_COLUMN_IDS.filter(historyColumnVisibility.isVisible).map(
        (id) => optionalHistoryColumns[id]
      ),
    ],
    [t, optionalHistoryColumns, historyColumnVisibility.isVisible, activeCharacterId]
  );
  // The full catalog, not just `columns`' currently-visible ids: a sort
  // picked while a column was shown should still resolve once the picker
  // hides it, ready to take effect again the moment it's shown back
  // (`resolveSort` only rejects a `columnId` the catalog has never heard of).
  const historySortProps = useUrlSort('history.sort', HISTORY_SORT, [
    'type',
    ...CONTRACTS_HISTORY_COLUMN_IDS,
  ]);

  const contracts = useMemo(
    () =>
      [...(contractsResult?.data ?? [])].sort((a, b) => b.date_issued.localeCompare(a.date_issued)),
    [contractsResult]
  );

  const statusOptions = useMemo(() => contractStatusOptions(contracts), [contracts]);
  const typeOptions = useMemo(() => contractTypeOptions(contracts), [contracts]);
  const filteredContracts = useMemo(
    () => filterContracts(contracts, filter, issuerNames),
    [contracts, filter, issuerNames]
  );
  // A contract an alert pointed at must be rendered to be scrolled to, and it
  // can sit past the cap — an accepted contract is not necessarily a recent
  // one. Uncapping is the honest fix: the alternative, splicing it into a
  // capped list, would show it out of the order the table claims to be in.
  const highlightBeyondCap =
    highlightedContractId !== null &&
    filteredContracts.findIndex((c) => c.contract_id === highlightedContractId) >= ROW_CAP;
  const visibleContracts =
    showAll || highlightBeyondCap ? filteredContracts : filteredContracts.slice(0, ROW_CAP);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-2 sm:space-y-4">
      {/* Both tabs read something datable and reloadable, but not the same
          thing: History is this character's own contract list, Search a shared
          public snapshot the panel below owns. So the badge and the Refresh
          are per tab — the CSV export is History-only, because it exports that
          character's contracts and nothing on Search corresponds to it. */}
      <PageHeader
        title={t('contracts.title')}
        meta={
          tab === 'history' ? (
            contractsResult ? (
              <DataAgeBadge date={contractsResult.fetchedAt} />
            ) : undefined
          ) : searchStatus?.lastSyncedAt != null ? (
            <DataAgeBadge date={new Date(searchStatus.lastSyncedAt)} />
          ) : undefined
        }
        actions={
          tab === 'history' ? (
            <>
              <IconButton
                icon={<Icon.Download />}
                label={t('contracts.exportCsv')}
                disabled={filteredContracts.length === 0}
                onClick={() =>
                  downloadCsv(
                    'contracts',
                    filteredContracts,
                    contractsCsvColumns(t, (id) => issuerNames.get(id) ?? `#${id}`),
                    new Date(),
                    contractsTruncated
                  )
                }
              />
              <IconButton
                icon={<Icon.Refresh />}
                label={t('contracts.refresh')}
                onClick={refresh}
                disabled={loading}
              />
            </>
          ) : (
            <IconButton
              icon={<Icon.Refresh />}
              label={t('contractSearch.refresh')}
              onClick={() => searchStatus?.refresh()}
              disabled={searchStatus === null || searchStatus.loading}
            />
          )
        }
      />

      {/* On a phone the Search tab's corpus switch sits at the right of this
          row, portalled in by the panel. The wrapper exists only then, so the
          desktop markup is the bare tab bar it always was. */}
      {isPhone && tab === 'search' ? (
        <div className="flex items-center gap-2">
          <Tabs
            tabs={pageTabs}
            value={tab}
            onChange={(id) => setTab(id as 'search' | 'history')}
            label={t('contracts.tabsLabel')}
            className="min-w-0 flex-1"
          />
          <div ref={setModeSwitchSlot} className="shrink-0" />
        </div>
      ) : (
        <Tabs
          tabs={pageTabs}
          value={tab}
          onChange={(id) => setTab(id as 'search' | 'history')}
          label={t('contracts.tabsLabel')}
        />
      )}

      {/* Switched outside the history chain below, not inside it: Search needs
          neither this character's contracts nor its `contracts` scope, so a
          character with an empty history or a 403 must still reach it. */}
      {tab === 'search' ? (
        <ContractSearchPanel
          mode={mode}
          onModeChange={setMode}
          onStatusChange={setSearchStatus}
          modeSwitchSlot={modeSwitchSlot}
        />
      ) : loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : contractsNeedsReauth ? (
        <GrantBanner
          characterId={activeCharacterId}
          endpoints={['getCharacterContracts']}
          title={t('contracts.reauthTitle')}
          hint={t('contracts.reauthHint')}
          actionLabel={t('contracts.reauthAction')}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !contractsResult || contracts.length === 0 ? (
        <CachedEmptyState
          result={contractsResult}
          title={t('contracts.emptyTitle')}
          hint={t('contracts.emptyHint')}
          fetchedTitle={t('contracts.emptyFetchedTitle')}
        />
      ) : (
        <Panel padded={false}>
          {contractsResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          {contractsTruncated && (
            <p className="flex flex-wrap items-center gap-2 px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              <span>{t('common.incompleteTitle')}</span>
              <Button size="sm" disabled={loading} onClick={refresh}>
                {t('contracts.fetchTruncatedRetry')}
              </Button>
            </p>
          )}
          <ContractsFilterBar
            filter={filter}
            onChange={setFilter}
            statusOptions={statusOptions}
            typeOptions={typeOptions}
            actions={
              <ColumnPickerMenu
                available={CONTRACTS_HISTORY_COLUMN_IDS}
                visible={historyColumnVisibility.visible}
                columnsById={optionalHistoryColumns}
                onToggle={historyColumnVisibility.toggle}
                buttonLabel={t('common.columnsButton')}
                menuTitle={t('common.columnsMenuTitle')}
                onReset={historyColumnVisibility.reset}
                resetLabel={t('common.resetColumns')}
              />
            }
          />
          {filteredContracts.length === 0 ? (
            // Zero matches with no active filter can't happen today (an empty
            // list is caught above), but the reset only belongs where a filter is on.
            isContractsFilterActive(filter) ? (
              <EmptyState
                title={t('contracts.noFilterMatches')}
                hint={t('contracts.noFilterMatchesResetHint')}
                className="py-8"
                action={
                  <Button size="sm" onClick={() => setFilter(EMPTY_CONTRACTS_FILTER)}>
                    {t('common.resetFilters')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title={t('contracts.noFilterMatches')}
                hint={t('contracts.noFilterMatchesHint')}
                className="py-8"
              />
            )
          ) : (
            <>
              <DataTable
                label={t('contracts.title')}
                columns={columns}
                rows={visibleContracts}
                rowKey={(contract) => contract.contract_id}
                highlightRowKey={highlightedContractId}
                rowContextMenu={contractRowContextMenu}
                {...historySortProps}
              />
              {!showAll && filteredContracts.length > ROW_CAP && (
                <div className="px-3 py-2">
                  <Button size="sm" onClick={() => setShowAll(true)}>
                    {t('contracts.showAll', { count: filteredContracts.length })}
                  </Button>
                </div>
              )}
            </>
          )}
        </Panel>
      )}

      {tab === 'history' && selectedContract && activeCharacterId !== null && (
        <ContractDetailModal
          characterId={activeCharacterId}
          contract={selectedContract}
          issuerName={
            issuerNames.get(selectedContract.issuer_id) ?? `#${selectedContract.issuer_id}`
          }
          issuerStanding={characterStanding(
            standingIndex,
            selectedContract.issuer_id,
            issuerAffiliations
          )}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}
