import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
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
  TabPanel,
  useTabsId,
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
import { ContractDetailModal } from '@/features/character/ContractDetailModal';
import { ContractIdentity } from '@/features/character/ContractIdentity';
import { CharacterLink, CorporationLink } from '@/features/entities';
import { ContractReceiverLink } from '@/features/character/ContractReceiverLink';
import { contractIssuer, contractReceiver } from '@/features/character/contractCounterparty';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
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
import { resolveCategories, resolveNames, type NameCategory } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import { cx } from '@/lib/cx';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { HintText } from '@/components/ui/HintText';
import { formatCountdown } from '@/lib/duration';
import { useTicker } from '@/lib/ticker';
import { courierDeliveryDeadlineMs } from '@/engine/courierDeadline';
import { useTimeZone } from '@/lib/timeFormat';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { contractsCsvColumns } from '@/features/character/contractsCsv';
import type { CharacterAffiliation, Contract } from '@/esi/endpoints';
import { useRememberedPageTab } from '@/lib/usePageTab';
import { useContractSearchMode } from '@/features/contractSearch/contractSearchModePref';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { optionalEnumParam, textParam } from '@/lib/urlState';
import { CONTRACTS_TABS } from '@/app/pageTabs';

interface Snapshot {
  contractsResult: CachedResult<Contract[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  contractsNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  contractsTruncated: boolean;
  issuerNames: Map<number, string>;
  /** Entity kind of each receiver, so a corp that took a public contract links as a corp. */
  receiverCategories: Map<number, NameCategory>;
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

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_CATEGORIES: ReadonlyMap<number, NameCategory> = new Map();
const NO_STANDING_INDEX: ContactStandingIndex = new Map();
const NO_AFFILIATIONS: ReadonlyMap<number, CharacterAffiliation> = new Map();

/**
 * Lapsed and unclaimed — still `outstanding` past its accept-by deadline.
 * `date_expired` is only ever "the deadline to act", not "when this row
 * stopped mattering": a finished/cancelled/etc. contract's deadline is
 * naturally in the past for anything old, so dimming on date alone (the
 * previous behavior) faded almost every completed contract in the list.
 */
function isStale(contract: Contract, nowMs: number): boolean {
  return contract.status === 'outstanding' && new Date(contract.date_expired).getTime() < nowMs;
}

/**
 * Minute cadence for the History table's clock-dependent cells. Their own
 * components, not a `Date.now()` in the column's `render`: `DataTable`'s rows
 * are memoized, so a render-time read would stay frozen until the row itself
 * changed — an outstanding contract would never flip to lapsed, a courier
 * never to overdue, while the page stayed open.
 */
const CONTRACT_CLOCK_MS = 60_000;

/** The status label, with the lapsed-offer warning once its accept-by deadline passes. */
function ContractStatusCell({ contract }: { contract: Contract }) {
  const { t } = useTranslation();
  const nowMs = useTicker(CONTRACT_CLOCK_MS);
  const label = t(CONTRACT_STATUS_KEY[contract.status]);
  return isStale(contract, nowMs) ? (
    <Tooltip content={t('contracts.staleTooltip')} openOnTap>
      <span tabIndex={0} className={cx('inline-flex items-center gap-1', focusRingClassName)}>
        <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0" />
        {label}
        <span className="sr-only">{t('contracts.staleTooltip')}</span>
      </span>
    </Tooltip>
  ) : (
    label
  );
}

/**
 * Yesterday's calendar day in `timeZone`, formatted like `formatDateOnly`.
 * Walks the calendar rather than subtracting 24h, which lands on the wrong day
 * across a DST change (a 23- or 25-hour day).
 */
function formatYesterday(nowMs: number, timeZone: string | undefined): string {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(nowMs))
    .split('-')
    .map(Number);
  return formatDateOnly(new Date(Date.UTC(year, month - 1, day - 1, 12)), 'UTC');
}

/** A phone day section's header: the date, and how many contracts were issued that day. */
function ContractDayHeader({
  date,
  count,
  timeZone,
}: {
  date: string;
  count: number;
  timeZone: string | undefined;
}) {
  const { t } = useTranslation();
  // Today and yesterday read as words; anything older keeps its date.
  const now = useTicker(CONTRACT_CLOCK_MS);
  const label =
    date === formatDateOnly(new Date(now), timeZone)
      ? t('contracts.today')
      : date === formatYesterday(now, timeZone)
        ? t('contracts.yesterday')
        : date;
  return (
    <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-semibold">{label}</span>
      <span className="text-[0.6875rem] text-text-dim tabular-nums">
        {t('contracts.dayCount', { count })}
      </span>
    </span>
  );
}

/** An accepted courier's delivery deadline, counting down to overdue. */
function CourierDeadlineCell({
  deadlineMs,
  timeZone,
}: {
  deadlineMs: number;
  timeZone: string | undefined;
}) {
  const { t } = useTranslation();
  const remainingMs = deadlineMs - useTicker(CONTRACT_CLOCK_MS);
  const date = new Date(deadlineMs);
  const time = formatDateOnly(date, timeZone);
  return (
    <HintText
      content={formatTimestamp(date, timeZone)}
      className={remainingMs <= 0 ? 'text-danger' : undefined}
    >
      {remainingMs <= 0
        ? t('contracts.deliverOverdue', { time })
        : t('contracts.deliverDue', { time, duration: formatCountdown(remainingMs / 1000) })}
    </HintText>
  );
}

/** A date alone in the cell; the exact time rides a tooltip (the detail modal carries it on touch). */
function ContractDateCell({ iso, timeZone }: { iso: string; timeZone: string | undefined }) {
  const date = new Date(iso);
  return (
    <HintText content={formatTimestamp(date, timeZone)}>{formatDateOnly(date, timeZone)}</HintText>
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
  const contracts = signal.cancelled ? [] : (contractsResult?.data ?? []);
  const issuers = contracts.map(contractIssuer);
  // Receivers share the name map; their kind comes from the resolved category.
  const receiverIds = contracts.flatMap((c) => contractReceiver(c, characterId)?.id ?? []);
  // Contacts and the names don't depend on the categories, so they run alongside.
  const contactsPromise = signal.cancelled ? Promise.resolve(null) : loadContacts(characterId);
  const namesPromise = resolveNames([...issuers.map((i) => i.id), ...receiverIds]);
  const receiverCategories = await resolveCategories(receiverIds);
  const receivers = contracts.flatMap(
    (c) => contractReceiver(c, characterId, receiverCategories) ?? []
  );
  // Only characters have affiliations/standings.
  const [issuerNames, contactsStatus, issuerAffiliations] = await Promise.all([
    namesPromise,
    contactsPromise,
    resolveAffiliations([
      ...issuers.filter((i) => i.kind === 'character').map((i) => i.id),
      ...receivers.filter((r) => r.kind === 'character').map((r) => r.id),
    ]),
  ]);
  const standingIndex = buildContactStandingIndex(contactsStatus?.cached?.data ?? []);
  return {
    contractsResult,
    contractsNeedsReauth,
    contractsTruncated,
    issuerNames,
    receiverCategories,
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
      triggerLabel
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

/** Module-level so the table's windowing and row memo see one stable function. */
const contractRowKey = (contract: Contract) => contract.contract_id;

const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_KEY) as Contract['status'][];
const CONTRACT_TYPES = Object.keys(CONTRACT_TYPE_KEY) as Contract['type'][];

/** The History table's own filter, in the URL (ADR 0015) as one group. */
const HISTORY_FILTER_PARAMS = {
  'history.q': textParam(),
  'history.status': optionalEnumParam(CONTRACT_STATUSES),
  'history.type': optionalEnumParam(CONTRACT_TYPES),
};
/** Newest-issued first — an untouched History view. */
const HISTORY_SORT = { columnId: 'issued', direction: 'desc' } as const;

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
  const receiverCategories = data?.receiverCategories ?? NO_CATEGORIES;
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
  // Rows derive from a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the bar and its setter keep the immediate one.
  const rowsFilter = useDeferredValue(filter);
  const setFilter = (next: ContractsFilter) =>
    setHistoryParams({
      'history.q': next.text,
      'history.status': next.status,
      'history.type': next.type,
    });
  // The contract a `contractAccepted` alert pointed at, if any.
  const highlightedContractId = useHighlightParam();

  /**
   * Item search's and Courier's own freshness and reload, reported up by the panel so the
   * page header can draw them beside the route title — the same slot the
   * History tab's badge and Refresh use, and the same slot every other route
   * puts them in. Null until that panel has mounted and loaded something.
   */
  const [searchStatus, setSearchStatus] = useState<ContractSearchStatus | null>(null);

  const rememberedMode = useContractSearchMode((state) => state.value);
  const rememberedModeHydrated = useContractSearchMode((state) => state.hydrated);
  const hydrateRememberedMode = useContractSearchMode((state) => state.hydrate);
  const setRememberedMode = useContractSearchMode((state) => state.setValue);
  useEffect(() => {
    void hydrateRememberedMode();
  }, [hydrateRememberedMode]);
  /**
   * A bare `/contracts` visit lands on whichever of Item search and Courier
   * was last used (issue #1719), while a link naming a tab — even
   * `search/items` itself — keeps it. The route/tab itself stays unpersisted
   * (decision `20260912-141100`); only the mode is remembered, and only
   * picking one of those two tabs stores it.
   */
  const rememberedTab = useMemo(
    () => ({
      value: `search/${rememberedMode}` as const,
      hydrated: rememberedModeHydrated,
    }),
    [rememberedMode, rememberedModeHydrated]
  );
  /**
   * The page's tab id is a full path suffix (`search/items`, `search/courier`,
   * `history`) — see `CONTRACTS_TABS`. Item search and Courier are one
   * public-contracts panel showing either corpus, so `tab` folds them together
   * for what the page header and body draw, and `mode` says which corpus.
   */
  const [tabId, setTabId] = useRememberedPageTab(CONTRACTS_TABS, rememberedTab);
  const tabsId = useTabsId();
  const tab: 'search' | 'history' = tabId === 'history' ? 'history' : 'search';
  const mode: ContractMode = tabId === 'search/courier' ? 'courier' : 'items';
  const selectTab = useCallback(
    (next: string) => {
      if (next === 'search/items' || next === 'search/courier') {
        setTabId(next);
        void setRememberedMode(next === 'search/courier' ? 'courier' : 'items');
      } else {
        setTabId('history');
      }
    },
    [setTabId, setRememberedMode]
  );
  const pageTabs = useMemo(
    () => [
      { id: 'search/items', label: t('contracts.itemSearchTab') },
      { id: 'search/courier', label: t('contracts.courierTab') },
      { id: 'history', label: t('contracts.historyTab') },
    ],
    [t]
  );

  // The identity column (never hidden — it opens the detail modal) plus the
  // optional columns the picker controls, in table order —
  // `CONTRACTS_HISTORY_COLUMN_IDS`' own order.
  const receiverFor = useCallback(
    (contract: Contract) =>
      activeCharacterId === null
        ? null
        : contractReceiver(contract, activeCharacterId, receiverCategories),
    [activeCharacterId, receiverCategories]
  );
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
        render: (contract) => <ContractStatusCell contract={contract} />,
      },
      issuer: {
        id: 'issuer',
        header: t('contracts.issuer'),
        sortValue: (contract) => {
          const { id } = contractIssuer(contract);
          return issuerNames.get(id) ?? `#${id}`;
        },
        render: (contract) => {
          const issuer = contractIssuer(contract);
          const name = issuerNames.get(issuer.id) ?? `#${issuer.id}`;
          return (
            <span className="inline-flex items-center gap-1.5">
              {issuer.kind === 'corporation' ? (
                <CorporationLink id={issuer.id} className="text-left">
                  {name}
                </CorporationLink>
              ) : (
                <CharacterLink id={issuer.id} className="text-left">
                  {name}
                </CharacterLink>
              )}
              {issuer.kind === 'character' && (
                <StandingTag
                  standing={characterStanding(standingIndex, issuer.id, issuerAffiliations)}
                />
              )}
            </span>
          );
        },
      },
      receiver: {
        id: 'receiver',
        header: t('contracts.receiver'),
        sortValue: (contract) => {
          const receiver = receiverFor(contract);
          return receiver ? (issuerNames.get(receiver.id) ?? `#${receiver.id}`) : '';
        },
        render: (contract) => {
          const receiver = receiverFor(contract);
          // No receiver (a public contract nobody took): the phone card's meta
          // line leaves the placeholder dash off rather than print a bare "—".
          if (receiver === null)
            return (
              <span className="text-text-dim" data-dense-omit>
                —
              </span>
            );
          return (
            <ContractReceiverLink
              receiver={receiver}
              name={receiver ? (issuerNames.get(receiver.id) ?? `#${receiver.id}`) : ''}
              standing={
                receiver?.kind === 'character'
                  ? characterStanding(standingIndex, receiver.id, issuerAffiliations)
                  : null
              }
            />
          );
        },
      },
      price: {
        id: 'price',
        header: t('contracts.price'),
        align: 'right',
        className: 'tabular-nums',
        // The dense phone card's headline figure, beside the title.
        cardCorner: true,
        sortValue: (contract) => contractAmount(contract),
        render: (contract) => {
          const amount = contractAmount(contract);
          return amount !== undefined ? <IskAmount value={amount} /> : t('common.unknown');
        },
      },
      issued: {
        id: 'issued',
        header: t('contracts.issued'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (contract) => new Date(contract.date_issued).getTime(),
        // Off the phone card: its day section header already says it.
        render: (contract) => (
          <span data-dense-omit>
            <ContractDateCell iso={contract.date_issued} timeZone={timeZone} />
          </span>
        ),
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
            return (
              <span>
                {/* Phone card only: its meta line has no column labels. */}
                <span className="sm:hidden">{t('contracts.expiresAffix')}</span>
                <ContractDateCell iso={contract.date_expired} timeZone={timeZone} />
              </span>
            );
          return <CourierDeadlineCell deadlineMs={deadlineMs} timeZone={timeZone} />;
        },
      },
    }),
    [t, issuerNames, timeZone, standingIndex, issuerAffiliations, receiverFor]
  );
  const columns = useMemo<DataTableColumn<Contract>[]>(
    () => [
      {
        id: 'type',
        header: t('contracts.type'),
        sortValue: (contract) => contract.title || t(CONTRACT_TYPE_KEY[contract.type]),
        render: (contract) => {
          const opener = (
            <button
              type="button"
              onClick={() => setSelectedContract(contract)}
              className={entityLinkClassName(
                cx(
                  'flex min-h-11 w-full items-center text-left font-medium md:block md:min-h-0 md:w-auto',
                  contract.title && 'md:max-w-72 md:truncate'
                )
              )}
            >
              {/* Phone only: the status tone as a dot, so a scan down the card
                  list reads outcome without the Status column (which the
                  picker can hide). The word stays on the meta line. */}
              <span
                aria-hidden="true"
                className={cx(
                  'mr-2 size-2 shrink-0 rounded-full bg-current sm:hidden',
                  STATUS_TONE[contract.status]
                )}
              />
              <ContractIdentity contract={contract} characterId={activeCharacterId} />
            </button>
          );
          // A title is the only free-text (so truncatable) identity; the full
          // text reaches the tooltip on hover and touch-and-hold.
          return contract.title ? <Tooltip content={contract.title}>{opener}</Tooltip> : opener;
        },
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
    () => filterContracts(contracts, rowsFilter, issuerNames, activeCharacterId ?? undefined),
    [contracts, rowsFilter, issuerNames, activeCharacterId]
  );
  const historyCsvColumns = useMemo(
    () =>
      contractsCsvColumns(
        t,
        (id) => issuerNames.get(id) ?? `#${id}`,
        activeCharacterId ?? undefined
      ),
    [t, issuerNames, activeCharacterId]
  );
  const historyExport = useTableExport({
    surface: 'contracts',
    rows: filteredContracts,
    columns: historyCsvColumns,
    truncated: contractsTruncated,
  });

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;
  const modalReceiver = selectedContract ? receiverFor(selectedContract) : null;
  const modalReceiverName = modalReceiver
    ? (issuerNames.get(modalReceiver.id) ?? `#${modalReceiver.id}`)
    : '';

  return (
    <div className="mx-auto max-w-6xl space-y-2 sm:space-y-4">
      {/* Both tabs read something datable and reloadable, but not the same
          thing: History is this character's own contract list, Search a shared
          public snapshot the panel below owns. So the badge and the Refresh
          are per tab — the export button is History-only, because it exports that
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
              <TableActionsMenu
                name={t('contracts.title')}
                tableExport={historyExport}
                size="md"
                showLabel
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

      <Tabs
        tabsId={tabsId}
        tabs={pageTabs}
        value={tabId}
        onChange={selectTab}
        label={t('contracts.tabsLabel')}
      />

      <TabPanel tabsId={tabsId} tabId={tabId} className="space-y-2 sm:space-y-4">
        {/* Switched outside the history chain below, not inside it: Search needs
          neither this character's contracts nor its `contracts` scope, so a
          character with an empty history or a 403 must still reach it. */}
        {tab === 'search' ? (
          <ContractSearchPanel mode={mode} onStatusChange={setSearchStatus} />
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
                  showLabel
                  onToggle={historyColumnVisibility.toggle}
                  buttonLabel={t('common.columnsButton')}
                  menuTitle={t('common.columnsMenuTitle')}
                  onReset={historyColumnVisibility.reset}
                  resetLabel={t('common.resetColumns')}
                />
              }
            />
            {/* Phone only: the filter sheet's status chips, one tap away. */}
            <div
              role="group"
              aria-label={t('contracts.statusFilterLabel')}
              className="flex gap-2 overflow-x-auto border-b border-line px-3 py-2 sm:hidden"
            >
              <FilterChip
                label={t('contracts.statusAll')}
                selected={filter.status === null}
                onToggle={() => setFilter({ ...filter, status: null })}
              />
              {statusOptions.map((status) => (
                <FilterChip
                  key={status}
                  label={t(CONTRACT_STATUS_KEY[status])}
                  selected={filter.status === status}
                  onToggle={() =>
                    setFilter({ ...filter, status: filter.status === status ? null : status })
                  }
                />
              ))}
            </div>
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
              <DataTable
                {...historyExport.tableProps}
                label={t('contracts.title')}
                columns={columns}
                rows={filteredContracts}
                rowKey={contractRowKey}
                virtualize="auto"
                highlightRowKey={highlightedContractId}
                {...historySortProps}
                stackLayout="dense"
                // Issue days are sections on a phone, not folded duplicates:
                // open, with members in line with the cards above them.
                className="dt-flat-groups"
                groupBy={{
                  key: (contract) => formatDateOnly(new Date(contract.date_issued), timeZone),
                  minSize: 1,
                  defaultExpanded: () => true,
                  renderHeader: (rows) => (
                    <ContractDayHeader
                      date={formatDateOnly(new Date(rows[0].date_issued), timeZone)}
                      count={rows.length}
                      timeZone={timeZone}
                    />
                  ),
                }}
              />
            )}
          </Panel>
        )}
      </TabPanel>

      {tab === 'history' && selectedContract && activeCharacterId !== null && (
        <ContractDetailModal
          characterId={activeCharacterId}
          contract={selectedContract}
          issuerName={
            issuerNames.get(contractIssuer(selectedContract).id) ??
            `#${contractIssuer(selectedContract).id}`
          }
          issuerStanding={
            contractIssuer(selectedContract).kind === 'character'
              ? characterStanding(
                  standingIndex,
                  contractIssuer(selectedContract).id,
                  issuerAffiliations
                )
              : null
          }
          receiver={modalReceiver}
          receiverName={modalReceiverName}
          receiverStanding={
            modalReceiver?.kind === 'character'
              ? characterStanding(standingIndex, modalReceiver.id, issuerAffiliations)
              : null
          }
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}
